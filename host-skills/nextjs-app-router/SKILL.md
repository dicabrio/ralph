---
name: nextjs-app-router
description: Build Next.js 15 App Router features with React 19 Server Components, Server Actions, and route groups. Use when creating pages, layouts, API routes, forms, or data fetching in the WebApp. Covers server-first patterns, client boundaries, streaming, and caching.
---

# Next.js 15 App Router with React 19

This skill provides patterns for building the RxApp WebApp using Next.js 15 App Router with React 19 features including Server Components, Server Actions, and the React Compiler.

## Tech Stack

- **Next.js**: 15.5.x with App Router
- **React**: 19.1.x with React Compiler enabled
- **Styling**: Tailwind CSS v4
- **Data Fetching**: TanStack Query for client state, Server Components for initial data
- **Validation**: Valibot
- **Database**: Drizzle ORM with PostgreSQL

## Project Structure

```
packages/WebApp/
├── app/
│   ├── (open)/          # Public routes (login, signup, pricing)
│   ├── (protected)/     # Authenticated routes (dashboard, members)
│   ├── (design)/        # Design/prototype routes
│   ├── api/v1/          # API routes
│   └── layout.tsx       # Root layout
├── src/
│   ├── db/              # Drizzle schema and client
│   ├── services/        # Business logic
│   ├── middleware/      # Auth and guards
│   └── lib/             # Utilities
└── components/          # Shared components
```

## Server Components (Default)

Server Components are the default in the App Router. Use them for:
- Data fetching from database
- Static content rendering
- Accessing server-only resources

```tsx
// app/(protected)/members/page.tsx - Server Component (default)
import { db } from '@/src/db'
import { members } from '@/src/db/schema'

export default async function MembersPage() {
  // Direct database access - no API layer needed
  const membersList = await db.select().from(members)

  return (
    <div>
      <h1>Members</h1>
      <MemberList members={membersList} />
    </div>
  )
}
```

## Client Components

Add `"use client"` directive only when you need:
- State (`useState`, `useReducer`)
- Effects (`useEffect`)
- Event handlers (`onClick`, `onChange`)
- Browser APIs

```tsx
// components/MemberSearch.tsx
"use client"

import { useState } from 'react'

export function MemberSearch({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('')

  return (
    <input
      value={query}
      onChange={(e) => {
        setQuery(e.target.value)
        onSearch(e.target.value)
      }}
      placeholder="Search members..."
    />
  )
}
```

## Client Boundaries

When you add `"use client"`, all imported components become Client Components. Keep client boundaries small:

```tsx
// GOOD: Small client boundary
// app/(protected)/members/page.tsx (Server Component)
import { MemberSearch } from '@/components/MemberSearch' // Client
import { MemberList } from '@/components/MemberList'     // Server

export default async function MembersPage() {
  const members = await db.select().from(membersTable)

  return (
    <div>
      <MemberSearch onSearch={handleSearch} />  {/* Client island */}
      <MemberList members={members} />           {/* Server rendered */}
    </div>
  )
}
```

## Server Actions

Use Server Actions for mutations instead of API routes for internal app operations:

```tsx
// app/(protected)/members/actions.ts
"use server"

import { db } from '@/src/db'
import { members } from '@/src/db/schema'
import { revalidatePath } from 'next/cache'
import * as v from 'valibot'

const CreateMemberSchema = v.object({
  name: v.pipe(v.string(), v.minLength(2)),
  email: v.pipe(v.string(), v.email()),
})

export async function createMember(formData: FormData) {
  // Validate input
  const result = v.safeParse(CreateMemberSchema, {
    name: formData.get('name'),
    email: formData.get('email'),
  })

  if (!result.success) {
    return { error: 'Invalid input', issues: result.issues }
  }

  // Insert into database
  await db.insert(members).values(result.output)

  // Revalidate the members page
  revalidatePath('/members')

  return { success: true }
}
```

```tsx
// app/(protected)/members/CreateMemberForm.tsx
"use client"

import { useActionState } from 'react'
import { createMember } from './actions'

export function CreateMemberForm() {
  const [state, action, pending] = useActionState(createMember, null)

  return (
    <form action={action}>
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <button type="submit" disabled={pending}>
        {pending ? 'Creating...' : 'Create Member'}
      </button>
      {state?.error && <p className="text-red-500">{state.error}</p>}
    </form>
  )
}
```

## Route Groups

Use route groups `(groupName)` to organize routes without affecting URLs:

- `(open)` - Public routes: `/login`, `/signup`, `/pricing`
- `(protected)` - Authenticated routes: `/dashboard`, `/members`
- `(design)` - Design prototypes: `/design/billing`

Each group can have its own layout:

```tsx
// app/(protected)/layout.tsx
"use client"

import BaseLayout from "@/components/BaseLayout"

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <BaseLayout variant="dashboard">{children}</BaseLayout>
}
```

## Data Fetching Patterns

### Pattern 1: Server Component with Direct DB Access

```tsx
// Best for initial page load
async function MembersPage() {
  const members = await db.select().from(membersTable)
  return <MemberList members={members} />
}
```

### Pattern 2: Server Component with Streaming

```tsx
import { Suspense } from 'react'

async function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<StatsLoading />}>
        <Stats />  {/* Async Server Component */}
      </Suspense>
      <Suspense fallback={<RecentActivityLoading />}>
        <RecentActivity />  {/* Async Server Component */}
      </Suspense>
    </div>
  )
}
```

### Pattern 3: Client Component with TanStack Query

```tsx
"use client"

import { useQuery } from '@tanstack/react-query'

function MemberStats({ affiliateId }: { affiliateId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['memberStats', affiliateId],
    queryFn: () => fetch(`/api/v1/stats?affiliate_id=${affiliateId}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  if (isLoading) return <Skeleton />
  return <StatsDisplay data={data} />
}
```

## Caching and Revalidation

### Time-based Revalidation

```tsx
// Revalidate every 5 minutes
export const revalidate = 300

async function PricingPage() {
  const plans = await db.select().from(affiliatePlans)
  return <PricingTable plans={plans} />
}
```

### On-demand Revalidation

```tsx
"use server"

import { revalidatePath, revalidateTag } from 'next/cache'

export async function updateMember(id: number, data: MemberData) {
  await db.update(members).set(data).where(eq(members.id, id))

  // Revalidate specific path
  revalidatePath('/members')

  // Or revalidate by tag
  revalidateTag('members')
}
```

## Error Handling

### Error Boundaries

```tsx
// app/(protected)/members/error.tsx
"use client"

export default function MembersError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Loading States

```tsx
// app/(protected)/members/loading.tsx
export default function MembersLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
    </div>
  )
}
```

## React Compiler Benefits

The React Compiler is enabled in this project (`babel-plugin-react-compiler`). It automatically:
- Memoizes components and values
- Applies `useMemo` and `useCallback` where safe
- Optimizes re-renders

**You don't need to manually add:**
- `React.memo()` wrappers
- `useMemo()` for expensive calculations
- `useCallback()` for stable function references

The compiler handles these optimizations automatically.

## Best Practices Summary

1. **Server-first**: Keep components as Server Components unless they need interactivity
2. **Small client boundaries**: Only wrap interactive parts with `"use client"`
3. **Server Actions for mutations**: Use for internal app operations, not public APIs
4. **Validate input**: Always validate with Valibot on the server
5. **Use Suspense**: Wrap async components for streaming
6. **Colocate data**: Fetch data where it's used, not in parent components
7. **Revalidate explicitly**: Use `revalidatePath` or `revalidateTag` after mutations

## When to Use API Routes vs Server Actions

| Use Case | Solution |
|----------|----------|
| Internal form submission | Server Action |
| Internal data mutation | Server Action |
| Public API endpoint | API Route (`app/api/v1/`) |
| Webhook receiver | API Route |
| External integrations | API Route |
| CORS requirements | API Route |

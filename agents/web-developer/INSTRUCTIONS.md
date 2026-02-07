# Web Developer Agent Instructions

## Role & Responsibilities

You are the **Web Developer** for the Ibiza Marketplace platform. You implement the web frontend using Next.js 15, React 19, and Tailwind CSS v4.

## Core Responsibilities

1. **Next.js Development**
   - App Router pages and layouts
   - Server Components and Client Components
   - Server Actions for mutations

2. **UI Implementation**
   - React components with TypeScript
   - Tailwind CSS v4 styling
   - Responsive design (mobile-first)

3. **Data Fetching**
   - React Query for client-side data
   - Server-side data fetching
   - API integration

4. **Internationalization**
   - next-intl for translations
   - Locale-based routing

## Key Locations

```
Web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/           # i18n routes
│   │   │   ├── (auth)/         # Auth-protected routes
│   │   │   ├── a/              # Advertisement pages
│   │   │   ├── c/              # Category pages
│   │   │   ├── q/              # Search/query pages
│   │   │   ├── u/              # User pages
│   │   │   ├── layout.tsx      # Locale layout
│   │   │   └── page.tsx        # Home page
│   │   ├── actions/            # Server Actions
│   │   ├── api/                # API routes
│   │   └── layout.tsx          # Root layout
│   ├── components/             # React components
│   ├── features/               # Feature modules
│   ├── data/                   # Data fetching utilities
│   ├── utils/                  # Utilities
│   ├── types/                  # TypeScript types
│   ├── i18n/                   # i18n configuration
│   └── middleware.ts           # Next.js middleware
├── messages/                   # Translation files
├── public/                     # Static assets
└── next.config.ts              # Next.js configuration
```

## Next.js App Router Patterns

### Page Component

```typescript
// app/[locale]/a/[id]/page.tsx
import { getAdvertisement } from '@/data/advertisements';

interface PageProps {
  params: { locale: string; id: string };
}

export default async function AdvertisementPage({ params }: PageProps) {
  const ad = await getAdvertisement(params.id);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold">{ad.title}</h1>
      <p className="text-gray-600 mt-4">{ad.description}</p>
    </div>
  );
}
```

### Layout

```typescript
// app/[locale]/layout.tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main>{children}</main>
    </NextIntlClientProvider>
  );
}
```

### Server Action

```typescript
// app/actions/advertisement.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string(),
  price: z.number().positive(),
});

export async function createAdvertisement(formData: FormData) {
  const data = CreateSchema.parse({
    title: formData.get('title'),
    description: formData.get('description'),
    price: Number(formData.get('price')),
  });

  const response = await fetch(`${process.env.API_URL}/v1/advertisements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create advertisement');
  }

  revalidatePath('/[locale]/a');
  return response.json();
}
```

### Client Component

```typescript
// components/SearchForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SearchForm() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/q?search=${encodeURIComponent(query)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="flex-1 px-4 py-2 border rounded-lg"
        placeholder="Search..."
      />
      <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg">
        Search
      </button>
    </form>
  );
}
```

## Tailwind CSS v4 Patterns

### Component Styling

```typescript
// Utility-first approach
<div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
  <h3 className="text-xl font-semibold mb-2">{title}</h3>
  <p className="text-gray-600">{description}</p>
</div>
```

### Responsive Design

```typescript
<div className="
  grid
  grid-cols-1        /* Mobile: 1 column */
  md:grid-cols-2     /* Tablet: 2 columns */
  lg:grid-cols-3     /* Desktop: 3 columns */
  xl:grid-cols-4     /* Large: 4 columns */
  gap-6
">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

## React Query Integration

```typescript
// components/AdvertisementList.tsx
'use client';

import { useQuery } from '@tanstack/react-query';

async function fetchAdvertisements(params: SearchParams) {
  const res = await fetch(`/api/advertisements?${new URLSearchParams(params)}`);
  return res.json();
}

export function AdvertisementList({ initialData }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['advertisements'],
    queryFn: () => fetchAdvertisements({}),
    initialData,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.map(ad => <AdCard key={ad.id} ad={ad} />)}
    </div>
  );
}
```

## Internationalization (next-intl)

### Using Translations

```typescript
// In Server Components
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('HomePage');
  return <h1>{t('title')}</h1>;
}

// In Client Components
'use client';
import { useTranslations } from 'next-intl';

export function ClientComponent() {
  const t = useTranslations('Common');
  return <button>{t('submit')}</button>;
}
```

### Translation Files

```json
// messages/en.json
{
  "HomePage": {
    "title": "Welcome to Ibiza Marketplace"
  },
  "Common": {
    "submit": "Submit",
    "cancel": "Cancel"
  }
}
```

## Authentication (next-auth)

```typescript
// Using auth in Server Components
import { auth } from '@/auth';

export default async function ProtectedPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return <div>Hello {session.user.name}</div>;
}

// Using auth in Client Components
'use client';
import { useSession } from 'next-auth/react';

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <Spinner />;
  if (!session) return <LoginButton />;

  return <UserDropdown user={session.user} />;
}
```

## Development Commands

```bash
cd Web

# Development
npm run dev          # Start with Turbopack (default)
npm run dev2         # Start without Turbopack

# Build
npm run build        # Production build
npm run start        # Start production server

# Lint
npm run lint         # Next.js lint
```

## Best Practices

1. **Server Components by Default**: Only use `'use client'` when needed
2. **Colocation**: Keep components close to where they're used
3. **Type Safety**: Use TypeScript for all components
4. **Validation**: Use Zod for form validation
5. **Responsive**: Design mobile-first with Tailwind

## Component Organization

```
components/
├── ui/                    # Generic UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   └── Input.tsx
├── features/              # Feature-specific components
│   ├── advertisement/
│   │   ├── AdCard.tsx
│   │   ├── AdForm.tsx
│   │   └── AdList.tsx
│   └── user/
│       ├── UserAvatar.tsx
│       └── UserMenu.tsx
└── layout/                # Layout components
    ├── Header.tsx
    ├── Footer.tsx
    └── Sidebar.tsx
```

## Handoff Protocol

After completing a feature:

```json
{
  "from": "web-developer",
  "to": "qa-specialist",
  "task": "Advertisement listing page complete",
  "route": "/[locale]/a",
  "files": [
    "Web/src/app/[locale]/a/page.tsx",
    "Web/src/components/features/advertisement/AdList.tsx"
  ],
  "notes": "Supports filtering by category, pagination"
}
```

## Resources

- **Project Docs**: `CLAUDE.md`
- **Code Standards**: `agents/shared/conventions.md`
- **Next.js Docs**: https://nextjs.org/docs
- **Tailwind CSS**: https://tailwindcss.com/docs
- **next-intl**: https://next-intl-docs.vercel.app/

# Backend Developer Agent Instructions

## Role & Responsibilities

You are the **Backend Developer** for the Ibiza Marketplace platform. You work with Express.js, TypeScript, and Knex.js to implement server-side logic, API endpoints, and business functionality.

## Core Responsibilities

1. **API Development**
   - Create and modify route handlers
   - Implement business logic
   - Work with the module pattern in `Api/src/modules/`

2. **Data Management**
   - Database queries via Knex.js
   - Data validation with Valibot
   - Request/response handling

3. **Authentication & Authorization**
   - JWT token management
   - User session handling
   - Permission checks

## Key Locations

```
Api/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── modules/              # Feature modules
│   │   ├── advertisement/    # Advertisement CRUD
│   │   ├── authorize/        # Auth endpoints
│   │   ├── bans/             # User bans
│   │   ├── category/         # Categories
│   │   ├── favorite/         # User favorites
│   │   ├── messages/         # Conversations
│   │   ├── offer/            # Offers on ads
│   │   └── user/             # User management
│   ├── types/                # Shared TypeScript types
│   └── utils/                # Utilities (config, context, etc.)
├── migrations/               # Knex migrations
├── seeds/                    # Database seeds
└── knexfile.ts               # Knex configuration
```

## Module Structure Pattern

Each module follows this pattern:

```
modules/{feature}/
├── index.ts           # Exports createXxxRoutes function
├── routes.ts          # Route definitions (optional, can be in index)
├── handlers/          # Request handlers
│   ├── create.ts
│   ├── update.ts
│   ├── delete.ts
│   └── list.ts
├── schema.ts          # Valibot validation schemas
└── types.ts           # Module-specific types
```

## Express Patterns

### Route Factory Pattern

The project uses a context-based route factory:

```typescript
// modules/advertisement/index.ts
import { Router } from 'express';
import { Context } from '../../utils';

export function createAdvertisementRoutes(context: Context) {
  const router = Router();

  router.get('/advertisements', listHandler(context));
  router.get('/advertisements/:id', getHandler(context));
  router.post('/advertisements', createHandler(context));
  router.put('/advertisements/:id', updateHandler(context));
  router.delete('/advertisements/:id', deleteHandler(context));

  return router;
}
```

### Handler Pattern

```typescript
// handlers/create.ts
import { Request, Response } from 'express';
import { parse } from 'valibot';
import { CreateAdvertisementSchema } from '../schema';

export function createHandler(context: Context) {
  return async (req: Request, res: Response) => {
    try {
      // Validate input
      const data = parse(CreateAdvertisementSchema, req.body);

      // Check authentication
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Business logic
      const [id] = await context.db('advertisements')
        .insert({
          ...data,
          user_id: req.user.id,
          created_at: new Date(),
        })
        .returning('id');

      res.json({ success: true, id });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
}
```

## Validation with Valibot

```typescript
// schema.ts
import * as v from 'valibot';

export const CreateAdvertisementSchema = v.object({
  title: v.pipe(v.string(), v.minLength(3), v.maxLength(100)),
  description: v.optional(v.string()),
  price: v.number(),
  category_id: v.number(),
});

export type CreateAdvertisementInput = v.InferOutput<typeof CreateAdvertisementSchema>;

// Usage in handler
import { parse, ValiError } from 'valibot';

try {
  const data = parse(CreateAdvertisementSchema, req.body);
} catch (error) {
  if (error instanceof ValiError) {
    res.status(400).json({ errors: error.issues });
  }
}
```

## Knex Database Queries

### Basic Queries

```typescript
// Select
const ads = await context.db('advertisements')
  .where({ user_id: userId })
  .orderBy('created_at', 'desc')
  .limit(20);

// Single item
const ad = await context.db('advertisements')
  .where({ id })
  .first();

// Insert
const [newId] = await context.db('advertisements')
  .insert(data)
  .returning('id');

// Update
await context.db('advertisements')
  .where({ id })
  .update({ title: newTitle, updated_at: new Date() });

// Delete
await context.db('advertisements')
  .where({ id })
  .delete();
```

### Joins

```typescript
const adsWithUser = await context.db('advertisements')
  .join('users', 'advertisements.user_id', 'users.id')
  .select(
    'advertisements.*',
    'users.name as user_name',
    'users.email as user_email'
  )
  .where('advertisements.id', id);
```

### Transactions

```typescript
await context.db.transaction(async (trx) => {
  const [adId] = await trx('advertisements').insert(adData).returning('id');

  await trx('advertisement_images').insert(
    images.map(img => ({ advertisement_id: adId, url: img }))
  );
});
```

## Authentication Middleware

The project uses JWT-based authentication:

```typescript
// The userAuthorization middleware in modules/authorize sets req.user
// Access authenticated user in handlers:

export function handler(context: Context) {
  return async (req: Request, res: Response) => {
    // req.user is set by middleware if valid token
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // req.session contains session data
    // req.language contains the request language
  };
}
```

## Error Handling

```typescript
try {
  // Business logic
} catch (error) {
  if (error instanceof ValiError) {
    // Validation error
    return res.status(400).json({
      error: 'Validation failed',
      issues: error.issues,
    });
  }

  if (error.code === '23505') {
    // PostgreSQL unique violation
    return res.status(409).json({ error: 'Resource already exists' });
  }

  console.error('Unexpected error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
```

## Development Commands

```bash
cd Api

# Development
npm run dev              # Start with nodemon

# Database
npm run migrate:latest   # Run migrations
npm run migrate:rollback # Rollback last migration
npm run seed:run         # Run seeds

# Build
npm run build            # Bundle with esbuild
npm run start            # Run production build

# Lint
npm run lint             # ESLint
```

## Best Practices

1. **Validation First**: Always validate input with Valibot before processing
2. **Type Safety**: Use TypeScript types for all data structures
3. **Error Handling**: Catch and handle errors appropriately
4. **Transactions**: Use transactions for multi-step operations
5. **Authentication**: Always check `req.user` for protected routes

## Handoff Protocol

After completing an API endpoint:

```json
{
  "from": "backend-developer",
  "to": "web-developer",
  "task": "Advertisement creation endpoint complete",
  "endpoint": "POST /v1/advertisements",
  "files": [
    "Api/src/modules/advertisement/handlers/create.ts",
    "Api/src/modules/advertisement/schema.ts"
  ],
  "notes": "Returns { success: true, id: number }"
}
```

## Resources

- **Project Docs**: `CLAUDE.md`
- **API Entry**: `Api/src/index.ts`
- **Code Standards**: `agents/shared/conventions.md`
- **Knex Docs**: https://knexjs.org/
- **Valibot Docs**: https://valibot.dev/

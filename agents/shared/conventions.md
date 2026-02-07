# Code Conventions - Ibiza Marketplace

## General Principles

1. **TypeScript First**: Use TypeScript across all projects
2. **Security First**: Validate input, prevent injection attacks
3. **Clean Code**: Readable, maintainable, self-documenting
4. **Consistent Patterns**: Follow existing module patterns

## TypeScript Conventions

### Code Style

- Use **2 spaces** for indentation
- Max line length: **100 characters**
- Use `const` by default, `let` when reassignment needed
- Never use `var`
- Use strict mode (`"strict": true` in tsconfig)

### Naming

```typescript
// Interfaces/Types: PascalCase
interface User {}
type Advertisement = {}

// Classes: PascalCase
class UserService {}

// Functions/Methods: camelCase
function calculatePrice() {}

// Variables: camelCase
const totalPrice = 100.00;

// Constants: UPPER_SNAKE_CASE
const MAX_ITEMS_PER_PAGE = 100;

// Files: camelCase for modules, kebab-case for components
// userService.ts, user-card.tsx
```

### Type Hints

Always use explicit types for function parameters and returns:

```typescript
function createUser(data: CreateUserInput): Promise<User> {
  // ...
}

// Prefer interfaces for object shapes
interface CreateUserInput {
  email: string;
  name: string;
}
```

## API (Express.js) Conventions

### Module Structure

```
Api/src/modules/{module}/
├── index.ts           # Export routes
├── routes.ts          # Route definitions
├── handlers/          # Request handlers
│   ├── create.ts
│   ├── update.ts
│   └── list.ts
├── schema.ts          # Valibot validation schemas
└── types.ts           # TypeScript types
```

### Route Patterns

```typescript
// routes.ts
import { Router } from 'express';

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
export function createHandler(context: Context) {
  return async (req: Request, res: Response) => {
    try {
      const data = parse(CreateSchema, req.body);
      const result = await context.db('advertisements').insert(data);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
}
```

### Validation with Valibot

```typescript
import * as v from 'valibot';

export const CreateAdvertisementSchema = v.object({
  title: v.pipe(v.string(), v.minLength(3), v.maxLength(100)),
  description: v.string(),
  price: v.number(),
  categoryId: v.number(),
});

export type CreateAdvertisementInput = v.InferOutput<typeof CreateAdvertisementSchema>;
```

## Web (Next.js) Conventions

### File Structure

```
Web/src/
├── app/               # App Router pages
│   └── [locale]/      # i18n routes
├── components/        # React components
├── features/          # Feature modules
├── utils/             # Utilities
└── types/             # Shared types
```

### Component Pattern

```typescript
// components/ProductCard.tsx
interface ProductCardProps {
  product: Product;
  onFavorite?: (id: number) => void;
}

export function ProductCard({ product, onFavorite }: ProductCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold">{product.title}</h3>
      {/* ... */}
    </div>
  );
}
```

### Server Actions

```typescript
// app/actions/advertisement.ts
'use server';

export async function createAdvertisement(formData: FormData) {
  const data = Object.fromEntries(formData);
  // validate and create
}
```

### Validation with Zod

```typescript
import { z } from 'zod';

export const CreateAdvertisementSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string(),
  price: z.number().positive(),
});

export type CreateAdvertisementInput = z.infer<typeof CreateAdvertisementSchema>;
```

## Mobile (React Native) Conventions

### File Structure

```
App/
├── screens/           # Screen components (by feature)
│   └── AdDetail/
│       ├── index.tsx
│       └── styles.ts
├── components/        # Shared components
├── stacks/            # Navigation stacks
├── context/           # React contexts
├── utils/             # Utilities
└── types/             # TypeScript types
```

### Screen Pattern

```typescript
// screens/AdDetail/index.tsx
import { View, Text } from 'react-native';
import { useRoute } from '@react-navigation/native';

export function AdDetailScreen() {
  const route = useRoute();
  const { id } = route.params as { id: number };

  return (
    <View>
      <Text>Advertisement {id}</Text>
    </View>
  );
}
```

### Navigation Stack

```typescript
// stacks/AdStack.tsx
import { createStackNavigator } from '@react-navigation/stack';

const Stack = createStackNavigator();

export function AdStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AdList" component={AdListScreen} />
      <Stack.Screen name="AdDetail" component={AdDetailScreen} />
    </Stack.Navigator>
  );
}
```

## Database Conventions

### Table Names

- Lowercase with underscores: `advertisements`, `user_favorites`
- Plural for collections: `users`, `categories`
- Junction tables: `advertisement_categories`

### Column Names

- Lowercase with underscores: `created_at`, `user_id`
- Foreign keys: `{table}_id` (e.g., `category_id`)
- Booleans: `is_active`, `is_verified`

### Migration Pattern

```typescript
// migrations/20240101_create_advertisements.ts
export async function up(knex: Knex) {
  return knex.schema.createTable('advertisements', (table) => {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.text('description');
    table.decimal('price', 10, 2);
    table.integer('user_id').references('users.id');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex) {
  return knex.schema.dropTable('advertisements');
}
```

## Git Conventions

### Commit Messages

Use Conventional Commits: `type(Scope): message`

```
feat(Advertisement): add image upload endpoint
fix(User): correct email validation
refactor(Api): extract validation to middleware
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding tests
- `docs`: Documentation
- `chore`: Maintenance

### Co-authored Commits

```
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Error Handling

### API

```typescript
try {
  const result = await service.create(data);
  res.json({ success: true, data: result });
} catch (error) {
  if (error instanceof ValidationError) {
    res.status(400).json({ error: error.message });
  } else {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### React/React Native

```typescript
const { data, error, isLoading } = useQuery({
  queryKey: ['advertisements'],
  queryFn: fetchAdvertisements,
});

if (error) {
  return <ErrorMessage error={error} />;
}
```

## Security Guidelines

### Input Validation

- Always validate user input with Valibot (API) or Zod (Web)
- Sanitize data before database operations
- Use parameterized queries (Knex handles this)

### Authentication

- JWT tokens for API authentication
- next-auth for Web authentication
- Secure token storage on mobile (AsyncStorage with encryption)

### Environment Variables

- Never commit secrets
- Use `.env` files locally (gitignored)
- AWS SSM Parameter Store for production

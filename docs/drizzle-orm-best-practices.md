# Drizzle ORM Best Practices

Dit document beschrijft de aanbevolen best practices voor Drizzle ORM ontwikkeling, inclusief schema design, queries, migrations, en performance optimalisatie.

## Inhoudsopgave

- [Project Setup](#project-setup)
- [Schema Design](#schema-design)
- [Queries](#queries)
- [Migrations](#migrations)
- [Performance](#performance)
- [Relaties](#relaties)
- [Validatie met Zod](#validatie-met-zod)

---

## Project Setup

### Installatie

```bash
# Core packages
npm install drizzle-orm
npm install -D drizzle-kit

# Database driver (kies één)
npm install postgres        # PostgreSQL met postgres.js
npm install @neondatabase/serverless  # Neon serverless
npm install better-sqlite3  # SQLite
npm install mysql2          # MySQL
```

### Drizzle Config

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Verbose logging tijdens development
  verbose: true,
  // Strikte mode voor veiligere migrations
  strict: true,
});
```

### Database Client

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Connection pool configuratie
const client = postgres(connectionString, {
  max: 10, // Maximum connecties
  idle_timeout: 20, // Sluit idle connecties na 20s
  connect_timeout: 10, // Timeout voor nieuwe connecties
});

export const db = drizzle(client, {
  schema,
  // Automatische snake_case conversie
  casing: 'snake_case',
  logger: process.env.NODE_ENV === 'development',
});
```

---

## Schema Design

### Folder Structuur

```
src/db/
├── index.ts              # Database client export
├── schema/
│   ├── index.ts          # Barrel export
│   ├── users.ts          # Users tabel
│   ├── posts.ts          # Posts tabel
│   ├── comments.ts       # Comments tabel
│   └── common.ts         # Gedeelde kolommen/types
└── migrations/           # Auto-generated migrations
```

### Modern Schema met Identity Columns

```typescript
// src/db/schema/common.ts
import { timestamp } from 'drizzle-orm/pg-core';

// Herbruikbare timestamp kolommen
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};
```

```typescript
// src/db/schema/users.ts
import { pgTable, varchar, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { timestamps } from './common';

// Enum definitie
export const userRoleEnum = pgEnum('user_role', ['user', 'admin', 'moderator']);

export const users = pgTable('users', {
  // Identity column (moderne aanpak, vervangt serial)
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  // Basis velden
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),

  // Enum kolom
  role: userRoleEnum('role').default('user').notNull(),

  // Boolean met default
  isActive: boolean('is_active').default(true).notNull(),

  // Timestamps
  ...timestamps,
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

```typescript
// src/db/schema/posts.ts
import { pgTable, varchar, text, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { timestamps } from './common';

export const posts = pgTable('posts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  content: text('content').notNull(),
  excerpt: varchar('excerpt', { length: 500 }),

  // Foreign key
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  ...timestamps,
}, (table) => [
  // Indexes
  index('posts_author_idx').on(table.authorId),
  index('posts_slug_idx').on(table.slug),
  index('posts_created_at_idx').on(table.createdAt),
]);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

### Barrel Export

```typescript
// src/db/schema/index.ts
export * from './users';
export * from './posts';
export * from './comments';
export * from './common';
```

### Default Values en Computed Columns

```typescript
import { sql } from 'drizzle-orm';
import { varchar, uuid } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  // UUID als primary key
  id: uuid('id').primaryKey().defaultRandom(),

  // Slug gegenereerd van titel
  slug: varchar('slug', { length: 255 })
    .notNull()
    .$default(() => generateSlug()),

  // SQL default
  code: varchar('code', { length: 10 })
    .default(sql`'PRD-' || gen_random_uuid()::text`),
});
```

---

## Queries

### Select Queries

```typescript
import { eq, and, or, like, desc, asc, sql } from 'drizzle-orm';

// Basis select
const allUsers = await db.select().from(users);

// Met condities
const activeAdmins = await db
  .select()
  .from(users)
  .where(
    and(
      eq(users.isActive, true),
      eq(users.role, 'admin')
    )
  );

// Specifieke kolommen selecteren
const userEmails = await db
  .select({
    id: users.id,
    email: users.email,
  })
  .from(users);

// Met ordering en limit
const recentPosts = await db
  .select()
  .from(posts)
  .orderBy(desc(posts.createdAt))
  .limit(10)
  .offset(0);

// Search met LIKE
const searchUsers = await db
  .select()
  .from(users)
  .where(like(users.name, `%${searchTerm}%`));

// Aggregate functies
const postCounts = await db
  .select({
    authorId: posts.authorId,
    count: sql<number>`count(*)`.as('post_count'),
  })
  .from(posts)
  .groupBy(posts.authorId);
```

### Insert Queries

```typescript
// Enkele insert
const newUser = await db
  .insert(users)
  .values({
    email: 'user@example.com',
    name: 'John Doe',
    passwordHash: hashedPassword,
  })
  .returning();

// Bulk insert
const newPosts = await db
  .insert(posts)
  .values([
    { title: 'Post 1', slug: 'post-1', content: '...', authorId: 1 },
    { title: 'Post 2', slug: 'post-2', content: '...', authorId: 1 },
  ])
  .returning();

// Insert met conflict handling (upsert)
const upsertedUser = await db
  .insert(users)
  .values({
    email: 'user@example.com',
    name: 'Updated Name',
    passwordHash: hashedPassword,
  })
  .onConflictDoUpdate({
    target: users.email,
    set: {
      name: 'Updated Name',
      updatedAt: new Date(),
    },
  })
  .returning();
```

### Update Queries

```typescript
// Basis update
const updatedUser = await db
  .update(users)
  .set({
    name: 'New Name',
    updatedAt: new Date(),
  })
  .where(eq(users.id, userId))
  .returning();

// Conditionele update
await db
  .update(posts)
  .set({ isPublished: true })
  .where(
    and(
      eq(posts.authorId, userId),
      eq(posts.isPublished, false)
    )
  );

// Increment
await db
  .update(posts)
  .set({
    viewCount: sql`${posts.viewCount} + 1`,
  })
  .where(eq(posts.id, postId));
```

### Delete Queries

```typescript
// Basis delete
await db.delete(users).where(eq(users.id, userId));

// Soft delete (met isDeleted vlag)
await db
  .update(users)
  .set({
    isDeleted: true,
    deletedAt: new Date(),
  })
  .where(eq(users.id, userId));
```

### Joins

```typescript
// Inner join
const postsWithAuthors = await db
  .select({
    postId: posts.id,
    postTitle: posts.title,
    authorName: users.name,
    authorEmail: users.email,
  })
  .from(posts)
  .innerJoin(users, eq(posts.authorId, users.id));

// Left join
const usersWithPosts = await db
  .select({
    user: users,
    post: posts,
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId));
```

### Prepared Statements

```typescript
// Prepared statement voor herhaaldelijk gebruik
const getUserById = db
  .select()
  .from(users)
  .where(eq(users.id, sql.placeholder('id')))
  .prepare('get_user_by_id');

// Executie
const user = await getUserById.execute({ id: 123 });

// Met meerdere placeholders
const searchPosts = db
  .select()
  .from(posts)
  .where(
    and(
      eq(posts.authorId, sql.placeholder('authorId')),
      like(posts.title, sql.placeholder('search'))
    )
  )
  .limit(sql.placeholder('limit'))
  .prepare('search_posts');

const results = await searchPosts.execute({
  authorId: 1,
  search: '%typescript%',
  limit: 10,
});
```

---

## Migrations

### Workflow

```bash
# 1. Maak schema wijzigingen in je TypeScript files

# 2. Genereer migration
npx drizzle-kit generate

# 3. Review de gegenereerde SQL in drizzle/migrations/

# 4. Pas migration toe
npx drizzle-kit migrate

# Of voor development: push direct naar database
npx drizzle-kit push
```

### Migration Commands

```bash
# Genereer migration van schema changes
drizzle-kit generate

# Apply migrations
drizzle-kit migrate

# Push schema direct (development)
drizzle-kit push

# Pull schema van bestaande database
drizzle-kit introspect

# Open Drizzle Studio (database GUI)
drizzle-kit studio
```

### Custom Migration Script

```typescript
// scripts/migrate.ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from '../src/db';

async function runMigrations() {
  console.log('Running migrations...');

  await migrate(db, {
    migrationsFolder: './drizzle/migrations',
  });

  console.log('Migrations completed!');

  await client.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

### Migration Best Practices

1. **Nooit handmatig migration files aanpassen** - laat Drizzle Kit ze genereren
2. **Nooit migration history verwijderen in productie** - dit kan data loss veroorzaken
3. **Review gegenereerde migrations** - check de SQL voordat je applied
4. **Test migrations lokaal** - voordat je naar staging/production pushed

---

## Performance

### Connection Pooling

```typescript
// Voor serverless/edge (Neon)
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

// Voor traditionele servers
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!, {
  max: 20,                    // Max pool size
  idle_timeout: 30,           // Close idle connections after 30s
  connect_timeout: 10,        // Connection timeout
  max_lifetime: 60 * 30,      // Max connection lifetime: 30 min
});
```

### Selective Field Loading

```typescript
// Laad alleen benodigde velden
const userPreviews = await db
  .select({
    id: users.id,
    name: users.name,
    // Exclusief: passwordHash, email, etc.
  })
  .from(users);

// Voor grote text velden
const postPreviews = await db
  .select({
    id: posts.id,
    title: posts.title,
    excerpt: posts.excerpt,
    // Exclusief: content (groot veld)
  })
  .from(posts);
```

### Batch Operations

```typescript
// Batch insert
const BATCH_SIZE = 1000;

async function bulkInsertUsers(users: NewUser[]) {
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await db.insert(usersTable).values(batch);
  }
}
```

### Query Optimalisatie

```typescript
// Gebruik indexes
// Schema:
export const posts = pgTable('posts', {
  // ...
}, (table) => [
  index('posts_author_created_idx').on(table.authorId, table.createdAt),
]);

// Query die de index gebruikt
const authorPosts = await db
  .select()
  .from(posts)
  .where(eq(posts.authorId, authorId))
  .orderBy(desc(posts.createdAt));
```

---

## Relaties

### Relaties Definiëren

```typescript
// src/db/schema/relations.ts
import { relations } from 'drizzle-orm';
import { users } from './users';
import { posts } from './posts';
import { comments } from './comments';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
}));
```

### Query met Relaties

```typescript
// Query met nested relaties
const postsWithComments = await db.query.posts.findMany({
  with: {
    author: true,
    comments: {
      with: {
        author: true,
      },
      orderBy: (comments, { desc }) => [desc(comments.createdAt)],
      limit: 5,
    },
  },
  where: eq(posts.isPublished, true),
  orderBy: (posts, { desc }) => [desc(posts.createdAt)],
  limit: 10,
});

// Selectieve velden in relaties
const users = await db.query.users.findMany({
  columns: {
    id: true,
    name: true,
    // passwordHash wordt niet geladen
  },
  with: {
    posts: {
      columns: {
        id: true,
        title: true,
      },
    },
  },
});
```

---

## Validatie met Zod

### Drizzle-Zod Integratie

```bash
npm install drizzle-zod zod
```

```typescript
// src/db/schema/users.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
});

// Auto-gegenereerde schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// Aangepaste schema met extra validatie
export const createUserSchema = createInsertSchema(users, {
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
}).omit({
  id: true,
  passwordHash: true,
}).extend({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

### Gebruik in API Routes

```typescript
// src/routes/users.ts
import { createUserSchema } from '@/db/schema/users';

export async function createUser(input: unknown) {
  // Validatie
  const validated = createUserSchema.parse(input);

  // Hash password
  const passwordHash = await hashPassword(validated.password);

  // Insert
  const [user] = await db
    .insert(users)
    .values({
      email: validated.email,
      name: validated.name,
      passwordHash,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
    });

  return user;
}
```

---

## Bronnen

- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Drizzle ORM PostgreSQL Best Practices Guide](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)
- [The Ultimate Guide to Drizzle ORM + PostgreSQL (2025)](https://dev.to/sameer_saleem/the-ultimate-guide-to-drizzle-orm-postgresql-2025-edition-22b)
- [3 Biggest Mistakes with Drizzle ORM](https://medium.com/@lior_amsalem/3-biggest-mistakes-with-drizzle-orm-1327e2531aff)
- [Build better backends with Drizzle ORM](https://geekyants.com/en-us/blog/drizzle-orm-in-practice-building-better-backends-with-type-safe-sql)

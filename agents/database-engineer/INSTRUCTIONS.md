# Database Engineer Agent Instructions

## Role & Responsibilities

You are the **Database Engineer** for the Ibiza Marketplace platform. You design data structures, optimize queries, and manage schema changes using PostgreSQL and Knex.js.

## Core Responsibilities

1. **Schema Design**
   - Table structure and relationships
   - Data normalization
   - Index strategy

2. **Migrations**
   - Knex migration files
   - Safe, reversible changes
   - Data backfill planning

3. **Performance**
   - Query optimization
   - Index tuning
   - Connection pooling

4. **Reliability**
   - Data integrity constraints
   - Backup strategies
   - Recovery planning

## Key Locations

```
Api/
├── migrations/              # Knex migration files
│   ├── 20240101_create_users.ts
│   ├── 20240102_create_advertisements.ts
│   └── ...
├── seeds/                   # Database seed files
│   ├── 01_users.ts
│   ├── 02_categories.ts
│   └── ...
├── knexfile.ts              # Knex configuration
└── src/
    ├── types/               # TypeScript types (match DB schema)
    └── utils/context.ts     # Database connection context
```

## Migration Patterns

### Creating a Table

```typescript
// migrations/20240115_create_advertisements.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('advertisements', (table) => {
    table.increments('id').primary();
    table.string('title', 255).notNullable();
    table.text('description');
    table.decimal('price', 10, 2).notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.integer('category_id').unsigned().notNullable();
    table.enum('status', ['draft', 'active', 'sold', 'expired']).defaultTo('draft');
    table.point('location'); // PostgreSQL point type
    table.boolean('is_featured').defaultTo(false);
    table.timestamps(true, true); // created_at, updated_at

    // Foreign keys
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.foreign('category_id').references('categories.id').onDelete('RESTRICT');

    // Indexes
    table.index(['status', 'created_at']);
    table.index('user_id');
    table.index('category_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('advertisements');
}
```

### Adding Columns

```typescript
// migrations/20240120_add_advertisement_views.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable('advertisements', (table) => {
    table.integer('view_count').unsigned().defaultTo(0);
    table.timestamp('last_viewed_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable('advertisements', (table) => {
    table.dropColumn('view_count');
    table.dropColumn('last_viewed_at');
  });
}
```

### Creating Indexes

```typescript
// migrations/20240125_add_search_indexes.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // GIN index for full-text search
  await knex.raw(`
    CREATE INDEX idx_advertisements_search
    ON advertisements
    USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')))
  `);

  // Partial index for active ads only
  await knex.raw(`
    CREATE INDEX idx_active_advertisements
    ON advertisements (created_at DESC)
    WHERE status = 'active'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_advertisements_search');
  await knex.raw('DROP INDEX IF EXISTS idx_active_advertisements');
}
```

### Data Migration

```typescript
// migrations/20240130_migrate_categories.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add new column
  await knex.schema.alterTable('categories', (table) => {
    table.string('slug', 100).nullable();
  });

  // Backfill data
  const categories = await knex('categories').select('id', 'name');
  for (const cat of categories) {
    await knex('categories')
      .where('id', cat.id)
      .update({ slug: slugify(cat.name) });
  }

  // Make column required
  await knex.schema.alterTable('categories', (table) => {
    table.string('slug', 100).notNullable().alter();
    table.unique('slug');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table) => {
    table.dropColumn('slug');
  });
}
```

## PostgreSQL-Specific Features

### JSONB Columns

```typescript
// For flexible data storage
table.jsonb('metadata').defaultTo('{}');
table.jsonb('images').defaultTo('[]');

// Query JSONB
const ads = await knex('advertisements')
  .whereRaw("metadata->>'color' = ?", ['red'])
  .whereRaw("images @> ?", [JSON.stringify([{ type: 'main' }])]);
```

### Array Columns

```typescript
// PostgreSQL arrays
await knex.raw(`
  ALTER TABLE advertisements
  ADD COLUMN tags TEXT[] DEFAULT '{}'
`);

// Query arrays
const ads = await knex('advertisements')
  .whereRaw("'electronics' = ANY(tags)");
```

### Full-Text Search

```typescript
// Add tsvector column
await knex.raw(`
  ALTER TABLE advertisements
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || COALESCE(description, ''))
  ) STORED
`);

// Create GIN index
await knex.raw(`
  CREATE INDEX idx_search ON advertisements USING GIN(search_vector)
`);

// Search query
const results = await knex('advertisements')
  .whereRaw("search_vector @@ plainto_tsquery('english', ?)", [searchTerm])
  .orderByRaw("ts_rank(search_vector, plainto_tsquery('english', ?)) DESC", [searchTerm]);
```

## Query Optimization

### Use Explain Analyze

```typescript
// Debug slow queries
const explain = await knex.raw(`
  EXPLAIN ANALYZE
  SELECT * FROM advertisements
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 20
`);
console.log(explain.rows);
```

### Efficient Pagination

```typescript
// Cursor-based pagination (better for large datasets)
const ads = await knex('advertisements')
  .where('status', 'active')
  .where('created_at', '<', cursor)
  .orderBy('created_at', 'desc')
  .limit(20);

// Offset pagination (simpler but slower for large offsets)
const ads = await knex('advertisements')
  .where('status', 'active')
  .orderBy('created_at', 'desc')
  .offset(page * 20)
  .limit(20);
```

### Batch Operations

```typescript
// Batch insert
await knex.batchInsert('advertisement_images', images, 100);

// Batch update
await knex('advertisements')
  .whereIn('id', ids)
  .update({ status: 'expired' });
```

## Database Commands

```bash
cd Api

# Run all pending migrations
npm run migrate:latest

# Rollback last batch
npm run migrate:rollback

# Rollback all migrations
npm run migrate:rollback -- --all

# Create new migration
npx knex migrate:make create_table_name

# Run seeds
npm run seed:run

# Check migration status
npx knex migrate:status
```

## Schema Documentation

### Core Tables

```
users
├── id (PK)
├── email (unique)
├── name
├── password_hash
├── is_verified
├── created_at
└── updated_at

advertisements
├── id (PK)
├── user_id (FK → users)
├── category_id (FK → categories)
├── title
├── description
├── price
├── status
├── location (point)
├── created_at
└── updated_at

categories
├── id (PK)
├── name
├── slug (unique)
├── parent_id (FK → categories, nullable)
└── sort_order

messages
├── id (PK)
├── conversation_id
├── sender_id (FK → users)
├── content
├── created_at
└── read_at
```

## Best Practices

1. **Always use transactions** for multi-step operations
2. **Add indexes** for frequently queried columns
3. **Use foreign keys** to maintain referential integrity
4. **Test migrations** on a copy of production data
5. **Keep migrations small** and focused
6. **Never modify** committed migrations; create new ones

## Handoff Protocol

After schema changes:

```json
{
  "from": "database-engineer",
  "to": "backend-developer",
  "task": "Added view_count to advertisements",
  "migration": "20240120_add_advertisement_views.ts",
  "changes": [
    "New column: advertisements.view_count (integer, default 0)",
    "New column: advertisements.last_viewed_at (timestamp, nullable)"
  ],
  "notes": "Run npm run migrate:latest to apply"
}
```

## Resources

- **Project Docs**: `CLAUDE.md`
- **Code Standards**: `agents/shared/conventions.md`
- **Knex.js Docs**: https://knexjs.org/
- **PostgreSQL Docs**: https://www.postgresql.org/docs/

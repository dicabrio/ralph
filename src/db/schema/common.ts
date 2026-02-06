import { sql } from 'drizzle-orm'
import { integer } from 'drizzle-orm/sqlite-core'

// Reusable timestamp columns for SQLite
// SQLite doesn't have native timestamp type, so we use integer with Unix timestamp
export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull()
    .$onUpdate(() => new Date()),
}

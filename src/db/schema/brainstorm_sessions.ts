import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { projects } from './projects'

// Session status enum type
export type BrainstormSessionStatus = 'active' | 'completed' | 'cancelled' | 'error'

// Brainstorm sessions table for storing chat sessions per project
export const brainstormSessions = sqliteTable(
  'brainstorm_sessions',
  {
    id: integer({ mode: 'number' }).primaryKey({
      autoIncrement: true,
    }),
    projectId: integer('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Title for the session (can be auto-generated from first message or user-provided)
    title: text(),
    // Session status
    status: text('status', {
      enum: ['active', 'completed', 'cancelled', 'error'],
    })
      .notNull()
      .default('active'),
    // Store generated stories as JSON (optional, for completed sessions)
    generatedStories: text('generated_stories'), // JSON string
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Index on project_id for efficient project session queries
    index('brainstorm_sessions_project_id_idx').on(table.projectId),
    // Index on created_at for chronological session listing
    index('brainstorm_sessions_created_at_idx').on(table.createdAt),
    // Composite index for querying sessions by project and time
    index('brainstorm_sessions_project_created_idx').on(
      table.projectId,
      table.createdAt
    ),
  ]
)

// Type exports
export type BrainstormSession = typeof brainstormSessions.$inferSelect
export type NewBrainstormSession = typeof brainstormSessions.$inferInsert

import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { brainstormSessions } from './brainstorm_sessions'

// Message role type (user or assistant)
export type MessageRole = 'user' | 'assistant'

// Brainstorm messages table for storing chat history
export const brainstormMessages = sqliteTable(
  'brainstorm_messages',
  {
    id: integer({ mode: 'number' }).primaryKey({
      autoIncrement: true,
    }),
    sessionId: integer('session_id', { mode: 'number' })
      .notNull()
      .references(() => brainstormSessions.id, { onDelete: 'cascade' }),
    // Role: 'user' or 'assistant'
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    // Message content
    content: text('content').notNull(),
    // Store generated stories as JSON (for assistant messages that contain stories)
    generatedStories: text('generated_stories'), // JSON string
    // Timestamp for ordering messages within a session
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => [
    // Index on session_id for efficient message retrieval
    index('brainstorm_messages_session_id_idx').on(table.sessionId),
    // Composite index for ordered message retrieval per session
    index('brainstorm_messages_session_created_idx').on(
      table.sessionId,
      table.createdAt
    ),
  ]
)

// Type exports
export type BrainstormMessage = typeof brainstormMessages.$inferSelect
export type NewBrainstormMessage = typeof brainstormMessages.$inferInsert

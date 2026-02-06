import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { projects } from './projects'

// Log type enum for stdout/stderr classification
export type LogType = 'stdout' | 'stderr'

// Runner logs table for storing terminal output from Claude runners
export const runnerLogs = sqliteTable(
  'runner_logs',
  {
    id: integer({ mode: 'number' }).primaryKey({
      autoIncrement: true,
    }),
    projectId: integer('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    storyId: text('story_id'), // Story ID from prd.json (e.g., "DB-004"), nullable for general project logs
    logContent: text('log_content').notNull(),
    logType: text('log_type', { enum: ['stdout', 'stderr'] })
      .notNull()
      .default('stdout'),
    timestamp: integer({ mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => [
    // Index on project_id for efficient project log queries
    index('runner_logs_project_id_idx').on(table.projectId),
    // Index on timestamp for chronological log retrieval
    index('runner_logs_timestamp_idx').on(table.timestamp),
    // Composite index for querying logs by project and time
    index('runner_logs_project_timestamp_idx').on(
      table.projectId,
      table.timestamp
    ),
  ]
)

// Type exports
export type RunnerLog = typeof runnerLogs.$inferSelect
export type NewRunnerLog = typeof runnerLogs.$inferInsert

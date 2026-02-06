import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './common'

// Projects table for storing connected projects
export const projects = sqliteTable('projects', {
  id: integer({ mode: 'number' }).primaryKey({
    autoIncrement: true,
  }),
  name: text().notNull(),
  path: text().notNull().unique(),
  description: text(),
  branchName: text('branch_name'),
  ...timestamps,
})

// Type exports
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

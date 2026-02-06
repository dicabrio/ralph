import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './schema/index.ts'

// Build database file path from DATA_PATH environment variable
// In Docker: DATA_PATH=/data → /data/ralph.db
// In local dev: DATA_PATH=./data → ./data/ralph.db
const dataPath = process.env.DATA_PATH || './data'
const databasePath = join(dataPath, 'ralph.db')

// Ensure the data directory exists
const dataDir = dirname(databasePath)
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

// Initialize better-sqlite3 with the database file path
const sqlite = new Database(databasePath)

// Enable WAL mode for better concurrent performance
sqlite.pragma('journal_mode = WAL')

// Export the drizzle database instance
export const db = drizzle(sqlite, { schema })

// Export the raw sqlite instance for advanced use cases
export { sqlite }

import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import path from 'node:path'

config({ path: ['.env.local', '.env'] })

// Build database file path from DATA_PATH environment variable
// In Docker: DATA_PATH=/data → /data/ralph.db
// In local dev: DATA_PATH=./data → ./data/ralph.db
const dataPath = process.env.DATA_PATH || './data'
const databasePath = path.join(dataPath, 'ralph.db')

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema/index.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: databasePath,
  },
  verbose: true,
  strict: true,
})

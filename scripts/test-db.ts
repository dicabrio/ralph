#!/usr/bin/env npx tsx
/**
 * Test script to verify database connection and query execution
 * Run with: npx tsx scripts/test-db.ts
 */

import { db, sqlite } from '../src/db/index.ts'
import { sql } from 'drizzle-orm'
import { todos } from '../src/db/schema/index.ts'

function testDatabase() {
  console.log('Testing database connection...\n')

  // Test 1: Check SQLite version
  const versionResult = sqlite.prepare('SELECT sqlite_version() as version').get() as { version: string }
  console.log(`✓ SQLite version: ${versionResult.version}`)

  // Test 2: Check WAL mode
  const walResult = sqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
  console.log(`✓ Journal mode: ${walResult.journal_mode}`)

  // Test 3: Test raw SQL query via sqlite
  const rawResult = sqlite.prepare('SELECT 1 + 1 as result').get() as { result: number }
  console.log(`✓ Raw SQL query: 1 + 1 = ${rawResult.result}`)

  // Test 4: Check if todos table exists (might not exist if migrations haven't run)
  const tableCheck = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='todos'"
  ).get() as { name: string } | undefined

  if (tableCheck) {
    console.log(`✓ Todos table exists`)

    // Test 5: Count todos via Drizzle
    const countResult = db.select({ count: sql<number>`count(*)` }).from(todos).all()
    console.log(`✓ Todos count: ${countResult[0].count}`)
  } else {
    console.log(`⚠ Todos table does not exist (run migrations first: pnpm db:migrate)`)
  }

  console.log('\n✓ Database connection test passed!')
}

try {
  testDatabase()
} catch (error) {
  console.error('\n✗ Database connection test failed:', error)
  process.exit(1)
}

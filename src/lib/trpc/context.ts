/**
 * tRPC Context
 *
 * Creates the context that is available in all tRPC procedures.
 * This is called for every request.
 */
import type { Context } from './trpc'

/**
 * Create context for each request.
 * Add database connections, session data, etc. here.
 */
export async function createContext(): Promise<Context> {
  // Future: Add database, session, etc.
  return {}
}

export type { Context }

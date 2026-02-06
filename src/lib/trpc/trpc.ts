/**
 * tRPC Server Configuration
 *
 * This file sets up the core tRPC server with context and procedures.
 * - Base procedure (publicProcedure) for unauthenticated endpoints
 * - Router and middleware utilities
 * - Type exports for client-side usage
 */
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

/**
 * Context that's available in all tRPC procedures.
 * Extended in createContext function.
 */
export interface Context {
  // Add context properties here (e.g., session, db)
}

/**
 * Initialize tRPC with context and transformer.
 * Using superjson for automatic serialization of Dates, Maps, Sets, etc.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape
  },
})

/**
 * Export reusable router and procedure helpers.
 * - router: Create new routers
 * - publicProcedure: Base procedure without auth
 * - middleware: Create middleware functions
 */
export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware
export const createCallerFactory = t.createCallerFactory

/**
 * Merge multiple routers (useful for combining router modules)
 */
export const mergeRouters = t.mergeRouters

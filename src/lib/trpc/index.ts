/**
 * tRPC Module Exports
 *
 * Re-exports all tRPC utilities for convenient imports.
 */

// Server-side exports
export { router, publicProcedure, middleware, createCallerFactory, mergeRouters } from './trpc'
export type { Context } from './trpc'

// Router exports
export { appRouter } from './routers'
export type { AppRouter } from './routers'

// Client-side exports
export { trpc, createTRPCClient } from './client'

// Context factory
export { createContext } from './context'

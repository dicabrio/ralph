/**
 * tRPC API Handler
 *
 * Handles all tRPC requests at /api/trpc/*
 * Uses the fetch adapter for compatibility with TanStack Start.
 */
import { createFileRoute } from '@tanstack/react-router'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/lib/trpc/routers'
import { createContext } from '@/lib/trpc/context'

/**
 * Handle tRPC requests
 */
async function handleTRPC(request: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext,
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: ({ request }) => handleTRPC(request),
      POST: ({ request }) => handleTRPC(request),
    },
  },
})

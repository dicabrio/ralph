/**
 * tRPC Client Configuration
 *
 * Sets up the tRPC client with TanStack Query integration.
 * Use the exported `trpc` object for type-safe API calls.
 */
import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from './routers'

/**
 * tRPC React Query hooks
 * Usage: trpc.health.check.useQuery()
 */
export const trpc = createTRPCReact<AppRouter>()

/**
 * Get the base URL for tRPC requests.
 * Works in both server and browser environments.
 */
function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser - use relative URL
    return ''
  }
  // SSR - use localhost
  return `http://localhost:${process.env.PORT ?? 9000}`
}

/**
 * Create tRPC client with links
 * - httpBatchLink: Batches multiple requests into one HTTP call
 * - superjson: Handles Date, Map, Set serialization
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
      }),
    ],
  })
}

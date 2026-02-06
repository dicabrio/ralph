/**
 * tRPC Provider
 *
 * Wraps the application with tRPC context for React Query integration.
 */
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTRPCClient } from '@/lib/trpc/client'

interface TRPCProviderProps {
  children: React.ReactNode
}

/**
 * tRPC Provider component
 * Sets up tRPC client and QueryClient for the application.
 *
 * Note: When using with existing TanStack Query setup,
 * pass the existing queryClient instead of creating a new one.
 */
export function TRPCProvider({ children }: TRPCProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 30 * 60 * 1000, // 30 minutes
          },
        },
      })
  )

  const [trpcClient] = useState(() => createTRPCClient())

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}

/**
 * Hook to get tRPC utilities (for invalidation, prefetching, etc.)
 */
export { trpc }

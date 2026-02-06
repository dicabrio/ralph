/**
 * Health Router
 *
 * Provides health check endpoints for monitoring and testing.
 */
import { z } from 'zod'
import { router, publicProcedure } from '../trpc'

export const healthRouter = router({
  /**
   * Basic health check - returns server status
   */
  check: publicProcedure.query(() => {
    return {
      status: 'ok' as const,
      timestamp: new Date(),
      uptime: process.uptime(),
    }
  }),

  /**
   * Echo endpoint for testing - returns the input message
   */
  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => {
      return {
        echo: input.message,
        receivedAt: new Date(),
      }
    }),
})

export type HealthRouter = typeof healthRouter

/**
 * tRPC App Router
 *
 * Main router that combines all sub-routers.
 * Import this in the API handler to serve tRPC endpoints.
 */
import { router } from '../trpc'
import { healthRouter } from './health'
import { projectsRouter } from './projects'
import { storiesRouter } from './stories'
import { skillsRouter } from './skills'

/**
 * Main application router
 * Add new routers here as the API grows
 */
export const appRouter = router({
  health: healthRouter,
  projects: projectsRouter,
  stories: storiesRouter,
  skills: skillsRouter,
})

/**
 * Export type definition of API
 * Used for client-side type inference
 */
export type AppRouter = typeof appRouter

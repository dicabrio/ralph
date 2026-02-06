/**
 * Runner Router
 *
 * API endpoints for managing Claude runners.
 * Handles starting, stopping, and querying runner status.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { runnerManager } from '@/lib/services/runnerManager'

// Input schemas
const startRunnerSchema = z.object({
  projectId: z.number().int().positive(),
  storyId: z.string().optional(),
})

const stopRunnerSchema = z.object({
  projectId: z.number().int().positive(),
  force: z.boolean().optional().default(false),
})

const getStatusSchema = z.object({
  projectId: z.number().int().positive(),
})

const setAutoRestartSchema = z.object({
  projectId: z.number().int().positive(),
  enabled: z.boolean(),
})

/**
 * Get the relative project path from the full path
 * The project path stored in DB is absolute, we need the relative path
 * from PROJECTS_ROOT for container mounting
 */
function getRelativeProjectPath(fullPath: string): string {
  const projectsRoot = process.env.PROJECTS_ROOT || '/projects'
  if (fullPath.startsWith(projectsRoot)) {
    return fullPath.substring(projectsRoot.length).replace(/^\//, '')
  }
  // If not starting with PROJECTS_ROOT, use the last path component
  return fullPath.split('/').filter(Boolean).pop() || fullPath
}

export const runnerRouter = router({
  /**
   * Start a runner for a project
   */
  start: publicProcedure
    .input(startRunnerSchema)
    .mutation(async ({ input }) => {
      const { projectId, storyId } = input

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${projectId} not found`,
        })
      }

      try {
        const relativePath = getRelativeProjectPath(project.path)
        const state = await runnerManager.start(projectId, relativePath, storyId)
        return state
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start runner',
        })
      }
    }),

  /**
   * Stop a running runner
   */
  stop: publicProcedure
    .input(stopRunnerSchema)
    .mutation(async ({ input }) => {
      const { projectId, force } = input

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${projectId} not found`,
        })
      }

      try {
        const state = await runnerManager.stop(projectId, force)
        return state
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to stop runner',
        })
      }
    }),

  /**
   * Get the status of a runner
   */
  getStatus: publicProcedure
    .input(getStatusSchema)
    .query(async ({ input }) => {
      const { projectId } = input

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${projectId} not found`,
        })
      }

      try {
        const state = await runnerManager.getStatus(projectId)
        return state
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get runner status',
        })
      }
    }),

  /**
   * Get status of all runners
   */
  getAllStatus: publicProcedure.query(async () => {
    try {
      const states = await runnerManager.getAllStatus()
      return states
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get runner statuses',
      })
    }
  }),

  /**
   * Enable or disable auto-restart for a project
   */
  setAutoRestart: publicProcedure
    .input(setAutoRestartSchema)
    .mutation(async ({ input }) => {
      const { projectId, enabled } = input

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${projectId} not found`,
        })
      }

      runnerManager.setAutoRestart(projectId, enabled)

      return {
        projectId,
        autoRestartEnabled: enabled,
      }
    }),

  /**
   * Get auto-restart status for a project
   */
  getAutoRestartStatus: publicProcedure
    .input(getStatusSchema)
    .query(async ({ input }) => {
      const { projectId } = input

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${projectId} not found`,
        })
      }

      return {
        projectId,
        autoRestartEnabled: runnerManager.isAutoRestartEnabled(projectId),
      }
    }),
})

export type RunnerRouter = typeof runnerRouter

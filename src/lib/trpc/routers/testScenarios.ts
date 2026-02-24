/**
 * Test Scenarios Router
 *
 * API for managing test scenarios that are generated when stories
 * transition to review status.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects } from '@/db/schema'
import {
  readTestScenario,
  updateTestItem,
  generateTestScenarios,
  getTestScenarioJsonPath,
} from '@/lib/services/testScenarioGenerator'
import { existsSync } from 'node:fs'

/**
 * Get project by ID with validation
 */
async function getProjectById(projectId: number) {
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

  return project
}

export const testScenariosRouter = router({
  /**
   * Get test scenario by story ID
   */
  getByStoryId: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)

      const scenario = await readTestScenario(project.path, input.storyId)

      if (!scenario) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test scenario not found for story ${input.storyId}`,
        })
      }

      return scenario
    }),

  /**
   * Check if a test scenario exists for a story
   */
  exists: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const jsonPath = getTestScenarioJsonPath(project.path, input.storyId)
      return existsSync(jsonPath)
    }),

  /**
   * Update a test item's checked status
   */
  updateItem: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
      itemId: z.string().min(1),
      checked: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)

      try {
        const scenario = await updateTestItem(
          project.path,
          input.storyId,
          input.itemId,
          input.checked,
        )
        return scenario
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: error.message,
          })
        }
        throw error
      }
    }),

  /**
   * Regenerate test scenarios for a story
   * Useful if the initial generation failed or if acceptance criteria changed
   */
  regenerate: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)

      // We need to get the story data - import the stories router helper
      const { join } = await import('node:path')
      const { readFile } = await import('node:fs/promises')
      const { existsSync } = await import('node:fs')

      const prdPath = join(project.path, 'stories', 'prd.json')

      if (!existsSync(prdPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'prd.json not found',
        })
      }

      const content = await readFile(prdPath, 'utf-8')
      const prd = JSON.parse(content)
      const story = prd.userStories?.find((s: { id: string }) => s.id === input.storyId)

      if (!story) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Story ${input.storyId} not found`,
        })
      }

      const scenario = await generateTestScenarios(story, project.path)
      return scenario
    }),
})

export type TestScenariosRouter = typeof testScenariosRouter

/**
 * Stories Router
 *
 * API for managing user stories from prd.json files.
 * Reads stories from project's prd.json and writes status updates back.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects } from '@/db/schema'

// Valid story statuses
export const storyStatusEnum = z.enum(['pending', 'in_progress', 'done', 'failed'])
export type StoryStatus = z.infer<typeof storyStatusEnum>

// Story schema from prd.json
export const storySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.number().int().positive(),
  status: storyStatusEnum,
  epic: z.string(),
  dependencies: z.array(z.string()),
  recommendedSkills: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
})

export type Story = z.infer<typeof storySchema>

// PRD.json schema with stories
const prdJsonSchema = z.object({
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  branchName: z.string().optional(),
  userStories: z.array(storySchema),
}).passthrough()

type PrdJson = z.infer<typeof prdJsonSchema>

// Valid status transitions
// pending -> in_progress, done (manual skip)
// in_progress -> done, failed
// done -> pending (reopening)
// failed -> in_progress, pending
const validTransitions: Record<StoryStatus, StoryStatus[]> = {
  pending: ['in_progress', 'done'],
  in_progress: ['done', 'failed', 'pending'],
  done: ['pending'],
  failed: ['in_progress', 'pending'],
}

/**
 * Check if a status transition is valid
 */
function isValidTransition(from: StoryStatus, to: StoryStatus): boolean {
  return validTransitions[from].includes(to)
}

/**
 * Get the prd.json path for a project
 */
function getPrdPath(projectPath: string): string {
  return join(projectPath, 'stories', 'prd.json')
}

/**
 * Read and parse prd.json from a project path
 */
async function readPrdJson(projectPath: string): Promise<PrdJson> {
  const prdPath = getPrdPath(projectPath)

  if (!existsSync(prdPath)) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `prd.json not found at ${prdPath}`,
    })
  }

  try {
    const content = await readFile(prdPath, 'utf-8')
    const data = JSON.parse(content)
    return prdJsonSchema.parse(data)
  } catch (error) {
    if (error instanceof TRPCError) throw error
    if (error instanceof z.ZodError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid prd.json format: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`,
      })
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to parse prd.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

/**
 * Write prd.json back to disk
 */
async function writePrdJson(projectPath: string, data: PrdJson): Promise<void> {
  const prdPath = getPrdPath(projectPath)

  try {
    const content = JSON.stringify(data, null, 2) + '\n'
    await writeFile(prdPath, content, 'utf-8')
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to write prd.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

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

/**
 * Find a story by ID in the stories array
 */
function findStoryById(stories: Story[], storyId: string): Story | undefined {
  return stories.find(s => s.id === storyId)
}

export const storiesRouter = router({
  /**
   * List all stories for a project
   */
  listByProject: publicProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const prdData = await readPrdJson(project.path)

      return prdData.userStories
    }),

  /**
   * Get a single story by project ID and story ID
   */
  getById: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const prdData = await readPrdJson(project.path)

      const story = findStoryById(prdData.userStories, input.storyId)

      if (!story) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Story with id "${input.storyId}" not found in project`,
        })
      }

      return story
    }),

  /**
   * Update a story's status
   * Validates status transitions
   */
  updateStatus: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
      status: storyStatusEnum,
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const prdData = await readPrdJson(project.path)

      const storyIndex = prdData.userStories.findIndex(s => s.id === input.storyId)

      if (storyIndex === -1) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Story with id "${input.storyId}" not found in project`,
        })
      }

      const currentStory = prdData.userStories[storyIndex]
      const currentStatus = currentStory.status
      const newStatus = input.status

      // Skip if status is the same
      if (currentStatus === newStatus) {
        return currentStory
      }

      // Validate transition
      if (!isValidTransition(currentStatus, newStatus)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid status transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${validTransitions[currentStatus].join(', ')}`,
        })
      }

      // Update the story status
      prdData.userStories[storyIndex] = {
        ...currentStory,
        status: newStatus,
      }

      // Write back to file
      await writePrdJson(project.path, prdData)

      return prdData.userStories[storyIndex]
    }),

  /**
   * Update a story's recommended skills
   */
  updateSkills: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
      recommendedSkills: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const prdData = await readPrdJson(project.path)

      const storyIndex = prdData.userStories.findIndex(s => s.id === input.storyId)

      if (storyIndex === -1) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Story with id "${input.storyId}" not found in project`,
        })
      }

      // Update the story skills
      prdData.userStories[storyIndex] = {
        ...prdData.userStories[storyIndex],
        recommendedSkills: input.recommendedSkills,
      }

      // Write back to file
      await writePrdJson(project.path, prdData)

      return prdData.userStories[storyIndex]
    }),
})

export type StoriesRouter = typeof storiesRouter

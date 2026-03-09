/**
 * Archive Router
 *
 * API for managing archived stories. Stories that are done can be archived
 * to keep prd.json clean while preserving history in archived.json.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects } from '@/db/schema'
import {
  archivedPrdSchema,
  type ArchivedStory,
  type ArchivedPrd,
} from '@/lib/schemas/prdSchema'

// Import story schema from stories router for prd.json parsing
import { storySchema, type Story } from './stories'

// PRD.json schema for reading (passthrough for extra fields)
const prdJsonSchema = z.object({
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  branchName: z.string().optional(),
  userStories: z.array(storySchema),
}).passthrough()

type PrdJson = z.infer<typeof prdJsonSchema>

/**
 * Get the prd.json path for a project
 */
function getPrdPath(projectPath: string): string {
  return join(projectPath, 'stories', 'prd.json')
}

/**
 * Get the archived.json path for a project
 */
function getArchivedPath(projectPath: string): string {
  return join(projectPath, 'stories', 'archived.json')
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
        message: `Invalid prd.json format: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
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
    const content = `${JSON.stringify(data, null, 2)}\n`
    await writeFile(prdPath, content, 'utf-8')
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to write prd.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

/**
 * Read and parse archived.json from a project path
 * Creates default structure if file doesn't exist
 */
async function readArchivedJson(projectPath: string, projectName: string): Promise<ArchivedPrd> {
  const archivedPath = getArchivedPath(projectPath)

  if (!existsSync(archivedPath)) {
    // Return empty structure if file doesn't exist
    return {
      projectName,
      archivedStories: [],
    }
  }

  try {
    const content = await readFile(archivedPath, 'utf-8')
    const data = JSON.parse(content)
    return archivedPrdSchema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid archived.json format: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      })
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to parse archived.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

/**
 * Write archived.json to disk
 * Creates parent directory if it doesn't exist
 */
async function writeArchivedJson(projectPath: string, data: ArchivedPrd): Promise<void> {
  const archivedPath = getArchivedPath(projectPath)
  const dir = dirname(archivedPath)

  try {
    // Ensure directory exists
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const content = `${JSON.stringify(data, null, 2)}\n`
    await writeFile(archivedPath, content, 'utf-8')
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to write archived.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

/**
 * Create an archived story from a regular story by adding archivedAt timestamp
 */
function createArchivedStory(story: Story): ArchivedStory {
  return {
    ...story,
    archivedAt: new Date().toISOString(),
  }
}

/**
 * Clean up dependencies: remove archived story IDs from all remaining stories
 * Returns the number of dependencies that were cleaned up
 */
function cleanupDependencies(prdData: PrdJson, archivedStoryIds: string[]): number {
  let cleanedCount = 0

  for (const story of prdData.userStories) {
    if (!story.dependencies || story.dependencies.length === 0) {
      continue
    }

    const originalLength = story.dependencies.length

    // Filter out archived story IDs (also ignores self-references as edge case)
    story.dependencies = story.dependencies.filter(
      (depId) => !archivedStoryIds.includes(depId) && depId !== story.id
    )

    cleanedCount += originalLength - story.dependencies.length
  }

  return cleanedCount
}

export const archiveRouter = router({
  /**
   * List all archived stories for a project
   */
  listByProject: publicProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)

      // Read prd.json to get project name for potential new archived.json
      const prdData = await readPrdJson(project.path)
      const projectName = prdData.projectName || project.name

      const archivedData = await readArchivedJson(project.path, projectName)
      return archivedData.archivedStories
    }),

  /**
   * Archive a single story
   * Moves story from prd.json to archived.json
   * Only stories with status 'done' can be archived
   */
  archiveStory: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyId: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)

      // Read both files
      const prdData = await readPrdJson(project.path)
      const projectName = prdData.projectName || project.name
      const archivedData = await readArchivedJson(project.path, projectName)

      // Find the story to archive
      const storyIndex = prdData.userStories.findIndex(s => s.id === input.storyId)

      if (storyIndex === -1) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Story with id "${input.storyId}" not found in project`,
        })
      }

      const story = prdData.userStories[storyIndex]

      // Validate that only done stories can be archived
      if (story.status !== 'done') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Only stories with status 'done' can be archived. Story "${input.storyId}" has status '${story.status}'`,
        })
      }

      // Check if story is already archived - if so, update the timestamp instead of throwing
      const existingArchivedIndex = archivedData.archivedStories.findIndex(s => s.id === input.storyId)
      const isUpdate = existingArchivedIndex !== -1

      // Create archived version of the story with new timestamp
      const archivedStory = createArchivedStory(story)

      // Remove from prd.json
      prdData.userStories.splice(storyIndex, 1)

      // Clean up dependencies: remove archived story ID from all remaining stories
      const cleanedDependencies = cleanupDependencies(prdData, [input.storyId])

      if (isUpdate) {
        // Update existing archived entry with new timestamp
        archivedData.archivedStories[existingArchivedIndex] = archivedStory
      } else {
        // Add new entry to archived.json
        archivedData.archivedStories.push(archivedStory)
      }

      // Atomic-ish write: write archived first, then prd
      // If prd write fails after archived write, we may have duplicates
      // but no data loss. The archived version is preserved.
      // Note: both story removal and dependency cleanup are written atomically to prd.json
      await writeArchivedJson(project.path, archivedData)
      await writePrdJson(project.path, prdData)

      return {
        ...archivedStory,
        cleanedDependencies,
        action: isUpdate ? 'updated' : 'archived' as const,
      }
    }),

  /**
   * Archive multiple stories at once
   * All stories must have status 'done'
   */
  archiveMultiple: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      storyIds: z.array(z.string().min(1)).min(1),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)

      // Read both files
      const prdData = await readPrdJson(project.path)
      const projectName = prdData.projectName || project.name
      const archivedData = await readArchivedJson(project.path, projectName)

      const archivedStories: ArchivedStory[] = []
      const updatedStories: ArchivedStory[] = []
      const errors: string[] = []
      const indicesToRemove: number[] = []
      const indicesToUpdate: { storyIndex: number; archivedIndex: number }[] = []

      for (const storyId of input.storyIds) {
        const storyIndex = prdData.userStories.findIndex(s => s.id === storyId)

        if (storyIndex === -1) {
          errors.push(`Story "${storyId}" not found`)
          continue
        }

        const story = prdData.userStories[storyIndex]

        if (story.status !== 'done') {
          errors.push(`Story "${storyId}" has status '${story.status}', only 'done' stories can be archived`)
          continue
        }

        const existingArchivedIndex = archivedData.archivedStories.findIndex(s => s.id === storyId)
        const archivedStory = createArchivedStory(story)

        if (existingArchivedIndex !== -1) {
          // Story already in archive - will be updated
          updatedStories.push(archivedStory)
          indicesToUpdate.push({ storyIndex, archivedIndex: existingArchivedIndex })
        } else {
          // New archive entry
          archivedStories.push(archivedStory)
        }
        indicesToRemove.push(storyIndex)
      }

      if (archivedStories.length === 0 && updatedStories.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No stories could be archived: ${errors.join('; ')}`,
        })
      }

      // Remove stories from prd.json (in reverse order to maintain indices)
      indicesToRemove.sort((a, b) => b - a)
      for (const index of indicesToRemove) {
        prdData.userStories.splice(index, 1)
      }

      // Clean up dependencies: remove all archived story IDs from remaining stories
      const allArchivedIds = [...archivedStories, ...updatedStories].map(s => s.id)
      const cleanedDependencies = cleanupDependencies(prdData, allArchivedIds)

      // Update existing archived entries
      for (const { archivedIndex } of indicesToUpdate) {
        const updatedStory = updatedStories.find(s => s.id === archivedData.archivedStories[archivedIndex].id)
        if (updatedStory) {
          archivedData.archivedStories[archivedIndex] = updatedStory
        }
      }

      // Add new archived stories
      archivedData.archivedStories.push(...archivedStories)

      // Write both files atomically (story removal + dependency cleanup in one prd.json write)
      await writeArchivedJson(project.path, archivedData)
      await writePrdJson(project.path, prdData)

      return {
        archived: archivedStories,
        updated: updatedStories,
        cleanedDependencies,
        errors: errors.length > 0 ? errors : undefined,
      }
    }),
})

export type ArchiveRouter = typeof archiveRouter

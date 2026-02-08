/**
 * Projects Router
 *
 * CRUD operations for managing projects.
 * Projects are stored in the database, with metadata synced from prd.json files.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects, type Project } from '@/db/schema'
import { discoverProjects, isValidProjectPath } from '@/lib/services/projectDiscovery'
import { ensureClaudePermissions } from '@/lib/services/claudePermissions'
import { expandPath } from '@/lib/utils.server'
import { claudeLoopService } from '@/lib/services/claudeLoopService'
import { validatePrd } from '@/lib/schemas/prdSchema'

// Zod schemas for input validation
const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  path: z.string().min(1, 'Path is required'),
  description: z.string().optional(),
  branchName: z.string().optional(),
})

const updateProjectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1, 'Name is required').max(255).optional(),
  path: z.string().min(1, 'Path is required').optional(),
  description: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
})

// PRD.json schema for validation
const prdJsonSchema = z.object({
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  branchName: z.string().optional(),
}).passthrough()

/**
 * Reads and parses prd.json from a project path
 * Returns null if file doesn't exist or can't be parsed
 */
async function readPrdJson(projectPath: string): Promise<z.infer<typeof prdJsonSchema> | null> {
  const prdPath = join(projectPath, 'stories', 'prd.json')

  if (!existsSync(prdPath)) {
    return null
  }

  try {
    const content = await readFile(prdPath, 'utf-8')
    const data = JSON.parse(content)
    return prdJsonSchema.parse(data)
  } catch {
    return null
  }
}

/**
 * Syncs project metadata from prd.json file
 * Updates description and branch_name from the file if they differ
 */
async function syncProjectWithPrd(project: Project): Promise<Project> {
  const prdData = await readPrdJson(project.path)

  if (!prdData) {
    return project
  }

  // Extract metadata from prd.json
  const prdDescription = prdData.projectDescription || null
  const prdBranchName = prdData.branchName || null

  // Check if we need to update
  const needsUpdate =
    (prdDescription !== null && prdDescription !== project.description) ||
    (prdBranchName !== null && prdBranchName !== project.branchName)

  if (needsUpdate) {
    const updates: Partial<typeof projects.$inferInsert> = {}

    if (prdDescription !== null && prdDescription !== project.description) {
      updates.description = prdDescription
    }
    if (prdBranchName !== null && prdBranchName !== project.branchName) {
      updates.branchName = prdBranchName
    }

    const [updated] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, project.id))
      .returning()

    return updated
  }

  return project
}

/**
 * Validates that a path exists on the filesystem
 * Expands ~ to home directory before checking
 */
function validatePathExists(path: string): void {
  const expandedPath = expandPath(path)
  if (!existsSync(expandedPath)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Path does not exist: ${path}`,
    })
  }
}

export const projectsRouter = router({
  /**
   * List all projects
   * Syncs each project with its prd.json before returning
   */
  list: publicProcedure.query(async () => {
    const allProjects = await db.select().from(projects)

    // Sync each project with prd.json in parallel
    const syncedProjects = await Promise.all(
      allProjects.map(project => syncProjectWithPrd(project))
    )

    return syncedProjects
  }),

  /**
   * Get a single project by ID
   * Syncs with prd.json before returning
   */
  getById: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.id} not found`,
        })
      }

      return syncProjectWithPrd(project)
    }),

  /**
   * Create a new project
   * Validates that the path exists on filesystem
   * Expands ~ to home directory and stores the expanded path
   */
  create: publicProcedure
    .input(createProjectSchema)
    .mutation(async ({ input }) => {
      // Expand ~ to home directory
      const expandedPath = expandPath(input.path)

      // Validate path exists
      validatePathExists(expandedPath)

      // Try to read prd.json for initial metadata
      const prdData = await readPrdJson(expandedPath)

      // Use prd.json values as defaults if not provided
      const name = input.name || prdData?.projectName || 'Untitled Project'
      const description = input.description ?? prdData?.projectDescription ?? null
      const branchName = input.branchName ?? prdData?.branchName ?? null

      try {
        const [newProject] = await db
          .insert(projects)
          .values({
            name,
            path: expandedPath, // Store expanded path in database
            description,
            branchName,
          })
          .returning()

        // Ensure Claude permissions are set up for the project
        // Creates .claude/settings.local.json with safe defaults if it doesn't exist
        try {
          ensureClaudePermissions(expandedPath)
        } catch (e) {
          // Log but don't fail project creation if permissions setup fails
          console.error('Failed to set up Claude permissions:', e)
        }

        return newProject
      } catch (error) {
        // Handle unique constraint violation on path
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A project with path "${expandedPath}" already exists`,
          })
        }
        throw error
      }
    }),

  /**
   * Update an existing project
   * Validates that the new path exists if path is being changed
   * Expands ~ to home directory and stores the expanded path
   */
  update: publicProcedure
    .input(updateProjectSchema)
    .mutation(async ({ input }) => {
      const { id, ...updates } = input

      // Expand ~ in path if provided
      const expandedPath = updates.path ? expandPath(updates.path) : undefined

      // Check if project exists
      const [existing] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${id} not found`,
        })
      }

      // Validate new path if being updated
      if (expandedPath && expandedPath !== existing.path) {
        validatePathExists(expandedPath)
      }

      // Filter out undefined values
      const cleanUpdates: Partial<typeof projects.$inferInsert> = {}
      if (updates.name !== undefined) cleanUpdates.name = updates.name
      if (expandedPath !== undefined) cleanUpdates.path = expandedPath // Store expanded path
      if (updates.description !== undefined) cleanUpdates.description = updates.description
      if (updates.branchName !== undefined) cleanUpdates.branchName = updates.branchName

      if (Object.keys(cleanUpdates).length === 0) {
        return existing
      }

      try {
        const [updated] = await db
          .update(projects)
          .set(cleanUpdates)
          .where(eq(projects.id, id))
          .returning()

        return updated
      } catch (error) {
        // Handle unique constraint violation on path
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A project with path "${expandedPath}" already exists`,
          })
        }
        throw error
      }
    }),

  /**
   * Delete a project from Ralph
   *
   * This removes the project from the database but does NOT delete
   * any files from the filesystem. The project folder remains intact.
   *
   * Before deletion:
   * - Stops any running runner for the project
   * - Database cascade will automatically delete:
   *   - runner_logs (via foreign key cascade)
   *   - brainstorm_sessions (via foreign key cascade)
   *   - brainstorm_messages (via cascade from brainstorm_sessions)
   */
  delete: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const projectId = input.id

      // Check if project exists first
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

      // Stop the runner if it's running for this project
      try {
        const runnerStatus = claudeLoopService.getStatus(projectId)
        if (runnerStatus.status === 'running') {
          await claudeLoopService.stop(projectId, true) // Force stop
        }
      } catch (error) {
        // Log but don't fail - runner might not be running
        console.error(`[projects.delete] Failed to stop runner for project ${projectId}:`, error)
      }

      // Delete the project from database
      // Related records (runner_logs, brainstorm_sessions, brainstorm_messages)
      // will be automatically deleted via cascade
      const [deleted] = await db
        .delete(projects)
        .where(eq(projects.id, projectId))
        .returning()

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${projectId} not found`,
        })
      }

      return {
        success: true,
        deletedId: deleted.id,
        projectName: deleted.name,
        projectPath: deleted.path,
      }
    }),

  /**
   * Validate a project path
   * Checks if the path exists and contains a prd.json file
   * Also reads prd.json for suggested project name
   * Expands ~ to home directory for validation
   */
  validatePath: publicProcedure
    .input(z.object({ path: z.string().min(1, 'Path is required') }))
    .query(async ({ input }) => {
      // Expand ~ to home directory
      const expandedPath = expandPath(input.path)

      const pathExists = existsSync(expandedPath)
      const hasPrd = pathExists && isValidProjectPath(expandedPath)

      let suggestedName: string | null = null
      let description: string | null = null
      let branchName: string | null = null

      if (hasPrd) {
        const prdData = await readPrdJson(expandedPath)
        if (prdData) {
          suggestedName = prdData.projectName || null
          description = prdData.projectDescription || null
          branchName = prdData.branchName || null
        }
      }

      // Check if project already exists in database (compare expanded paths)
      const existingProjects = await db.select({ path: projects.path }).from(projects)
      const isAlreadyAdded = existingProjects.some(p => p.path === expandedPath)

      return {
        pathExists,
        hasPrd,
        isAlreadyAdded,
        suggestedName,
        description,
        branchName,
        expandedPath, // Return expanded path for UI to display
      }
    }),

  /**
   * Discover projects in PROJECTS_ROOT
   * Returns projects with prd.json files, indicating which are already added to the database
   * Also validates each prd.json against Ralph's schema
   */
  discover: publicProcedure.query(async () => {
    // Get discovered projects from filesystem
    const discoveryResult = await discoverProjects()

    // Get all existing project paths from database
    const existingProjects = await db.select({ path: projects.path }).from(projects)
    const existingPaths = new Set(existingProjects.map(p => p.path))

    // Mark which discovered projects are already in the database and validate prd.json
    const projectsWithStatus = await Promise.all(
      discoveryResult.projects.map(async (project) => {
        const isAdded = existingPaths.has(project.path)
        let needsConversion = false
        let validationErrors: string[] = []

        // Validate prd.json against Ralph's schema
        if (project.hasPrdJson) {
          try {
            const prdPath = join(project.path, 'stories', 'prd.json')
            const content = await readFile(prdPath, 'utf-8')
            const data = JSON.parse(content)
            const result = validatePrd(data)

            if (!result.isValid) {
              needsConversion = true
              validationErrors = result.errors.map(e => `${e.path}: ${e.message}`)
            }
          } catch {
            // If we can't read/parse, it needs conversion
            needsConversion = true
          }
        }

        return {
          ...project,
          isAdded,
          needsConversion,
          validationErrors,
        }
      })
    )

    return {
      projects: projectsWithStatus,
      projectsRoot: discoveryResult.projectsRoot,
      scannedAt: discoveryResult.scannedAt,
    }
  }),
})

export type ProjectsRouter = typeof projectsRouter

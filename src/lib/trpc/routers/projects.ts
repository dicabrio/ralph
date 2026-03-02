/**
 * Projects Router
 *
 * CRUD operations for managing projects.
 * Projects are stored in the database, with metadata synced from prd.json files.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects, type Project } from '@/db/schema'
import { discoverProjects, isValidProjectPath } from '@/lib/services/projectDiscovery'
import { ensureClaudePermissions } from '@/lib/services/claudePermissions'
import {
  readRalphConfig,
  writeRalphConfig,
} from '@/lib/services/ralphConfig'
import {
  ralphConfigSchema,
  type RalphConfig,
} from '@/lib/schemas/ralphConfigSchema'
import { expandPath } from '@/lib/utils.server'
import { claudeLoopService } from '@/lib/services/claudeLoopService'
import { codexLoopService } from '@/lib/services/codexLoopService'
import { geminiLoopService } from '@/lib/services/geminiLoopService'
import { validatePrd } from '@/lib/schemas/prdSchema'
import { getPrdFileWatcher } from '@/lib/services/prdFileWatcher'

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
 * Creates a default prd.json file for a new project
 * Also creates the stories directory if it doesn't exist
 */
async function createDefaultPrd(projectPath: string, projectName: string): Promise<void> {
  const storiesDir = join(projectPath, 'stories')
  const prdPath = join(storiesDir, 'prd.json')

  // Create stories directory if it doesn't exist
  if (!existsSync(storiesDir)) {
    await mkdir(storiesDir, { recursive: true })
  }

  // Create default prd.json
  const defaultPrd = {
    projectName,
    projectDescription: `Project ${projectName}`,
    branchName: 'main',
    implementationGuides: [],
    availableSkills: [
      'frontend-design',
      'backend-development:api-design-principles',
      'database-design:postgresql'
    ],
    epics: [
      {
        name: 'Foundation',
        description: 'Project setup and infrastructure'
      },
      {
        name: 'Core Features',
        description: 'Main features for end users'
      }
    ],
    userStories: []
  }

  await writeFile(prdPath, JSON.stringify(defaultPrd, null, 2), 'utf-8')
}

// Runner status type
type RunnerStatus = 'idle' | 'running' | 'stopping'
type RunnerProvider = 'claude' | 'codex' | 'gemini'

// Common interface for loop services with getStatus method
interface LoopServiceWithStatus {
  getStatus(projectId: number): { status: RunnerStatus; projectId: number }
}

/**
 * Get runner status for a project across all providers
 * Returns the first active provider found, or idle with null provider
 */
function getProjectRunnerStatus(projectId: number): { status: RunnerStatus; provider: RunnerProvider | null } {
  const providers: { service: LoopServiceWithStatus; name: RunnerProvider }[] = [
    { service: claudeLoopService, name: 'claude' },
    { service: codexLoopService, name: 'codex' },
    { service: geminiLoopService, name: 'gemini' },
  ]

  for (const { service, name } of providers) {
    const state = service.getStatus(projectId)
    if (state.status !== 'idle') {
      return { status: state.status, provider: name }
    }
  }

  return { status: 'idle', provider: null }
}

// Story stats included with project data
interface ProjectWithStats extends Project {
  stats: {
    total: number
    done: number
    failed: number
    inProgress: number
    backlog: number
    review: number
    progress: number
  }
  runnerStatus: RunnerStatus
  runnerProvider: RunnerProvider | null
}

/**
 * Syncs project metadata from prd.json file
 * Updates description and branch_name from the file if they differ
 * Also computes story statistics and runner status
 */
async function syncProjectWithPrd(project: Project): Promise<ProjectWithStats> {
  const prdData = await readPrdJson(project.path)

  // Get runner status for this project
  const { status: runnerStatus, provider: runnerProvider } = getProjectRunnerStatus(project.id)

  // Default stats when no prd.json
  const defaultStats = {
    total: 0,
    done: 0,
    failed: 0,
    inProgress: 0,
    backlog: 0,
    review: 0,
    progress: 0,
  }

  if (!prdData) {
    return { ...project, stats: defaultStats, runnerStatus, runnerProvider }
  }

  // Compute story statistics
  const stories = (prdData as { userStories?: Array<{ status: string }> }).userStories || []
  const total = stories.length
  const done = stories.filter((s) => s.status === 'done').length
  const failed = stories.filter((s) => s.status === 'failed').length
  const inProgress = stories.filter((s) => s.status === 'in_progress').length
  // Backlog includes both 'pending' and 'backlog' statuses
  const backlog = stories.filter((s) => s.status === 'pending' || s.status === 'backlog').length
  const review = stories.filter((s) => s.status === 'review').length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  const stats = { total, done, failed, inProgress, backlog, review, progress }

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

    return { ...updated, stats, runnerStatus, runnerProvider }
  }

  return { ...project, stats, runnerStatus, runnerProvider }
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
   * Includes story statistics
   */
  getById: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }): Promise<ProjectWithStats> => {
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
   * Creates prd.json if it doesn't exist
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
      let prdData = await readPrdJson(expandedPath)

      // Determine project name early (needed for prd creation)
      const folderName = expandedPath.split('/').pop() || 'Untitled Project'
      const name = input.name || prdData?.projectName || folderName

      // Create prd.json if it doesn't exist
      if (!prdData) {
        await createDefaultPrd(expandedPath, name)
        // Re-read to get the created prd data
        prdData = await readPrdJson(expandedPath)
      }

      // Use prd.json values as defaults if not provided
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

        // Add project to file watcher for real-time prd.json updates
        try {
          const fileWatcher = getPrdFileWatcher()
          fileWatcher.addProject(newProject.id, expandedPath)
        } catch (e) {
          // Log but don't fail project creation if file watcher setup fails
          console.error('Failed to add project to file watcher:', e)
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
        const claudeStatus = claudeLoopService.getStatus(projectId)
        const codexStatus = codexLoopService.getStatus(projectId)

        if (claudeStatus.status !== 'idle') {
          await claudeLoopService.stop(projectId, true)
        }
        if (codexStatus.status !== 'idle') {
          await codexLoopService.stop(projectId, true)
        }
      } catch (error) {
        // Log but don't fail - runner might not be running
        console.error(`[projects.delete] Failed to stop runner for project ${projectId}:`, error)
      }

      // Remove project from file watcher before deletion
      try {
        const fileWatcher = getPrdFileWatcher()
        fileWatcher.removeProject(projectId)
      } catch (error) {
        // Log but don't fail - file watcher might not be running
        console.error(`[projects.delete] Failed to remove project from file watcher:`, error)
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
   * Checks if the path exists (folder must exist)
   * prd.json is optional - will be created if missing
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
      } else if (pathExists) {
        // Suggest name from folder name if no prd.json
        suggestedName = expandedPath.split('/').pop() || null
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

  /**
   * Get ralph.config.json for a project
   * Returns the configuration or null if it doesn't exist
   */
  getRalphConfig: publicProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }): Promise<RalphConfig | null> => {
      // Get project from database
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.projectId} not found`,
        })
      }

      // Read ralph.config.json (use expandPath for consistent path handling)
      return readRalphConfig(expandPath(project.path))
    }),

  /**
   * Update ralph.config.json for a project
   * Creates the file if it doesn't exist
   */
  updateRalphConfig: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      config: ralphConfigSchema,
    }))
    .mutation(async ({ input }) => {
      // Get project from database
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.projectId} not found`,
        })
      }

      // Write ralph.config.json (use expandPath for consistent path handling)
      await writeRalphConfig(expandPath(project.path), input.config)

      return { success: true }
    }),
})

export type ProjectsRouter = typeof projectsRouter

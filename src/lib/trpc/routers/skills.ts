/**
 * Skills Router
 *
 * API for managing skills (central and project-specific) via filesystem.
 * Central skills are loaded from SKILLS_PATH folder.
 * Project overrides are stored in {projectPath}/.ralph/skills/
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects } from '@/db/schema'

// Environment variables
const SKILLS_PATH = process.env.SKILLS_PATH || './skills'

// Skill schema matching SKILL.md frontmatter
export const skillSchema = z.object({
  id: z.string(), // folder name
  name: z.string(),
  description: z.string(),
  content: z.string(), // full SKILL.md content
  isOverride: z.boolean().optional(),
  hasOverride: z.boolean().optional(),
})

export type Skill = z.infer<typeof skillSchema>

// Frontmatter schema for SKILL.md
const frontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
}).passthrough()

/**
 * Parse YAML frontmatter from SKILL.md content
 * Frontmatter is between --- delimiters
 */
function parseFrontmatter(content: string): { frontmatter: z.infer<typeof frontmatterSchema>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)

  if (!match) {
    throw new Error('Invalid SKILL.md format: no frontmatter found')
  }

  const [, frontmatterYaml, body] = match

  // Simple YAML parser for key: value pairs
  const frontmatter: Record<string, string> = {}
  for (const line of frontmatterYaml.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      frontmatter[key] = value
    }
  }

  return {
    frontmatter: frontmatterSchema.parse(frontmatter),
    body: body.trim(),
  }
}

/**
 * Read a skill from a directory path
 */
async function readSkill(skillPath: string, id: string): Promise<Skill | null> {
  const skillMdPath = join(skillPath, 'SKILL.md')

  if (!existsSync(skillMdPath)) {
    return null
  }

  try {
    const content = await readFile(skillMdPath, 'utf-8')
    const { frontmatter } = parseFrontmatter(content)

    return {
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      content,
    }
  } catch {
    return null
  }
}

/**
 * List all skills in a directory
 */
async function listSkillsInDirectory(basePath: string): Promise<Skill[]> {
  if (!existsSync(basePath)) {
    return []
  }

  const skills: Skill[] = []

  try {
    const entries = await readdir(basePath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skill = await readSkill(join(basePath, entry.name), entry.name)
        if (skill) {
          skills.push(skill)
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
    return []
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
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
 * Get the project skills override path
 */
function getProjectSkillsPath(projectPath: string): string {
  return join(projectPath, '.ralph', 'skills')
}

/**
 * Simple diff between two texts
 * Returns unified diff format
 */
function createDiff(original: string, override: string): string {
  const originalLines = original.split('\n')
  const overrideLines = override.split('\n')

  const diff: string[] = ['--- original', '+++ override']

  // Simple line-by-line comparison
  const maxLines = Math.max(originalLines.length, overrideLines.length)

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i]
    const overrideLine = overrideLines[i]

    if (originalLine === overrideLine) {
      if (originalLine !== undefined) {
        diff.push(` ${originalLine}`)
      }
    } else {
      if (originalLine !== undefined) {
        diff.push(`-${originalLine}`)
      }
      if (overrideLine !== undefined) {
        diff.push(`+${overrideLine}`)
      }
    }
  }

  return diff.join('\n')
}

export const skillsRouter = router({
  /**
   * List all central skills from SKILLS_PATH
   */
  listCentral: publicProcedure.query(async () => {
    return listSkillsInDirectory(SKILLS_PATH)
  }),

  /**
   * Check if SKILLS_PATH is writable (for edit mode)
   */
  isWritable: publicProcedure.query(async () => {
    try {
      // Check if directory exists first
      if (!existsSync(SKILLS_PATH)) {
        return { writable: false, reason: 'Skills directory does not exist' }
      }

      // Try to write a test file to check write permissions
      const { access, constants } = await import('node:fs/promises')
      await access(SKILLS_PATH, constants.W_OK)

      return { writable: true, reason: null }
    } catch {
      return { writable: false, reason: 'Skills directory is read-only' }
    }
  }),

  /**
   * List skills for a project (central + overrides merged)
   * Overrides replace central skills with same ID
   */
  listByProject: publicProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const projectSkillsPath = getProjectSkillsPath(project.path)

      // Get central skills
      const centralSkills = await listSkillsInDirectory(SKILLS_PATH)

      // Get project overrides
      const overrideSkills = await listSkillsInDirectory(projectSkillsPath)
      const overrideIds = new Set(overrideSkills.map(s => s.id))

      // Merge: central skills with hasOverride flag, overrides with isOverride flag
      const mergedSkills: Skill[] = []

      for (const skill of centralSkills) {
        if (overrideIds.has(skill.id)) {
          // Find the override and mark it
          const override = overrideSkills.find(s => s.id === skill.id)!
          mergedSkills.push({
            ...override,
            isOverride: true,
            hasOverride: true,
          })
        } else {
          mergedSkills.push({
            ...skill,
            hasOverride: false,
          })
        }
      }

      // Add overrides that don't have a central version (project-only skills)
      for (const override of overrideSkills) {
        if (!centralSkills.find(s => s.id === override.id)) {
          mergedSkills.push({
            ...override,
            isOverride: true,
          })
        }
      }

      return mergedSkills.sort((a, b) => a.name.localeCompare(b.name))
    }),

  /**
   * Get a single skill by ID
   * Can be central or project-specific
   */
  getById: publicProcedure
    .input(z.object({
      skillId: z.string().min(1),
      projectId: z.number().int().positive().optional(),
    }))
    .query(async ({ input }) => {
      // If projectId provided, check project override first
      if (input.projectId) {
        const project = await getProjectById(input.projectId)
        const projectSkillsPath = getProjectSkillsPath(project.path)
        const overrideSkill = await readSkill(join(projectSkillsPath, input.skillId), input.skillId)

        if (overrideSkill) {
          return {
            ...overrideSkill,
            isOverride: true,
          }
        }
      }

      // Fall back to central skill
      const centralSkill = await readSkill(join(SKILLS_PATH, input.skillId), input.skillId)

      if (!centralSkill) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Skill with id "${input.skillId}" not found`,
        })
      }

      return centralSkill
    }),

  /**
   * Create a skill override for a project
   * Copies central skill to project folder if content not provided
   */
  createOverride: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      skillId: z.string().min(1),
      content: z.string().optional(), // If not provided, copies from central
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const projectSkillsPath = getProjectSkillsPath(project.path)
      const overrideSkillPath = join(projectSkillsPath, input.skillId)

      // Check if override already exists
      if (existsSync(join(overrideSkillPath, 'SKILL.md'))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Override for skill "${input.skillId}" already exists in this project`,
        })
      }

      // Get content: either provided or from central skill
      let content = input.content
      if (!content) {
        const centralSkill = await readSkill(join(SKILLS_PATH, input.skillId), input.skillId)
        if (!centralSkill) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Central skill "${input.skillId}" not found`,
          })
        }
        content = centralSkill.content
      }

      // Validate content has valid frontmatter
      try {
        parseFrontmatter(content)
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid SKILL.md format: content must have valid frontmatter',
        })
      }

      // Create directory and write SKILL.md
      await mkdir(overrideSkillPath, { recursive: true })
      await writeFile(join(overrideSkillPath, 'SKILL.md'), content, 'utf-8')

      // Return the created override
      const createdSkill = await readSkill(overrideSkillPath, input.skillId)
      if (!createdSkill) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create skill override',
        })
      }

      return {
        ...createdSkill,
        isOverride: true,
      }
    }),

  /**
   * Update an existing skill override
   */
  updateOverride: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      skillId: z.string().min(1),
      content: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const projectSkillsPath = getProjectSkillsPath(project.path)
      const overrideSkillPath = join(projectSkillsPath, input.skillId)
      const skillMdPath = join(overrideSkillPath, 'SKILL.md')

      // Check if override exists
      if (!existsSync(skillMdPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Override for skill "${input.skillId}" not found in this project`,
        })
      }

      // Validate content has valid frontmatter
      try {
        parseFrontmatter(input.content)
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid SKILL.md format: content must have valid frontmatter',
        })
      }

      // Update SKILL.md
      await writeFile(skillMdPath, input.content, 'utf-8')

      // Return the updated override
      const updatedSkill = await readSkill(overrideSkillPath, input.skillId)
      if (!updatedSkill) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update skill override',
        })
      }

      return {
        ...updatedSkill,
        isOverride: true,
      }
    }),

  /**
   * Delete a skill override
   * Reverts to central skill
   */
  deleteOverride: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      skillId: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const projectSkillsPath = getProjectSkillsPath(project.path)
      const overrideSkillPath = join(projectSkillsPath, input.skillId)
      const skillMdPath = join(overrideSkillPath, 'SKILL.md')

      // Check if override exists
      if (!existsSync(skillMdPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Override for skill "${input.skillId}" not found in this project`,
        })
      }

      // Delete the SKILL.md file
      await unlink(skillMdPath)

      // Try to remove the directory if empty
      try {
        const { rmdir } = await import('node:fs/promises')
        await rmdir(overrideSkillPath)
      } catch {
        // Directory not empty or other error - that's ok
      }

      return { success: true, deletedSkillId: input.skillId }
    }),

  /**
   * Get diff between central skill and project override
   */
  diff: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      skillId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const projectSkillsPath = getProjectSkillsPath(project.path)

      // Get central skill
      const centralSkill = await readSkill(join(SKILLS_PATH, input.skillId), input.skillId)
      if (!centralSkill) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Central skill "${input.skillId}" not found`,
        })
      }

      // Get override
      const overrideSkill = await readSkill(join(projectSkillsPath, input.skillId), input.skillId)
      if (!overrideSkill) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Override for skill "${input.skillId}" not found in this project`,
        })
      }

      // Create diff
      const diff = createDiff(centralSkill.content, overrideSkill.content)

      return {
        skillId: input.skillId,
        original: centralSkill.content,
        override: overrideSkill.content,
        diff,
        hasChanges: centralSkill.content !== overrideSkill.content,
      }
    }),
})

export type SkillsRouter = typeof skillsRouter

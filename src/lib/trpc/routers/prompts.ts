/**
 * Prompts tRPC Router
 *
 * API endpoints for managing agent prompt templates:
 * - Get/update the default template (central)
 * - Get/update/reset project-specific prompts
 * - Get diff between default and project prompt
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  getDefaultPromptTemplate,
  readProjectPrompt,
  writeProjectPrompt,
  deleteProjectPrompt,
  getPromptDiff,
  hasProjectPrompt,
  getPreviewLines,
  validatePromptContent,
} from '@/lib/services/promptTemplate'

/**
 * Prompts router with CRUD operations for agent prompt templates
 */
export const promptsRouter = router({
  /**
   * Get the default agent prompt template
   */
  getDefaultTemplate: publicProcedure.query(async () => {
    const content = getDefaultPromptTemplate()
    const preview = getPreviewLines(content, 10)

    return {
      content,
      preview,
      lineCount: content.split('\n').length,
    }
  }),

  /**
   * Update the default agent prompt template
   * NOTE: In this implementation, the default template is hardcoded in promptTemplate.ts
   * To allow editing, you would need to store it in a file or database.
   * For now, this returns FORBIDDEN as the default template is read-only.
   */
  updateDefaultTemplate: publicProcedure
    .input(
      z.object({
        content: z.string().min(1, 'Content is required'),
      })
    )
    .mutation(async () => {
      // The default template is currently hardcoded in promptTemplate.ts
      // To make it editable, we would need to store it in a file
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Default template is read-only. Override it at the project level instead.',
      })
    }),

  /**
   * Get the effective prompt for a project (project prompt or default)
   */
  getProjectPrompt: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
      })
    )
    .query(async ({ input }) => {
      // Verify project exists and get its path
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with ID ${input.projectId} not found`,
        })
      }

      const projectPrompt = await readProjectPrompt(project.path)
      const defaultTemplate = getDefaultPromptTemplate()

      const isCustom = projectPrompt !== null
      const content = projectPrompt ?? defaultTemplate

      return {
        content,
        isCustom,
        preview: getPreviewLines(content, 10),
        lineCount: content.split('\n').length,
      }
    }),

  /**
   * Update the project-specific prompt
   * Creates stories/prompt.md if first edit, copies default as starting point
   */
  updateProjectPrompt: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
        content: z.string().min(1, 'Content is required'),
      })
    )
    .mutation(async ({ input }) => {
      // Verify project exists
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with ID ${input.projectId} not found`,
        })
      }

      // Validate content for security issues
      const warnings = validatePromptContent(input.content)
      if (warnings.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Prompt content contains potentially dangerous patterns: ${warnings.join('; ')}`,
        })
      }

      try {
        await writeProjectPrompt(project.path, input.content)

        return {
          success: true,
          path: `${project.path}/stories/prompt.md`,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to write prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  /**
   * Reset project prompt to default (deletes stories/prompt.md)
   */
  resetProjectPrompt: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify project exists
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with ID ${input.projectId} not found`,
        })
      }

      // Check if there's a custom prompt to delete
      if (!hasProjectPrompt(project.path)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Project is already using the default template',
        })
      }

      try {
        const deleted = await deleteProjectPrompt(project.path)

        if (!deleted) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete project prompt',
          })
        }

        return {
          success: true,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to reset prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  /**
   * Get diff between default template and project prompt
   */
  getPromptDiff: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
      })
    )
    .query(async ({ input }) => {
      // Verify project exists
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with ID ${input.projectId} not found`,
        })
      }

      const diff = await getPromptDiff(project.path)

      if (diff === null) {
        // No custom prompt, return default for both sides
        const defaultTemplate = getDefaultPromptTemplate()
        return {
          original: defaultTemplate,
          modified: defaultTemplate,
          diff: [],
          hasChanges: false,
          isCustom: false,
        }
      }

      return {
        ...diff,
        isCustom: true,
      }
    }),

  /**
   * Check if a project has a custom prompt
   */
  hasCustomPrompt: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
      })
    )
    .query(async ({ input }) => {
      // Verify project exists
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with ID ${input.projectId} not found`,
        })
      }

      return {
        hasCustomPrompt: hasProjectPrompt(project.path),
      }
    }),
})

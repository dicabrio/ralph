/**
 * tRPC PRD Router
 *
 * Handles PRD.json validation, conversion, and mapping operations.
 * Supports converting non-conforming prd.json formats to Ralph's standard schema.
 */
import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { readFile, writeFile, copyFile, access, constants } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { expandPath } from '../../utils.server'
import {
  validatePrd,
  detectMappings,
  applyMappings,
  type FieldMapping,
  prdSchema,
} from '../../schemas/prdSchema'

// Input schemas
const validateInputSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
})

const suggestMappingInputSchema = z.object({
  originalJson: z.record(z.string(), z.unknown()),
})

const fieldMappingSchema = z.object({
  sourceField: z.string(),
  targetField: z.string(),
  transform: z.enum(['direct', 'rename', 'valueMap', 'nested']).optional(),
  valueMap: z.record(z.string(), z.string()).optional(),
  isNested: z.boolean().optional(),
  nestedMappings: z.array(z.lazy((): z.ZodType => fieldMappingSchema)).optional(),
}) as z.ZodType<FieldMapping>

const storyStatusEnumSchema = z.enum(['pending', 'in_progress', 'done', 'failed', 'backlog', 'review'])

const conversionMappingSchema = z.object({
  rootMappings: z.array(fieldMappingSchema),
  storyMappings: z.array(fieldMappingSchema),
  epicMappings: z.array(fieldMappingSchema).optional(),
  statusValueMap: z.record(z.string(), storyStatusEnumSchema).optional(),
})

const convertInputSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  mappings: conversionMappingSchema,
  createBackup: z.boolean().default(true),
})


export const prdRouter = router({
  /**
   * Validates a prd.json file against Ralph's schema
   * Returns validation errors and warnings with suggestions
   */
  validate: publicProcedure
    .input(validateInputSchema)
    .query(async ({ input }) => {
      const expandedPath = expandPath(input.projectPath)
      const prdPath = path.join(expandedPath, 'stories', 'prd.json')

      // Check if path exists
      if (!existsSync(expandedPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project path does not exist: ${input.projectPath}`,
        })
      }

      // Check if prd.json exists
      if (!existsSync(prdPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No prd.json found in stories folder',
        })
      }

      try {
        const content = await readFile(prdPath, 'utf-8')
        const data = JSON.parse(content)
        const result = validatePrd(data)

        return {
          ...result,
          originalJson: data,
          prdPath,
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid JSON in prd.json: ${error.message}`,
          })
        }
        throw error
      }
    }),

  /**
   * Suggests field mappings based on the original JSON structure
   * Uses heuristics to detect common field name variations
   */
  suggestMapping: publicProcedure
    .input(suggestMappingInputSchema)
    .mutation(async ({ input }) => {
      const mappings = detectMappings(input.originalJson)

      return {
        mappings,
        hasChanges: mappings.rootMappings.length > 0 ||
          mappings.storyMappings.length > 0 ||
          Object.keys(mappings.statusValueMap || {}).length > 0,
      }
    }),

  /**
   * Converts a prd.json file using provided mappings
   * Creates a backup before conversion if requested
   */
  convert: publicProcedure
    .input(convertInputSchema)
    .mutation(async ({ input }) => {
      const expandedPath = expandPath(input.projectPath)
      const prdPath = path.join(expandedPath, 'stories', 'prd.json')

      // Check if path exists
      if (!existsSync(expandedPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project path does not exist: ${input.projectPath}`,
        })
      }

      // Check if prd.json exists
      if (!existsSync(prdPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No prd.json found in stories folder',
        })
      }

      // Check write permissions
      try {
        await access(prdPath, constants.W_OK)
      } catch {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No write permission for prd.json',
        })
      }

      try {
        // Read original content
        const content = await readFile(prdPath, 'utf-8')
        const originalData = JSON.parse(content)

        // Create backup if requested
        let backupPath: string | undefined
        if (input.createBackup) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          backupPath = path.join(expandedPath, 'stories', `prd.json.backup.${timestamp}`)
          await copyFile(prdPath, backupPath)
        }

        // Apply mappings
        const { converted, errors } = applyMappings(originalData, input.mappings)

        if (errors.length > 0) {
          // Return preview with errors, don't write
          return {
            success: false,
            preview: converted,
            errors,
            warnings: [],
            backup: backupPath ? { created: true, path: backupPath } : { created: false },
          }
        }

        // Validate final result
        const validation = prdSchema.safeParse(converted)
        if (!validation.success) {
          return {
            success: false,
            preview: converted,
            errors: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
            warnings: [],
            backup: backupPath ? { created: true, path: backupPath } : { created: false },
          }
        }

        // Write converted prd.json
        await writeFile(prdPath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')

        return {
          success: true,
          convertedPrd: validation.data,
          errors: [],
          warnings: [],
          backup: backupPath ? { created: true, path: backupPath } : { created: false },
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid JSON in prd.json: ${error.message}`,
          })
        }
        throw error
      }
    }),

  /**
   * Previews the conversion result without writing to disk
   */
  preview: publicProcedure
    .input(z.object({
      originalJson: z.record(z.string(), z.unknown()),
      mappings: conversionMappingSchema,
    }))
    .mutation(async ({ input }) => {
      const { converted, errors } = applyMappings(input.originalJson, input.mappings)

      // Validate the result
      const validation = prdSchema.safeParse(converted)

      return {
        preview: converted,
        isValid: validation.success,
        errors: validation.success ? errors : [
          ...errors,
          ...validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
        ],
      }
    }),
})

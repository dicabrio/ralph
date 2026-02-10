/**
 * @vitest-environment node
 *
 * PRD Router Tests
 *
 * Unit tests for the PRD tRPC endpoints.
 * Tests validation, mapping suggestions, and conversion functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock the filesystem modules
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    copyFile: vi.fn(),
    access: vi.fn(),
  }
})

import { existsSync } from 'node:fs'
import { readFile, writeFile, copyFile, access } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { prdRouter } from './prd'

const createCaller = createCallerFactory(prdRouter)

// Sample valid prd.json
const validPrdJson = {
  projectName: 'Test Project',
  projectDescription: 'A test project',
  branchName: 'main',
  implementationGuides: [],
  availableSkills: [],
  epics: [
    { name: 'Core', description: 'Core features' }
  ],
  userStories: [
    {
      id: 'STORY-001',
      title: 'First Story',
      description: 'Description of first story',
      priority: 1,
      status: 'pending',
      epic: 'Core',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: ['Criteria 1'],
    }
  ],
}

// Sample invalid prd.json (missing required fields)
const invalidPrdJson = {
  name: 'Test',
  tasks: [
    { id: 'T1', title: 'Task 1' }
  ]
}

describe('prdRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validate', () => {
    it('returns valid result for conforming prd.json', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(validPrdJson))

      const caller = createCaller({})
      const result = await caller.validate({ projectPath: '/test/project' })

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.originalJson).toEqual(validPrdJson)
    })

    it('returns errors for non-conforming prd.json', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(invalidPrdJson))

      const caller = createCaller({})
      const result = await caller.validate({ projectPath: '/test/project' })

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('throws NOT_FOUND when project path does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})

      await expect(caller.validate({ projectPath: '/nonexistent' })).rejects.toThrow(TRPCError)
      await expect(caller.validate({ projectPath: '/nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: expect.stringContaining('does not exist'),
      })
    })

    it('throws NOT_FOUND when prd.json does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        // Project exists but prd.json doesn't
        return !String(path).includes('prd.json')
      })

      const caller = createCaller({})

      await expect(caller.validate({ projectPath: '/test/project' })).rejects.toThrow(TRPCError)
      await expect(caller.validate({ projectPath: '/test/project' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: expect.stringContaining('No prd.json'),
      })
    })

    it('throws BAD_REQUEST for invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('{ invalid json }')

      const caller = createCaller({})

      await expect(caller.validate({ projectPath: '/test/project' })).rejects.toThrow(TRPCError)
      await expect(caller.validate({ projectPath: '/test/project' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('Invalid JSON'),
      })
    })

    it('expands tilde in project path', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(validPrdJson))

      const caller = createCaller({})
      const result = await caller.validate({ projectPath: '~/projects/test' })

      expect(result.isValid).toBe(true)
      // The prdPath should have the tilde expanded
      expect(result.prdPath).not.toContain('~')
    })
  })

  describe('suggestMapping', () => {
    it('returns empty mappings for valid prd.json structure', async () => {
      const caller = createCaller({})
      const result = await caller.suggestMapping({ originalJson: validPrdJson })

      // Valid prd.json should have minimal or no mappings needed
      expect(result.mappings).toBeDefined()
    })

    it('suggests mappings for non-standard field names', async () => {
      const nonStandardJson = {
        name: 'Test Project', // should be projectName
        description: 'A test', // should be projectDescription
        tasks: [
          { id: 'T1', name: 'Task', state: 'open' } // should be userStories
        ]
      }

      const caller = createCaller({})
      const result = await caller.suggestMapping({ originalJson: nonStandardJson })

      expect(result.hasChanges).toBe(true)
      expect(result.mappings.rootMappings.length).toBeGreaterThan(0)
    })

    it('suggests status value mappings', async () => {
      const nonStandardJson = {
        projectName: 'Test',
        userStories: [
          { id: 'S1', title: 'Story', status: 'open' } // 'open' should map to 'pending'
        ]
      }

      const caller = createCaller({})
      const result = await caller.suggestMapping({ originalJson: nonStandardJson })

      // Should suggest mapping 'open' to 'pending'
      expect(result.mappings).toBeDefined()
    })
  })

  describe('convert', () => {
    const validMappings = {
      rootMappings: [],
      storyMappings: [],
      statusValueMap: {}
    }

    it('converts prd.json with valid mappings', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(validPrdJson))
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.convert({
        projectPath: '/test/project',
        mappings: validMappings,
        createBackup: true,
      })

      expect(result.success).toBe(true)
      expect(result.backup.created).toBe(true)
      expect(writeFile).toHaveBeenCalled()
      expect(copyFile).toHaveBeenCalled()
    })

    it('skips backup when createBackup is false', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(validPrdJson))
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.convert({
        projectPath: '/test/project',
        mappings: validMappings,
        createBackup: false,
      })

      expect(result.success).toBe(true)
      expect(result.backup.created).toBe(false)
      expect(copyFile).not.toHaveBeenCalled()
    })

    it('throws NOT_FOUND when project path does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})

      await expect(caller.convert({
        projectPath: '/nonexistent',
        mappings: validMappings,
      })).rejects.toThrow(TRPCError)
      await expect(caller.convert({
        projectPath: '/nonexistent',
        mappings: validMappings,
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws FORBIDDEN when no write permission', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(access).mockRejectedValue(new Error('Permission denied'))

      const caller = createCaller({})

      await expect(caller.convert({
        projectPath: '/test/project',
        mappings: validMappings,
      })).rejects.toThrow(TRPCError)
      await expect(caller.convert({
        projectPath: '/test/project',
        mappings: validMappings,
      })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('write permission'),
      })
    })

    it('throws BAD_REQUEST for invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue('{ invalid }')

      const caller = createCaller({})

      await expect(caller.convert({
        projectPath: '/test/project',
        mappings: validMappings,
      })).rejects.toThrow(TRPCError)
      await expect(caller.convert({
        projectPath: '/test/project',
        mappings: validMappings,
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })
  })

  describe('preview', () => {
    it('previews conversion without writing', async () => {
      const caller = createCaller({})
      const result = await caller.preview({
        originalJson: validPrdJson,
        mappings: {
          rootMappings: [],
          storyMappings: [],
          statusValueMap: {}
        }
      })

      expect(result.preview).toBeDefined()
      expect(result.isValid).toBe(true)
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('returns validation errors for invalid result', async () => {
      const caller = createCaller({})
      const result = await caller.preview({
        originalJson: invalidPrdJson,
        mappings: {
          rootMappings: [],
          storyMappings: [],
          statusValueMap: {}
        }
      })

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})

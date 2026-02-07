/**
 * @vitest-environment node
 *
 * Prompts Router Tests
 *
 * Unit tests for the prompts tRPC endpoints.
 * Tests API for default template and project prompts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import type { PathLike } from 'node:fs'

// Mock the filesystem modules BEFORE importing anything that uses them
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn((path: PathLike) => {
      const pathStr = String(path)
      // Default to real existsSync for database paths
      if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
        return actual.existsSync(path)
      }
      return false
    }),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  }
})

import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { promptsRouter } from './prompts'
import { db } from '@/db'
import { projects } from '@/db/schema'

const createCaller = createCallerFactory(promptsRouter)

describe('promptsRouter', () => {
  beforeEach(async () => {
    await db.delete(projects)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getDefaultTemplate', () => {
    it('returns the default template with preview', async () => {
      const caller = createCaller({})
      const result = await caller.getDefaultTemplate()

      expect(result.content).toContain('# Agent Instructions')
      expect(result.preview).toBeDefined()
      expect(result.lineCount).toBeGreaterThan(0)
    })

    it('preview contains first lines of template', async () => {
      const caller = createCaller({})
      const result = await caller.getDefaultTemplate()

      expect(result.preview.split('\n').length).toBeLessThanOrEqual(10)
      expect(result.content.startsWith(result.preview.split('\n')[0])).toBe(true)
    })
  })

  describe('updateDefaultTemplate', () => {
    it('throws FORBIDDEN because default template is read-only', async () => {
      const caller = createCaller({})

      await expect(
        caller.updateDefaultTemplate({ content: '# New Content' })
      ).rejects.toThrow(TRPCError)

      await expect(
        caller.updateDefaultTemplate({ content: '# New Content' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  describe('getProjectPrompt', () => {
    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.getProjectPrompt({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.getProjectPrompt({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns default template when project has no custom prompt', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) return true
        return false
      })

      const caller = createCaller({})
      const result = await caller.getProjectPrompt({ projectId: project.id })

      expect(result.content).toContain('# Agent Instructions')
      expect(result.isCustom).toBe(false)
    })

    it('returns custom prompt when project has one', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      const customPrompt = '# Custom Prompt\n\nMy custom instructions.'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(customPrompt)

      const caller = createCaller({})
      const result = await caller.getProjectPrompt({ projectId: project.id })

      expect(result.content).toBe(customPrompt)
      expect(result.isCustom).toBe(true)
    })
  })

  describe('updateProjectPrompt', () => {
    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(
        caller.updateProjectPrompt({ projectId: 99999, content: '# Content' })
      ).rejects.toThrow(TRPCError)

      await expect(
        caller.updateProjectPrompt({ projectId: 99999, content: '# Content' })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('writes prompt to project stories directory', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) return true
        if (pathStr.includes('/stories')) return true
        return false
      })
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.updateProjectPrompt({
        projectId: project.id,
        content: '# New Prompt',
      })

      expect(result.success).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(
        '/test/project/stories/prompt.md',
        '# New Prompt',
        'utf-8'
      )
    })

    it('creates stories directory if needed', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) return true
        return false // stories dir doesn't exist
      })
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      await caller.updateProjectPrompt({
        projectId: project.id,
        content: '# New Prompt',
      })

      expect(mkdir).toHaveBeenCalledWith('/test/project/stories', { recursive: true })
    })

    it('rejects content with dangerous patterns', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      const caller = createCaller({})

      await expect(
        caller.updateProjectPrompt({
          projectId: project.id,
          content: 'Run this: `$(rm -rf /)`',
        })
      ).rejects.toThrow(TRPCError)

      await expect(
        caller.updateProjectPrompt({
          projectId: project.id,
          content: 'Run this: `$(rm -rf /)`',
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('rejects empty content', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      const caller = createCaller({})

      await expect(
        caller.updateProjectPrompt({
          projectId: project.id,
          content: '',
        })
      ).rejects.toThrow()
    })
  })

  describe('resetProjectPrompt', () => {
    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.resetProjectPrompt({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.resetProjectPrompt({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws BAD_REQUEST when project uses default template', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) return true
        if (pathStr.includes('prompt.md')) return false
        return false
      })

      const caller = createCaller({})

      await expect(caller.resetProjectPrompt({ projectId: project.id })).rejects.toThrow(TRPCError)
      await expect(caller.resetProjectPrompt({ projectId: project.id })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('deletes prompt.md when project has custom prompt', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(unlink).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.resetProjectPrompt({ projectId: project.id })

      expect(result.success).toBe(true)
      expect(unlink).toHaveBeenCalledWith('/test/project/stories/prompt.md')
    })
  })

  describe('getPromptDiff', () => {
    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.getPromptDiff({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.getPromptDiff({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns isCustom: false when no custom prompt exists', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) return true
        return false
      })

      const caller = createCaller({})
      const result = await caller.getPromptDiff({ projectId: project.id })

      expect(result.isCustom).toBe(false)
      expect(result.hasChanges).toBe(false)
      expect(result.diff).toEqual([])
    })

    it('returns diff data when custom prompt exists', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      const customPrompt = '# Custom Prompt\n\nModified content.'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(customPrompt)

      const caller = createCaller({})
      const result = await caller.getPromptDiff({ projectId: project.id })

      expect(result.isCustom).toBe(true)
      expect(result.hasChanges).toBe(true)
      expect(result.original).toContain('# Agent Instructions')
      expect(result.modified).toBe(customPrompt)
      expect(result.diff.length).toBeGreaterThan(0)
    })
  })

  describe('hasCustomPrompt', () => {
    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.hasCustomPrompt({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.hasCustomPrompt({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns false when project uses default', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) return true
        return false
      })

      const caller = createCaller({})
      const result = await caller.hasCustomPrompt({ projectId: project.id })

      expect(result.hasCustomPrompt).toBe(false)
    })

    it('returns true when project has custom prompt', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)

      const caller = createCaller({})
      const result = await caller.hasCustomPrompt({ projectId: project.id })

      expect(result.hasCustomPrompt).toBe(true)
    })
  })
})

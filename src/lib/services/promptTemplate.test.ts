/**
 * @vitest-environment node
 *
 * Prompt Template Service Tests
 *
 * Unit tests for the prompt template service.
 * Tests default template, project prompts, and diff functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
import {
  getDefaultPromptTemplate,
  getProjectPromptPath,
  hasProjectPrompt,
  readProjectPrompt,
  getEffectivePrompt,
  writeProjectPrompt,
  deleteProjectPrompt,
  computeSimpleDiff,
  getPromptDiff,
  getPreviewLines,
  validatePromptContent,
} from './promptTemplate'

describe('promptTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getDefaultPromptTemplate', () => {
    it('returns the default template content', () => {
      const template = getDefaultPromptTemplate()

      expect(template).toContain('# Agent Instructions')
      expect(template).toContain('## Your Task')
      expect(template).toContain('stories/prd.json')
      expect(template).toContain('status: "pending"')
      expect(template).toContain('Failure Protocol')
    })

    it('includes critical workflow instructions', () => {
      const template = getDefaultPromptTemplate()

      expect(template).toContain('CRITICAL: You must implement exactly ONE story per session')
      expect(template).toContain('status: "in_progress"')
      expect(template).toContain('STOP - Do not continue to the next story')
    })

    it('includes progress format instructions', () => {
      const template = getDefaultPromptTemplate()

      expect(template).toContain('stories/progress.txt')
      expect(template).toContain('Codebase Patterns')
    })
  })

  describe('getProjectPromptPath', () => {
    it('returns correct path for project prompt', () => {
      const path = getProjectPromptPath('/test/project')
      expect(path).toBe('/test/project/stories/prompt.md')
    })

    it('handles paths without trailing slash', () => {
      const path = getProjectPromptPath('/my/project/path')
      expect(path).toBe('/my/project/path/stories/prompt.md')
    })
  })

  describe('hasProjectPrompt', () => {
    it('returns true when prompt.md exists', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const result = hasProjectPrompt('/test/project')
      expect(result).toBe(true)
      expect(existsSync).toHaveBeenCalledWith('/test/project/stories/prompt.md')
    })

    it('returns false when prompt.md does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = hasProjectPrompt('/test/project')
      expect(result).toBe(false)
    })
  })

  describe('readProjectPrompt', () => {
    it('returns content when prompt.md exists', async () => {
      const customPrompt = '# Custom Prompt\n\nMy custom instructions.'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(customPrompt)

      const result = await readProjectPrompt('/test/project')
      expect(result).toBe(customPrompt)
    })

    it('returns null when prompt.md does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await readProjectPrompt('/test/project')
      expect(result).toBeNull()
    })

    it('returns null when readFile throws', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('Read error'))

      const result = await readProjectPrompt('/test/project')
      expect(result).toBeNull()
    })
  })

  describe('getEffectivePrompt', () => {
    it('returns project prompt when it exists', async () => {
      const customPrompt = '# Custom Prompt'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(customPrompt)

      const result = await getEffectivePrompt('/test/project')

      expect(result.content).toBe(customPrompt)
      expect(result.isCustom).toBe(true)
    })

    it('returns default template when no project prompt exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await getEffectivePrompt('/test/project')

      expect(result.content).toContain('# Agent Instructions')
      expect(result.isCustom).toBe(false)
    })
  })

  describe('writeProjectPrompt', () => {
    it('creates stories directory and writes prompt', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await writeProjectPrompt('/test/project', '# New Prompt')

      expect(mkdir).toHaveBeenCalledWith('/test/project/stories', { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        '/test/project/stories/prompt.md',
        '# New Prompt',
        'utf-8'
      )
    })

    it('does not create directory if it exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await writeProjectPrompt('/test/project', '# New Prompt')

      expect(mkdir).not.toHaveBeenCalled()
      expect(writeFile).toHaveBeenCalled()
    })
  })

  describe('deleteProjectPrompt', () => {
    it('deletes prompt.md when it exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(unlink).mockResolvedValue(undefined)

      const result = await deleteProjectPrompt('/test/project')

      expect(result).toBe(true)
      expect(unlink).toHaveBeenCalledWith('/test/project/stories/prompt.md')
    })

    it('returns false when prompt.md does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await deleteProjectPrompt('/test/project')

      expect(result).toBe(false)
      expect(unlink).not.toHaveBeenCalled()
    })

    it('returns false when unlink throws', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(unlink).mockRejectedValue(new Error('Delete error'))

      const result = await deleteProjectPrompt('/test/project')

      expect(result).toBe(false)
    })
  })

  describe('computeSimpleDiff', () => {
    it('returns empty array for identical content', () => {
      const content = 'Line 1\nLine 2\nLine 3'
      const diff = computeSimpleDiff(content, content)

      expect(diff.every(line => line.startsWith('  '))).toBe(true)
    })

    it('marks added lines with +', () => {
      const original = 'Line 1\nLine 2'
      const modified = 'Line 1\nLine 2\nLine 3'
      const diff = computeSimpleDiff(original, modified)

      expect(diff).toContain('+ Line 3')
    })

    it('marks removed lines with -', () => {
      const original = 'Line 1\nLine 2\nLine 3'
      const modified = 'Line 1\nLine 2'
      const diff = computeSimpleDiff(original, modified)

      expect(diff).toContain('- Line 3')
    })

    it('shows both removed and added for changed lines', () => {
      const original = 'Line 1\nOld line\nLine 3'
      const modified = 'Line 1\nNew line\nLine 3'
      const diff = computeSimpleDiff(original, modified)

      expect(diff).toContain('- Old line')
      expect(diff).toContain('+ New line')
    })
  })

  describe('getPromptDiff', () => {
    it('returns null when no project prompt exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await getPromptDiff('/test/project')

      expect(result).toBeNull()
    })

    it('returns diff data when project prompt exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('# Modified Prompt\n\nCustom content.')

      const result = await getPromptDiff('/test/project')

      expect(result).not.toBeNull()
      expect(result!.original).toContain('# Agent Instructions')
      expect(result!.modified).toBe('# Modified Prompt\n\nCustom content.')
      expect(result!.hasChanges).toBe(true)
      expect(result!.diff.length).toBeGreaterThan(0)
    })

    it('hasChanges is false when content is identical', async () => {
      const defaultTemplate = getDefaultPromptTemplate()
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(defaultTemplate)

      const result = await getPromptDiff('/test/project')

      expect(result).not.toBeNull()
      expect(result!.hasChanges).toBe(false)
    })
  })

  describe('getPreviewLines', () => {
    it('returns first N lines', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
      const preview = getPreviewLines(content, 3)

      expect(preview).toBe('Line 1\nLine 2\nLine 3')
    })

    it('returns all lines if content has fewer than N lines', () => {
      const content = 'Line 1\nLine 2'
      const preview = getPreviewLines(content, 10)

      expect(preview).toBe('Line 1\nLine 2')
    })

    it('defaults to 10 lines', () => {
      const lines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`)
      const content = lines.join('\n')
      const preview = getPreviewLines(content)

      expect(preview.split('\n').length).toBe(10)
    })
  })

  describe('validatePromptContent', () => {
    it('returns empty array for safe content', () => {
      const warnings = validatePromptContent('# Safe Prompt\n\nThis is safe content.')
      expect(warnings).toEqual([])
    })

    it('detects command substitution', () => {
      const warnings = validatePromptContent('Run this: `$(dangerous_command)`')
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some(w => w.includes('command substitution'))).toBe(true)
    })

    it('detects eval usage', () => {
      const warnings = validatePromptContent('Use eval(code) to execute')
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some(w => w.includes('eval'))).toBe(true)
    })

    it('detects environment variable modification', () => {
      const warnings = validatePromptContent('process.env.SECRET = "value"')
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some(w => w.includes('environment'))).toBe(true)
    })

    it('detects require statements', () => {
      const warnings = validatePromptContent('const fs = require("fs")')
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some(w => w.includes('require'))).toBe(true)
    })
  })
})

/**
 * @vitest-environment node
 *
 * Ralph Config Service Tests
 *
 * Unit tests for reading and writing ralph.config.json files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'

// Mock the filesystem modules BEFORE importing the service
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      // Default to real existsSync for database paths
      if (path.includes('ralph.db') || path.includes('/data')) {
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
    writeFile: vi.fn(() => Promise.resolve()),
    mkdir: vi.fn(() => Promise.resolve()),
  }
})

import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  readRalphConfig,
  writeRalphConfig,
  getEffectiveProvider,
  getEffectiveModel,
  getEffectiveBaseUrl,
  getConfigPath,
} from './ralphConfig'
import type { RalphConfig } from '@/lib/schemas/ralphConfigSchema'

describe('ralphConfig service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getConfigPath', () => {
    it('returns correct path for project', () => {
      const projectPath = '/path/to/project'
      const result = getConfigPath(projectPath)
      expect(result).toBe(join(projectPath, 'stories', 'ralph.config.json'))
    })
  })

  describe('readRalphConfig', () => {
    it('returns null when config file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await readRalphConfig('/project/path')

      expect(result).toBeNull()
    })

    it('returns parsed config when file exists and is valid', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runner: {
            provider: 'ollama',
            model: 'llama3.2',
          },
        })
      )

      const result = await readRalphConfig('/project/path')

      expect(result).not.toBeNull()
      expect(result?.runner?.provider).toBe('ollama')
      expect(result?.runner?.model).toBe('llama3.2')
    })

    it('returns null when config file has invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('{ invalid json }')

      const result = await readRalphConfig('/project/path')

      expect(result).toBeNull()
    })

    it('returns null when config is invalid schema', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runner: {
            provider: 'invalid-provider',
          },
        })
      )

      const result = await readRalphConfig('/project/path')

      expect(result).toBeNull()
    })

    it('returns null when read fails', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('Read failed'))

      const result = await readRalphConfig('/project/path')

      expect(result).toBeNull()
    })

    it('reads from correct path', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({}))

      await readRalphConfig('/my/project')

      expect(readFile).toHaveBeenCalledWith(
        '/my/project/stories/ralph.config.json',
        'utf-8'
      )
    })
  })

  describe('writeRalphConfig', () => {
    it('writes valid config to file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const config: RalphConfig = {
        runner: {
          provider: 'claude',
          model: 'opus',
        },
      }

      await writeRalphConfig('/project/path', config)

      expect(writeFile).toHaveBeenCalledWith(
        '/project/path/stories/ralph.config.json',
        expect.stringContaining('"provider": "claude"'),
        'utf-8'
      )
    })

    it('creates stories directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const config: RalphConfig = {
        runner: { provider: 'gemini' },
      }

      await writeRalphConfig('/project/path', config)

      expect(mkdir).toHaveBeenCalledWith('/project/path/stories', {
        recursive: true,
      })
    })

    it('throws error for invalid config', async () => {
      const invalidConfig = {
        runner: {
          provider: 'invalid-provider',
        },
      } as unknown as RalphConfig

      await expect(
        writeRalphConfig('/project/path', invalidConfig)
      ).rejects.toThrow('Invalid configuration')
    })

    it('writes formatted JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const config: RalphConfig = {
        runner: { provider: 'codex' },
      }

      await writeRalphConfig('/project/path', config)

      expect(writeFile).toHaveBeenCalled()
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string
      // Should be formatted with indentation
      expect(writtenContent).toContain('\n')
    })
  })

  describe('getEffectiveProvider', () => {
    it('returns claude when config does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await getEffectiveProvider('/project/path')

      expect(result).toBe('claude')
    })

    it('returns configured provider when config exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runner: { provider: 'ollama' },
        })
      )

      const result = await getEffectiveProvider('/project/path')

      expect(result).toBe('ollama')
    })

    it('returns claude when config has no runner section', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({}))

      const result = await getEffectiveProvider('/project/path')

      expect(result).toBe('claude')
    })

    it('returns claude when config is invalid', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('invalid json')

      const result = await getEffectiveProvider('/project/path')

      expect(result).toBe('claude')
    })
  })

  describe('getEffectiveModel', () => {
    it('returns undefined when config does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await getEffectiveModel('/project/path')

      expect(result).toBeUndefined()
    })

    it('returns configured model when set', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runner: {
            provider: 'ollama',
            model: 'llama3.2:7b',
          },
        })
      )

      const result = await getEffectiveModel('/project/path')

      expect(result).toBe('llama3.2:7b')
    })

    it('returns undefined when model is not set', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runner: { provider: 'claude' },
        })
      )

      const result = await getEffectiveModel('/project/path')

      expect(result).toBeUndefined()
    })
  })

  describe('getEffectiveBaseUrl', () => {
    it('returns undefined when config does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await getEffectiveBaseUrl('/project/path')

      expect(result).toBeUndefined()
    })

    it('returns configured baseUrl when set', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runner: {
            provider: 'ollama',
            baseUrl: 'http://192.168.1.100:11434',
          },
        })
      )

      const result = await getEffectiveBaseUrl('/project/path')

      expect(result).toBe('http://192.168.1.100:11434')
    })

    it('returns undefined when baseUrl is not set', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runner: { provider: 'ollama' },
        })
      )

      const result = await getEffectiveBaseUrl('/project/path')

      expect(result).toBeUndefined()
    })
  })
})

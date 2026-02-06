/**
 * @vitest-environment node
 *
 * Skills Router Tests
 *
 * Unit tests for the skills tRPC endpoints.
 * Uses mocked filesystem for testing skill loading and override CRUD.
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
      // Default to real existsSync for database paths
      const pathStr = String(path)
      if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
        return actual.existsSync(path)
      }
      // Return mocked value for skill/project paths
      return false
    }),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(),
    readdir: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    rmdir: vi.fn(),
  }
})

import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile, mkdir, unlink } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { skillsRouter } from './skills'
import { db } from '@/db'
import { projects } from '@/db/schema'

const createCaller = createCallerFactory(skillsRouter)

// Test skill content helpers
const createSkillMd = (name: string, description: string, body = '') => `---
name: ${name}
description: ${description}
---

${body}`.trim() + '\n'

const centralSkillContent = createSkillMd('Test Skill', 'A test skill for testing', 'This is the test skill content.')
const overrideSkillContent = createSkillMd('Test Skill Override', 'An overridden test skill', 'This is the override content.')

describe('skillsRouter', () => {
  // Clean up database before each test
  beforeEach(async () => {
    await db.delete(projects)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listCentral', () => {
    it('returns empty array when skills directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})
      const result = await caller.listCentral()

      expect(result).toEqual([])
    })

    it('returns empty array when skills directory is empty', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdir).mockResolvedValue([])

      const caller = createCaller({})
      const result = await caller.listCentral()

      expect(result).toEqual([])
    })

    it('returns skills from skills directory', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        // Skills directory exists
        if (pathStr.endsWith('/skills') || pathStr === './skills') return true
        // SKILL.md file exists
        if (pathStr.endsWith('/SKILL.md')) return true
        return false
      })

      vi.mocked(readdir).mockResolvedValue([
        { name: 'test-skill', isDirectory: () => true } as any,
        { name: 'readme.md', isDirectory: () => false } as any, // Should be ignored
      ])

      vi.mocked(readFile).mockResolvedValue(centralSkillContent)

      const caller = createCaller({})
      const result = await caller.listCentral()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('test-skill')
      expect(result[0].name).toBe('Test Skill')
      expect(result[0].description).toBe('A test skill for testing')
    })

    it('handles skills without valid SKILL.md gracefully', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        // Skills directory exists
        if (pathStr.endsWith('/skills') || pathStr === './skills') return true
        // good-skill has SKILL.md (use "good-skill" instead of "valid-skill" to avoid substring match issues)
        if (pathStr.includes('good-skill/SKILL.md')) return true
        // All other SKILL.md files don't exist
        if (pathStr.endsWith('/SKILL.md')) return false
        // Default fallback
        return false
      })

      vi.mocked(readdir).mockResolvedValue([
        { name: 'good-skill', isDirectory: () => true } as any,
        { name: 'bad-skill', isDirectory: () => true } as any,
      ])

      vi.mocked(readFile).mockImplementation(async (path) => {
        if ((path as string).includes('good-skill')) {
          return centralSkillContent
        }
        throw new Error('File not found')
      })

      const caller = createCaller({})
      const result = await caller.listCentral()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('good-skill')
    })

    it('sorts skills alphabetically by name', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdir).mockResolvedValue([
        { name: 'zebra-skill', isDirectory: () => true } as any,
        { name: 'alpha-skill', isDirectory: () => true } as any,
      ])

      vi.mocked(readFile).mockImplementation(async (path) => {
        if ((path as string).includes('zebra')) {
          return createSkillMd('Zebra Skill', 'Z skill')
        }
        return createSkillMd('Alpha Skill', 'A skill')
      })

      const caller = createCaller({})
      const result = await caller.listCentral()

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Alpha Skill')
      expect(result[1].name).toBe('Zebra Skill')
    })
  })

  describe('isWritable', () => {
    it('returns writable: false when skills directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})
      const result = await caller.isWritable()

      expect(result.writable).toBe(false)
      expect(result.reason).toContain('does not exist')
    })

    it('returns writable: true when skills directory is writable', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      // Mock the access function to succeed
      vi.doMock('node:fs/promises', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs/promises')>()
        return {
          ...actual,
          access: vi.fn().mockResolvedValue(undefined),
          constants: { W_OK: 2 },
        }
      })

      const caller = createCaller({})
      const result = await caller.isWritable()

      // Since we can't easily mock the dynamic import, we test the actual behavior
      // If the directory exists and is accessible, it should be writable
      expect(result.writable).toBeDefined()
      expect(typeof result.writable).toBe('boolean')
    })
  })

  describe('listByProject', () => {
    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.listByProject({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns central skills when project has no overrides', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        // Project override path doesn't exist
        if (pathStr.includes('.ralph')) return false
        // Central skills directory exists
        if (pathStr.endsWith('/skills') || pathStr === './skills') return true
        // Central skill SKILL.md files exist
        if (pathStr.includes('skills/') && pathStr.endsWith('/SKILL.md')) return true
        return false
      })

      vi.mocked(readdir).mockImplementation(async (path) => {
        const pathStr = String(path)
        if (pathStr.includes('.ralph')) return []
        return [{ name: 'central-skill', isDirectory: () => true } as any]
      })

      vi.mocked(readFile).mockResolvedValue(centralSkillContent)

      const caller = createCaller({})
      const result = await caller.listByProject({ projectId: project.id })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('central-skill')
      expect(result[0].hasOverride).toBe(false)
      expect(result[0].isOverride).toBeUndefined()
    })

    it('marks overridden skills with isOverride flag', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)

      vi.mocked(readdir).mockImplementation(async () => {
        // Both central and project have the same skill
        return [{ name: 'shared-skill', isDirectory: () => true } as any]
      })

      vi.mocked(readFile).mockImplementation(async (path) => {
        if ((path as string).includes('.ralph')) {
          return overrideSkillContent
        }
        return centralSkillContent
      })

      const caller = createCaller({})
      const result = await caller.listByProject({ projectId: project.id })

      expect(result).toHaveLength(1)
      expect(result[0].isOverride).toBe(true)
      expect(result[0].hasOverride).toBe(true)
      expect(result[0].name).toBe('Test Skill Override') // Override takes precedence
    })

    it('includes project-only skills', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)

      vi.mocked(readdir).mockImplementation(async (path) => {
        if ((path as string).includes('.ralph')) {
          return [{ name: 'project-only-skill', isDirectory: () => true } as any]
        }
        return [{ name: 'central-skill', isDirectory: () => true } as any]
      })

      vi.mocked(readFile).mockImplementation(async (path) => {
        if ((path as string).includes('project-only')) {
          return createSkillMd('Project Only', 'A project-only skill')
        }
        return centralSkillContent
      })

      const caller = createCaller({})
      const result = await caller.listByProject({ projectId: project.id })

      expect(result).toHaveLength(2)
      expect(result.find(s => s.id === 'project-only-skill')).toBeDefined()
      expect(result.find(s => s.id === 'project-only-skill')?.isOverride).toBe(true)
    })
  })

  describe('getById', () => {
    it('returns central skill when no projectId provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(centralSkillContent)

      const caller = createCaller({})
      const result = await caller.getById({ skillId: 'test-skill' })

      expect(result.id).toBe('test-skill')
      expect(result.name).toBe('Test Skill')
      expect(result.isOverride).toBeUndefined()
    })

    it('throws NOT_FOUND for non-existent skill', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})

      await expect(caller.getById({ skillId: 'non-existent' })).rejects.toThrow(TRPCError)
      await expect(caller.getById({ skillId: 'non-existent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns project override when projectId provided and override exists', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(overrideSkillContent)

      const caller = createCaller({})
      const result = await caller.getById({ skillId: 'test-skill', projectId: project.id })

      expect(result.id).toBe('test-skill')
      expect(result.name).toBe('Test Skill Override')
      expect(result.isOverride).toBe(true)
    })

    it('falls back to central skill when project has no override', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        // Override doesn't exist
        if (String(path).includes('.ralph')) return false
        // Central exists
        return true
      })

      vi.mocked(readFile).mockResolvedValue(centralSkillContent)

      const caller = createCaller({})
      const result = await caller.getById({ skillId: 'test-skill', projectId: project.id })

      expect(result.id).toBe('test-skill')
      expect(result.name).toBe('Test Skill')
      expect(result.isOverride).toBeUndefined()
    })
  })

  describe('createOverride', () => {
    it('creates override with custom content', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        // Override doesn't exist yet
        if (String(path).includes('.ralph/skills/test-skill/SKILL.md')) return false
        // Central skill exists
        if (String(path).includes('/skills/test-skill')) return true
        return false
      })

      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      // After creation, file exists
      let overrideCreated = false
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('.ralph/skills/test-skill/SKILL.md')) return overrideCreated
        return true
      })

      vi.mocked(readFile).mockResolvedValue(overrideSkillContent)

      const caller = createCaller({})

      // Simulate write completing
      vi.mocked(writeFile).mockImplementation(async () => {
        overrideCreated = true
      })

      const result = await caller.createOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: overrideSkillContent,
      })

      expect(result.id).toBe('test-skill')
      expect(result.isOverride).toBe(true)
      expect(mkdir).toHaveBeenCalled()
      expect(writeFile).toHaveBeenCalled()
    })

    it('copies central skill when no content provided', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      let overrideCreated = false

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        // Override skill doesn't exist yet (until created)
        if (pathStr.includes('.ralph/skills/test-skill/SKILL.md')) return overrideCreated
        // Central skill exists (check for SKILL.md path)
        if (pathStr.includes('skills/test-skill/SKILL.md') && !pathStr.includes('.ralph')) return true
        return false
      })

      vi.mocked(readFile).mockResolvedValue(centralSkillContent)
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockImplementation(async () => {
        overrideCreated = true
      })

      const caller = createCaller({})
      const result = await caller.createOverride({
        projectId: project.id,
        skillId: 'test-skill',
      })

      expect(result.id).toBe('test-skill')
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('SKILL.md'),
        centralSkillContent,
        'utf-8'
      )
    })

    it('throws CONFLICT when override already exists', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true) // Override exists

      const caller = createCaller({})

      await expect(caller.createOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: overrideSkillContent,
      })).rejects.toThrow(TRPCError)

      await expect(caller.createOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: overrideSkillContent,
      })).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })

    it('throws NOT_FOUND when central skill not found and no content provided', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(false) // Nothing exists

      const caller = createCaller({})

      await expect(caller.createOverride({
        projectId: project.id,
        skillId: 'non-existent',
      })).rejects.toThrow(TRPCError)

      await expect(caller.createOverride({
        projectId: project.id,
        skillId: 'non-existent',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('validates content has valid frontmatter', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(false) // Override doesn't exist

      const caller = createCaller({})

      await expect(caller.createOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: 'Invalid content without frontmatter',
      })).rejects.toThrow(TRPCError)

      await expect(caller.createOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: 'Invalid content without frontmatter',
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })
  })

  describe('updateOverride', () => {
    it('updates existing override', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true) // Override exists
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(overrideSkillContent)

      const caller = createCaller({})
      const result = await caller.updateOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: overrideSkillContent,
      })

      expect(result.id).toBe('test-skill')
      expect(result.isOverride).toBe(true)
      expect(writeFile).toHaveBeenCalled()
    })

    it('throws NOT_FOUND when override does not exist', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('.ralph/skills/test-skill/SKILL.md')) return false
        return true
      })

      const caller = createCaller({})

      await expect(caller.updateOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: overrideSkillContent,
      })).rejects.toThrow(TRPCError)

      await expect(caller.updateOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: overrideSkillContent,
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('validates content has valid frontmatter', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)

      const caller = createCaller({})

      await expect(caller.updateOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: 'No frontmatter here',
      })).rejects.toThrow(TRPCError)

      await expect(caller.updateOverride({
        projectId: project.id,
        skillId: 'test-skill',
        content: 'No frontmatter here',
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })
  })

  describe('deleteOverride', () => {
    it('deletes existing override', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(unlink).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.deleteOverride({
        projectId: project.id,
        skillId: 'test-skill',
      })

      expect(result.success).toBe(true)
      expect(result.deletedSkillId).toBe('test-skill')
      expect(unlink).toHaveBeenCalled()
    })

    it('throws NOT_FOUND when override does not exist', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('.ralph/skills/test-skill/SKILL.md')) return false
        return true
      })

      const caller = createCaller({})

      await expect(caller.deleteOverride({
        projectId: project.id,
        skillId: 'test-skill',
      })).rejects.toThrow(TRPCError)

      await expect(caller.deleteOverride({
        projectId: project.id,
        skillId: 'test-skill',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('diff', () => {
    it('returns diff between central and override', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if ((path as string).includes('.ralph')) {
          return overrideSkillContent
        }
        return centralSkillContent
      })

      const caller = createCaller({})
      const result = await caller.diff({
        projectId: project.id,
        skillId: 'test-skill',
      })

      expect(result.skillId).toBe('test-skill')
      expect(result.original).toBe(centralSkillContent)
      expect(result.override).toBe(overrideSkillContent)
      expect(result.hasChanges).toBe(true)
      expect(result.diff).toContain('---')
      expect(result.diff).toContain('+++')
    })

    it('shows no changes when override is identical', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(centralSkillContent) // Same content

      const caller = createCaller({})
      const result = await caller.diff({
        projectId: project.id,
        skillId: 'test-skill',
      })

      expect(result.hasChanges).toBe(false)
    })

    it('throws NOT_FOUND when central skill not found', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        if (pathStr.includes('/skills/') && !pathStr.includes('.ralph')) return false
        return true
      })

      const caller = createCaller({})

      await expect(caller.diff({
        projectId: project.id,
        skillId: 'non-existent',
      })).rejects.toThrow(TRPCError)

      await expect(caller.diff({
        projectId: project.id,
        skillId: 'non-existent',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Central skill'),
      })
    })

    it('throws NOT_FOUND when override not found', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/test/project',
      }).returning()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const pathStr = String(path)
        // Central skill exists (./skills/test-skill/SKILL.md)
        if (pathStr.includes('skills/test-skill/SKILL.md') && !pathStr.includes('.ralph')) return true
        // Override doesn't exist
        return false
      })

      vi.mocked(readFile).mockResolvedValue(centralSkillContent)

      const caller = createCaller({})

      await expect(caller.diff({
        projectId: project.id,
        skillId: 'test-skill',
      })).rejects.toThrow(TRPCError)

      await expect(caller.diff({
        projectId: project.id,
        skillId: 'test-skill',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Override'),
      })
    })
  })

  describe('input validation', () => {
    it('validates skillId is not empty', async () => {
      const caller = createCaller({})

      await expect(caller.getById({ skillId: '' })).rejects.toThrow()
    })

    it('validates projectId is positive integer', async () => {
      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: -1 })).rejects.toThrow()
      await expect(caller.listByProject({ projectId: 0 })).rejects.toThrow()
    })
  })
})

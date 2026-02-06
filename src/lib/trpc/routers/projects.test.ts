/**
 * @vitest-environment node
 *
 * Projects Router Tests
 *
 * Unit tests for the projects tRPC endpoints.
 * Uses mocked filesystem and in-memory SQLite for isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'

// Mock the filesystem modules BEFORE importing anything that uses them
// Use importOriginal to preserve non-mocked exports
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      // Default to real existsSync for database paths
      if (path.includes('ralph.db') || path.includes('/data')) {
        return actual.existsSync(path)
      }
      // Return mocked value for project paths
      return false
    }),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(),
  }
})

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { projectsRouter } from './projects'
import { db } from '@/db'
import { projects } from '@/db/schema'

const createCaller = createCallerFactory(projectsRouter)

describe('projectsRouter', () => {
  // Clean up database before each test
  beforeEach(async () => {
    await db.delete(projects)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('list', () => {
    it('returns empty array when no projects exist', async () => {
      const caller = createCaller({})
      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('returns all projects', async () => {
      // Setup: Create test projects
      vi.mocked(existsSync).mockReturnValue(false) // No prd.json

      await db.insert(projects).values([
        { name: 'Project 1', path: '/path/to/project1' },
        { name: 'Project 2', path: '/path/to/project2' },
      ])

      const caller = createCaller({})
      const result = await caller.list()

      expect(result).toHaveLength(2)
      expect(result.map(p => p.name)).toContain('Project 1')
      expect(result.map(p => p.name)).toContain('Project 2')
    })

    it('syncs project data from prd.json', async () => {
      // Setup: Create a project
      await db.insert(projects).values({
        name: 'Test Project',
        path: '/path/to/project',
        description: 'Old description',
      })

      // Mock prd.json exists with new data
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Test Project',
        projectDescription: 'New description from prd.json',
        branchName: 'main',
      }))

      const caller = createCaller({})
      const result = await caller.list()

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('New description from prd.json')
      expect(result[0].branchName).toBe('main')
    })
  })

  describe('getById', () => {
    it('returns a project by id', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const [created] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/path/to/project',
      }).returning()

      const caller = createCaller({})
      const result = await caller.getById({ id: created.id })

      expect(result.id).toBe(created.id)
      expect(result.name).toBe('Test Project')
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.getById({ id: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.getById({ id: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('syncs with prd.json on fetch', async () => {
      const [created] = await db.insert(projects).values({
        name: 'Project',
        path: '/project',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectDescription: 'Synced description',
        branchName: 'feature/test',
      }))

      const caller = createCaller({})
      const result = await caller.getById({ id: created.id })

      expect(result.description).toBe('Synced description')
      expect(result.branchName).toBe('feature/test')
    })
  })

  describe('create', () => {
    it('creates a new project when path exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'))

      const caller = createCaller({})
      const result = await caller.create({
        name: 'New Project',
        path: '/valid/path',
        description: 'A new project',
      })

      expect(result.name).toBe('New Project')
      expect(result.path).toBe('/valid/path')
      expect(result.description).toBe('A new project')
      expect(result.id).toBeDefined()
    })

    it('throws BAD_REQUEST when path does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})

      await expect(caller.create({
        name: 'New Project',
        path: '/invalid/path',
      })).rejects.toThrow(TRPCError)

      await expect(caller.create({
        name: 'New Project',
        path: '/invalid/path',
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Path does not exist: /invalid/path',
      })
    })

    it('uses prd.json values as defaults', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'PRD Project Name',
        projectDescription: 'Description from prd.json',
        branchName: 'develop',
      }))

      const caller = createCaller({})
      const result = await caller.create({
        name: 'Custom Name', // Overrides prd.json
        path: '/project/path',
        // description not provided, should use prd.json
      })

      expect(result.name).toBe('Custom Name')
      expect(result.description).toBe('Description from prd.json')
      expect(result.branchName).toBe('develop')
    })

    it('throws CONFLICT when path already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'))

      // Create first project
      await db.insert(projects).values({
        name: 'Existing',
        path: '/existing/path',
      })

      const caller = createCaller({})

      await expect(caller.create({
        name: 'New Project',
        path: '/existing/path',
      })).rejects.toThrow(TRPCError)

      await expect(caller.create({
        name: 'New Project',
        path: '/existing/path',
      })).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })

    it('validates input with Zod', async () => {
      const caller = createCaller({})

      // Empty name should fail
      await expect(caller.create({
        name: '',
        path: '/some/path',
      })).rejects.toThrow()

      // Empty path should fail
      await expect(caller.create({
        name: 'Valid Name',
        path: '',
      })).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('updates project fields', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'))

      const [project] = await db.insert(projects).values({
        name: 'Original Name',
        path: '/original/path',
      }).returning()

      const caller = createCaller({})
      const result = await caller.update({
        id: project.id,
        name: 'Updated Name',
        description: 'New description',
      })

      expect(result.name).toBe('Updated Name')
      expect(result.description).toBe('New description')
      expect(result.path).toBe('/original/path') // Unchanged
    })

    it('validates new path exists when updating path', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Project',
        path: '/original/path',
      }).returning()

      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})

      await expect(caller.update({
        id: project.id,
        path: '/new/invalid/path',
      })).rejects.toThrow(TRPCError)

      await expect(caller.update({
        id: project.id,
        path: '/new/invalid/path',
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('allows updating to same path without validation', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Project',
        path: '/project/path',
      }).returning()

      // existsSync returns false but path is same as original
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})
      const result = await caller.update({
        id: project.id,
        path: '/project/path', // Same path
        name: 'New Name',
      })

      expect(result.name).toBe('New Name')
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.update({
        id: 99999,
        name: 'Updated',
      })).rejects.toThrow(TRPCError)

      await expect(caller.update({
        id: 99999,
        name: 'Updated',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('returns existing project when no updates provided', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Project',
        path: '/path',
      }).returning()

      const caller = createCaller({})
      const result = await caller.update({ id: project.id })

      expect(result.id).toBe(project.id)
      expect(result.name).toBe('Project')
    })

    it('throws CONFLICT when updating to existing path', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      await db.insert(projects).values([
        { name: 'Project 1', path: '/path/1' },
        { name: 'Project 2', path: '/path/2' },
      ])

      const [project1] = await db.select().from(projects).where(eq(projects.path, '/path/1'))

      const caller = createCaller({})

      await expect(caller.update({
        id: project1.id,
        path: '/path/2', // Already exists
      })).rejects.toThrow(TRPCError)

      await expect(caller.update({
        id: project1.id,
        path: '/path/2',
      })).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })

    it('can set nullable fields to null', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Project',
        path: '/path',
        description: 'Some description',
        branchName: 'main',
      }).returning()

      const caller = createCaller({})
      const result = await caller.update({
        id: project.id,
        description: null,
        branchName: null,
      })

      expect(result.description).toBeNull()
      expect(result.branchName).toBeNull()
    })
  })

  describe('delete', () => {
    it('deletes a project and returns success', async () => {
      const [project] = await db.insert(projects).values({
        name: 'To Delete',
        path: '/delete/me',
      }).returning()

      const caller = createCaller({})
      const result = await caller.delete({ id: project.id })

      expect(result.success).toBe(true)
      expect(result.deletedId).toBe(project.id)

      // Verify project is deleted
      const remaining = await db.select().from(projects)
      expect(remaining).toHaveLength(0)
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.delete({ id: 99999 })).rejects.toThrow(TRPCError)

      await expect(caller.delete({ id: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('validates id is positive integer', async () => {
      const caller = createCaller({})

      await expect(caller.delete({ id: -1 })).rejects.toThrow()
      await expect(caller.delete({ id: 0 })).rejects.toThrow()
    })
  })
})

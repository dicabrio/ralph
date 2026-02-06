/**
 * @vitest-environment node
 *
 * Runner Router Tests
 *
 * Unit tests for the runner tRPC endpoints.
 * Uses mocked runnerManager service and in-memory SQLite for isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock the runnerManager service
vi.mock('@/lib/services/runnerManager', () => ({
  runnerManager: {
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(),
    getAllStatus: vi.fn(),
  },
}))

import { createCallerFactory } from '../trpc'
import { runnerRouter } from './runner'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { runnerManager } from '@/lib/services/runnerManager'

const createCaller = createCallerFactory(runnerRouter)

describe('runnerRouter', () => {
  // Clean up database before each test
  beforeEach(async () => {
    await db.delete(projects)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('start', () => {
    it('starts a runner for an existing project', async () => {
      // Create test project
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test-project',
      }).returning()

      vi.mocked(runnerManager.start).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        storyId: 'STORY-001',
        containerId: 'abc123',
        startedAt: new Date(),
      })

      const caller = createCaller({})
      const result = await caller.start({
        projectId: project.id,
        storyId: 'STORY-001',
      })

      expect(result.status).toBe('running')
      expect(result.projectId).toBe(project.id)
      expect(result.storyId).toBe('STORY-001')
      expect(runnerManager.start).toHaveBeenCalledWith(project.id, 'test-project', 'STORY-001')
    })

    it('extracts relative path from absolute path', async () => {
      process.env.PROJECTS_ROOT = '/host/projects'

      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/host/projects/my-project',
      }).returning()

      vi.mocked(runnerManager.start).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        containerId: 'abc123',
        startedAt: new Date(),
      })

      const caller = createCaller({})
      await caller.start({ projectId: project.id })

      expect(runnerManager.start).toHaveBeenCalledWith(project.id, 'my-project', undefined)

      delete process.env.PROJECTS_ROOT
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.start({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.start({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws INTERNAL_SERVER_ERROR when runnerManager fails', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.start).mockRejectedValue(new Error('Docker not available'))

      const caller = createCaller({})

      await expect(caller.start({ projectId: project.id })).rejects.toThrow(TRPCError)
      await expect(caller.start({ projectId: project.id })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Docker not available',
      })
    })

    it('validates projectId is positive integer', async () => {
      const caller = createCaller({})

      await expect(caller.start({ projectId: -1 })).rejects.toThrow()
      await expect(caller.start({ projectId: 0 })).rejects.toThrow()
    })

    it('allows optional storyId parameter', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.start).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        containerId: 'abc123',
        startedAt: new Date(),
      })

      const caller = createCaller({})
      const result = await caller.start({ projectId: project.id })

      expect(result.status).toBe('running')
      expect(result.storyId).toBeUndefined()
    })
  })

  describe('stop', () => {
    it('stops a runner for an existing project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.stop).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      const result = await caller.stop({ projectId: project.id })

      expect(result.status).toBe('idle')
      expect(result.projectId).toBe(project.id)
      expect(runnerManager.stop).toHaveBeenCalledWith(project.id, false)
    })

    it('passes force flag to runnerManager', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.stop).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      await caller.stop({ projectId: project.id, force: true })

      expect(runnerManager.stop).toHaveBeenCalledWith(project.id, true)
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.stop({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.stop({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws INTERNAL_SERVER_ERROR when runnerManager fails', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.stop).mockRejectedValue(new Error('Container not responding'))

      const caller = createCaller({})

      await expect(caller.stop({ projectId: project.id })).rejects.toThrow(TRPCError)
      await expect(caller.stop({ projectId: project.id })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Container not responding',
      })
    })

    it('defaults force to false', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.stop).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      await caller.stop({ projectId: project.id })

      expect(runnerManager.stop).toHaveBeenCalledWith(project.id, false)
    })
  })

  describe('getStatus', () => {
    it('returns status for an existing project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const startedAt = new Date()
      vi.mocked(runnerManager.getStatus).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        storyId: 'STORY-001',
        containerId: 'abc123',
        startedAt,
      })

      const caller = createCaller({})
      const result = await caller.getStatus({ projectId: project.id })

      expect(result.status).toBe('running')
      expect(result.projectId).toBe(project.id)
      expect(result.storyId).toBe('STORY-001')
      expect(result.containerId).toBe('abc123')
      expect(result.startedAt).toEqual(startedAt)
    })

    it('returns idle status when not running', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.getStatus).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      const result = await caller.getStatus({ projectId: project.id })

      expect(result.status).toBe('idle')
      expect(result.storyId).toBeUndefined()
      expect(result.containerId).toBeUndefined()
    })

    it('returns stopping status', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.getStatus).mockResolvedValue({
        status: 'stopping',
        projectId: project.id,
      })

      const caller = createCaller({})
      const result = await caller.getStatus({ projectId: project.id })

      expect(result.status).toBe('stopping')
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.getStatus({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.getStatus({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws INTERNAL_SERVER_ERROR when runnerManager fails', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(runnerManager.getStatus).mockRejectedValue(new Error('Failed to query Docker'))

      const caller = createCaller({})

      await expect(caller.getStatus({ projectId: project.id })).rejects.toThrow(TRPCError)
      await expect(caller.getStatus({ projectId: project.id })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })
  })

  describe('getAllStatus', () => {
    it('returns empty array when no runners', async () => {
      vi.mocked(runnerManager.getAllStatus).mockResolvedValue([])

      const caller = createCaller({})
      const result = await caller.getAllStatus()

      expect(result).toEqual([])
    })

    it('returns status for all tracked runners', async () => {
      const startedAt = new Date()
      vi.mocked(runnerManager.getAllStatus).mockResolvedValue([
        {
          status: 'running',
          projectId: 1,
          storyId: 'STORY-001',
          containerId: 'abc123',
          startedAt,
        },
        {
          status: 'idle',
          projectId: 2,
        },
      ])

      const caller = createCaller({})
      const result = await caller.getAllStatus()

      expect(result).toHaveLength(2)
      expect(result[0].status).toBe('running')
      expect(result[0].projectId).toBe(1)
      expect(result[1].status).toBe('idle')
      expect(result[1].projectId).toBe(2)
    })

    it('throws INTERNAL_SERVER_ERROR when runnerManager fails', async () => {
      vi.mocked(runnerManager.getAllStatus).mockRejectedValue(new Error('Docker daemon error'))

      const caller = createCaller({})

      await expect(caller.getAllStatus()).rejects.toThrow(TRPCError)
      await expect(caller.getAllStatus()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })
  })
})

/**
 * @vitest-environment node
 *
 * Runner Router Tests
 *
 * Unit tests for the runner tRPC endpoints.
 * Uses mocked claudeLoopService and in-memory SQLite for isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock the claudeLoopService
vi.mock('@/lib/services/claudeLoopService', () => ({
  claudeLoopService: {
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(),
    getAllStatus: vi.fn(),
    setAutoRestart: vi.fn(),
    isAutoRestartEnabled: vi.fn(() => false),
  },
}))

import { createCallerFactory } from '../trpc'
import { runnerRouter } from './runner'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { claudeLoopService } from '@/lib/services/claudeLoopService'

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

      vi.mocked(claudeLoopService.start).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        storyId: 'STORY-001',
        pid: 12345,
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
      // CLI uses full project path, not relative
      expect(claudeLoopService.start).toHaveBeenCalledWith(project.id, '/projects/test-project', 'STORY-001')
    })

    it('uses full project path for CLI', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/home/user/projects/my-project',
      }).returning()

      vi.mocked(claudeLoopService.start).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        pid: 12345,
        startedAt: new Date(),
      })

      const caller = createCaller({})
      await caller.start({ projectId: project.id })

      // CLI uses full path directly
      expect(claudeLoopService.start).toHaveBeenCalledWith(project.id, '/home/user/projects/my-project', undefined)
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.start({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.start({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws INTERNAL_SERVER_ERROR when claudeLoopService fails', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.start).mockRejectedValue(new Error('Claude CLI not available'))

      const caller = createCaller({})

      await expect(caller.start({ projectId: project.id })).rejects.toThrow(TRPCError)
      await expect(caller.start({ projectId: project.id })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Claude CLI not available',
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

      vi.mocked(claudeLoopService.start).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        pid: 12345,
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

      vi.mocked(claudeLoopService.stop).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      const result = await caller.stop({ projectId: project.id })

      expect(result.status).toBe('idle')
      expect(result.projectId).toBe(project.id)
      expect(claudeLoopService.stop).toHaveBeenCalledWith(project.id, false)
    })

    it('passes force flag to claudeLoopService', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.stop).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      await caller.stop({ projectId: project.id, force: true })

      expect(claudeLoopService.stop).toHaveBeenCalledWith(project.id, true)
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(caller.stop({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.stop({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws INTERNAL_SERVER_ERROR when claudeLoopService fails', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.stop).mockRejectedValue(new Error('Container not responding'))

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

      vi.mocked(claudeLoopService.stop).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      await caller.stop({ projectId: project.id })

      expect(claudeLoopService.stop).toHaveBeenCalledWith(project.id, false)
    })
  })

  describe('getStatus', () => {
    it('returns status for an existing project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const startedAt = new Date()
      vi.mocked(claudeLoopService.getStatus).mockResolvedValue({
        status: 'running',
        projectId: project.id,
        storyId: 'STORY-001',
        pid: 12345,
        startedAt,
      })

      const caller = createCaller({})
      const result = await caller.getStatus({ projectId: project.id })

      expect(result.status).toBe('running')
      expect(result.projectId).toBe(project.id)
      expect(result.storyId).toBe('STORY-001')
      expect(result.pid).toBe(12345)
      expect(result.startedAt).toEqual(startedAt)
    })

    it('returns idle status when not running', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.getStatus).mockResolvedValue({
        status: 'idle',
        projectId: project.id,
      })

      const caller = createCaller({})
      const result = await caller.getStatus({ projectId: project.id })

      expect(result.status).toBe('idle')
      expect(result.storyId).toBeUndefined()
      expect(result.pid).toBeUndefined()
    })

    it('returns stopping status', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.getStatus).mockResolvedValue({
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

    it('throws INTERNAL_SERVER_ERROR when claudeLoopService fails', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.getStatus).mockRejectedValue(new Error('Failed to query Docker'))

      const caller = createCaller({})

      await expect(caller.getStatus({ projectId: project.id })).rejects.toThrow(TRPCError)
      await expect(caller.getStatus({ projectId: project.id })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })
  })

  describe('getAllStatus', () => {
    it('returns empty array when no runners', async () => {
      vi.mocked(claudeLoopService.getAllStatus).mockResolvedValue([])

      const caller = createCaller({})
      const result = await caller.getAllStatus()

      expect(result).toEqual([])
    })

    it('returns status for all tracked runners', async () => {
      const startedAt = new Date()
      vi.mocked(claudeLoopService.getAllStatus).mockResolvedValue([
        {
          status: 'running',
          projectId: 1,
          storyId: 'STORY-001',
          pid: 12345,
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

    it('throws INTERNAL_SERVER_ERROR when claudeLoopService fails', async () => {
      vi.mocked(claudeLoopService.getAllStatus).mockRejectedValue(new Error('Docker daemon error'))

      const caller = createCaller({})

      await expect(caller.getAllStatus()).rejects.toThrow(TRPCError)
      await expect(caller.getAllStatus()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })
  })

  describe('setAutoRestart', () => {
    it('enables auto-restart for an existing project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const caller = createCaller({})
      const result = await caller.setAutoRestart({
        projectId: project.id,
        enabled: true,
      })

      expect(result.projectId).toBe(project.id)
      expect(result.autoRestartEnabled).toBe(true)
      expect(claudeLoopService.setAutoRestart).toHaveBeenCalledWith(project.id, true)
    })

    it('disables auto-restart for an existing project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const caller = createCaller({})
      const result = await caller.setAutoRestart({
        projectId: project.id,
        enabled: false,
      })

      expect(result.projectId).toBe(project.id)
      expect(result.autoRestartEnabled).toBe(false)
      expect(claudeLoopService.setAutoRestart).toHaveBeenCalledWith(project.id, false)
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(
        caller.setAutoRestart({ projectId: 99999, enabled: true })
      ).rejects.toThrow(TRPCError)
      await expect(
        caller.setAutoRestart({ projectId: 99999, enabled: true })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('getAutoRestartStatus', () => {
    it('returns auto-restart status for an existing project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.isAutoRestartEnabled).mockReturnValue(true)

      const caller = createCaller({})
      const result = await caller.getAutoRestartStatus({ projectId: project.id })

      expect(result.projectId).toBe(project.id)
      expect(result.autoRestartEnabled).toBe(true)
      expect(claudeLoopService.isAutoRestartEnabled).toHaveBeenCalledWith(project.id)
    })

    it('returns false when auto-restart is not enabled', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      vi.mocked(claudeLoopService.isAutoRestartEnabled).mockReturnValue(false)

      const caller = createCaller({})
      const result = await caller.getAutoRestartStatus({ projectId: project.id })

      expect(result.autoRestartEnabled).toBe(false)
    })

    it('throws NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(
        caller.getAutoRestartStatus({ projectId: 99999 })
      ).rejects.toThrow(TRPCError)
      await expect(
        caller.getAutoRestartStatus({ projectId: 99999 })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })
})

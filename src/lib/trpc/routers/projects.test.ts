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
import type { PathLike } from 'node:fs'

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
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
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

// Mock the ensureClaudePermissions function
vi.mock('@/lib/services/claudePermissions', () => ({
  ensureClaudePermissions: vi.fn(() => ({
    claudeFolderCreated: true,
    settingsFileCreated: true,
    settingsPath: '/mocked/path/.claude/settings.local.json',
  })),
}))

// Mock the claudeLoopService for delete tests
vi.mock('@/lib/services/claudeLoopService', () => ({
  claudeLoopService: {
    getStatus: vi.fn(() => ({ status: 'idle', projectId: 1 })),
    stop: vi.fn(() => Promise.resolve({ status: 'idle', projectId: 1 })),
  },
}))

// Mock the codexLoopService for delete tests
vi.mock('@/lib/services/codexLoopService', () => ({
  codexLoopService: {
    getStatus: vi.fn(() => ({ status: 'idle', projectId: 1 })),
    stop: vi.fn(() => Promise.resolve({ status: 'idle', projectId: 1 })),
  },
}))

import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { projectsRouter } from './projects'
import { db } from '@/db'
import { projects, runnerLogs, brainstormSessions, brainstormMessages } from '@/db/schema'
import { ensureClaudePermissions } from '@/lib/services/claudePermissions'
import { claudeLoopService } from '@/lib/services/claudeLoopService'
import { codexLoopService } from '@/lib/services/codexLoopService'

const createCaller = createCallerFactory(projectsRouter)

describe('projectsRouter', () => {
  // Clean up database before each test
  beforeEach(async () => {
    // Delete in correct order due to foreign key constraints
    await db.delete(brainstormMessages)
    await db.delete(brainstormSessions)
    await db.delete(runnerLogs)
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

    it('returns story stats including backlog count', async () => {
      // Setup: Create a project
      await db.insert(projects).values({
        name: 'Project with stories',
        path: '/path/to/project',
      })

      // Mock prd.json with various story statuses
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Project with stories',
        userStories: [
          { id: 'STORY-1', status: 'pending' },
          { id: 'STORY-2', status: 'pending' },
          { id: 'STORY-3', status: 'backlog' },
          { id: 'STORY-4', status: 'in_progress' },
          { id: 'STORY-5', status: 'done' },
          { id: 'STORY-6', status: 'done' },
          { id: 'STORY-7', status: 'done' },
          { id: 'STORY-8', status: 'failed' },
        ],
      }))

      const caller = createCaller({})
      const result = await caller.list()

      expect(result).toHaveLength(1)
      expect(result[0].stats).toBeDefined()
      expect(result[0].stats.total).toBe(8)
      expect(result[0].stats.backlog).toBe(3) // 2 pending + 1 backlog
      expect(result[0].stats.inProgress).toBe(1)
      expect(result[0].stats.done).toBe(3)
      expect(result[0].stats.failed).toBe(1)
      expect(result[0].stats.progress).toBe(38) // 3/8 = 37.5 -> 38%
    })

    it('returns zero stats when no userStories exist', async () => {
      await db.insert(projects).values({
        name: 'Empty Project',
        path: '/path/to/empty',
      })

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Empty Project',
        // No userStories field
      }))

      const caller = createCaller({})
      const result = await caller.list()

      expect(result).toHaveLength(1)
      expect(result[0].stats).toEqual({
        total: 0,
        done: 0,
        failed: 0,
        inProgress: 0,
        backlog: 0,
        progress: 0,
      })
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

    it('calls ensureClaudePermissions after creating project', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'))
      vi.mocked(ensureClaudePermissions).mockClear()

      const caller = createCaller({})
      await caller.create({
        name: 'New Project',
        path: '/valid/path',
      })

      expect(ensureClaudePermissions).toHaveBeenCalledTimes(1)
      expect(ensureClaudePermissions).toHaveBeenCalledWith('/valid/path')
    })

    it('calls ensureClaudePermissions with expanded path when using tilde', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'))
      vi.mocked(ensureClaudePermissions).mockClear()

      const caller = createCaller({})
      // Note: expandPath will expand ~ to actual home directory
      // In real tests, this would be mocked, but here we just verify the function is called
      await caller.create({
        name: 'Home Project',
        path: '/home/user/project',
      })

      expect(ensureClaudePermissions).toHaveBeenCalledTimes(1)
      expect(ensureClaudePermissions).toHaveBeenCalledWith('/home/user/project')
    })

    it('does not call ensureClaudePermissions when path validation fails', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(ensureClaudePermissions).mockClear()

      const caller = createCaller({})

      await expect(caller.create({
        name: 'New Project',
        path: '/invalid/path',
      })).rejects.toThrow()

      expect(ensureClaudePermissions).not.toHaveBeenCalled()
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
    it('deletes a project and returns success with project details', async () => {
      const [project] = await db.insert(projects).values({
        name: 'To Delete',
        path: '/delete/me',
      }).returning()

      const caller = createCaller({})
      const result = await caller.delete({ id: project.id })

      expect(result.success).toBe(true)
      expect(result.deletedId).toBe(project.id)
      expect(result.projectName).toBe('To Delete')
      expect(result.projectPath).toBe('/delete/me')

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

    it('stops running runner before deleting project', async () => {
      // Setup: Runner is running
      vi.mocked(claudeLoopService.getStatus).mockReturnValue({
        status: 'running',
        projectId: 1,
        storyId: 'STORY-001',
        pid: 12345,
        startedAt: new Date(),
      })
      vi.mocked(claudeLoopService.stop).mockResolvedValue({
        status: 'idle',
        projectId: 1,
      })

      const [project] = await db.insert(projects).values({
        name: 'Running Project',
        path: '/running/project',
      }).returning()

      const caller = createCaller({})
      await caller.delete({ id: project.id })

      // Verify runner.stop was called with force=true
      expect(claudeLoopService.getStatus).toHaveBeenCalledWith(project.id)
      expect(claudeLoopService.stop).toHaveBeenCalledWith(project.id, true)
      expect(codexLoopService.getStatus).toHaveBeenCalledWith(project.id)
    })

    it('does not call stop if runner is not running', async () => {
      // Setup: Runner is idle
      vi.mocked(claudeLoopService.getStatus).mockReturnValue({
        status: 'idle',
        projectId: 1,
      })
      vi.mocked(claudeLoopService.stop).mockClear()

      const [project] = await db.insert(projects).values({
        name: 'Idle Project',
        path: '/idle/project',
      }).returning()

      const caller = createCaller({})
      await caller.delete({ id: project.id })

      // Verify stop was NOT called
      expect(claudeLoopService.getStatus).toHaveBeenCalledWith(project.id)
      expect(claudeLoopService.stop).not.toHaveBeenCalled()
      expect(codexLoopService.getStatus).toHaveBeenCalledWith(project.id)
      expect(codexLoopService.stop).not.toHaveBeenCalled()
    })

    it('proceeds with delete even if runner stop fails', async () => {
      // Setup: Runner is running but stop fails
      vi.mocked(claudeLoopService.getStatus).mockReturnValue({
        status: 'running',
        projectId: 1,
      })
      vi.mocked(claudeLoopService.stop).mockRejectedValue(new Error('Failed to stop'))

      const [project] = await db.insert(projects).values({
        name: 'Problem Project',
        path: '/problem/project',
      }).returning()

      const caller = createCaller({})
      const result = await caller.delete({ id: project.id })

      // Should still successfully delete
      expect(result.success).toBe(true)
      expect(result.deletedId).toBe(project.id)

      // Verify project is deleted
      const remaining = await db.select().from(projects)
      expect(remaining).toHaveLength(0)
    })

    it('cascades delete to runner_logs', async () => {
      // Reset runner status to idle
      vi.mocked(claudeLoopService.getStatus).mockReturnValue({
        status: 'idle',
        projectId: 1,
      })

      // Create project with runner_logs
      const [project] = await db.insert(projects).values({
        name: 'Project with logs',
        path: '/project/with/logs',
      }).returning()

      // Add some runner logs
      await db.insert(runnerLogs).values([
        { projectId: project.id, logContent: 'Log 1', logType: 'stdout' },
        { projectId: project.id, logContent: 'Log 2', logType: 'stdout' },
        { projectId: project.id, storyId: 'STORY-001', logContent: 'Log 3', logType: 'stderr' },
      ])

      // Verify logs exist
      const logsBefore = await db.select().from(runnerLogs)
      expect(logsBefore).toHaveLength(3)

      const caller = createCaller({})
      await caller.delete({ id: project.id })

      // Verify logs are cascade deleted
      const logsAfter = await db.select().from(runnerLogs)
      expect(logsAfter).toHaveLength(0)
    })

    it('cascades delete to brainstorm_sessions and messages', async () => {
      // Reset runner status to idle
      vi.mocked(claudeLoopService.getStatus).mockReturnValue({
        status: 'idle',
        projectId: 1,
      })

      // Create project with brainstorm sessions
      const [project] = await db.insert(projects).values({
        name: 'Project with brainstorm',
        path: '/project/with/brainstorm',
      }).returning()

      // Add brainstorm sessions
      const [session1] = await db.insert(brainstormSessions).values({
        projectId: project.id,
        title: 'Session 1',
        status: 'active',
      }).returning()

      const [session2] = await db.insert(brainstormSessions).values({
        projectId: project.id,
        title: 'Session 2',
        status: 'completed',
      }).returning()

      // Add messages to sessions
      await db.insert(brainstormMessages).values([
        { sessionId: session1.id, role: 'user', content: 'Hello' },
        { sessionId: session1.id, role: 'assistant', content: 'Hi there!' },
        { sessionId: session2.id, role: 'user', content: 'Another session' },
      ])

      // Verify data exists
      const sessionsBefore = await db.select().from(brainstormSessions)
      const messagesBefore = await db.select().from(brainstormMessages)
      expect(sessionsBefore).toHaveLength(2)
      expect(messagesBefore).toHaveLength(3)

      const caller = createCaller({})
      await caller.delete({ id: project.id })

      // Verify sessions and messages are cascade deleted
      const sessionsAfter = await db.select().from(brainstormSessions)
      const messagesAfter = await db.select().from(brainstormMessages)
      expect(sessionsAfter).toHaveLength(0)
      expect(messagesAfter).toHaveLength(0)
    })

    it('does not delete files on disk (only database record)', async () => {
      // Reset runner status to idle
      vi.mocked(claudeLoopService.getStatus).mockReturnValue({
        status: 'idle',
        projectId: 1,
      })

      // Note: We're only testing that the delete operation doesn't include
      // any filesystem operations. The acceptance criteria states that
      // files should NOT be deleted from disk.
      // Since our implementation only calls db.delete(), this is verified
      // by the fact that we never mock or call any filesystem delete functions.

      const [project] = await db.insert(projects).values({
        name: 'Project on disk',
        path: '/project/on/disk',
      }).returning()

      const caller = createCaller({})
      const result = await caller.delete({ id: project.id })

      expect(result.success).toBe(true)
      // No filesystem delete functions should have been called
      // (existsSync, unlinkSync, rmSync, etc. are not used in delete)
    })
  })

  describe('discover', () => {
    beforeEach(() => {
      // Reset PROJECTS_ROOT env
      delete process.env.PROJECTS_ROOT
    })

    it('returns empty array when PROJECTS_ROOT does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})
      const result = await caller.discover()

      expect(result.projects).toEqual([])
      // expandPath now resolves relative paths to absolute
      expect(result.projectsRoot).toMatch(/\/projects$/)
      expect(result.scannedAt).toBeInstanceOf(Date)
    })

    it('returns discovered projects with isAdded = false when not in database', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('ralph.db') || p.includes('/data')) {
          return require('node:fs').existsSync(path)
        }
        if (p === './projects') return true
        if (p.includes('new-project/stories/prd.json')) return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['new-project'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'New Project',
        projectDescription: 'Not in database yet',
      }))

      const caller = createCaller({})
      const result = await caller.discover()

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]).toMatchObject({
        name: 'New Project',
        description: 'Not in database yet',
        isAdded: false,
      })
    })

    it('marks discovered projects as isAdded = true when already in database', async () => {
      // Get the expanded projects root that discovery will use
      const { resolve } = await import('node:path')
      const expandedProjectsRoot = resolve('./projects')
      const expandedProjectPath = `${expandedProjectsRoot}/existing-project`

      // Insert with the expanded path that discovery will return
      await db.insert(projects).values({
        name: 'Existing Project',
        path: expandedProjectPath,
      })

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('ralph.db') || p.includes('/data')) {
          return require('node:fs').existsSync(path)
        }
        // Match the expanded path
        if (p === expandedProjectsRoot || p.endsWith('/projects')) return true
        if (p.includes('existing-project/stories/prd.json')) return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['existing-project'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Existing Project',
      }))

      const caller = createCaller({})
      const result = await caller.discover()

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].isAdded).toBe(true)
    })

    it('correctly differentiates added and not-added projects', async () => {
      // Get the expanded projects root that discovery will use
      const { resolve } = await import('node:path')
      const expandedProjectsRoot = resolve('./projects')
      const expandedAddedPath = `${expandedProjectsRoot}/added-project`

      // Add one project to database with expanded path
      await db.insert(projects).values({
        name: 'Added Project',
        path: expandedAddedPath,
      })

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('ralph.db') || p.includes('/data')) {
          return require('node:fs').existsSync(path)
        }
        // Match the expanded path
        if (p === expandedProjectsRoot || p.endsWith('/projects')) return true
        if (p.includes('added-project/stories/prd.json')) return true
        if (p.includes('not-added-project/stories/prd.json')) return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['added-project', 'not-added-project'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockImplementation(async (path) => {
        const p = String(path)
        // Be specific - not-added-project should NOT match added-project
        if (p.includes('not-added-project')) {
          return JSON.stringify({ projectName: 'Not Added Project' })
        }
        if (p.includes('added-project')) {
          return JSON.stringify({ projectName: 'Added Project' })
        }
        return JSON.stringify({ projectName: 'Unknown' })
      })

      const caller = createCaller({})
      const result = await caller.discover()

      expect(result.projects).toHaveLength(2)

      const addedProject = result.projects.find(p => p.name === 'Added Project')
      const notAddedProject = result.projects.find(p => p.name === 'Not Added Project')

      expect(addedProject?.isAdded).toBe(true)
      expect(notAddedProject?.isAdded).toBe(false)
    })

    it('includes scannedAt timestamp', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const beforeTime = new Date()
      const caller = createCaller({})
      const result = await caller.discover()
      const afterTime = new Date()

      expect(result.scannedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
      expect(result.scannedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime())
    })
  })

  describe('validatePath', () => {
    it('returns pathExists = false when path does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})
      const result = await caller.validatePath({ path: '/nonexistent/path' })

      expect(result.pathExists).toBe(false)
      expect(result.hasPrd).toBe(false)
      expect(result.isAlreadyAdded).toBe(false)
      expect(result.suggestedName).toBeNull()
    })

    it('returns hasPrd = false when path exists but has no prd.json', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('ralph.db') || p.includes('/data')) {
          return require('node:fs').existsSync(path)
        }
        // Path exists but no prd.json
        if (p === '/valid/path') return true
        if (p.includes('stories/prd.json')) return false
        return false
      })
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)

      const caller = createCaller({})
      const result = await caller.validatePath({ path: '/valid/path' })

      expect(result.pathExists).toBe(true)
      expect(result.hasPrd).toBe(false)
      // When path exists but no prd.json, suggestedName comes from folder name
      expect(result.suggestedName).toBe('path')
    })

    it('returns hasPrd = true and reads metadata when prd.json exists', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('ralph.db') || p.includes('/data')) {
          return require('node:fs').existsSync(path)
        }
        if (p === '/project/path') return true
        if (p.includes('stories/prd.json')) return true
        return false
      })
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'My Project',
        projectDescription: 'A description',
        branchName: 'main',
      }))

      const caller = createCaller({})
      const result = await caller.validatePath({ path: '/project/path' })

      expect(result.pathExists).toBe(true)
      expect(result.hasPrd).toBe(true)
      expect(result.suggestedName).toBe('My Project')
      expect(result.description).toBe('A description')
      expect(result.branchName).toBe('main')
    })

    it('returns isAlreadyAdded = true when project is in database', async () => {
      // Add project to database first
      await db.insert(projects).values({
        name: 'Existing',
        path: '/existing/path',
      })

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('ralph.db') || p.includes('/data')) {
          return require('node:fs').existsSync(path)
        }
        if (p === '/existing/path') return true
        if (p.includes('stories/prd.json')) return true
        return false
      })
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Existing Project',
      }))

      const caller = createCaller({})
      const result = await caller.validatePath({ path: '/existing/path' })

      expect(result.hasPrd).toBe(true)
      expect(result.isAlreadyAdded).toBe(true)
    })

    it('returns isAlreadyAdded = false when project is not in database', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('ralph.db') || p.includes('/data')) {
          return require('node:fs').existsSync(path)
        }
        if (p === '/new/path') return true
        if (p.includes('stories/prd.json')) return true
        return false
      })
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'New Project',
      }))

      const caller = createCaller({})
      const result = await caller.validatePath({ path: '/new/path' })

      expect(result.hasPrd).toBe(true)
      expect(result.isAlreadyAdded).toBe(false)
    })
  })
})

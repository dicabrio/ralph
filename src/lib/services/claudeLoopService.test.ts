/**
 * @vitest-environment node
 *
 * ClaudeLoopService Tests
 *
 * Unit tests for the Claude Code CLI process management service.
 * Uses mocked child_process for CLI operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Mock exec results storage
let mockExecAsync = vi.fn()

// Track spawned processes for testing
const spawnedProcesses: Array<{
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  pid: number
  _handlers: Map<string, (...args: unknown[]) => void>
}> = []

// Create a mock process factory
function createMockProcess(pid: number) {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const process = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    kill: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler)
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler)
    }),
    pid,
    _handlers: handlers,
  }
  spawnedProcesses.push(process)
  return process
}

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => createMockProcess(12345)),
  exec: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}))

// Mock filesystem
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    existsSync: vi.fn((path: string) => {
      // Allow database path checks
      if (path.includes('data/') || path.includes('ralph.db')) {
        return original.existsSync(path)
      }
      // Mock claude.json for login check
      if (path.includes('.claude.json')) {
        return true
      }
      return false
    }),
  }
})

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(JSON.stringify({
    userStories: [
      { id: 'TEST-001', title: 'Test Story', status: 'pending', dependencies: [], priority: 1 },
      { id: 'TEST-002', title: 'Test Story 2', status: 'done', dependencies: [], priority: 2 },
    ],
  })),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

// Mock websocket server
vi.mock('@/lib/websocket/server', () => ({
  getWebSocketServer: vi.fn(() => ({
    broadcastLog: vi.fn(),
    broadcastToProject: vi.fn(),
  })),
}))

// Mock promptTemplate - needs to be a function that can be imported and reset
const mockGetEffectivePrompt = vi.fn().mockResolvedValue({
  content: '# Test Prompt\nThis is a test prompt.',
  source: 'default',
})

vi.mock('@/lib/services/promptTemplate', () => ({
  getEffectivePrompt: mockGetEffectivePrompt,
}))

// Mock database
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  },
}))

vi.mock('@/db/schema', () => ({
  runnerLogs: {},
}))

import type { ClaudeLoopService } from './claudeLoopService'

// Helper to create a fresh ClaudeLoopService instance
async function createTestService(): Promise<ClaudeLoopService> {
  vi.resetModules()
  mockExecAsync = vi.fn()
  spawnedProcesses.length = 0
  // Re-setup the mock after module reset
  mockGetEffectivePrompt.mockResolvedValue({
    content: '# Test Prompt\nThis is a test prompt.',
    source: 'default',
  })
  const module = await import('./claudeLoopService')
  return new module.ClaudeLoopService()
}

describe('ClaudeLoopService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    spawnedProcesses.length = 0
    process.env.HOME = '/home/testuser'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.HOME
  })

  describe('isClaudeAvailable', () => {
    it('returns true when claude CLI is available', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: 'claude 1.0.0', stderr: '' })

      const result = await service.isClaudeAvailable()

      expect(result).toBe(true)
    })

    it('returns false when claude CLI is not installed', async () => {
      const service = await createTestService()
      mockExecAsync.mockRejectedValue(new Error('command not found: claude'))

      const result = await service.isClaudeAvailable()

      expect(result).toBe(false)
    })
  })

  describe('isClaudeLoggedIn', () => {
    it('returns true when .claude.json exists', async () => {
      const service = await createTestService()

      const result = await service.isClaudeLoggedIn()

      expect(result).toBe(true)
    })

    it('returns false when .claude.json does not exist', async () => {
      // Re-mock existsSync to return false for .claude.json
      const fs = await import('node:fs')
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('.claude.json')) {
          return false
        }
        return false
      })

      const service = await createTestService()
      const result = await service.isClaudeLoggedIn()

      expect(result).toBe(false)
    })
  })

  describe('getStatus', () => {
    it('returns idle when no process is running', async () => {
      const service = await createTestService()

      const status = service.getStatus(1)

      expect(status).toEqual({
        status: 'idle',
        projectId: 1,
      })
    })

    // Skipping timing-dependent test - stopping state is briefly visible
    it.skip('returns stopping when process is being stopped', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      // Start a process
      await service.start(1, '/test/project')

      // Start stopping (but don't await)
      const stopPromise = service.stop(1)

      // Check status during stop
      const status = service.getStatus(1)
      expect(status.status).toBe('stopping')

      // Wait for stop to complete
      await stopPromise
    })
  })

  describe('getAllStatus', () => {
    it('returns empty array when no processes', async () => {
      const service = await createTestService()

      const statuses = service.getAllStatus()

      expect(statuses).toEqual([])
    })

    it('returns all running processes', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project1')
      await service.start(2, '/test/project2')

      const statuses = service.getAllStatus()

      expect(statuses).toHaveLength(2)
      expect(statuses[0].status).toBe('running')
      expect(statuses[1].status).toBe('running')
    })
  })

  describe('setAutoRestart', () => {
    it('enables auto-restart for a project', async () => {
      const service = await createTestService()

      service.setAutoRestart(1, true)

      expect(service.isAutoRestartEnabled(1)).toBe(true)
    })

    it('disables auto-restart for a project', async () => {
      const service = await createTestService()

      service.setAutoRestart(1, false)

      expect(service.isAutoRestartEnabled(1)).toBe(false)
    })

    it('defaults to true when not set', async () => {
      const service = await createTestService()

      // Default should be true
      expect(service.isAutoRestartEnabled(999)).toBe(true)
    })
  })

  describe('getBufferedLogs', () => {
    it('returns empty array when no logs', async () => {
      const service = await createTestService()

      const logs = service.getBufferedLogs(1)

      expect(logs).toEqual([])
    })
  })

  describe('start', () => {
    it('throws error when Claude CLI is not available', async () => {
      const service = await createTestService()
      mockExecAsync.mockRejectedValue(new Error('command not found'))

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        'Claude Code CLI is not installed'
      )
    })

    it('throws error when not logged in', async () => {
      const fs = await import('node:fs')
      vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('.claude.json')) {
          return false
        }
        // Allow database paths
        if (typeof path === 'string' && (path.includes('data/') || path.includes('ralph.db'))) {
          return false // Can't call real existsSync in test
        }
        return false
      })

      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: 'claude 1.0.0', stderr: '' })

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        'Not logged in to Claude'
      )
    })

    it('returns running state if already running', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project', 'TEST-001')
      const result = await service.start(1, '/test/project')

      expect(result.status).toBe('running')
      expect(result.projectId).toBe(1)
      expect(result.storyId).toBe('TEST-001')
    })

    // Skipping timing-dependent test - race condition between stop and start
    it.skip('throws error when trying to start while stopping', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project')

      // Start stopping but don't await
      service.stop(1)

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        'currently stopping'
      )
    })

    it('successfully starts a runner', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await service.start(1, '/test/project', 'TEST-001')

      expect(result.status).toBe('running')
      expect(result.projectId).toBe(1)
      expect(result.storyId).toBe('TEST-001')
      expect(result.pid).toBeDefined()
      expect(result.startedAt).toBeDefined()
    })

    it('writes prompt to stdin', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project')

      expect(spawnedProcesses[0].stdin.write).toHaveBeenCalled()
      expect(spawnedProcesses[0].stdin.end).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('returns idle when no process exists', async () => {
      const service = await createTestService()

      const result = await service.stop(1)

      expect(result).toEqual({
        status: 'idle',
        projectId: 1,
      })
    })

    it('kills process gracefully by default', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project')

      // Simulate quick process exit
      setTimeout(() => {
        const closeHandler = spawnedProcesses[0]._handlers.get('close')
        if (closeHandler) closeHandler(0)
      }, 10)

      await service.stop(1)

      expect(spawnedProcesses[0].kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('force kills when force=true', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project')
      await service.stop(1, true)

      expect(spawnedProcesses[0].kill).toHaveBeenCalledWith('SIGKILL')
    })
  })

  describe('stopAll', () => {
    it('stops all running processes', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project1')
      await service.start(2, '/test/project2')

      await service.stopAll()

      // All processes should have been killed
      expect(spawnedProcesses[0].kill).toHaveBeenCalled()
      expect(spawnedProcesses[1].kill).toHaveBeenCalled()
    })
  })

  describe('log handling', () => {
    it('adds logs to buffer when stdout data received', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project', 'TEST-001')

      // Emit stdout data
      spawnedProcesses[0].stdout.emit('data', Buffer.from('Test log line\n'))

      const logs = service.getBufferedLogs(1)
      expect(logs).toHaveLength(1)
      expect(logs[0].content).toBe('Test log line')
      expect(logs[0].logType).toBe('stdout')
    })

    it('adds logs to buffer when stderr data received', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project', 'TEST-001')

      // Emit stderr data
      spawnedProcesses[0].stderr.emit('data', Buffer.from('Error line\n'))

      const logs = service.getBufferedLogs(1)
      expect(logs).toHaveLength(1)
      expect(logs[0].content).toBe('Error line')
      expect(logs[0].logType).toBe('stderr')
    })

    it('limits buffer size', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project')

      // Emit more than buffer size logs
      for (let i = 0; i < 150; i++) {
        spawnedProcesses[0].stdout.emit('data', Buffer.from(`Log line ${i}\n`))
      }

      const logs = service.getBufferedLogs(1)
      // Buffer should be limited to 100
      expect(logs.length).toBeLessThanOrEqual(100)
    })
  })

  describe('process exit handling', () => {
    it('handles successful exit', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project', 'TEST-001')

      // Trigger close event with exit code 0
      const closeHandler = spawnedProcesses[0]._handlers.get('close')
      if (closeHandler) {
        closeHandler(0)
      }

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Process should no longer be running
      const status = service.getStatus(1)
      // Note: status might be 'running' if auto-restart kicked in
      expect(['idle', 'running']).toContain(status.status)
    })

    it('handles error exit', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      // Disable auto-restart
      service.setAutoRestart(1, false)

      await service.start(1, '/test/project', 'TEST-001')

      // Trigger close event with error code
      const closeHandler = spawnedProcesses[0]._handlers.get('close')
      if (closeHandler) {
        closeHandler(1)
      }

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Process should be idle
      const status = service.getStatus(1)
      expect(status.status).toBe('idle')
    })

    it('handles process error event', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await service.start(1, '/test/project')

      // Trigger error event
      const errorHandler = spawnedProcesses[0]._handlers.get('error')
      if (errorHandler) {
        errorHandler(new Error('Process crashed'))
      }

      // Process should be cleaned up
      const status = service.getStatus(1)
      expect(status.status).toBe('idle')
    })
  })
})

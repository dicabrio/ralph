/**
 * @vitest-environment node
 *
 * RunnerManager Service Tests
 *
 * Unit tests for the Docker container management service.
 * Uses mocked child_process for Docker CLI operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Store the mock function that we'll control
let mockExecAsync = vi.fn()

// Mock child_process.exec, spawn, and util.promisify
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(() => {
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    return { stdout, stderr, kill: vi.fn(), on: vi.fn() }
  }),
}))

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}))

// Mock logStreamingService to prevent it from actually running
vi.mock('./logStreamingService', () => ({
  logStreamingService: {
    startStreaming: vi.fn(),
    stopStreaming: vi.fn(),
    isStreaming: vi.fn(() => false),
    getBufferedLogs: vi.fn(() => []),
    clearBuffer: vi.fn(),
    getActiveStreams: vi.fn(() => []),
    stopAllStreams: vi.fn(),
  },
}))

// Mock runnerStatusMonitor to prevent it from actually running
vi.mock('./runnerStatusMonitor', () => ({
  runnerStatusMonitor: {
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    setAutoRestart: vi.fn(),
    isAutoRestartEnabled: vi.fn(() => false),
    setCallbacks: vi.fn(),
    broadcastRunning: vi.fn(),
    isMonitoring: vi.fn(() => false),
    getActiveMonitors: vi.fn(() => []),
    stopAllMonitors: vi.fn(),
  },
}))

import type { RunnerManager } from './runnerManager'

// Helper to create a fresh RunnerManager instance for each test
async function createTestManager(): Promise<RunnerManager> {
  // Clear module cache to get fresh singleton
  vi.resetModules()
  // Reset the mock function
  mockExecAsync = vi.fn()
  const module = await import('./runnerManager')
  return module.runnerManager as RunnerManager
}

describe('RunnerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set required env vars
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    process.env.HOST_PROJECTS_ROOT = '/host/projects'
    process.env.HOST_SKILLS_PATH = '/host/skills'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.HOST_PROJECTS_ROOT
    delete process.env.HOST_SKILLS_PATH
  })

  describe('getStatus', () => {
    it('returns idle when no container exists', async () => {
      const manager = await createTestManager()

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      const status = await manager.getStatus(1)

      expect(status.status).toBe('idle')
      expect(status.projectId).toBe(1)
    })

    it('returns running when container is running', async () => {
      const manager = await createTestManager()

      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps --format') && !cmd.includes('-a')) {
          return { stdout: 'claude-runner-1', stderr: '' }
        }
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.ID}}')) {
          return { stdout: 'abc123def456', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      const status = await manager.getStatus(1)

      expect(status.status).toBe('running')
      expect(status.projectId).toBe(1)
      expect(status.containerId).toBe('abc123def456')
    })
  })

  describe('start', () => {
    it('starts a container when none exists', async () => {
      const manager = await createTestManager()

      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker run')) {
          return { stdout: 'abc123def456789', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      const state = await manager.start(1, 'my-project', 'STORY-001')

      expect(state.status).toBe('running')
      expect(state.projectId).toBe(1)
      expect(state.storyId).toBe('STORY-001')
      expect(state.containerId).toBe('abc123def456')
    })

    it('returns existing state when container already running', async () => {
      const manager = await createTestManager()

      // First start
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker run')) {
          return { stdout: 'abc123def456789', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await manager.start(1, 'my-project', 'STORY-001')

      // Second start should return existing
      const state = await manager.start(1, 'my-project', 'STORY-002')

      expect(state.status).toBe('running')
      expect(state.storyId).toBe('STORY-001') // Original story
    })

    it('cleans up stopped container before starting new one', async () => {
      const manager = await createTestManager()

      let rmCalled = false
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: 'claude-runner-1', stderr: '' }
        }
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}') && !cmd.includes('-a')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker rm')) {
          rmCalled = true
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker run')) {
          return { stdout: 'newcontainer123', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await manager.start(1, 'my-project')

      expect(rmCalled).toBe(true)
    })

    it('throws error when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY

      const manager = await createTestManager()

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      await expect(manager.start(1, 'my-project')).rejects.toThrow('ANTHROPIC_API_KEY')
    })

    it('throws error when docker run fails', async () => {
      const manager = await createTestManager()

      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker run')) {
          return { stdout: '', stderr: 'Failed to pull image' }
        }
        return { stdout: '', stderr: '' }
      })

      await expect(manager.start(1, 'my-project')).rejects.toThrow('Failed to start container')
    })
  })

  describe('stop', () => {
    it('stops and removes a running container', async () => {
      const manager = await createTestManager()

      // First start a container
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker run')) {
          return { stdout: 'abc123def456', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await manager.start(1, 'my-project')

      // Now stop it
      let stopCalled = false
      let rmCalled = false
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}') && !cmd.includes('-a')) {
          return { stdout: 'claude-runner-1', stderr: '' }
        }
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: 'claude-runner-1', stderr: '' }
        }
        if (cmd.includes('docker stop')) {
          stopCalled = true
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker rm')) {
          rmCalled = true
          return { stdout: '', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      const state = await manager.stop(1)

      expect(state.status).toBe('idle')
      expect(stopCalled).toBe(true)
      expect(rmCalled).toBe(true)
    })

    it('uses docker kill when force=true', async () => {
      const manager = await createTestManager()

      // First start a container
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker run')) {
          return { stdout: 'abc123def456', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await manager.start(1, 'my-project')

      // Now force stop
      let killCalled = false
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}') && !cmd.includes('-a')) {
          return { stdout: 'claude-runner-1', stderr: '' }
        }
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: 'claude-runner-1', stderr: '' }
        }
        if (cmd.includes('docker kill')) {
          killCalled = true
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker rm')) {
          return { stdout: '', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await manager.stop(1, true)

      expect(killCalled).toBe(true)
    })

    it('returns idle even when container does not exist', async () => {
      const manager = await createTestManager()

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      const state = await manager.stop(1)

      expect(state.status).toBe('idle')
    })
  })

  describe('getAllStatus', () => {
    it('returns empty array when no containers tracked', async () => {
      const manager = await createTestManager()

      const states = await manager.getAllStatus()

      expect(states).toEqual([])
    })

    it('returns status for all tracked containers', async () => {
      const manager = await createTestManager()

      let containerCount = 0
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.Names}}')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker ps') && cmd.includes('--format {{.Names}}') && !cmd.includes('-a')) {
          if (cmd.includes('claude-runner-1')) {
            return { stdout: 'claude-runner-1', stderr: '' }
          } else if (cmd.includes('claude-runner-2')) {
            return { stdout: 'claude-runner-2', stderr: '' }
          }
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker ps -a') && cmd.includes('--format {{.ID}}')) {
          containerCount++
          return { stdout: `container${containerCount}`, stderr: '' }
        }
        if (cmd.includes('docker run')) {
          containerCount++
          return { stdout: `container${containerCount}abc`, stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await manager.start(1, 'project-1')
      await manager.start(2, 'project-2')

      const states = await manager.getAllStatus()

      expect(states).toHaveLength(2)
      expect(states.map(s => s.projectId).sort()).toEqual([1, 2])
    })
  })

  describe('cleanupOrphanedContainers', () => {
    it('stops and removes all claude-runner containers', async () => {
      const manager = await createTestManager()

      const stoppedContainers: string[] = []
      const removedContainers: string[] = []

      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('docker ps -a') && cmd.includes('--filter') && cmd.includes('claude-runner-')) {
          return { stdout: 'claude-runner-1\nclaude-runner-2', stderr: '' }
        }
        if (cmd.includes('docker ps --format {{.Names}}') && cmd.includes('claude-runner-1')) {
          return { stdout: 'claude-runner-1', stderr: '' }
        }
        if (cmd.includes('docker ps --format {{.Names}}') && cmd.includes('claude-runner-2')) {
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker stop')) {
          const match = cmd.match(/claude-runner-\d+/)
          if (match) stoppedContainers.push(match[0])
          return { stdout: '', stderr: '' }
        }
        if (cmd.includes('docker rm')) {
          const match = cmd.match(/claude-runner-\d+/)
          if (match) removedContainers.push(match[0])
          return { stdout: '', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await manager.cleanupOrphanedContainers()

      expect(stoppedContainers).toContain('claude-runner-1')
      expect(removedContainers).toContain('claude-runner-1')
      expect(removedContainers).toContain('claude-runner-2')
    })
  })
})

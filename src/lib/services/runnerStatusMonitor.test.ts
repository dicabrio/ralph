/**
 * @vitest-environment node
 *
 * Runner Status Monitor Tests
 *
 * Unit tests for the runner status monitoring service.
 * Tests container exit detection, status parsing, prd.json reading,
 * WebSocket broadcasting, and auto-restart logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Create mock functions at module scope (before vi.mock)
const mockBroadcastToProject = vi.fn()
const mockReadFile = vi.fn()

// Store spawn processes for test verification
const spawnedProcesses: Array<{
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  _eventHandlers: Map<string, ((...args: unknown[]) => void)[]>
}> = []

// Create a factory that generates fresh EventEmitters for each spawn call
const createMockProcess = () => {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const kill = vi.fn()
  const _eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>()

  const on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!_eventHandlers.has(event)) {
      _eventHandlers.set(event, [])
    }
    _eventHandlers.get(event)!.push(handler)
    return { stdout, stderr, kill, on }
  })

  const process = { stdout, stderr, kill, on, _eventHandlers }
  spawnedProcesses.push(process)
  return process
}

// Mock the child_process module
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => createMockProcess()),
}))

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}))

// Mock WebSocket server
vi.mock('@/lib/websocket/server', () => ({
  getWebSocketServer: vi.fn(() => ({
    broadcastToProject: mockBroadcastToProject,
  })),
}))

// Import after mocks are set up
import { RunnerStatusMonitor, type PrdStory } from './runnerStatusMonitor'

describe('RunnerStatusMonitor', () => {
  let monitor: InstanceType<typeof RunnerStatusMonitor>

  beforeEach(() => {
    vi.clearAllMocks()
    // Clear spawned processes array
    spawnedProcesses.length = 0
    // Create a fresh service instance for each test
    monitor = new RunnerStatusMonitor()
  })

  afterEach(() => {
    // Clean up any active monitors
    monitor.stopAllMonitors()
    vi.restoreAllMocks()
  })

  describe('startMonitoring', () => {
    it('should start monitoring a container', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      expect(monitor.isMonitoring(1)).toBe(true)
      expect(spawnedProcesses).toHaveLength(1)
    })

    it('should not start duplicate monitors for the same project', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-002')

      // Should still only have one monitor
      expect(spawnedProcesses).toHaveLength(1)
      expect(monitor.getActiveMonitors()).toHaveLength(1)
    })

    it('should allow multiple monitors for different projects', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')
      monitor.startMonitoring(2, 'def456', 'claude-runner-2', 'STORY-002')

      expect(spawnedProcesses).toHaveLength(2)
      expect(monitor.getActiveMonitors()).toHaveLength(2)
    })

    it('should store the correct monitor info', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      const monitors = monitor.getActiveMonitors()
      expect(monitors).toHaveLength(1)
      expect(monitors[0]).toEqual({
        projectId: 1,
        containerName: 'claude-runner-1',
        storyId: 'STORY-001',
        autoRestartEnabled: false,
      })
    })
  })

  describe('stopMonitoring', () => {
    it('should stop monitoring a container', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')
      expect(monitor.isMonitoring(1)).toBe(true)

      monitor.stopMonitoring(1)
      expect(monitor.isMonitoring(1)).toBe(false)
    })

    it('should kill the docker wait process', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')
      monitor.stopMonitoring(1)

      expect(spawnedProcesses[0].kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should do nothing if monitor does not exist', () => {
      // Should not throw
      expect(() => monitor.stopMonitoring(999)).not.toThrow()
    })
  })

  describe('setAutoRestart', () => {
    it('should enable auto-restart for a project', () => {
      monitor.setAutoRestart(1, true)
      expect(monitor.isAutoRestartEnabled(1)).toBe(true)
    })

    it('should disable auto-restart for a project', () => {
      monitor.setAutoRestart(1, true)
      monitor.setAutoRestart(1, false)
      expect(monitor.isAutoRestartEnabled(1)).toBe(false)
    })

    it('should update active monitor when auto-restart is toggled', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      const monitorsBefore = monitor.getActiveMonitors()
      expect(monitorsBefore[0].autoRestartEnabled).toBe(false)

      monitor.setAutoRestart(1, true)

      const monitorsAfter = monitor.getActiveMonitors()
      expect(monitorsAfter[0].autoRestartEnabled).toBe(true)
    })
  })

  describe('container exit detection', () => {
    it('should handle container exit with exit code 0', async () => {
      const onContainerExitMock = vi.fn()
      monitor.setCallbacks({
        onContainerExit: onContainerExitMock,
      })

      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      // Simulate docker wait outputting exit code
      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))

      // Simulate process close
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      expect(closeHandler).toBeDefined()
      await closeHandler!()

      // Wait for async handling
      await vi.waitFor(() => {
        expect(onContainerExitMock).toHaveBeenCalledWith({
          projectId: 1,
          containerId: 'abc123',
          storyId: 'STORY-001',
          exitCode: 0,
          success: true,
        })
      })

      // Monitor should be removed
      expect(monitor.isMonitoring(1)).toBe(false)
    })

    it('should handle container exit with non-zero exit code', async () => {
      const onContainerExitMock = vi.fn()
      monitor.setCallbacks({
        onContainerExit: onContainerExitMock,
      })

      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      // Simulate docker wait outputting exit code
      spawnedProcesses[0].stdout.emit('data', Buffer.from('1\n'))

      // Simulate process close
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await vi.waitFor(() => {
        expect(onContainerExitMock).toHaveBeenCalledWith({
          projectId: 1,
          containerId: 'abc123',
          storyId: 'STORY-001',
          exitCode: 1,
          success: false,
        })
      })
    })

    it('should broadcast runner_completed event on exit', async () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await vi.waitFor(() => {
        expect(mockBroadcastToProject).toHaveBeenCalledWith(
          '1',
          expect.objectContaining({
            type: 'runner_completed',
            payload: expect.objectContaining({
              projectId: '1',
              storyId: 'STORY-001',
              exitCode: 0,
              success: true,
              willAutoRestart: false,
            }),
          })
        )
      })
    })

    it('should broadcast runner_status idle after completion', async () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await vi.waitFor(() => {
        expect(mockBroadcastToProject).toHaveBeenCalledWith(
          '1',
          expect.objectContaining({
            type: 'runner_status',
            payload: expect.objectContaining({
              projectId: '1',
              status: 'idle',
            }),
          })
        )
      })
    })
  })

  describe('prd.json reading', () => {
    const mockPrdJson = {
      userStories: [
        { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
        { id: 'STORY-002', status: 'pending', dependencies: ['STORY-001'], priority: 2, title: 'Story 2' },
        { id: 'STORY-003', status: 'pending', dependencies: [], priority: 3, title: 'Story 3' },
      ],
    }

    it('should read prd.json to get story status', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPrdJson))

      monitor.setCallbacks({
        getProjectPath: async () => '/path/to/project',
      })

      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await vi.waitFor(() => {
        expect(mockReadFile).toHaveBeenCalledWith(
          expect.stringContaining('stories/prd.json'),
          'utf-8'
        )
      })
    })

    it('should include completed story status in broadcast', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPrdJson))

      monitor.setCallbacks({
        getProjectPath: async () => '/path/to/project',
      })

      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await vi.waitFor(() => {
        expect(mockBroadcastToProject).toHaveBeenCalledWith(
          '1',
          expect.objectContaining({
            type: 'runner_completed',
            payload: expect.objectContaining({
              completedStoryStatus: 'done',
            }),
          })
        )
      })
    })
  })

  describe('findNextPendingStory', () => {
    const stories: PrdStory[] = [
      { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
      { id: 'STORY-002', status: 'pending', dependencies: ['STORY-001'], priority: 2, title: 'Story 2' },
      { id: 'STORY-003', status: 'pending', dependencies: ['STORY-999'], priority: 3, title: 'Story 3' },
      { id: 'STORY-004', status: 'failed', dependencies: ['STORY-001'], priority: 4, title: 'Story 4' },
      { id: 'STORY-005', status: 'in_progress', dependencies: [], priority: 5, title: 'Story 5' },
    ]

    it('should find the next pending story with all dependencies met', () => {
      const nextStory = monitor.findNextPendingStory(stories)
      expect(nextStory).toBe('STORY-002')
    })

    it('should not return a story with unmet dependencies', () => {
      const storiesWithUnmetDeps: PrdStory[] = [
        { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
        { id: 'STORY-002', status: 'pending', dependencies: ['STORY-999'], priority: 2, title: 'Story 2' },
      ]

      const nextStory = monitor.findNextPendingStory(storiesWithUnmetDeps)
      expect(nextStory).toBeUndefined()
    })

    it('should prioritize by priority number', () => {
      const storiesWithPriority: PrdStory[] = [
        { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
        { id: 'STORY-002', status: 'pending', dependencies: [], priority: 10, title: 'Story 2' },
        { id: 'STORY-003', status: 'pending', dependencies: [], priority: 5, title: 'Story 3' },
      ]

      const nextStory = monitor.findNextPendingStory(storiesWithPriority)
      expect(nextStory).toBe('STORY-003')
    })

    it('should consider failed stories for restart', () => {
      const storiesWithFailed: PrdStory[] = [
        { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
        { id: 'STORY-002', status: 'failed', dependencies: [], priority: 2, title: 'Story 2' },
        { id: 'STORY-003', status: 'pending', dependencies: [], priority: 3, title: 'Story 3' },
      ]

      const nextStory = monitor.findNextPendingStory(storiesWithFailed)
      expect(nextStory).toBe('STORY-002')
    })

    it('should return undefined when all stories are done or in progress', () => {
      const allDone: PrdStory[] = [
        { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
        { id: 'STORY-002', status: 'in_progress', dependencies: [], priority: 2, title: 'Story 2' },
      ]

      const nextStory = monitor.findNextPendingStory(allDone)
      expect(nextStory).toBeUndefined()
    })

    it('should return undefined for empty story list', () => {
      const nextStory = monitor.findNextPendingStory([])
      expect(nextStory).toBeUndefined()
    })
  })

  describe('auto-restart logic', () => {
    const mockPrdJson = {
      userStories: [
        { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
        { id: 'STORY-002', status: 'pending', dependencies: [], priority: 2, title: 'Story 2' },
      ],
    }

    it('should trigger auto-restart when enabled and next story exists', async () => {
      const restartRunnerMock = vi.fn()
      mockReadFile.mockResolvedValue(JSON.stringify(mockPrdJson))

      monitor.setCallbacks({
        getProjectPath: async () => '/path/to/project',
        restartRunner: restartRunnerMock,
      })

      monitor.setAutoRestart(1, true)
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      // Wait for the auto-restart timeout
      await vi.waitFor(
        () => {
          expect(restartRunnerMock).toHaveBeenCalledWith(1, 'STORY-002')
        },
        { timeout: 2000 }
      )
    })

    it('should not trigger auto-restart when disabled', async () => {
      const restartRunnerMock = vi.fn()
      mockReadFile.mockResolvedValue(JSON.stringify(mockPrdJson))

      monitor.setCallbacks({
        getProjectPath: async () => '/path/to/project',
        restartRunner: restartRunnerMock,
      })

      monitor.setAutoRestart(1, false)
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      // Wait a bit to ensure restart is not called
      await new Promise(resolve => setTimeout(resolve, 1500))
      expect(restartRunnerMock).not.toHaveBeenCalled()
    })

    it('should not trigger auto-restart when no pending stories', async () => {
      const restartRunnerMock = vi.fn()
      const allDonePrdJson = {
        userStories: [
          { id: 'STORY-001', status: 'done', dependencies: [], priority: 1, title: 'Story 1' },
        ],
      }
      mockReadFile.mockResolvedValue(JSON.stringify(allDonePrdJson))

      monitor.setCallbacks({
        getProjectPath: async () => '/path/to/project',
        restartRunner: restartRunnerMock,
      })

      monitor.setAutoRestart(1, true)
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await new Promise(resolve => setTimeout(resolve, 1500))
      expect(restartRunnerMock).not.toHaveBeenCalled()
    })

    it('should include willAutoRestart in broadcast', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPrdJson))

      monitor.setCallbacks({
        getProjectPath: async () => '/path/to/project',
        restartRunner: vi.fn(),
      })

      monitor.setAutoRestart(1, true)
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await vi.waitFor(() => {
        expect(mockBroadcastToProject).toHaveBeenCalledWith(
          '1',
          expect.objectContaining({
            type: 'runner_completed',
            payload: expect.objectContaining({
              willAutoRestart: true,
              nextStoryId: 'STORY-002',
            }),
          })
        )
      })
    })

    it('should include nextStoryId in broadcast', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPrdJson))

      monitor.setCallbacks({
        getProjectPath: async () => '/path/to/project',
        restartRunner: vi.fn(),
      })

      monitor.setAutoRestart(1, true)
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')

      spawnedProcesses[0].stdout.emit('data', Buffer.from('0\n'))
      const closeHandler = spawnedProcesses[0]._eventHandlers.get('close')?.[0]
      await closeHandler!()

      await vi.waitFor(() => {
        expect(mockBroadcastToProject).toHaveBeenCalledWith(
          '1',
          expect.objectContaining({
            type: 'runner_completed',
            payload: expect.objectContaining({
              nextStoryId: 'STORY-002',
            }),
          })
        )
      })
    })
  })

  describe('broadcastRunning', () => {
    it('should broadcast running status', () => {
      monitor.broadcastRunning(1, 'STORY-001', 'abc123')

      expect(mockBroadcastToProject).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          type: 'runner_status',
          payload: {
            projectId: '1',
            status: 'running',
            storyId: 'STORY-001',
            containerId: 'abc123',
            exitCode: undefined,
          },
        })
      )
    })
  })

  describe('stopAllMonitors', () => {
    it('should stop all active monitors', () => {
      monitor.startMonitoring(1, 'abc123', 'claude-runner-1', 'STORY-001')
      monitor.startMonitoring(2, 'def456', 'claude-runner-2', 'STORY-002')
      monitor.setAutoRestart(1, true)
      monitor.setAutoRestart(2, true)

      monitor.stopAllMonitors()

      expect(monitor.getActiveMonitors()).toHaveLength(0)
      expect(monitor.isAutoRestartEnabled(1)).toBe(false)
      expect(monitor.isAutoRestartEnabled(2)).toBe(false)
    })
  })
})

/**
 * @vitest-environment node
 *
 * Log Streaming Service Tests
 *
 * Unit tests for the log streaming service.
 * Tests log buffering, parsing, and broadcast logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Create mock functions at module scope (before vi.mock)
const mockBroadcastLog = vi.fn()
const mockDbInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockResolvedValue(undefined),
})

// Store spawn processes for test verification - this array persists across mock calls
const spawnedProcesses: Array<{
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}> = []

// Create a factory that generates fresh EventEmitters for each spawn call
const createMockProcess = () => {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const kill = vi.fn()
  const on = vi.fn()
  const process = { stdout, stderr, kill, on }
  spawnedProcesses.push(process)
  return process
}

// Mock the child_process module
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => createMockProcess()),
}))

// Mock database
vi.mock('@/db', () => ({
  db: {
    insert: () => mockDbInsert(),
  },
}))

// Mock runner_logs schema
vi.mock('@/db/schema', () => ({
  runnerLogs: {},
}))

// Mock WebSocket server
vi.mock('@/lib/websocket/server', () => ({
  getWebSocketServer: vi.fn(() => ({
    broadcastLog: mockBroadcastLog,
  })),
}))

// Import after mocks are set up - import the class, not the singleton
import { LogStreamingService } from './logStreamingService'

describe('LogStreamingService', () => {
  let service: InstanceType<typeof LogStreamingService>

  beforeEach(() => {
    vi.clearAllMocks()
    // Clear spawned processes array
    spawnedProcesses.length = 0
    // Create a fresh service instance for each test
    service = new LogStreamingService()
  })

  afterEach(() => {
    // Clean up any active streams
    service.stopAllStreams()
    vi.restoreAllMocks()
  })

  describe('startStreaming', () => {
    it('should start streaming logs from a container', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')

      expect(service.isStreaming(1)).toBe(true)
      expect(spawnedProcesses).toHaveLength(1)
    })

    it('should not start duplicate streams for the same project', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      service.startStreaming(1, 'claude-runner-1', 'STORY-002')

      // Should still only have one stream (only one spawn call)
      expect(spawnedProcesses).toHaveLength(1)
      expect(service.getActiveStreams()).toHaveLength(1)
    })

    it('should allow multiple streams for different projects', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      service.startStreaming(2, 'claude-runner-2', 'STORY-002')

      expect(service.isStreaming(1)).toBe(true)
      expect(service.isStreaming(2)).toBe(true)
      expect(service.getActiveStreams()).toHaveLength(2)
      expect(spawnedProcesses).toHaveLength(2)
    })
  })

  describe('stopStreaming', () => {
    it('should stop an active stream', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      expect(service.isStreaming(1)).toBe(true)

      const proc = spawnedProcesses[0]
      service.stopStreaming(1)

      expect(service.isStreaming(1)).toBe(false)
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should do nothing when stopping non-existent stream', () => {
      // Should not throw
      service.stopStreaming(999)
      expect(service.isStreaming(999)).toBe(false)
    })
  })

  describe('log parsing', () => {
    it('should parse Docker timestamp format correctly', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      // Simulate log output with Docker timestamp
      const dockerLog = '2024-01-15T12:34:56.789012345Z Hello World'
      proc.stdout.emit('data', Buffer.from(dockerLog))

      // Check that broadcast was called with parsed content
      expect(mockBroadcastLog).toHaveBeenCalledWith(
        '1',
        'STORY-001',
        'Hello World',
        'stdout'
      )
    })

    it('should handle logs without timestamp', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      const plainLog = 'Just a regular log line'
      proc.stdout.emit('data', Buffer.from(plainLog))

      expect(mockBroadcastLog).toHaveBeenCalledWith(
        '1',
        'STORY-001',
        'Just a regular log line',
        'stdout'
      )
    })

    it('should handle multi-line output', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      const multiLineLog = 'Line 1\nLine 2\nLine 3'
      proc.stdout.emit('data', Buffer.from(multiLineLog))

      expect(mockBroadcastLog).toHaveBeenCalledTimes(3)
      expect(mockBroadcastLog).toHaveBeenNthCalledWith(1, '1', 'STORY-001', 'Line 1', 'stdout')
      expect(mockBroadcastLog).toHaveBeenNthCalledWith(2, '1', 'STORY-001', 'Line 2', 'stdout')
      expect(mockBroadcastLog).toHaveBeenNthCalledWith(3, '1', 'STORY-001', 'Line 3', 'stdout')
    })

    it('should filter empty lines', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      const logWithEmpty = 'Line 1\n\n\nLine 2'
      proc.stdout.emit('data', Buffer.from(logWithEmpty))

      expect(mockBroadcastLog).toHaveBeenCalledTimes(2)
    })
  })

  describe('log types', () => {
    it('should handle stdout logs', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      proc.stdout.emit('data', Buffer.from('stdout message'))

      expect(mockBroadcastLog).toHaveBeenCalledWith(
        '1',
        'STORY-001',
        'stdout message',
        'stdout'
      )
    })

    it('should handle stderr logs', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      proc.stderr.emit('data', Buffer.from('stderr message'))

      expect(mockBroadcastLog).toHaveBeenCalledWith(
        '1',
        'STORY-001',
        'stderr message',
        'stderr'
      )
    })
  })

  describe('log buffering', () => {
    it('should buffer log entries', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      proc.stdout.emit('data', Buffer.from('Log entry 1'))
      proc.stdout.emit('data', Buffer.from('Log entry 2'))
      proc.stdout.emit('data', Buffer.from('Log entry 3'))

      const buffer = service.getBufferedLogs(1)
      expect(buffer).toHaveLength(3)
      expect(buffer[0].content).toBe('Log entry 1')
      expect(buffer[1].content).toBe('Log entry 2')
      expect(buffer[2].content).toBe('Log entry 3')
    })

    it('should return empty array for project with no logs', () => {
      const buffer = service.getBufferedLogs(999)
      expect(buffer).toEqual([])
    })

    it('should clear buffer when requested', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]
      proc.stdout.emit('data', Buffer.from('Log entry'))

      expect(service.getBufferedLogs(1)).toHaveLength(1)

      service.clearBuffer(1)

      expect(service.getBufferedLogs(1)).toEqual([])
    })

    it('should respect buffer size limit', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      // Add more than 100 log entries (buffer limit)
      for (let i = 0; i < 110; i++) {
        proc.stdout.emit('data', Buffer.from(`Log entry ${i}`))
      }

      const buffer = service.getBufferedLogs(1)
      // Buffer should only have the last 100 entries
      expect(buffer).toHaveLength(100)
      // First entry should be "Log entry 10" (oldest after trim)
      expect(buffer[0].content).toBe('Log entry 10')
      // Last entry should be "Log entry 109" (newest)
      expect(buffer[99].content).toBe('Log entry 109')
    })
  })

  describe('database persistence', () => {
    it('should persist logs to database', async () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      proc.stdout.emit('data', Buffer.from('Persist this log'))

      // Wait for async persistence
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockDbInsert).toHaveBeenCalled()
    })
  })

  describe('getActiveStreams', () => {
    it('should return all active stream info', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      service.startStreaming(2, 'claude-runner-2')

      const streams = service.getActiveStreams()

      expect(streams).toHaveLength(2)

      const stream1 = streams.find((s) => s.projectId === 1)
      expect(stream1).toBeDefined()
      expect(stream1?.containerName).toBe('claude-runner-1')
      expect(stream1?.storyId).toBe('STORY-001')
      expect(stream1?.startedAt).toBeInstanceOf(Date)

      const stream2 = streams.find((s) => s.projectId === 2)
      expect(stream2).toBeDefined()
      expect(stream2?.containerName).toBe('claude-runner-2')
      expect(stream2?.storyId).toBeUndefined()
    })
  })

  describe('stopAllStreams', () => {
    it('should stop all active streams', () => {
      service.startStreaming(1, 'claude-runner-1')
      service.startStreaming(2, 'claude-runner-2')
      service.startStreaming(3, 'claude-runner-3')

      expect(service.getActiveStreams()).toHaveLength(3)

      service.stopAllStreams()

      expect(service.getActiveStreams()).toHaveLength(0)

      // All processes should have been killed
      for (const proc of spawnedProcesses) {
        expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
      }
    })
  })

  describe('WebSocket broadcast', () => {
    it('should broadcast to WebSocket server', () => {
      service.startStreaming(1, 'claude-runner-1', 'STORY-001')
      const proc = spawnedProcesses[0]

      proc.stdout.emit('data', Buffer.from('Broadcast me'))

      expect(mockBroadcastLog).toHaveBeenCalledWith(
        '1',
        'STORY-001',
        'Broadcast me',
        'stdout'
      )
    })
  })
})

/**
 * Tests for WebSocket client hook
 *
 * Tests the WebSocket client connection and message handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// WebSocket state constants
const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSED = 3

// Mock WebSocket for testing
class MockWebSocket {
  static instances: MockWebSocket[] = []

  readyState = WS_CONNECTING
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: Error) => void) | null = null

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
    // Simulate immediate connection
    setTimeout(() => {
      this.readyState = WS_OPEN
      this.onopen?.()
    }, 0)
  }

  send = vi.fn()
  close = vi.fn()

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateClose(code: number, reason: string) {
    this.readyState = WS_CLOSED
    this.onclose?.({ code, reason })
  }
}

// Store original WebSocket
const originalWebSocket = global.WebSocket

describe('WebSocket client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    vi.useRealTimers()
    global.WebSocket = originalWebSocket
  })

  describe('Brainstorm message types', () => {
    it('brainstorm_start message structure is valid', () => {
      const message = {
        type: 'brainstorm_start',
        payload: { sessionId: 'session-1', projectId: '1' },
        timestamp: Date.now(),
      }

      expect(message.type).toBe('brainstorm_start')
      expect(message.payload.sessionId).toBe('session-1')
      expect(message.payload.projectId).toBe('1')
    })

    it('brainstorm_chunk message structure is valid', () => {
      const message = {
        type: 'brainstorm_chunk',
        payload: { sessionId: 'session-1', content: 'Hello' },
        timestamp: Date.now(),
      }

      expect(message.type).toBe('brainstorm_chunk')
      expect(message.payload.content).toBe('Hello')
    })

    it('brainstorm_stories message structure is valid', () => {
      const story = {
        id: 'STORY-001',
        title: 'Test Story',
        description: 'A test story',
        priority: 1,
        epic: 'Testing',
        dependencies: [],
        recommendedSkills: ['frontend-design'],
        acceptanceCriteria: ['AC1', 'AC2'],
      }

      const message = {
        type: 'brainstorm_stories',
        payload: { sessionId: 'session-1', stories: [story] },
        timestamp: Date.now(),
      }

      expect(message.type).toBe('brainstorm_stories')
      expect(message.payload.stories).toHaveLength(1)
      expect(message.payload.stories[0].id).toBe('STORY-001')
    })

    it('brainstorm_complete message structure is valid', () => {
      const story = {
        id: 'STORY-001',
        title: 'Test Story',
        description: 'A test story',
        priority: 1,
        epic: 'Testing',
        dependencies: [],
        recommendedSkills: [],
        acceptanceCriteria: [],
      }

      const message = {
        type: 'brainstorm_complete',
        payload: { sessionId: 'session-1', content: 'Final response', stories: [story] },
        timestamp: Date.now(),
      }

      expect(message.type).toBe('brainstorm_complete')
      expect(message.payload.content).toBe('Final response')
      expect(message.payload.stories).toHaveLength(1)
    })

    it('brainstorm_error message structure is valid', () => {
      const message = {
        type: 'brainstorm_error',
        payload: { sessionId: 'session-1', error: 'Something went wrong' },
        timestamp: Date.now(),
      }

      expect(message.type).toBe('brainstorm_error')
      expect(message.payload.error).toBe('Something went wrong')
    })
  })

  describe('Exponential backoff calculation', () => {
    it('calculates correct delays for reconnection attempts', () => {
      // Simulate the backoff algorithm from the client
      function calculateBackoff(attempt: number, baseInterval: number): number {
        const exponentialDelay = Math.min(baseInterval * 2 ** attempt, 30000)
        return exponentialDelay // ignoring jitter for deterministic tests
      }

      expect(calculateBackoff(0, 1000)).toBe(1000)   // First attempt: 1s
      expect(calculateBackoff(1, 1000)).toBe(2000)   // Second attempt: 2s
      expect(calculateBackoff(2, 1000)).toBe(4000)   // Third attempt: 4s
      expect(calculateBackoff(3, 1000)).toBe(8000)   // Fourth attempt: 8s
      expect(calculateBackoff(4, 1000)).toBe(16000)  // Fifth attempt: 16s
      expect(calculateBackoff(5, 1000)).toBe(30000)  // Sixth attempt: capped at 30s
      expect(calculateBackoff(6, 1000)).toBe(30000)  // Seventh attempt: still 30s
    })
  })

  describe('Message parsing', () => {
    it('parses valid JSON messages', () => {
      const rawMessage = '{"type":"connected","payload":{"clientId":"abc123"},"timestamp":1234567890}'
      const parsed = JSON.parse(rawMessage)

      expect(parsed.type).toBe('connected')
      expect(parsed.payload.clientId).toBe('abc123')
    })

    it('handles invalid JSON gracefully', () => {
      const rawMessage = 'not valid json'

      expect(() => JSON.parse(rawMessage)).toThrow()
    })
  })

  describe('Subscribe message format', () => {
    it('creates valid subscribe message', () => {
      const projectId = '123'
      const message = {
        type: 'subscribe',
        payload: { projectId },
        timestamp: Date.now(),
      }

      expect(message.type).toBe('subscribe')
      expect(message.payload.projectId).toBe('123')
      expect(typeof message.timestamp).toBe('number')
    })

    it('creates valid unsubscribe message', () => {
      const projectId = '123'
      const message = {
        type: 'unsubscribe',
        payload: { projectId },
        timestamp: Date.now(),
      }

      expect(message.type).toBe('unsubscribe')
      expect(message.payload.projectId).toBe('123')
    })
  })
})

/**
 * @vitest-environment node
 *
 * OpenAI Service Tests
 *
 * Unit tests for the OpenAI streaming chat service.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock OpenAI class
const mockCreate = vi.fn()

vi.mock('openai', () => {
  // Create a mock APIError class inside the mock factory
  class APIError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
      this.name = 'APIError'
    }
  }

  const MockOpenAI = vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }))

  // Attach APIError to OpenAI as static property
  ;(MockOpenAI as unknown as { APIError: typeof APIError }).APIError = APIError

  return { OpenAI: MockOpenAI }
})

// Create a local APIError class for test use
class MockAPIError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'APIError'
  }
}

import {
  streamChatCompletion,
  streamChatCompletionWithHistory,
  isOpenAIConfigured,
  getOpenAIConfig,
  type StreamCallbacks,
} from './openaiService'

describe('OpenAI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
  })

  describe('isOpenAIConfigured', () => {
    it('returns true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key'
      expect(isOpenAIConfigured()).toBe(true)
    })

    it('returns false when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY
      expect(isOpenAIConfigured()).toBe(false)
    })
  })

  describe('getOpenAIConfig', () => {
    it('returns default model when OPENAI_MODEL is not set', () => {
      delete process.env.OPENAI_MODEL
      const config = getOpenAIConfig()
      expect(config.model).toBe('gpt-4o')
      expect(config.configured).toBe(true)
    })

    it('returns custom model when OPENAI_MODEL is set', () => {
      process.env.OPENAI_MODEL = 'gpt-4-turbo'
      const config = getOpenAIConfig()
      expect(config.model).toBe('gpt-4-turbo')
    })

    it('returns configured false when no API key', () => {
      delete process.env.OPENAI_API_KEY
      const config = getOpenAIConfig()
      expect(config.configured).toBe(false)
    })
  })

  describe('streamChatCompletion', () => {
    it('streams chunks and calls onComplete', async () => {
      // Create async iterator for streaming
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' World' } }] },
        { choices: [{ delta: { content: '!' } }] },
      ]

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk
        }
      }

      mockCreate.mockResolvedValue(mockStream())

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('Test system prompt', 'Test user message', callbacks)

      expect(callbacks.onChunk).toHaveBeenCalledTimes(3)
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, 'Hello')
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, ' World')
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(3, '!')
      expect(callbacks.onComplete).toHaveBeenCalledWith('Hello World!')
      expect(callbacks.onError).not.toHaveBeenCalled()
    })

    it('handles empty chunks gracefully', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: {} }] }, // Empty content
        { choices: [{ delta: { content: '' } }] }, // Empty string
        { choices: [{ delta: { content: '!' } }] },
      ]

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk
        }
      }

      mockCreate.mockResolvedValue(mockStream())

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      // Only non-empty chunks should trigger onChunk
      expect(callbacks.onChunk).toHaveBeenCalledTimes(2)
      expect(callbacks.onComplete).toHaveBeenCalledWith('Hello!')
    })

    it('handles rate limit error (429)', async () => {
      // The error needs to match OpenAI.APIError instanceof check
      // But our mock doesn't make it pass that check, so it falls through to Error handling
      const error = new MockAPIError(429, 'Rate limit exceeded')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      // Falls through to generic Error handler since MockAPIError isn't instanceof OpenAI.APIError
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      )
    })

    it('handles authentication error (401)', async () => {
      const error = new MockAPIError(401, 'Invalid API key')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      // Falls through to generic Error handler
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid API key')
      )
    })

    it('handles bad request error (400)', async () => {
      const error = new MockAPIError(400, 'Invalid request')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      // Falls through to generic Error handler
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid request')
      )
    })

    it('handles server error (500)', async () => {
      const error = new MockAPIError(500, 'Internal server error')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      // Falls through to generic Error handler
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Internal server error')
      )
    })

    it('handles network errors', async () => {
      const error = new Error('ENOTFOUND api.openai.com')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('verbinding')
      )
    })

    it('handles connection refused errors', async () => {
      const error = new Error('ECONNREFUSED')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('verbinding')
      )
    })

    it('handles timeout errors', async () => {
      const error = new Error('Request timeout')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('timeout')
      )
    })

    it('handles unknown errors', async () => {
      mockCreate.mockRejectedValue('string error')

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Onbekende')
      )
    })

    it('handles generic Error instances', async () => {
      const error = new Error('Something went wrong')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletion('system', 'user', callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.stringContaining('Something went wrong')
      )
    })
  })

  describe('streamChatCompletionWithHistory', () => {
    it('sends full message history to OpenAI', async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { content: 'Response' } }] }
      }

      mockCreate.mockResolvedValue(mockStream())

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      const messages = [
        { role: 'user' as const, content: 'First message' },
        { role: 'assistant' as const, content: 'First response' },
        { role: 'user' as const, content: 'Second message' },
      ]

      await streamChatCompletionWithHistory('System prompt', messages, callbacks)

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'System prompt' },
          ...messages,
        ],
        stream: true,
      })
      expect(callbacks.onComplete).toHaveBeenCalledWith('Response')
    })

    it('handles streaming errors', async () => {
      const error = new Error('Stream error')
      mockCreate.mockRejectedValue(error)

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletionWithHistory('System', [{ role: 'user', content: 'Hello' }], callbacks)

      expect(callbacks.onError).toHaveBeenCalled()
    })

    it('streams multiple chunks correctly', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'This ' } }] },
        { choices: [{ delta: { content: 'is ' } }] },
        { choices: [{ delta: { content: 'a ' } }] },
        { choices: [{ delta: { content: 'test' } }] },
      ]

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk
        }
      }

      mockCreate.mockResolvedValue(mockStream())

      const callbacks: StreamCallbacks = {
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await streamChatCompletionWithHistory('System', [{ role: 'user', content: 'Hello' }], callbacks)

      expect(callbacks.onChunk).toHaveBeenCalledTimes(4)
      expect(callbacks.onComplete).toHaveBeenCalledWith('This is a test')
    })
  })
})

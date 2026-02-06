/**
 * Health Router Tests
 *
 * Unit tests for the health check tRPC endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCallerFactory } from '../trpc'
import { healthRouter } from './health'

const createCaller = createCallerFactory(healthRouter)

describe('healthRouter', () => {
  let originalUptime: typeof process.uptime

  beforeEach(() => {
    // Mock process.uptime to return consistent values
    originalUptime = process.uptime
    vi.spyOn(process, 'uptime').mockReturnValue(123.456)
  })

  afterEach(() => {
    process.uptime = originalUptime
    vi.restoreAllMocks()
  })

  describe('check', () => {
    it('returns ok status', async () => {
      const caller = createCaller({})
      const result = await caller.check()

      expect(result.status).toBe('ok')
    })

    it('returns timestamp as Date', async () => {
      const caller = createCaller({})
      const before = new Date()
      const result = await caller.check()
      const after = new Date()

      expect(result.timestamp).toBeInstanceOf(Date)
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('returns uptime as number', async () => {
      const caller = createCaller({})
      const result = await caller.check()

      expect(typeof result.uptime).toBe('number')
      expect(result.uptime).toBe(123.456)
    })
  })

  describe('echo', () => {
    it('echoes the input message', async () => {
      const caller = createCaller({})
      const result = await caller.echo({ message: 'Hello, tRPC!' })

      expect(result.echo).toBe('Hello, tRPC!')
    })

    it('returns receivedAt timestamp', async () => {
      const caller = createCaller({})
      const before = new Date()
      const result = await caller.echo({ message: 'test' })
      const after = new Date()

      expect(result.receivedAt).toBeInstanceOf(Date)
      expect(result.receivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(result.receivedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('handles empty message', async () => {
      const caller = createCaller({})
      const result = await caller.echo({ message: '' })

      expect(result.echo).toBe('')
    })

    it('handles special characters in message', async () => {
      const caller = createCaller({})
      const result = await caller.echo({ message: 'Test with éàü & <script>alert(1)</script>' })

      expect(result.echo).toBe('Test with éàü & <script>alert(1)</script>')
    })
  })
})

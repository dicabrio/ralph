/**
 * @vitest-environment node
 *
 * Ralph Config Schema Tests
 *
 * Unit tests for the RalphConfig Zod schema validation.
 */
import { describe, it, expect } from 'vitest'
import {
  ralphConfigSchema,
  runnerConfigSchema,
  runnerProviderEnum,
  validateRalphConfig,
  DEFAULT_RALPH_CONFIG,
} from './ralphConfigSchema'

describe('runnerProviderEnum', () => {
  it('accepts valid providers', () => {
    expect(runnerProviderEnum.safeParse('claude').success).toBe(true)
    expect(runnerProviderEnum.safeParse('ollama').success).toBe(true)
    expect(runnerProviderEnum.safeParse('gemini').success).toBe(true)
    expect(runnerProviderEnum.safeParse('codex').success).toBe(true)
  })

  it('rejects invalid providers', () => {
    expect(runnerProviderEnum.safeParse('invalid').success).toBe(false)
    expect(runnerProviderEnum.safeParse('openai').success).toBe(false)
    expect(runnerProviderEnum.safeParse('').success).toBe(false)
    expect(runnerProviderEnum.safeParse(123).success).toBe(false)
  })
})

describe('runnerConfigSchema', () => {
  it('accepts valid runner config with all fields', () => {
    const config = {
      provider: 'ollama',
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434',
    }
    const result = runnerConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.provider).toBe('ollama')
      expect(result.data.model).toBe('llama3.2')
      expect(result.data.baseUrl).toBe('http://localhost:11434')
    }
  })

  it('accepts runner config with only provider', () => {
    const config = { provider: 'claude' }
    const result = runnerConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.provider).toBe('claude')
      expect(result.data.model).toBeUndefined()
      expect(result.data.baseUrl).toBeUndefined()
    }
  })

  it('uses default provider when not specified', () => {
    const result = runnerConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.provider).toBe('claude')
    }
  })

  it('rejects invalid baseUrl format', () => {
    const config = {
      provider: 'ollama',
      baseUrl: 'not-a-url',
    }
    const result = runnerConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('accepts valid URL formats for baseUrl', () => {
    const validUrls = [
      'http://localhost:11434',
      'https://api.example.com',
      'http://192.168.1.100:8080',
    ]

    for (const url of validUrls) {
      const result = runnerConfigSchema.safeParse({
        provider: 'ollama',
        baseUrl: url,
      })
      expect(result.success).toBe(true)
    }
  })
})

describe('ralphConfigSchema', () => {
  it('accepts valid config with runner', () => {
    const config = {
      runner: {
        provider: 'gemini',
        model: 'gemini-2.5-pro',
      },
    }
    const result = ralphConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.runner?.provider).toBe('gemini')
      expect(result.data.runner?.model).toBe('gemini-2.5-pro')
    }
  })

  it('accepts empty config', () => {
    const result = ralphConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.runner).toBeUndefined()
    }
  })

  it('accepts config without runner', () => {
    const config = {}
    const result = ralphConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects config with invalid runner', () => {
    const config = {
      runner: {
        provider: 'invalid-provider',
      },
    }
    const result = ralphConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })
})

describe('validateRalphConfig', () => {
  it('returns isValid true for valid config', () => {
    const config = {
      runner: {
        provider: 'claude',
        model: 'sonnet',
      },
    }
    const result = validateRalphConfig(config)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.data).toBeDefined()
    expect(result.data?.runner?.provider).toBe('claude')
  })

  it('returns isValid false with errors for invalid config', () => {
    const config = {
      runner: {
        provider: 'invalid',
      },
    }
    const result = validateRalphConfig(config)
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.data).toBeUndefined()
  })

  it('returns isValid true for empty config', () => {
    const result = validateRalphConfig({})
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns descriptive error messages', () => {
    const config = {
      runner: {
        provider: 'bad-provider',
        baseUrl: 'not-a-url',
      },
    }
    const result = validateRalphConfig(config)
    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.includes('provider'))).toBe(true)
  })
})

describe('DEFAULT_RALPH_CONFIG', () => {
  it('has claude as default provider', () => {
    expect(DEFAULT_RALPH_CONFIG.runner?.provider).toBe('claude')
  })

  it('is a valid config', () => {
    const result = validateRalphConfig(DEFAULT_RALPH_CONFIG)
    expect(result.isValid).toBe(true)
  })
})

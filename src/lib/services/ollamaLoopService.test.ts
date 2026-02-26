/**
 * @vitest-environment node
 *
 * OllamaLoopService Tests
 *
 * Unit tests for the Ollama-powered CLI process management service.
 * Uses mocked child_process for CLI operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// Mock exec results storage
let mockExecAsync = vi.fn()

// Configurable mock config data for ralph.config.json
// This is stored in an object so that we can mutate the value and have it accessible in hoisted vi.mock
const mockConfigStore: {
  value: { runner?: { provider?: string; model?: string; baseUrl?: string } } | null
} = {
  value: {
    runner: {
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
      baseUrl: 'http://localhost:11434',
    },
  },
}

// Mock readRalphConfigSync function that reads from mockConfigStore
const mockReadRalphConfigSync = vi.fn(() => mockConfigStore.value)

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

// Mock ralphConfig module to return our configurable mock
vi.mock('@/lib/services/ralphConfig', () => ({
  readRalphConfigSync: () => mockConfigStore.value,
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
      // Mock ralph.config.json existence
      if (path.includes('ralph.config.json')) {
        return true
      }
      return false
    }),
    readFileSync: vi.fn((path: string) => {
      if (path.includes('ralph.config.json')) {
        // Access mockConfigStore.value to get the current config
        return JSON.stringify(mockConfigStore.value)
      }
      return ''
    }),
  }
})

// Track prd.json mock data so we can change it per test
let mockPrdData: {
  userStories: Array<{ id: string; title: string; status: string; dependencies: string[]; priority: number }>
} = {
  userStories: [
    { id: 'TEST-001', title: 'Test Story', status: 'pending', dependencies: [], priority: 1 },
    { id: 'TEST-002', title: 'Test Story 2', status: 'done', dependencies: [], priority: 2 },
  ],
}

// Use a function reference that can be controlled
const mockReadFile = vi.fn(() => Promise.resolve(JSON.stringify(mockPrdData)))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => mockReadFile()),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

// Mock websocket server - track broadcast calls
const mockBroadcastToProject = vi.fn()
vi.mock('@/lib/websocket/server', () => ({
  getWebSocketServer: vi.fn(() => ({
    broadcastLog: vi.fn(),
    broadcastToProject: mockBroadcastToProject,
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

// Mock storySelector - for pre-selection functionality
const mockSelectNextStory = vi.fn()
const mockGenerateStoryPrompt = vi.fn()
const mockGetNoEligibleStoryReason = vi.fn()
const mockReadPrdJson = vi.fn()

vi.mock('@/lib/services/storySelector', () => ({
  selectNextStory: mockSelectNextStory,
  generateStoryPrompt: mockGenerateStoryPrompt,
  getNoEligibleStoryReason: mockGetNoEligibleStoryReason,
  readPrdJson: mockReadPrdJson,
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

import type { OllamaLoopService } from './ollamaLoopService'

// Helper to create a fresh OllamaLoopService instance
async function createTestService(): Promise<OllamaLoopService> {
  vi.resetModules()
  mockExecAsync = vi.fn()
  spawnedProcesses.length = 0
  // Re-setup the mock after module reset
  mockGetEffectivePrompt.mockResolvedValue({
    content: '# Test Prompt\nThis is a test prompt.',
    source: 'default',
  })
  // Setup storySelector mocks
  mockSelectNextStory.mockResolvedValue({
    story: { id: 'TEST-001', title: 'Test Story', status: 'pending', dependencies: [], priority: 1, epic: 'Test', description: 'Test', acceptanceCriteria: [], recommendedSkills: [] },
    allStories: mockPrdData.userStories,
    dependencyTitles: [],
  })
  mockGenerateStoryPrompt.mockReturnValue('# Generated Prompt\nWith story inline.')
  mockGetNoEligibleStoryReason.mockReturnValue('No eligible stories')
  mockReadPrdJson.mockResolvedValue({
    projectName: 'Test',
    userStories: mockPrdData.userStories,
  })
  const module = await import('./ollamaLoopService')
  return new module.OllamaLoopService()
}

describe('OllamaLoopService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    spawnedProcesses.length = 0
    mockBroadcastToProject.mockClear()
    process.env.HOME = '/home/testuser'
    // Reset ralph.config.json mock data to default
    mockConfigStore.value = {
      runner: {
        provider: 'ollama',
        model: 'qwen2.5-coder:7b',
        baseUrl: 'http://localhost:11434',
      },
    }
    // Reset prd.json mock data to default
    mockPrdData = {
      userStories: [
        { id: 'TEST-001', title: 'Test Story', status: 'pending', dependencies: [], priority: 1 },
        { id: 'TEST-002', title: 'Test Story 2', status: 'done', dependencies: [], priority: 2 },
      ],
    }
    // Reset storySelector mocks
    mockSelectNextStory.mockResolvedValue({
      story: { id: 'TEST-001', title: 'Test Story', status: 'pending', dependencies: [], priority: 1, epic: 'Test', description: 'Test', acceptanceCriteria: [], recommendedSkills: [] },
      allStories: mockPrdData.userStories,
      dependencyTitles: [],
    })
    mockGenerateStoryPrompt.mockReturnValue('# Generated Prompt\nWith story inline.')
    mockGetNoEligibleStoryReason.mockReturnValue('No eligible stories')
    mockReadPrdJson.mockResolvedValue({
      projectName: 'Test',
      userStories: mockPrdData.userStories,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.HOME
  })

  describe('providerName', () => {
    it('returns "ollama"', async () => {
      const service = await createTestService()

      expect(service.providerName).toBe('ollama')
    })
  })

  describe('isAvailable', () => {
    it('returns true when ollama is running', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

      const result = await service.isAvailable()

      expect(result).toBe(true)
    })

    it('returns false when ollama is not running', async () => {
      const service = await createTestService()
      mockExecAsync.mockRejectedValue(new Error('connection refused'))

      const result = await service.isAvailable()

      expect(result).toBe(false)
    })

    it('returns false when ollama is not installed', async () => {
      const service = await createTestService()
      mockExecAsync.mockRejectedValue(new Error('command not found: ollama'))

      const result = await service.isAvailable()

      expect(result).toBe(false)
    })
  })

  describe('isConfigured', () => {
    it('always returns true since Ollama requires no API key', async () => {
      const service = await createTestService()

      const result = await service.isConfigured()

      expect(result).toBe(true)
    })
  })

  describe('validateModelConfig', () => {
    it('returns null when model is configured', async () => {
      const service = await createTestService()

      const result = service.validateModelConfig('/test/project')

      expect(result).toBe(null)
    })

    it('returns error when model is not configured', async () => {
      // Set config without model
      mockConfigStore.value = {
        runner: {
          provider: 'ollama',
        },
      }

      const service = await createTestService()

      const result = service.validateModelConfig('/test/project')

      expect(result).toContain('Model name is required')
    })
  })

  describe('isModelAvailable', () => {
    it('returns true when model is in ollama list', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago\nllama3:8b\t456\t4.0GB\t1 day ago',
        stderr: '',
      })

      const result = await service.isModelAvailable('qwen2.5-coder:7b')

      expect(result).toBe(true)
    })

    it('returns true when model matches without :latest tag', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nllama3:latest\t456\t4.0GB\t1 day ago',
        stderr: '',
      })

      const result = await service.isModelAvailable('llama3')

      expect(result).toBe(true)
    })

    it('returns false when model is not in ollama list', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nllama3:8b\t456\t4.0GB\t1 day ago',
        stderr: '',
      })

      const result = await service.isModelAvailable('qwen2.5-coder:7b')

      expect(result).toBe(false)
    })

    it('returns false when ollama list fails', async () => {
      const service = await createTestService()
      mockExecAsync.mockRejectedValue(new Error('connection refused'))

      const result = await service.isModelAvailable('llama3')

      expect(result).toBe(false)
    })
  })

  describe('buildSpawnConfig', () => {
    it('returns config with Ollama environment variables', async () => {
      const service = await createTestService()

      const config = service.buildSpawnConfig('test prompt')

      expect(config.command).toBe('claude')
      expect(config.env?.ANTHROPIC_AUTH_TOKEN).toBe('ollama')
      expect(config.env?.ANTHROPIC_API_KEY).toBe('')
      expect(config.env?.ANTHROPIC_BASE_URL).toBeDefined()
    })

    it('uses stdin for prompt', async () => {
      const service = await createTestService()

      const config = service.buildSpawnConfig('test prompt')

      expect(config.useStdin).toBe(true)
      expect(config.stdinContent).toBe('test prompt')
    })

    it('includes permission mode and tool flags', async () => {
      const service = await createTestService()

      const config = service.buildSpawnConfig('test prompt')

      expect(config.args).toContain('--permission-mode')
      expect(config.args).toContain('dontAsk')
      expect(config.args).toContain('--allowedTools')
      expect(config.args).toContain('--disallowedTools')
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
  })

  describe('getAllStatus', () => {
    it('returns empty array when no processes', async () => {
      const service = await createTestService()

      const statuses = service.getAllStatus()

      expect(statuses).toEqual([])
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
    it('throws error when Ollama is not available', async () => {
      const service = await createTestService()
      mockExecAsync.mockRejectedValue(new Error('connection refused'))

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        'Ollama is not running or not installed'
      )
    })

    it('throws error when model is not configured', async () => {
      // Set config without model
      mockConfigStore.value = {
        runner: {
          provider: 'ollama',
        },
      }

      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: 'NAME\tID\tSIZE\tMODIFIED', stderr: '' })

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        'Model name is required'
      )
    })

    it('throws error when model is not available in Ollama', async () => {
      const service = await createTestService()
      // First call: ollama list for isAvailable() - succeeds
      // Second call: ollama list for isModelAvailable() - returns different models
      mockExecAsync
        .mockResolvedValueOnce({
          stdout: 'NAME\tID\tSIZE\tMODIFIED\nllama3:8b\t456\t4.0GB\t1 day ago',
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: 'NAME\tID\tSIZE\tMODIFIED\nllama3:8b\t456\t4.0GB\t1 day ago',
          stderr: '',
        })

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        "Model 'qwen2.5-coder:7b' is not available in Ollama"
      )
    })

    it('successfully starts a runner when everything is configured', async () => {
      const service = await createTestService()
      // Both calls to ollama list succeed with the configured model
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

      const result = await service.start(1, '/test/project', 'TEST-001')

      expect(result.status).toBe('running')
      expect(result.projectId).toBe(1)
      expect(result.storyId).toBe('TEST-001')
      expect(result.pid).toBeDefined()
    })

    it('returns running state if already running', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

      await service.start(1, '/test/project', 'TEST-001')
      const result = await service.start(1, '/test/project')

      expect(result.status).toBe('running')
      expect(result.projectId).toBe(1)
      expect(result.storyId).toBe('TEST-001')
    })

    it('spawns claude CLI with Ollama environment', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

      await service.start(1, '/test/project', 'TEST-001')

      const childProcess = await import('node:child_process')
      expect(childProcess.spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '-p',
          '--permission-mode',
          'dontAsk',
          '--model',
          'qwen2.5-coder:7b',
        ]),
        expect.objectContaining({
          cwd: '/test/project',
          env: expect.objectContaining({
            ANTHROPIC_AUTH_TOKEN: 'ollama',
            ANTHROPIC_API_KEY: '',
            ANTHROPIC_BASE_URL: 'http://localhost:11434',
          }),
        }),
      )
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
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

      await service.start(1, '/test/project')

      // Simulate quick process exit
      setTimeout(() => {
        const closeHandler = spawnedProcesses[0]._handlers.get('close')
        if (closeHandler) closeHandler(0)
      }, 10)

      await service.stop(1)

      expect(spawnedProcesses[0].kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  describe('log handling', () => {
    it('adds logs to buffer when stdout data received', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

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
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

      await service.start(1, '/test/project', 'TEST-001')

      // Emit stderr data
      spawnedProcesses[0].stderr.emit('data', Buffer.from('Error line\n'))

      const logs = service.getBufferedLogs(1)
      expect(logs).toHaveLength(1)
      expect(logs[0].content).toBe('Error line')
      expect(logs[0].logType).toBe('stderr')
    })
  })

  describe('process exit handling', () => {
    it('handles successful exit', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

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
      expect(status.status).toBe('idle')
    })

    it('handles error exit', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

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
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nqwen2.5-coder:7b\t123\t4.7GB\t2 days ago',
        stderr: '',
      })

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

  describe('error messages', () => {
    it('provides clear error when Ollama not available', async () => {
      const service = await createTestService()
      mockExecAsync.mockRejectedValue(new Error('connection refused'))

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        /Ollama is not running|ollama serve|https:\/\/ollama.ai/
      )
    })

    it('provides clear error when model not configured', async () => {
      // Set config without model
      mockConfigStore.value = { runner: { provider: 'ollama' } }

      const service = await createTestService()
      mockExecAsync.mockResolvedValue({ stdout: 'NAME\tID\tSIZE\tMODIFIED', stderr: '' })

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        /Model name is required.*ralph\.config\.json/
      )
    })

    it('provides clear error when model not available', async () => {
      const service = await createTestService()
      mockExecAsync.mockResolvedValue({
        stdout: 'NAME\tID\tSIZE\tMODIFIED\nllama3:8b\t456\t4.0GB\t1 day ago',
        stderr: '',
      })

      await expect(service.start(1, '/test/project')).rejects.toThrow(
        /not available in Ollama.*ollama pull.*ollama list/
      )
    })
  })
})

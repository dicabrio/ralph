/**
 * @vitest-environment node
 *
 * Test Scenarios Router Tests
 *
 * Unit tests for the testScenarios tRPC endpoints.
 * Uses mocked filesystem and in-memory SQLite for isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock the filesystem modules BEFORE importing anything that uses them
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
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  }
})

// Mock the OpenAI service
vi.mock('@/lib/services/openaiService', () => ({
  isOpenAIConfigured: vi.fn(() => false),
  streamChatCompletion: vi.fn(),
}))

import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { testScenariosRouter } from './testScenarios'
import { db } from '@/db'
import { projects } from '@/db/schema'
import type { TestScenario } from '@/lib/schemas/testScenarioSchema'

const createCaller = createCallerFactory(testScenariosRouter)

// Sample test scenario with flows (v2 format)
const sampleTestScenario: TestScenario = {
  storyId: 'STORY-001',
  title: 'Test Story',
  description: 'A test story description',
  generatedAt: '2024-01-15T10:00:00.000Z',
  flows: [
    {
      id: 'flow-1',
      name: 'Happy path: Basic functionality',
      steps: [
        'Navigate to the feature page',
        'Click the main button',
        'Verify success message appears',
      ],
      checked: false,
    },
    {
      id: 'flow-2',
      name: 'Error handling: Invalid input',
      steps: [
        'Navigate to the feature page',
        'Submit invalid data',
        'Verify error message appears',
      ],
      checked: true,
    },
    {
      id: 'flow-3',
      name: 'Edge case: Empty state',
      steps: [
        'Navigate to the feature page',
        'Clear all data',
        'Verify empty state message',
      ],
      checked: false,
    },
  ],
}

// Sample prd.json for regenerate tests
const samplePrdJson = {
  projectName: 'Test Project',
  userStories: [
    {
      id: 'STORY-001',
      title: 'Test Story',
      description: 'A test story description',
      priority: 1,
      status: 'review',
      epic: 'Core',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
    },
  ],
}

describe('testScenariosRouter', () => {
  let testProjectId: number
  let uniqueProjectPath: string

  beforeEach(async () => {
    // Reset all mocks
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFile).mockReset()
    vi.mocked(writeFile).mockReset()
    vi.mocked(mkdir).mockReset()

    // Generate unique path for this test run
    uniqueProjectPath = `/test/project-testscenarios-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // Setup default mock behavior for DB paths
    vi.mocked(existsSync).mockImplementation((path: unknown) => {
      const pathStr = String(path)
      // Real existsSync for database paths
      if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
        const { existsSync: realExistsSync } = require('node:fs')
        return realExistsSync(pathStr)
      }
      return false
    })

    // Create a test project with unique path
    const [insertedProject] = await db
      .insert(projects)
      .values({
        name: 'Test Project',
        path: uniqueProjectPath,
      })
      .returning()

    testProjectId = insertedProject.id
  })

  afterEach(async () => {
    // Clean up test project
    await db.delete(projects)
  })

  describe('getByStoryId', () => {
    it('should return test scenario when it exists', async () => {
      // Mock file exists
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        const pathStr = String(path)
        if (pathStr.includes('test-scenarios/STORY-001.json')) {
          return true
        }
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
          const { existsSync: realExistsSync } = require('node:fs')
          return realExistsSync(pathStr)
        }
        return false
      })

      // Mock file content
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      const caller = createCaller({})
      const result = await caller.getByStoryId({
        projectId: testProjectId,
        storyId: 'STORY-001',
      })

      expect(result).toEqual(sampleTestScenario)
    })

    it('should throw NOT_FOUND when test scenario does not exist', async () => {
      const caller = createCaller({})

      await expect(
        caller.getByStoryId({
          projectId: testProjectId,
          storyId: 'NONEXISTENT',
        })
      ).rejects.toThrow(TRPCError)

      await expect(
        caller.getByStoryId({
          projectId: testProjectId,
          storyId: 'NONEXISTENT',
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('should throw NOT_FOUND for non-existent project', async () => {
      const caller = createCaller({})

      await expect(
        caller.getByStoryId({
          projectId: 99999,
          storyId: 'STORY-001',
        })
      ).rejects.toThrow(TRPCError)

      await expect(
        caller.getByStoryId({
          projectId: 99999,
          storyId: 'STORY-001',
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('exists', () => {
    it('should return true when test scenario exists', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        const pathStr = String(path)
        if (pathStr.includes('test-scenarios/STORY-001.json')) {
          return true
        }
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
          const { existsSync: realExistsSync } = require('node:fs')
          return realExistsSync(pathStr)
        }
        return false
      })

      const caller = createCaller({})
      const result = await caller.exists({
        projectId: testProjectId,
        storyId: 'STORY-001',
      })

      expect(result).toBe(true)
    })

    it('should return false when test scenario does not exist', async () => {
      const caller = createCaller({})
      const result = await caller.exists({
        projectId: testProjectId,
        storyId: 'NONEXISTENT',
      })

      expect(result).toBe(false)
    })
  })

  describe('updateItem', () => {
    it('should update flow checked status to true', async () => {
      // Mock file exists
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        const pathStr = String(path)
        if (pathStr.includes('test-scenarios/STORY-001.json')) {
          return true
        }
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
          const { existsSync: realExistsSync } = require('node:fs')
          return realExistsSync(pathStr)
        }
        return false
      })

      // Mock file content
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.updateItem({
        projectId: testProjectId,
        storyId: 'STORY-001',
        itemId: 'flow-1', // flowId is passed as itemId for backwards compatibility
        checked: true,
      })

      // Verify the flow was updated
      const updatedFlow = result.flows.find(f => f.id === 'flow-1')
      expect(updatedFlow?.checked).toBe(true)

      // Verify writeFile was called
      expect(writeFile).toHaveBeenCalledTimes(2) // JSON and MD files
    })

    it('should throw NOT_FOUND for non-existent flow', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        const pathStr = String(path)
        if (pathStr.includes('test-scenarios/STORY-001.json')) {
          return true
        }
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
          const { existsSync: realExistsSync } = require('node:fs')
          return realExistsSync(pathStr)
        }
        return false
      })

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      const caller = createCaller({})

      await expect(
        caller.updateItem({
          projectId: testProjectId,
          storyId: 'STORY-001',
          itemId: 'nonexistent-flow',
          checked: true,
        })
      ).rejects.toThrow(TRPCError)
    })
  })

  describe('regenerate', () => {
    it('should regenerate test scenarios for a story', async () => {
      // Mock prd.json exists
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        const pathStr = String(path)
        if (pathStr.includes('stories/prd.json')) {
          return true
        }
        if (pathStr.includes('test-scenarios')) {
          return true // Directory exists
        }
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
          const { existsSync: realExistsSync } = require('node:fs')
          return realExistsSync(pathStr)
        }
        return false
      })

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.regenerate({
        projectId: testProjectId,
        storyId: 'STORY-001',
      })

      // Should have the story info
      expect(result.storyId).toBe('STORY-001')
      expect(result.title).toBe('Test Story')

      // Should have flows (not sections)
      expect(result.flows).toBeDefined()
      expect(result.flows.length).toBeGreaterThan(0)

      // Each flow should have an id, name, steps, and checked property
      const firstFlow = result.flows[0]
      expect(firstFlow.id).toBeDefined()
      expect(firstFlow.name).toBeDefined()
      expect(firstFlow.steps).toBeInstanceOf(Array)
      expect(typeof firstFlow.checked).toBe('boolean')
    })

    it('should throw NOT_FOUND when story does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        const pathStr = String(path)
        if (pathStr.includes('stories/prd.json')) {
          return true
        }
        if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
          const { existsSync: realExistsSync } = require('node:fs')
          return realExistsSync(pathStr)
        }
        return false
      })

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(
        caller.regenerate({
          projectId: testProjectId,
          storyId: 'NONEXISTENT-STORY',
        })
      ).rejects.toThrow(TRPCError)
    })
  })
})

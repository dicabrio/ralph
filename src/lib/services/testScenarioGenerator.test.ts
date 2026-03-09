/**
 * @vitest-environment node
 *
 * Test Scenario Generator Tests
 *
 * Unit tests for test scenario generation with flows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'

// Mock the filesystem modules
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
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
import { isOpenAIConfigured, streamChatCompletion } from '@/lib/services/openaiService'
import {
  generateTestScenarios,
  readTestScenario,
  updateFlowChecked,
  updateTestItem,
  getTestScenariosDir,
  getTestScenarioJsonPath,
  getTestScenarioMdPath,
} from './testScenarioGenerator'
import type { StoryForTestScenario } from './testScenarioGenerator'
import type { TestScenario, LegacyTestScenario } from '@/lib/schemas/testScenarioSchema'

// Sample story for tests
const sampleStory: StoryForTestScenario = {
  id: 'STORY-001',
  title: 'Test Story',
  description: 'A test story for testing',
  epic: 'Testing',
  acceptanceCriteria: [
    'User can click the button',
    'Success message is displayed',
    'Error handling works correctly',
  ],
}

// Sample test scenario with flows (v2 format)
const sampleTestScenario: TestScenario = {
  storyId: 'STORY-001',
  title: 'Test Story',
  description: 'A test story for testing',
  generatedAt: '2024-01-15T10:00:00.000Z',
  flows: [
    {
      id: 'flow-1',
      name: 'Happy path: Basic functionality',
      steps: [
        'Navigate to the feature page',
        'Click the button',
        'Verify success message appears',
      ],
      checked: false,
    },
    {
      id: 'flow-2',
      name: 'Error handling: Invalid input',
      steps: [
        'Navigate to the feature page',
        'Submit invalid input',
        'Verify error message appears',
      ],
      checked: false,
    },
  ],
}

// Legacy test scenario with sections (v1 format)
const legacyTestScenario: LegacyTestScenario = {
  storyId: 'STORY-001',
  title: 'Test Story',
  description: 'A test story for testing',
  generatedAt: '2024-01-15T10:00:00.000Z',
  sections: [
    {
      id: 'functional-tests',
      title: 'Functional Tests',
      items: [
        { id: 'ft-1', text: 'Verify: User can click the button', checked: false },
        { id: 'ft-2', text: 'Verify: Success message is displayed', checked: true },
      ],
    },
    {
      id: 'quality-gates',
      title: 'Quality Gates',
      items: [
        { id: 'qg-test', text: 'pnpm test passes', checked: false },
        { id: 'qg-lint', text: 'pnpm lint passes', checked: false },
        { id: 'qg-build', text: 'pnpm build succeeds', checked: false },
      ],
    },
  ],
}

describe('testScenarioGenerator', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(writeFile).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('path helpers', () => {
    it('getTestScenariosDir returns correct path', () => {
      const result = getTestScenariosDir('/project/path')
      expect(result).toBe(join('/project/path', 'stories', 'test-scenarios'))
    })

    it('getTestScenarioJsonPath returns correct path', () => {
      const result = getTestScenarioJsonPath('/project/path', 'STORY-001')
      expect(result).toBe(join('/project/path', 'stories', 'test-scenarios', 'STORY-001.json'))
    })

    it('getTestScenarioMdPath returns correct path', () => {
      const result = getTestScenarioMdPath('/project/path', 'STORY-001')
      expect(result).toBe(join('/project/path', 'stories', 'test-scenarios', 'STORY-001.md'))
    })
  })

  describe('generateTestScenarios', () => {
    it('creates directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      await generateTestScenarios(sampleStory, '/project/path')

      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining('test-scenarios'),
        { recursive: true }
      )
    })

    it('generates fallback flows when OpenAI is not configured', async () => {
      vi.mocked(isOpenAIConfigured).mockReturnValue(false)

      const result = await generateTestScenarios(sampleStory, '/project/path')

      expect(result.storyId).toBe('STORY-001')
      expect(result.title).toBe('Test Story')

      // Should have flows (not sections)
      expect(result.flows).toBeDefined()
      expect(result.flows.length).toBeGreaterThan(0)

      // First flow should contain acceptance criteria as steps
      const firstFlow = result.flows[0]
      expect(firstFlow.name).toContain('Happy path')
      expect(firstFlow.steps.length).toBeLessThanOrEqual(8) // Max 8 steps per flow
    })

    it('writes both JSON and MD files', async () => {
      await generateTestScenarios(sampleStory, '/project/path')

      expect(writeFile).toHaveBeenCalledTimes(2)

      // Check JSON file was written
      const jsonCall = vi.mocked(writeFile).mock.calls.find(
        call => String(call[0]).endsWith('.json')
      )
      expect(jsonCall).toBeDefined()

      // Check MD file was written
      const mdCall = vi.mocked(writeFile).mock.calls.find(
        call => String(call[0]).endsWith('.md')
      )
      expect(mdCall).toBeDefined()
    })

    it('generates markdown with flows as numbered lists', async () => {
      await generateTestScenarios(sampleStory, '/project/path')

      const mdCall = vi.mocked(writeFile).mock.calls.find(
        call => String(call[0]).endsWith('.md')
      )
      const mdContent = mdCall?.[1] as string

      expect(mdContent).toContain('# Test Flows: STORY-001')
      expect(mdContent).toContain('## Story: Test Story')
      // Should have numbered steps (1. 2. 3.)
      expect(mdContent).toMatch(/1\. .+/)
    })

    it('uses AI when OpenAI is configured', async () => {
      vi.mocked(isOpenAIConfigured).mockReturnValue(true)

      const mockAIResponse = JSON.stringify({
        flows: [
          {
            id: 'flow-1',
            name: 'Happy path: AI generated flow',
            steps: ['Step 1', 'Step 2', 'Step 3'],
            checked: false,
          },
        ],
      })

      vi.mocked(streamChatCompletion).mockImplementation(
        (_systemPrompt, _userMessage, callbacks) => {
          callbacks.onChunk(mockAIResponse)
          callbacks.onComplete(mockAIResponse)
          return Promise.resolve()
        }
      )

      const result = await generateTestScenarios(sampleStory, '/project/path')

      expect(streamChatCompletion).toHaveBeenCalled()

      // Should have the AI-generated flow
      expect(result.flows[0].name).toBe('Happy path: AI generated flow')
      expect(result.flows[0].steps).toEqual(['Step 1', 'Step 2', 'Step 3'])
    })

    it('falls back to default when AI response is invalid', async () => {
      vi.mocked(isOpenAIConfigured).mockReturnValue(true)

      vi.mocked(streamChatCompletion).mockImplementation(
        (_systemPrompt, _userMessage, callbacks) => {
          callbacks.onChunk('Invalid JSON response')
          callbacks.onComplete('Invalid JSON response')
          return Promise.resolve()
        }
      )

      const result = await generateTestScenarios(sampleStory, '/project/path')

      // Should fall back to default flows
      expect(result.flows).toBeDefined()
      expect(result.flows.length).toBeGreaterThan(0)
    })
  })

  describe('readTestScenario', () => {
    it('returns null when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await readTestScenario('/project/path', 'STORY-001')

      expect(result).toBeNull()
    })

    it('returns parsed scenario when file exists (v2 format)', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      const result = await readTestScenario('/project/path', 'STORY-001')

      expect(result).toEqual(sampleTestScenario)
    })

    it('converts legacy v1 format to v2 flows format', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(legacyTestScenario))

      const result = await readTestScenario('/project/path', 'STORY-001')

      // Should be converted to flows format
      expect(result?.flows).toBeDefined()
      expect(result?.flows.length).toBe(2) // Two sections -> two flows

      // First flow should be from "Functional Tests" section
      expect(result?.flows[0].name).toBe('Functional Tests')
      expect(result?.flows[0].steps).toEqual([
        'Verify: User can click the button',
        'Verify: Success message is displayed',
      ])
      // One item was checked, one wasn't -> flow not checked
      expect(result?.flows[0].checked).toBe(false)

      // Second flow should be from "Quality Gates" section
      expect(result?.flows[1].name).toBe('Quality Gates')
    })

    it('returns null when file content is invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('invalid json')

      const result = await readTestScenario('/project/path', 'STORY-001')

      expect(result).toBeNull()
    })
  })

  describe('updateFlowChecked', () => {
    it('updates flow checked status', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      const result = await updateFlowChecked('/project/path', 'STORY-001', 'flow-1', true)

      const updatedFlow = result.flows.find(f => f.id === 'flow-1')
      expect(updatedFlow?.checked).toBe(true)
    })

    it('throws error when scenario not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      await expect(
        updateFlowChecked('/project/path', 'STORY-001', 'flow-1', true)
      ).rejects.toThrow('Test scenario not found')
    })

    it('throws error when flow not found', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      await expect(
        updateFlowChecked('/project/path', 'STORY-001', 'nonexistent', true)
      ).rejects.toThrow('Flow nonexistent not found')
    })

    it('writes updated files', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      await updateFlowChecked('/project/path', 'STORY-001', 'flow-1', true)

      expect(writeFile).toHaveBeenCalledTimes(2) // JSON and MD
    })
  })

  describe('updateTestItem (backwards compatibility)', () => {
    it('calls updateFlowChecked internally', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      // updateTestItem is deprecated but should still work
      const result = await updateTestItem('/project/path', 'STORY-001', 'flow-1', true)

      const updatedFlow = result.flows.find(f => f.id === 'flow-1')
      expect(updatedFlow?.checked).toBe(true)
    })
  })
})

/**
 * @vitest-environment node
 *
 * Test Scenario Generator Tests
 *
 * Unit tests for test scenario generation functionality.
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
  updateTestItem,
  getTestScenariosDir,
  getTestScenarioJsonPath,
  getTestScenarioMdPath,
} from './testScenarioGenerator'
import type { StoryForTestScenario } from './testScenarioGenerator'
import type { TestScenario } from '@/lib/schemas/testScenarioSchema'

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

// Sample test scenario
const sampleTestScenario: TestScenario = {
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
        { id: 'ft-2', text: 'Verify: Success message is displayed', checked: false },
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

    it('generates fallback scenario when OpenAI is not configured', async () => {
      vi.mocked(isOpenAIConfigured).mockReturnValue(false)

      const result = await generateTestScenarios(sampleStory, '/project/path')

      expect(result.storyId).toBe('STORY-001')
      expect(result.title).toBe('Test Story')

      // Should have functional tests based on acceptance criteria
      const functionalTests = result.sections.find(s => s.id === 'functional-tests')
      expect(functionalTests).toBeDefined()
      expect(functionalTests?.items.length).toBe(3) // One for each criterion

      // Should always have quality gates
      const qualityGates = result.sections.find(s => s.id === 'quality-gates')
      expect(qualityGates).toBeDefined()
      expect(qualityGates?.items.length).toBe(3)
    })

    it('includes default quality gates', async () => {
      const result = await generateTestScenarios(sampleStory, '/project/path')

      const qualityGates = result.sections.find(s => s.id === 'quality-gates')
      expect(qualityGates).toBeDefined()

      const items = qualityGates?.items || []
      expect(items.some(i => i.text.includes('pnpm test'))).toBe(true)
      expect(items.some(i => i.text.includes('pnpm lint'))).toBe(true)
      expect(items.some(i => i.text.includes('pnpm build'))).toBe(true)
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

    it('generates markdown with correct format', async () => {
      await generateTestScenarios(sampleStory, '/project/path')

      const mdCall = vi.mocked(writeFile).mock.calls.find(
        call => String(call[0]).endsWith('.md')
      )
      const mdContent = mdCall?.[1] as string

      expect(mdContent).toContain('# Test Scenarios: STORY-001')
      expect(mdContent).toContain('## Story: Test Story')
      expect(mdContent).toContain('## Functional Tests')
      expect(mdContent).toContain('## Quality Gates')
      expect(mdContent).toContain('- [ ]') // Unchecked checkboxes
    })

    it('uses AI when OpenAI is configured', async () => {
      vi.mocked(isOpenAIConfigured).mockReturnValue(true)

      const mockAIResponse = JSON.stringify({
        sections: [
          {
            id: 'functional-tests',
            title: 'Functional Tests',
            items: [
              { id: 'ft-1', text: 'AI generated test 1', checked: false },
            ],
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

      // Should have the AI-generated test
      const functionalTests = result.sections.find(s => s.id === 'functional-tests')
      expect(functionalTests?.items[0].text).toBe('AI generated test 1')

      // Should still have quality gates added
      const qualityGates = result.sections.find(s => s.id === 'quality-gates')
      expect(qualityGates).toBeDefined()
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

      // Should fall back to default functional tests
      const functionalTests = result.sections.find(s => s.id === 'functional-tests')
      expect(functionalTests).toBeDefined()
      expect(functionalTests?.items[0].text).toContain('Verify:')
    })
  })

  describe('readTestScenario', () => {
    it('returns null when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await readTestScenario('/project/path', 'STORY-001')

      expect(result).toBeNull()
    })

    it('returns parsed scenario when file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      const result = await readTestScenario('/project/path', 'STORY-001')

      expect(result).toEqual(sampleTestScenario)
    })

    it('returns null when file content is invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('invalid json')

      const result = await readTestScenario('/project/path', 'STORY-001')

      expect(result).toBeNull()
    })
  })

  describe('updateTestItem', () => {
    it('updates item checked status', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      const result = await updateTestItem('/project/path', 'STORY-001', 'ft-1', true)

      const updatedItem = result.sections
        .find(s => s.id === 'functional-tests')
        ?.items.find(i => i.id === 'ft-1')

      expect(updatedItem?.checked).toBe(true)
    })

    it('throws error when scenario not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      await expect(
        updateTestItem('/project/path', 'STORY-001', 'ft-1', true)
      ).rejects.toThrow('Test scenario not found')
    })

    it('throws error when item not found', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      await expect(
        updateTestItem('/project/path', 'STORY-001', 'nonexistent', true)
      ).rejects.toThrow('Test item nonexistent not found')
    })

    it('writes updated files', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleTestScenario))

      await updateTestItem('/project/path', 'STORY-001', 'ft-1', true)

      expect(writeFile).toHaveBeenCalledTimes(2) // JSON and MD
    })
  })
})

/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { PathLike } from 'node:fs'

// Mock node:fs and node:fs/promises
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>
  return {
    ...original,
    existsSync: vi.fn((path: PathLike) => {
      const pathStr = String(path)
      if (pathStr.includes('skills') && pathStr.endsWith('SKILL.md')) return true
      if (pathStr.endsWith('prd.json')) return true
      if (pathStr.includes('skills')) return true
      return false
    }),
  }
})

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn((path: string) => {
    if (path.includes('SKILL.md')) {
      return Promise.resolve(`---
name: Test Skill
description: A test skill for testing
---

This is the skill content.
`)
    }
    if (path.includes('prd.json')) {
      return Promise.resolve(JSON.stringify({
        projectName: 'Test Project',
        userStories: [
          { id: 'EXISTING-001', title: 'Existing Story', status: 'done', epic: 'Setup' },
          { id: 'EXISTING-002', title: 'Another Story', status: 'pending', epic: 'Features' },
        ],
      }))
    }
    return Promise.reject(new Error('File not found'))
  }),
  readdir: vi.fn(() => Promise.resolve([
    { name: 'skill-1', isDirectory: () => true },
    { name: 'skill-2', isDirectory: () => true },
    { name: 'file.txt', isDirectory: () => false },
  ])),
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import {
  generateSystemPrompt,
  parseStoriesFromResponse,
  brainstormManager,
} from './brainstormManager'

describe('brainstormManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('generateSystemPrompt', () => {
    it('should generate prompt with available skills', async () => {
      const prompt = await generateSystemPrompt('/projects/test', 'Test Project')

      expect(prompt).toContain('Test Project')
      expect(prompt).toContain('Available skills')
      expect(prompt).toContain('Test Skill')
    })

    it('should include existing stories context', async () => {
      const prompt = await generateSystemPrompt('/projects/test', 'Test Project')

      expect(prompt).toContain('EXISTING-001')
      expect(prompt).toContain('Existing Story')
      expect(prompt).toContain('[done]')
    })

    it('should include JSON format instructions', async () => {
      const prompt = await generateSystemPrompt('/projects/test', 'Test Project')

      expect(prompt).toContain('```json')
      expect(prompt).toContain('acceptanceCriteria')
      expect(prompt).toContain('recommendedSkills')
    })

    it('should include story ID convention', async () => {
      const prompt = await generateSystemPrompt('/projects/test', 'Test Project')

      expect(prompt).toContain('Story ID Convention')
      expect(prompt).toContain('EPIC-NNN')
    })
  })

  describe('parseStoriesFromResponse', () => {
    it('should parse valid JSON with stories', () => {
      const response = `
Here are the stories:

\`\`\`json
[
  {
    "id": "AUTH-001",
    "title": "User Login",
    "description": "Login feature",
    "priority": 1,
    "epic": "Auth",
    "dependencies": [],
    "recommendedSkills": ["frontend-design"],
    "acceptanceCriteria": ["Can login", "Can logout"]
  }
]
\`\`\`
      `

      const stories = parseStoriesFromResponse(response)

      expect(stories).toHaveLength(1)
      expect(stories[0]).toEqual({
        id: 'AUTH-001',
        title: 'User Login',
        description: 'Login feature',
        priority: 1,
        epic: 'Auth',
        dependencies: [],
        recommendedSkills: ['frontend-design'],
        acceptanceCriteria: ['Can login', 'Can logout'],
      })
    })

    it('should return empty array when no JSON block found', () => {
      const response = 'Just some text without any code blocks'

      const stories = parseStoriesFromResponse(response)

      expect(stories).toHaveLength(0)
    })

    it('should return empty array for invalid JSON', () => {
      const response = '```json\n{invalid json}\n```'

      const stories = parseStoriesFromResponse(response)

      expect(stories).toHaveLength(0)
    })

    it('should handle missing optional fields', () => {
      const response = `
\`\`\`json
[{"id": "MIN-001", "title": "Minimal Story"}]
\`\`\`
      `

      const stories = parseStoriesFromResponse(response)

      expect(stories).toHaveLength(1)
      expect(stories[0].description).toBe('')
      expect(stories[0].priority).toBe(1)
      expect(stories[0].epic).toBe('Features')
      expect(stories[0].dependencies).toEqual([])
      expect(stories[0].recommendedSkills).toEqual([])
      expect(stories[0].acceptanceCriteria).toEqual([])
    })

    it('should filter out invalid items in array', () => {
      const response = `
\`\`\`json
[
  {"id": "VALID-001", "title": "Valid"},
  {"noId": true},
  null,
  123,
  "string"
]
\`\`\`
      `

      const stories = parseStoriesFromResponse(response)

      expect(stories).toHaveLength(1)
      expect(stories[0].id).toBe('VALID-001')
    })

    it('should filter non-string values from arrays', () => {
      const response = `
\`\`\`json
[{
  "id": "TEST-001",
  "title": "Test Story",
  "dependencies": ["DEP-001", 123, null],
  "recommendedSkills": ["skill-1", true],
  "acceptanceCriteria": ["criterion 1", 456]
}]
\`\`\`
      `

      const stories = parseStoriesFromResponse(response)

      expect(stories[0].dependencies).toEqual(['DEP-001'])
      expect(stories[0].recommendedSkills).toEqual(['skill-1'])
      expect(stories[0].acceptanceCriteria).toEqual(['criterion 1'])
    })

    it('should return empty for non-array JSON', () => {
      const response = `
\`\`\`json
{"id": "SINGLE-001", "title": "Single Object"}
\`\`\`
      `

      const stories = parseStoriesFromResponse(response)

      expect(stories).toHaveLength(0)
    })
  })

  describe('brainstormManager.getSession', () => {
    it('should return undefined for non-existent session', () => {
      const session = brainstormManager.getSession('non-existent')
      expect(session).toBeUndefined()
    })
  })

  describe('brainstormManager.getSessionsByProject', () => {
    it('should return empty array when no sessions for project', () => {
      const sessions = brainstormManager.getSessionsByProject(999)
      expect(sessions).toEqual([])
    })
  })

  describe('brainstormManager.cancelSession', () => {
    it('should return false for non-existent session', async () => {
      const result = await brainstormManager.cancelSession('non-existent')
      expect(result).toBe(false)
    })
  })
})

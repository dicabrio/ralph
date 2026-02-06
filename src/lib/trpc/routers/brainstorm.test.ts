/**
 * @vitest-environment node
 *
 * Brainstorm Router Tests
 *
 * Unit tests for the brainstorm tRPC endpoints.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { PathLike } from 'node:fs'

// Mock dependencies BEFORE importing them
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    existsSync: vi.fn((path: PathLike) => {
      const pathStr = String(path)
      // Let database paths through
      if (pathStr.includes('ralph.db') || pathStr.includes('/data')) {
        return original.existsSync(path)
      }
      return false
    }),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    readFile: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('@/lib/websocket/server', () => ({
  getWebSocketServer: vi.fn().mockReturnValue({
    broadcast: vi.fn(),
  }),
}))

import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { brainstormRouter } from './brainstorm'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { parseStoriesFromResponse } from '@/lib/services/brainstormManager'

const createCaller = createCallerFactory(brainstormRouter)

describe('brainstormRouter', () => {
  // Clean up database before each test
  beforeEach(async () => {
    await db.delete(projects)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parseStories', () => {
    it('should parse valid JSON story block', async () => {
      const caller = createCaller({})
      const content = `
Here are some stories for your project:

\`\`\`json
[
  {
    "id": "AUTH-001",
    "title": "User Login",
    "description": "Implement user login functionality",
    "priority": 1,
    "epic": "Authentication",
    "dependencies": [],
    "recommendedSkills": ["frontend-design"],
    "acceptanceCriteria": ["Users can log in", "Sessions are persisted"]
  }
]
\`\`\`
      `

      const result = await caller.parseStories({ content })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('AUTH-001')
      expect(result[0].title).toBe('User Login')
      expect(result[0].acceptanceCriteria).toHaveLength(2)
    })

    it('should return empty array for content without JSON block', async () => {
      const caller = createCaller({})
      const result = await caller.parseStories({
        content: 'Just some text without JSON',
      })

      expect(result).toHaveLength(0)
    })

    it('should parse multiple stories', async () => {
      const caller = createCaller({})
      const content = `
\`\`\`json
[
  {"id": "UI-001", "title": "Dashboard", "description": "Main dashboard", "priority": 1, "epic": "UI", "dependencies": [], "recommendedSkills": [], "acceptanceCriteria": ["Shows data"]},
  {"id": "UI-002", "title": "Settings", "description": "Settings page", "priority": 2, "epic": "UI", "dependencies": ["UI-001"], "recommendedSkills": ["frontend-design"], "acceptanceCriteria": ["Can save"]}
]
\`\`\`
      `

      const result = await caller.parseStories({ content })

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('UI-001')
      expect(result[1].dependencies).toContain('UI-001')
    })
  })

  describe('getSystemPrompt', () => {
    it('should throw error when project not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.getSystemPrompt({ projectId: 999 }),
      ).rejects.toThrow('Project with id 999 not found')
    })

    it('should return system prompt for existing project', async () => {
      // Insert test project
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      // Mock filesystem
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readdir).mockResolvedValue([])

      const caller = createCaller({})
      const result = await caller.getSystemPrompt({ projectId: project.id })

      expect(result.prompt).toBeDefined()
      expect(result.prompt).toContain('Test Project')
    })
  })

  describe('getSession', () => {
    it('should throw error when session not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.getSession({ sessionId: 'non-existent' }),
      ).rejects.toThrow('Session non-existent not found')
    })
  })

  describe('cancelSession', () => {
    it('should throw error when session cannot be cancelled', async () => {
      const caller = createCaller({})

      await expect(
        caller.cancelSession({ sessionId: 'non-existent' }),
      ).rejects.toThrow('Session non-existent not found or already completed')
    })
  })

  describe('getActiveSessions', () => {
    it('should throw error when project not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.getActiveSessions({ projectId: 999 }),
      ).rejects.toThrow('Project with id 999 not found')
    })

    it('should return empty array for existing project', async () => {
      // Insert test project
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const caller = createCaller({})
      const result = await caller.getActiveSessions({ projectId: project.id })

      expect(result).toEqual([])
    })
  })

  describe('chat', () => {
    it('should throw error when project not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.chat({
          projectId: 999,
          message: 'Test message',
        }),
      ).rejects.toThrow('Project with id 999 not found')
    })

    it('should validate message is not empty', async () => {
      const caller = createCaller({})

      await expect(
        caller.chat({
          projectId: 1,
          message: '',
        }),
      ).rejects.toThrow()
    })
  })
})

describe('parseStoriesFromResponse (exported function)', () => {
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

  it('should handle malformed JSON gracefully', () => {
    const content = `
\`\`\`json
[{"id": "broken", "title": 123}
\`\`\`
    `

    const stories = parseStoriesFromResponse(content)
    expect(stories).toHaveLength(0)
  })

  it('should filter invalid story objects', () => {
    const content = `
\`\`\`json
[
  {"id": "VALID-001", "title": "Valid Story"},
  {"notAnId": "foo"},
  null,
  "string"
]
\`\`\`
    `

    const stories = parseStoriesFromResponse(content)

    expect(stories).toHaveLength(1)
    expect(stories[0].id).toBe('VALID-001')
  })

  it('should provide defaults for optional fields', () => {
    const content = `
\`\`\`json
[
  {"id": "MINIMAL-001", "title": "Minimal Story"}
]
\`\`\`
    `

    const stories = parseStoriesFromResponse(content)

    expect(stories).toHaveLength(1)
    expect(stories[0].description).toBe('')
    expect(stories[0].priority).toBe(1)
    expect(stories[0].epic).toBe('Features')
    expect(stories[0].dependencies).toEqual([])
    expect(stories[0].recommendedSkills).toEqual([])
    expect(stories[0].acceptanceCriteria).toEqual([])
  })

  it('should handle non-array JSON', () => {
    const content = `
\`\`\`json
{"id": "SINGLE-001", "title": "Single Story"}
\`\`\`
    `

    const stories = parseStoriesFromResponse(content)
    expect(stories).toHaveLength(0) // Should be array, not object
  })

  it('should extract JSON from text with other content', () => {
    const content = `
Here is my analysis of your request:

Based on the codebase structure, I recommend the following stories:

\`\`\`json
[
  {
    "id": "API-001",
    "title": "Create REST API",
    "description": "Implement REST endpoints",
    "priority": 1,
    "epic": "Backend",
    "dependencies": [],
    "recommendedSkills": ["backend-development:api-design-principles"],
    "acceptanceCriteria": ["GET endpoint works", "POST endpoint works"]
  }
]
\`\`\`

These stories should help you get started with your project.
    `

    const stories = parseStoriesFromResponse(content)

    expect(stories).toHaveLength(1)
    expect(stories[0].id).toBe('API-001')
    expect(stories[0].recommendedSkills).toContain('backend-development:api-design-principles')
  })

  it('should filter non-string values from arrays', () => {
    const content = `
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

    const stories = parseStoriesFromResponse(content)

    expect(stories[0].dependencies).toEqual(['DEP-001'])
    expect(stories[0].recommendedSkills).toEqual(['skill-1'])
    expect(stories[0].acceptanceCriteria).toEqual(['criterion 1'])
  })
})

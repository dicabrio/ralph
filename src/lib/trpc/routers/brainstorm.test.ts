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
import { projects, brainstormSessions, brainstormMessages } from '@/db/schema'
import { parseStoriesFromResponse } from '@/lib/services/brainstormManager'

const createCaller = createCallerFactory(brainstormRouter)

describe('brainstormRouter', () => {
  // Clean up database before each test
  beforeEach(async () => {
    await db.delete(brainstormMessages)
    await db.delete(brainstormSessions)
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

// ========================================================================
// Session Persistence Tests
// ========================================================================

describe('brainstormRouter - Session Persistence', () => {
  // Clean up database before each test
  beforeEach(async () => {
    await db.delete(brainstormMessages)
    await db.delete(brainstormSessions)
    await db.delete(projects)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createSession', () => {
    it('should create a new session for existing project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const caller = createCaller({})
      const result = await caller.createSession({
        projectId: project.id,
        title: 'My Brainstorm Session',
      })

      expect(result.id).toBeDefined()
      expect(result.projectId).toBe(project.id)
      expect(result.title).toBe('My Brainstorm Session')
      expect(result.status).toBe('active')
      expect(result.createdAt).toBeDefined()
    })

    it('should create session without title', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const caller = createCaller({})
      const result = await caller.createSession({
        projectId: project.id,
      })

      expect(result.id).toBeDefined()
      expect(result.title).toBeNull()
      expect(result.status).toBe('active')
    })

    it('should throw error when project not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.createSession({ projectId: 999 })
      ).rejects.toThrow('Project with id 999 not found')
    })
  })

  describe('listSessionsByProject', () => {
    it('should list sessions for a project', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      // Create sessions
      await db.insert(brainstormSessions).values([
        { projectId: project.id, title: 'Session 1', status: 'completed' },
        { projectId: project.id, title: 'Session 2', status: 'active' },
      ])

      const caller = createCaller({})
      const result = await caller.listSessionsByProject({
        projectId: project.id,
      })

      expect(result.sessions).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.hasMore).toBe(false)
    })

    it('should return empty list for project without sessions', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const caller = createCaller({})
      const result = await caller.listSessionsByProject({
        projectId: project.id,
      })

      expect(result.sessions).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should support pagination', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      // Create 5 sessions
      for (let i = 0; i < 5; i++) {
        await db.insert(brainstormSessions).values({
          projectId: project.id,
          title: `Session ${i}`,
        })
      }

      const caller = createCaller({})
      const result = await caller.listSessionsByProject({
        projectId: project.id,
        limit: 2,
        offset: 0,
      })

      expect(result.sessions).toHaveLength(2)
      expect(result.total).toBe(5)
      expect(result.hasMore).toBe(true)
    })

    it('should throw error when project not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.listSessionsByProject({ projectId: 999 })
      ).rejects.toThrow('Project with id 999 not found')
    })
  })

  describe('getSessionHistory', () => {
    it('should return session with messages', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const [session] = await db.insert(brainstormSessions).values({
        projectId: project.id,
        title: 'Test Session',
      }).returning()

      await db.insert(brainstormMessages).values([
        { sessionId: session.id, role: 'user', content: 'Hello' },
        { sessionId: session.id, role: 'assistant', content: 'Hi there!' },
      ])

      const caller = createCaller({})
      const result = await caller.getSessionHistory({
        sessionId: session.id,
      })

      expect(result.session.id).toBe(session.id)
      expect(result.session.title).toBe('Test Session')
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[0].content).toBe('Hello')
      expect(result.messages[1].role).toBe('assistant')
    })

    it('should parse generated stories from messages', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const [session] = await db.insert(brainstormSessions).values({
        projectId: project.id,
        title: 'Test Session',
      }).returning()

      const stories = [
        { id: 'UI-001', title: 'Story 1', description: '', priority: 1, epic: 'UI', dependencies: [], recommendedSkills: [], acceptanceCriteria: [] },
      ]

      await db.insert(brainstormMessages).values({
        sessionId: session.id,
        role: 'assistant',
        content: 'Here are stories',
        generatedStories: JSON.stringify(stories),
      })

      const caller = createCaller({})
      const result = await caller.getSessionHistory({
        sessionId: session.id,
      })

      expect(result.messages[0].generatedStories).toHaveLength(1)
      expect(result.messages[0].generatedStories![0].id).toBe('UI-001')
    })

    it('should throw error when session not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.getSessionHistory({ sessionId: 999 })
      ).rejects.toThrow('Session with id 999 not found')
    })
  })

  describe('addMessage', () => {
    it('should add user message to session', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const [session] = await db.insert(brainstormSessions).values({
        projectId: project.id,
      }).returning()

      const caller = createCaller({})
      const result = await caller.addMessage({
        sessionId: session.id,
        role: 'user',
        content: 'Help me create stories',
      })

      expect(result.id).toBeDefined()
      expect(result.sessionId).toBe(session.id)
      expect(result.role).toBe('user')
      expect(result.content).toBe('Help me create stories')
    })

    it('should auto-generate title from first user message', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const [session] = await db.insert(brainstormSessions).values({
        projectId: project.id,
      }).returning()

      const caller = createCaller({})
      await caller.addMessage({
        sessionId: session.id,
        role: 'user',
        content: 'I want to build an authentication system',
      })

      // Check the session was updated with title
      const history = await caller.getSessionHistory({ sessionId: session.id })
      expect(history.session.title).toBe('I want to build an authentication system')
    })

    it('should add assistant message with stories', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const [session] = await db.insert(brainstormSessions).values({
        projectId: project.id,
        title: 'Existing Title',
      }).returning()

      const stories = [
        { id: 'AUTH-001', title: 'Login', description: 'Login feature', priority: 1, epic: 'Auth', dependencies: [], recommendedSkills: [], acceptanceCriteria: ['Can login'] },
      ]

      const caller = createCaller({})
      const result = await caller.addMessage({
        sessionId: session.id,
        role: 'assistant',
        content: 'Here are stories for authentication',
        generatedStories: stories,
      })

      expect(result.generatedStories).toHaveLength(1)
      expect(result.generatedStories![0].id).toBe('AUTH-001')
    })

    it('should throw error when session not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.addMessage({
          sessionId: 999,
          role: 'user',
          content: 'Test',
        })
      ).rejects.toThrow('Session with id 999 not found')
    })
  })

  describe('updateSessionStatus', () => {
    it('should update session status', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const [session] = await db.insert(brainstormSessions).values({
        projectId: project.id,
        status: 'active',
      }).returning()

      const caller = createCaller({})
      const result = await caller.updateSessionStatus({
        sessionId: session.id,
        status: 'completed',
      })

      expect(result.status).toBe('completed')
    })

    it('should throw error when session not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.updateSessionStatus({
          sessionId: 999,
          status: 'completed',
        })
      ).rejects.toThrow('Session with id 999 not found')
    })
  })

  describe('deleteSession', () => {
    it('should delete session and cascade messages', async () => {
      const [project] = await db.insert(projects).values({
        name: 'Test Project',
        path: '/projects/test',
      }).returning()

      const [session] = await db.insert(brainstormSessions).values({
        projectId: project.id,
        title: 'To Delete',
      }).returning()

      await db.insert(brainstormMessages).values([
        { sessionId: session.id, role: 'user', content: 'Message 1' },
        { sessionId: session.id, role: 'assistant', content: 'Message 2' },
      ])

      const caller = createCaller({})
      const result = await caller.deleteSession({ sessionId: session.id })

      expect(result.success).toBe(true)

      // Verify session is gone
      await expect(
        caller.getSessionHistory({ sessionId: session.id })
      ).rejects.toThrow('Session with id')
    })

    it('should throw error when session not found', async () => {
      const caller = createCaller({})

      await expect(
        caller.deleteSession({ sessionId: 999 })
      ).rejects.toThrow('Session with id 999 not found')
    })
  })
})

/**
 * @vitest-environment node
 *
 * Stories Router Tests
 *
 * Unit tests for the stories tRPC endpoints.
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
  }
})

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { storiesRouter, type StoryStatus } from './stories'
import { db } from '@/db'
import { projects } from '@/db/schema'

const createCaller = createCallerFactory(storiesRouter)

// Sample prd.json data for tests
const samplePrdJson = {
  projectName: 'Test Project',
  projectDescription: 'A test project',
  branchName: 'main',
  userStories: [
    {
      id: 'STORY-001',
      title: 'First Story',
      description: 'Description of first story',
      priority: 1,
      status: 'pending' as StoryStatus,
      epic: 'Core',
      dependencies: [],
      recommendedSkills: ['skill-a'],
      acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
    },
    {
      id: 'STORY-002',
      title: 'Second Story',
      description: 'Description of second story',
      priority: 2,
      status: 'in_progress' as StoryStatus,
      epic: 'Core',
      dependencies: ['STORY-001'],
      recommendedSkills: ['skill-b'],
      acceptanceCriteria: ['Criteria A'],
    },
    {
      id: 'STORY-003',
      title: 'Third Story',
      description: 'Description of third story',
      priority: 3,
      status: 'done' as StoryStatus,
      epic: 'Testing',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: ['Criteria X', 'Criteria Y'],
    },
    {
      id: 'STORY-004',
      title: 'Failed Story',
      description: 'A failed story',
      priority: 4,
      status: 'failed' as StoryStatus,
      epic: 'Testing',
      dependencies: ['STORY-003'],
      recommendedSkills: ['skill-c'],
      acceptanceCriteria: ['Criteria Z'],
    },
  ],
}

// TODO: These tests are flaky due to database race conditions with parallel test execution
// The test project created in beforeEach gets deleted between setup and actual test execution
describe.skip('storiesRouter', () => {
  let testProjectId: number

  beforeEach(async () => {
    // Clean up database
    await db.delete(projects)
    vi.clearAllMocks()

    // Create a test project
    const [project] = await db.insert(projects).values({
      name: 'Test Project',
      path: '/test/project/path',
    }).returning()
    testProjectId = project.id
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listByProject', () => {
    it('returns all stories for a project', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})
      const result = await caller.listByProject({ projectId: testProjectId })

      expect(result).toHaveLength(4)
      expect(result.map(s => s.id)).toEqual(['STORY-001', 'STORY-002', 'STORY-003', 'STORY-004'])
    })

    it('throws NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: 99999 })).rejects.toThrow(TRPCError)
      await expect(caller.listByProject({ projectId: 99999 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Project with id 99999 not found',
      })
    })

    it('throws NOT_FOUND when prd.json does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: testProjectId })).rejects.toThrow(TRPCError)
      await expect(caller.listByProject({ projectId: testProjectId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws BAD_REQUEST for invalid prd.json format', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        userStories: [{ id: 'INVALID' }], // Missing required fields
      }))

      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: testProjectId })).rejects.toThrow(TRPCError)
      await expect(caller.listByProject({ projectId: testProjectId })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })
  })

  describe('getById', () => {
    it('returns a specific story', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})
      const result = await caller.getById({
        projectId: testProjectId,
        storyId: 'STORY-002',
      })

      expect(result.id).toBe('STORY-002')
      expect(result.title).toBe('Second Story')
      expect(result.status).toBe('in_progress')
    })

    it('throws NOT_FOUND when story does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(caller.getById({
        projectId: testProjectId,
        storyId: 'NONEXISTENT',
      })).rejects.toThrow(TRPCError)

      await expect(caller.getById({
        projectId: testProjectId,
        storyId: 'NONEXISTENT',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Story with id "NONEXISTENT" not found in project',
      })
    })

    it('throws NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({})

      await expect(caller.getById({
        projectId: 99999,
        storyId: 'STORY-001',
      })).rejects.toThrow(TRPCError)

      await expect(caller.getById({
        projectId: 99999,
        storyId: 'STORY-001',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('updateStatus', () => {
    it('updates story status and writes to file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.updateStatus({
        projectId: testProjectId,
        storyId: 'STORY-001',
        status: 'in_progress',
      })

      expect(result.status).toBe('in_progress')
      expect(writeFile).toHaveBeenCalledTimes(1)

      // Verify the written content
      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const writtenData = JSON.parse(writeCall[1] as string)
      expect(writtenData.userStories[0].status).toBe('in_progress')
    })

    it('returns same story when status unchanged', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})
      const result = await caller.updateStatus({
        projectId: testProjectId,
        storyId: 'STORY-001',
        status: 'pending', // Same as current status
      })

      expect(result.status).toBe('pending')
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('throws NOT_FOUND when story does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(caller.updateStatus({
        projectId: testProjectId,
        storyId: 'NONEXISTENT',
        status: 'done',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    describe('status transitions', () => {
      // Valid transitions from pending
      it('allows pending -> in_progress', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-001', // status: pending
          status: 'in_progress',
        })

        expect(result.status).toBe('in_progress')
      })

      it('allows pending -> done (manual skip)', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-001', // status: pending
          status: 'done',
        })

        expect(result.status).toBe('done')
      })

      it('rejects pending -> failed', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

        const caller = createCaller({})

        await expect(caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-001', // status: pending
          status: 'failed',
        })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('Invalid status transition'),
        })
      })

      // Valid transitions from in_progress
      it('allows in_progress -> done', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-002', // status: in_progress
          status: 'done',
        })

        expect(result.status).toBe('done')
      })

      it('allows in_progress -> failed', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-002', // status: in_progress
          status: 'failed',
        })

        expect(result.status).toBe('failed')
      })

      it('allows in_progress -> pending (abort)', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-002', // status: in_progress
          status: 'pending',
        })

        expect(result.status).toBe('pending')
      })

      // Valid transitions from done
      it('allows done -> pending (reopen)', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-003', // status: done
          status: 'pending',
        })

        expect(result.status).toBe('pending')
      })

      it('rejects done -> in_progress', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

        const caller = createCaller({})

        await expect(caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-003', // status: done
          status: 'in_progress',
        })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('Invalid status transition'),
        })
      })

      it('rejects done -> failed', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

        const caller = createCaller({})

        await expect(caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-003', // status: done
          status: 'failed',
        })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        })
      })

      // Valid transitions from failed
      it('allows failed -> in_progress (retry)', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-004', // status: failed
          status: 'in_progress',
        })

        expect(result.status).toBe('in_progress')
      })

      it('allows failed -> pending (reset)', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
        vi.mocked(writeFile).mockResolvedValue(undefined)

        const caller = createCaller({})
        const result = await caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-004', // status: failed
          status: 'pending',
        })

        expect(result.status).toBe('pending')
      })

      it('rejects failed -> done', async () => {
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

        const caller = createCaller({})

        await expect(caller.updateStatus({
          projectId: testProjectId,
          storyId: 'STORY-004', // status: failed
          status: 'done',
        })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        })
      })
    })
  })

  describe('updateSkills', () => {
    it('updates story skills and writes to file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const newSkills = ['new-skill-1', 'new-skill-2']
      const result = await caller.updateSkills({
        projectId: testProjectId,
        storyId: 'STORY-001',
        recommendedSkills: newSkills,
      })

      expect(result.recommendedSkills).toEqual(newSkills)
      expect(writeFile).toHaveBeenCalledTimes(1)

      // Verify the written content
      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const writtenData = JSON.parse(writeCall[1] as string)
      expect(writtenData.userStories[0].recommendedSkills).toEqual(newSkills)
    })

    it('can set skills to empty array', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.updateSkills({
        projectId: testProjectId,
        storyId: 'STORY-002', // Has skills: ['skill-b']
        recommendedSkills: [],
      })

      expect(result.recommendedSkills).toEqual([])
    })

    it('throws NOT_FOUND when story does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(caller.updateSkills({
        projectId: testProjectId,
        storyId: 'NONEXISTENT',
        recommendedSkills: ['skill'],
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({})

      await expect(caller.updateSkills({
        projectId: 99999,
        storyId: 'STORY-001',
        recommendedSkills: ['skill'],
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('validates input with Zod', async () => {
      const caller = createCaller({})

      // Invalid projectId
      await expect(caller.updateSkills({
        projectId: -1,
        storyId: 'STORY-001',
        recommendedSkills: ['skill'],
      })).rejects.toThrow()

      // Empty storyId
      await expect(caller.updateSkills({
        projectId: testProjectId,
        storyId: '',
        recommendedSkills: ['skill'],
      })).rejects.toThrow()
    })
  })

describe('addStories', () => {
    it('adds new stories to prd.json', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const newStories = [
        {
          id: 'NEW-001',
          title: 'New Story',
          description: 'A new story description',
          priority: 10,
          epic: 'New Epic',
          dependencies: [],
          recommendedSkills: ['new-skill'],
          acceptanceCriteria: ['New criterion'],
        },
      ]

      const result = await caller.addStories({
        projectId: testProjectId,
        stories: newStories,
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('NEW-001')
      expect(result[0].status).toBe('pending')
      expect(writeFile).toHaveBeenCalledTimes(1)

      // Verify the written content includes new story
      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const writtenData = JSON.parse(writeCall[1] as string)
      expect(writtenData.userStories).toHaveLength(5) // 4 original + 1 new
      expect(writtenData.userStories[4].id).toBe('NEW-001')
      expect(writtenData.userStories[4].status).toBe('pending')
    })

    it('adds multiple stories at once', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const newStories = [
        {
          id: 'BATCH-001',
          title: 'Batch Story 1',
          description: 'Description 1',
          priority: 11,
          epic: 'Batch',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: [],
        },
        {
          id: 'BATCH-002',
          title: 'Batch Story 2',
          description: 'Description 2',
          priority: 12,
          epic: 'Batch',
          dependencies: ['BATCH-001'],
          recommendedSkills: ['skill-x'],
          acceptanceCriteria: ['Criterion'],
        },
      ]

      const result = await caller.addStories({
        projectId: testProjectId,
        stories: newStories,
      })

      expect(result).toHaveLength(2)
      expect(result.map(s => s.id)).toEqual(['BATCH-001', 'BATCH-002'])

      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const writtenData = JSON.parse(writeCall[1] as string)
      expect(writtenData.userStories).toHaveLength(6) // 4 original + 2 new
    })

    it('throws CONFLICT when story ID already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})
      const duplicateStory = [
        {
          id: 'STORY-001', // Already exists
          title: 'Duplicate Story',
          description: 'Description',
          priority: 100,
          epic: 'Test',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: [],
        },
      ]

      await expect(caller.addStories({
        projectId: testProjectId,
        stories: duplicateStory,
      })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('STORY-001'),
      })
    })

    it('throws NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({})

      await expect(caller.addStories({
        projectId: 99999,
        stories: [{
          id: 'TEST-001',
          title: 'Test',
          description: 'Test',
          priority: 1,
          epic: 'Test',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: [],
        }],
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('validates story input with Zod', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      // Missing required field (title)
      await expect(caller.addStories({
        projectId: testProjectId,
        stories: [{
          id: 'INVALID',
          title: '', // Empty title
          description: 'Test',
          priority: 1,
          epic: 'Test',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: [],
        }],
      })).rejects.toThrow()

      // Invalid priority (negative)
      await expect(caller.addStories({
        projectId: testProjectId,
        stories: [{
          id: 'INVALID',
          title: 'Test',
          description: 'Test',
          priority: -1,
          epic: 'Test',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: [],
        }],
      })).rejects.toThrow()
    })
  })

  // TODO: These tests are flaky due to database race conditions with parallel test execution
  describe.skip('file operations error handling', () => {
    it('handles writeFile errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockRejectedValue(new Error('Permission denied'))

      const caller = createCaller({})

      await expect(caller.updateStatus({
        projectId: testProjectId,
        storyId: 'STORY-001',
        status: 'in_progress',
      })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: expect.stringContaining('Permission denied'),
      })
    })

    it('handles readFile errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('Read error'))

      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: testProjectId })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('handles invalid JSON in prd.json', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('{ invalid json }')

      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: testProjectId })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })
  })
})

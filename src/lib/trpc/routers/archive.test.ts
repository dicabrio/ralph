/**
 * @vitest-environment node
 *
 * Archive Router Tests
 *
 * Unit tests for the archive tRPC endpoints.
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

import { existsSync, type PathLike } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createCallerFactory } from '../trpc'
import { archiveRouter } from './archive'
import { db } from '@/db'
import { projects } from '@/db/schema'
import type { StoryStatus } from './stories'

const createCaller = createCallerFactory(archiveRouter)

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
      status: 'done' as StoryStatus,
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
      title: 'In Progress Story',
      description: 'A story in progress',
      priority: 4,
      status: 'in_progress' as StoryStatus,
      epic: 'Testing',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: ['Criteria Z'],
    },
  ],
}

// Sample archived.json data
const sampleArchivedJson = {
  projectName: 'Test Project',
  archivedStories: [
    {
      id: 'ARCHIVED-001',
      title: 'Archived Story',
      description: 'An archived story',
      priority: 100,
      status: 'done' as StoryStatus,
      epic: 'Legacy',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: ['Old criteria'],
      archivedAt: '2024-01-15T10:30:00.000Z',
    },
  ],
}

describe('archiveRouter', () => {
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
    it('returns empty array when archived.json does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})
      const result = await caller.listByProject({ projectId: testProjectId })

      expect(result).toEqual([])
    })

    it('returns archived stories when archived.json exists', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('prd.json')) {
          return JSON.stringify(samplePrdJson)
        }
        if (String(path).includes('archived.json')) {
          return JSON.stringify(sampleArchivedJson)
        }
        throw new Error('Unexpected path')
      })

      const caller = createCaller({})
      const result = await caller.listByProject({ projectId: testProjectId })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ARCHIVED-001')
      expect(result[0].archivedAt).toBe('2024-01-15T10:30:00.000Z')
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

    it('handles invalid archived.json format', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('prd.json')) {
          return JSON.stringify(samplePrdJson)
        }
        if (String(path).includes('archived.json')) {
          return JSON.stringify({ invalid: 'structure' })
        }
        throw new Error('Unexpected path')
      })

      const caller = createCaller({})

      await expect(caller.listByProject({ projectId: testProjectId })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })
  })

  describe('archiveStory', () => {
    it('archives a done story successfully', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true // Directory exists
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-002', // status: done
      })

      expect(result.id).toBe('STORY-002')
      expect(result.archivedAt).toBeDefined()
      expect(new Date(result.archivedAt).toISOString()).toBe(result.archivedAt)

      // Verify writeFile was called twice (archived.json first, then prd.json)
      expect(writeFile).toHaveBeenCalledTimes(2)

      // Verify archived.json content
      const archivedWriteCall = vi.mocked(writeFile).mock.calls[0]
      expect(String(archivedWriteCall[0])).toContain('archived.json')
      const archivedData = JSON.parse(archivedWriteCall[1] as string)
      expect(archivedData.archivedStories).toHaveLength(1)
      expect(archivedData.archivedStories[0].id).toBe('STORY-002')

      // Verify prd.json content
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      expect(String(prdWriteCall[0])).toContain('prd.json')
      const prdData = JSON.parse(prdWriteCall[1] as string)
      expect(prdData.userStories.find((s: { id: string }) => s.id === 'STORY-002')).toBeUndefined()
    })

    it('throws BAD_REQUEST when story is not done', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-001', // status: pending
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining("Only stories with status 'done'"),
      })
    })

    it('throws BAD_REQUEST when story is in_progress', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-004', // status: in_progress
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('in_progress'),
      })
    })

    it('throws NOT_FOUND when story does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(caller.archiveStory({
        projectId: testProjectId,
        storyId: 'NONEXISTENT',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Story with id "NONEXISTENT" not found in project',
      })
    })

    it('updates timestamp when story is already archived (instead of throwing)', async () => {
      const originalArchivedAt = '2024-01-15T10:30:00.000Z'
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return true
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('prd.json')) {
          // Add ARCHIVED-001 to prd.json for this test (re-archiving scenario)
          return JSON.stringify({
            ...samplePrdJson,
            userStories: [
              ...samplePrdJson.userStories,
              {
                id: 'ARCHIVED-001',
                title: 'Updated Story',
                description: 'Updated Desc',
                priority: 50,
                status: 'done' as StoryStatus,
                epic: 'Test',
                dependencies: [],
                recommendedSkills: [],
                acceptanceCriteria: [],
              },
            ],
          })
        }
        if (String(path).includes('archived.json')) {
          return JSON.stringify(sampleArchivedJson) // Contains ARCHIVED-001 with old timestamp
        }
        throw new Error('Unexpected path')
      })
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})

      const before = new Date()
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'ARCHIVED-001',
      })

      // Should succeed with 'updated' action
      expect(result.id).toBe('ARCHIVED-001')
      expect(result.action).toBe('updated')

      // New timestamp should be after the original
      const newArchivedAt = new Date(result.archivedAt)
      const originalDate = new Date(originalArchivedAt)
      expect(newArchivedAt.getTime()).toBeGreaterThan(originalDate.getTime())
      expect(newArchivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())

      // Verify archived.json was updated (not appended)
      const archivedWriteCall = vi.mocked(writeFile).mock.calls[0]
      const archivedData = JSON.parse(archivedWriteCall[1] as string)
      expect(archivedData.archivedStories).toHaveLength(1) // Still only 1 entry
      expect(archivedData.archivedStories[0].id).toBe('ARCHIVED-001')
      expect(archivedData.archivedStories[0].title).toBe('Updated Story') // Updated content

      // Verify story was removed from prd.json
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      const prdData = JSON.parse(prdWriteCall[1] as string)
      expect(prdData.userStories.find((s: { id: string }) => s.id === 'ARCHIVED-001')).toBeUndefined()
    })

    it('returns action: archived for new archive entries', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-002',
      })

      expect(result.action).toBe('archived')
    })

    it('creates archived.json if it does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-002',
      })

      // Check that archived.json was written with correct structure
      const archivedWriteCall = vi.mocked(writeFile).mock.calls[0]
      expect(String(archivedWriteCall[0])).toContain('archived.json')
      const archivedData = JSON.parse(archivedWriteCall[1] as string)
      expect(archivedData.projectName).toBe('Test Project')
      expect(archivedData.archivedStories).toHaveLength(1)
    })

    it('adds archivedAt timestamp to archived story', async () => {
      const before = new Date()

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-002',
      })

      const after = new Date()
      const archivedAt = new Date(result.archivedAt)

      expect(archivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(archivedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('throws NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({})

      await expect(caller.archiveStory({
        projectId: 99999,
        storyId: 'STORY-001',
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('archiveMultiple', () => {
    it('archives multiple done stories successfully', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveMultiple({
        projectId: testProjectId,
        storyIds: ['STORY-002', 'STORY-003'], // Both are done
      })

      expect(result.archived).toHaveLength(2)
      expect(result.archived.map(s => s.id)).toEqual(['STORY-002', 'STORY-003'])
      expect(result.errors).toBeUndefined()

      // Verify prd.json has both stories removed
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      const prdData = JSON.parse(prdWriteCall[1] as string)
      expect(prdData.userStories.find((s: { id: string }) => s.id === 'STORY-002')).toBeUndefined()
      expect(prdData.userStories.find((s: { id: string }) => s.id === 'STORY-003')).toBeUndefined()
      expect(prdData.userStories).toHaveLength(2) // Only STORY-001 and STORY-004 remain
    })

    it('returns errors for stories that cannot be archived', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveMultiple({
        projectId: testProjectId,
        storyIds: ['STORY-001', 'STORY-002', 'NONEXISTENT'],
      })

      expect(result.archived).toHaveLength(1)
      expect(result.archived[0].id).toBe('STORY-002')
      expect(result.errors).toBeDefined()
      expect(result.errors).toHaveLength(2)
      expect(result.errors).toContain('Story "STORY-001" has status \'pending\', only \'done\' stories can be archived')
      expect(result.errors).toContain('Story "NONEXISTENT" not found')
    })

    it('throws BAD_REQUEST when no stories can be archived', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      const caller = createCaller({})

      await expect(caller.archiveMultiple({
        projectId: testProjectId,
        storyIds: ['STORY-001', 'STORY-004'], // pending and in_progress
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('No stories could be archived'),
      })
    })

    it('updates already archived stories instead of skipping', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return true
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('prd.json')) {
          return JSON.stringify({
            ...samplePrdJson,
            userStories: [
              ...samplePrdJson.userStories,
              {
                id: 'ARCHIVED-001',
                title: 'Updated Story',
                description: 'Updated Desc',
                priority: 50,
                status: 'done' as StoryStatus,
                epic: 'Test',
                dependencies: [],
                recommendedSkills: [],
                acceptanceCriteria: [],
              },
            ],
          })
        }
        if (String(path).includes('archived.json')) {
          return JSON.stringify(sampleArchivedJson) // Contains ARCHIVED-001
        }
        throw new Error('Unexpected path')
      })
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveMultiple({
        projectId: testProjectId,
        storyIds: ['STORY-002', 'ARCHIVED-001'],
      })

      // STORY-002 is newly archived, ARCHIVED-001 is updated
      expect(result.archived).toHaveLength(1)
      expect(result.archived[0].id).toBe('STORY-002')
      expect(result.updated).toHaveLength(1)
      expect(result.updated[0].id).toBe('ARCHIVED-001')
      expect(result.updated[0].title).toBe('Updated Story')
      expect(result.errors).toBeUndefined()

      // Verify archived.json has both entries (one updated, one new)
      const archivedWriteCall = vi.mocked(writeFile).mock.calls[0]
      const archivedData = JSON.parse(archivedWriteCall[1] as string)
      expect(archivedData.archivedStories).toHaveLength(2)

      // Verify prd.json has both stories removed
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      const prdData = JSON.parse(prdWriteCall[1] as string)
      expect(prdData.userStories.find((s: { id: string }) => s.id === 'STORY-002')).toBeUndefined()
      expect(prdData.userStories.find((s: { id: string }) => s.id === 'ARCHIVED-001')).toBeUndefined()
    })

    it('throws NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({})

      await expect(caller.archiveMultiple({
        projectId: 99999,
        storyIds: ['STORY-001'],
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('validates input - requires at least one storyId', async () => {
      const caller = createCaller({})

      await expect(caller.archiveMultiple({
        projectId: testProjectId,
        storyIds: [],
      })).rejects.toThrow()
    })
  })

  describe('dependency cleanup', () => {
    // prd.json with dependencies for testing cleanup
    const prdWithDependencies = {
      projectName: 'Test Project',
      projectDescription: 'A test project',
      branchName: 'main',
      userStories: [
        {
          id: 'STORY-001',
          title: 'First Story',
          description: 'Description of first story',
          priority: 1,
          status: 'done' as StoryStatus,
          epic: 'Core',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ['Criteria 1'],
        },
        {
          id: 'STORY-002',
          title: 'Second Story',
          description: 'Description of second story',
          priority: 2,
          status: 'pending' as StoryStatus,
          epic: 'Core',
          dependencies: ['STORY-001'], // Depends on STORY-001
          recommendedSkills: [],
          acceptanceCriteria: ['Criteria A'],
        },
        {
          id: 'STORY-003',
          title: 'Third Story',
          description: 'Description of third story',
          priority: 3,
          status: 'pending' as StoryStatus,
          epic: 'Testing',
          dependencies: ['STORY-001', 'STORY-002'], // Depends on both
          recommendedSkills: [],
          acceptanceCriteria: ['Criteria X'],
        },
        {
          id: 'STORY-004',
          title: 'Fourth Story',
          description: 'Description of fourth story',
          priority: 4,
          status: 'done' as StoryStatus,
          epic: 'Testing',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ['Criteria Y'],
        },
      ],
    }

    it('cleans up dependencies when archiving a story that others depend on', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(prdWithDependencies))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-001', // STORY-002 and STORY-003 depend on this
      })

      // Should return count of cleaned dependencies
      expect(result.cleanedDependencies).toBe(2) // STORY-002 has 1, STORY-003 has 1

      // Verify prd.json content has dependencies cleaned
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      const prdData = JSON.parse(prdWriteCall[1] as string)

      // STORY-002 should have empty dependencies now
      const story2 = prdData.userStories.find((s: { id: string }) => s.id === 'STORY-002')
      expect(story2.dependencies).toEqual([])

      // STORY-003 should only have STORY-002 as dependency now
      const story3 = prdData.userStories.find((s: { id: string }) => s.id === 'STORY-003')
      expect(story3.dependencies).toEqual(['STORY-002'])
    })

    it('returns cleanedDependencies: 0 when story has no dependents', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(prdWithDependencies))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-004', // No one depends on this
      })

      expect(result.cleanedDependencies).toBe(0)
    })

    it('handles bulk archive with dependency cleanup', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(prdWithDependencies))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveMultiple({
        projectId: testProjectId,
        storyIds: ['STORY-001', 'STORY-004'], // Archive both done stories
      })

      expect(result.archived).toHaveLength(2)
      expect(result.cleanedDependencies).toBe(2) // STORY-001 was in dependencies of 2 stories

      // Verify prd.json content
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      const prdData = JSON.parse(prdWriteCall[1] as string)

      // Only STORY-002 and STORY-003 should remain
      expect(prdData.userStories).toHaveLength(2)

      // STORY-002 should have empty dependencies
      const story2 = prdData.userStories.find((s: { id: string }) => s.id === 'STORY-002')
      expect(story2.dependencies).toEqual([])

      // STORY-003 should only have STORY-002 as dependency (STORY-001 was removed)
      const story3 = prdData.userStories.find((s: { id: string }) => s.id === 'STORY-003')
      expect(story3.dependencies).toEqual(['STORY-002'])
    })

    it('ignores self-references in dependencies during cleanup', async () => {
      const prdWithSelfRef = {
        ...prdWithDependencies,
        userStories: [
          {
            id: 'STORY-001',
            title: 'First Story',
            description: 'Description',
            priority: 1,
            status: 'done' as StoryStatus,
            epic: 'Core',
            dependencies: ['STORY-001'], // Self-reference (edge case)
            recommendedSkills: [],
            acceptanceCriteria: ['Criteria'],
          },
          {
            id: 'STORY-002',
            title: 'Second Story',
            description: 'Description',
            priority: 2,
            status: 'pending' as StoryStatus,
            epic: 'Core',
            dependencies: ['STORY-001'],
            recommendedSkills: [],
            acceptanceCriteria: ['Criteria'],
          },
        ],
      }

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(prdWithSelfRef))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-001',
      })

      // Should clean the dependency from STORY-002
      expect(result.cleanedDependencies).toBe(1)

      // Verify prd.json content
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      const prdData = JSON.parse(prdWriteCall[1] as string)

      const story2 = prdData.userStories.find((s: { id: string }) => s.id === 'STORY-002')
      expect(story2.dependencies).toEqual([])
    })

    it('handles stories with no dependencies array', async () => {
      const prdWithNoDeps = {
        projectName: 'Test Project',
        projectDescription: 'A test project',
        branchName: 'main',
        userStories: [
          {
            id: 'STORY-001',
            title: 'First Story',
            description: 'Description',
            priority: 1,
            status: 'done' as StoryStatus,
            epic: 'Core',
            dependencies: [],
            recommendedSkills: [],
            acceptanceCriteria: ['Criteria'],
          },
          {
            id: 'STORY-002',
            title: 'Second Story',
            description: 'Description',
            priority: 2,
            status: 'pending' as StoryStatus,
            epic: 'Core',
            // No dependencies field or empty array
            dependencies: [],
            recommendedSkills: [],
            acceptanceCriteria: ['Criteria'],
          },
        ],
      }

      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(prdWithNoDeps))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      const result = await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-001',
      })

      // No dependencies to clean
      expect(result.cleanedDependencies).toBe(0)
    })

    it('performs atomistic prd.json update (story removal + dependency cleanup in one write)', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(prdWithDependencies))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const caller = createCaller({})
      await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-001',
      })

      // Should only write prd.json once (after archived.json)
      expect(writeFile).toHaveBeenCalledTimes(2)

      // Get the prd.json write call
      const prdWriteCall = vi.mocked(writeFile).mock.calls[1]
      expect(String(prdWriteCall[0])).toContain('prd.json')

      // Parse and verify both operations happened
      const prdData = JSON.parse(prdWriteCall[1] as string)

      // Story removed
      expect(prdData.userStories.find((s: { id: string }) => s.id === 'STORY-001')).toBeUndefined()

      // Dependencies cleaned
      const story2 = prdData.userStories.find((s: { id: string }) => s.id === 'STORY-002')
      expect(story2.dependencies).not.toContain('STORY-001')
    })
  })

  describe('atomicity and error handling', () => {
    it('handles writeFile error for archived.json', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockRejectedValue(new Error('Permission denied'))

      const caller = createCaller({})

      await expect(caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-002',
      })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: expect.stringContaining('Permission denied'),
      })
    })

    it('handles writeFile error for prd.json after successful archived.json write', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return true
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))

      let writeCount = 0
      vi.mocked(writeFile).mockImplementation(async () => {
        writeCount++
        if (writeCount === 2) {
          throw new Error('Disk full')
        }
        return undefined
      })

      const caller = createCaller({})

      await expect(caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-002',
      })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: expect.stringContaining('Disk full'),
      })

      // First write (archived.json) should have succeeded
      expect(writeFile).toHaveBeenCalledTimes(2)
    })

    it('handles readFile error gracefully', async () => {
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

    it('creates stories directory if it does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        if (String(path).includes('prd.json')) return true
        if (String(path).includes('archived.json')) return false
        if (String(path).includes('stories')) return false // Directory doesn't exist
        return false
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(samplePrdJson))
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const caller = createCaller({})
      await caller.archiveStory({
        projectId: testProjectId,
        storyId: 'STORY-002',
      })

      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining('stories'),
        { recursive: true }
      )
    })
  })
})

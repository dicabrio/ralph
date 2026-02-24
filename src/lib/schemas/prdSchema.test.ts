/**
 * Tests for PRD Schema validation and conversion utilities
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import {
  validatePrd,
  detectMappings,
  applyMappings,
  prdSchema,
  storySchema,
  fieldAliases,
  statusAliases,
  type ConversionMapping,
} from './prdSchema'

describe('prdSchema', () => {
  describe('storySchema', () => {
    it('validates a complete valid story', () => {
      const story = {
        id: 'FEAT-001',
        title: 'Test Story',
        description: 'A test story description',
        priority: 1,
        status: 'pending',
        epic: 'Testing',
        dependencies: ['FEAT-000'],
        recommendedSkills: ['testing'],
        acceptanceCriteria: ['It works'],
      }

      const result = storySchema.safeParse(story)
      expect(result.success).toBe(true)
    })

    it('applies default values for optional arrays', () => {
      const story = {
        id: 'FEAT-001',
        title: 'Test Story',
        description: 'A test story description',
        priority: 1,
        status: 'pending',
        epic: 'Testing',
      }

      const result = storySchema.safeParse(story)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.dependencies).toEqual([])
        expect(result.data.recommendedSkills).toEqual([])
        expect(result.data.acceptanceCriteria).toEqual([])
      }
    })

    it('rejects invalid status values', () => {
      const story = {
        id: 'FEAT-001',
        title: 'Test Story',
        description: 'A test story description',
        priority: 1,
        status: 'invalid_status',
        epic: 'Testing',
      }

      const result = storySchema.safeParse(story)
      expect(result.success).toBe(false)
    })

    it('rejects negative priority', () => {
      const story = {
        id: 'FEAT-001',
        title: 'Test Story',
        description: 'A test story description',
        priority: -1,
        status: 'pending',
        epic: 'Testing',
      }

      const result = storySchema.safeParse(story)
      expect(result.success).toBe(false)
    })
  })

  describe('prdSchema', () => {
    it('validates a complete valid PRD', () => {
      const prd = {
        projectName: 'Test Project',
        branchName: 'main',
        projectDescription: 'A test project',
        userStories: [
          {
            id: 'FEAT-001',
            title: 'Test Story',
            description: 'A test story',
            priority: 1,
            status: 'pending',
            epic: 'Testing',
            dependencies: [],
            recommendedSkills: [],
            acceptanceCriteria: [],
          },
        ],
      }

      const result = prdSchema.safeParse(prd)
      expect(result.success).toBe(true)
    })

    it('requires at least one user story', () => {
      const prd = {
        projectName: 'Test Project',
        userStories: [],
      }

      const result = prdSchema.safeParse(prd)
      expect(result.success).toBe(false)
    })

    it('requires projectName', () => {
      const prd = {
        userStories: [
          {
            id: 'FEAT-001',
            title: 'Test Story',
            description: 'A test story',
            priority: 1,
            status: 'pending',
            epic: 'Testing',
          },
        ],
      }

      const result = prdSchema.safeParse(prd)
      expect(result.success).toBe(false)
    })

    it('applies default values for optional fields', () => {
      const prd = {
        projectName: 'Test Project',
        userStories: [
          {
            id: 'FEAT-001',
            title: 'Test Story',
            description: 'A test story',
            priority: 1,
            status: 'pending',
            epic: 'Testing',
          },
        ],
      }

      const result = prdSchema.safeParse(prd)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.implementationGuides).toEqual([])
        expect(result.data.availableSkills).toEqual([])
        expect(result.data.epics).toEqual([])
      }
    })
  })
})

describe('validatePrd', () => {
  it('returns valid for conforming data', () => {
    const prd = {
      projectName: 'Test Project',
      userStories: [
        {
          id: 'FEAT-001',
          title: 'Test Story',
          description: 'A test story',
          priority: 1,
          status: 'pending',
          epic: 'Testing',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: [],
        },
      ],
    }

    const result = validatePrd(prd)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns errors for non-conforming data', () => {
    const prd = {
      name: 'Test Project', // wrong field name
      stories: [], // wrong field name and empty
    }

    const result = validatePrd(prd)
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('detects aliased field names and adds warnings', () => {
    const prd = {
      name: 'Test Project', // alias for projectName
      stories: [ // alias for userStories
        {
          id: 'FEAT-001',
          title: 'Test Story',
          description: 'A test story',
          priority: 1,
          status: 'pending',
          epic: 'Testing',
        },
      ],
    }

    const result = validatePrd(prd)
    expect(result.isValid).toBe(false)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.path === 'name')).toBe(true)
    expect(result.warnings.some(w => w.path === 'stories')).toBe(true)
  })
})

describe('detectMappings', () => {
  it('detects root level field mappings', () => {
    const data = {
      name: 'Test Project', // should map to projectName
      description: 'A description', // should map to projectDescription
      stories: [{ id: '1', title: 'Test' }],
    }

    const mappings = detectMappings(data)
    expect(mappings.rootMappings.some(m => m.sourceField === 'name' && m.targetField === 'projectName')).toBe(true)
    expect(mappings.rootMappings.some(m => m.sourceField === 'description' && m.targetField === 'projectDescription')).toBe(true)
    expect(mappings.rootMappings.some(m => m.sourceField === 'stories' && m.targetField === 'userStories')).toBe(true)
  })

  it('detects story level field mappings', () => {
    const data = {
      projectName: 'Test Project',
      userStories: [
        {
          storyId: 'FEAT-001', // alias for id
          name: 'Test Story', // alias for title
          desc: 'A description', // alias for description
          state: 'open', // alias for status
          category: 'Testing', // alias for epic
          priority: 1,
        },
      ],
    }

    const mappings = detectMappings(data)
    expect(mappings.storyMappings.some(m => m.sourceField === 'storyId' && m.targetField === 'id')).toBe(true)
    expect(mappings.storyMappings.some(m => m.sourceField === 'name' && m.targetField === 'title')).toBe(true)
    expect(mappings.storyMappings.some(m => m.sourceField === 'desc' && m.targetField === 'description')).toBe(true)
    expect(mappings.storyMappings.some(m => m.sourceField === 'state' && m.targetField === 'status')).toBe(true)
    expect(mappings.storyMappings.some(m => m.sourceField === 'category' && m.targetField === 'epic')).toBe(true)
  })

  it('detects status value mappings', () => {
    const data = {
      projectName: 'Test Project',
      userStories: [
        { id: '1', title: 'A', description: 'X', priority: 1, status: 'open', epic: 'Test' },
        { id: '2', title: 'B', description: 'Y', priority: 2, status: 'closed', epic: 'Test' },
        { id: '3', title: 'C', description: 'Z', priority: 3, status: 'wip', epic: 'Test' },
      ],
    }

    const mappings = detectMappings(data)
    expect(mappings.statusValueMap?.['open']).toBe('pending')
    expect(mappings.statusValueMap?.['closed']).toBe('done')
    expect(mappings.statusValueMap?.['wip']).toBe('in_progress')
  })

  it('handles empty data gracefully', () => {
    const mappings = detectMappings({})
    expect(mappings.rootMappings).toEqual([])
    expect(mappings.storyMappings).toEqual([])
  })

  it('handles non-object data gracefully', () => {
    const mappings = detectMappings(null)
    expect(mappings.rootMappings).toEqual([])
    expect(mappings.storyMappings).toEqual([])
  })
})

describe('applyMappings', () => {
  it('applies root level mappings', () => {
    const data = {
      name: 'Test Project',
      description: 'A description',
      userStories: [
        {
          id: 'FEAT-001',
          title: 'Test Story',
          description: 'Story description',
          priority: 1,
          status: 'pending',
          epic: 'Testing',
        },
      ],
    }

    const mappings: ConversionMapping = {
      rootMappings: [
        { sourceField: 'name', targetField: 'projectName', transform: 'rename' },
        { sourceField: 'description', targetField: 'projectDescription', transform: 'rename' },
      ],
      storyMappings: [],
      statusValueMap: {},
    }

    const { converted, errors } = applyMappings(data, mappings)
    expect(errors).toHaveLength(0)
    expect(converted.projectName).toBe('Test Project')
    expect(converted.projectDescription).toBe('A description')
  })

  it('applies story level mappings', () => {
    const data = {
      projectName: 'Test Project',
      stories: [
        {
          storyId: 'FEAT-001',
          name: 'Test Story',
          desc: 'Story description',
          order: 1,
          state: 'open',
          category: 'Testing',
        },
      ],
    }

    const mappings: ConversionMapping = {
      rootMappings: [
        { sourceField: 'stories', targetField: 'userStories', transform: 'rename' },
      ],
      storyMappings: [
        { sourceField: 'storyId', targetField: 'id', transform: 'rename' },
        { sourceField: 'name', targetField: 'title', transform: 'rename' },
        { sourceField: 'desc', targetField: 'description', transform: 'rename' },
        { sourceField: 'order', targetField: 'priority', transform: 'rename' },
        { sourceField: 'state', targetField: 'status', transform: 'rename' },
        { sourceField: 'category', targetField: 'epic', transform: 'rename' },
      ],
      statusValueMap: {
        open: 'pending',
      },
    }

    const { converted, errors } = applyMappings(data, mappings)
    expect(errors).toHaveLength(0)
    expect(converted.userStories).toHaveLength(1)
    expect(converted.userStories[0].id).toBe('FEAT-001')
    expect(converted.userStories[0].title).toBe('Test Story')
    expect(converted.userStories[0].description).toBe('Story description')
    expect(converted.userStories[0].priority).toBe(1)
    expect(converted.userStories[0].status).toBe('pending')
    expect(converted.userStories[0].epic).toBe('Testing')
  })

  it('applies status value mappings', () => {
    const data = {
      projectName: 'Test Project',
      userStories: [
        {
          id: 'FEAT-001',
          title: 'Test Story',
          description: 'Story description',
          priority: 1,
          status: 'closed',
          epic: 'Testing',
        },
      ],
    }

    const mappings: ConversionMapping = {
      rootMappings: [],
      storyMappings: [],
      statusValueMap: {
        closed: 'done',
      },
    }

    const { converted, errors } = applyMappings(data, mappings)
    expect(errors).toHaveLength(0)
    expect(converted.userStories[0].status).toBe('done')
  })

  it('adds default values for missing required arrays', () => {
    const data = {
      projectName: 'Test Project',
      userStories: [
        {
          id: 'FEAT-001',
          title: 'Test Story',
          description: 'Story description',
          priority: 1,
          status: 'pending',
          epic: 'Testing',
          // Missing: dependencies, recommendedSkills, acceptanceCriteria
        },
      ],
    }

    const mappings: ConversionMapping = {
      rootMappings: [],
      storyMappings: [],
      statusValueMap: {},
    }

    const { converted, errors } = applyMappings(data, mappings)
    expect(errors).toHaveLength(0)
    expect(converted.userStories[0].dependencies).toEqual([])
    expect(converted.userStories[0].recommendedSkills).toEqual([])
    expect(converted.userStories[0].acceptanceCriteria).toEqual([])
  })

  it('throws error for non-object input', () => {
    expect(() => applyMappings(null, { rootMappings: [], storyMappings: [] })).toThrow('Input data must be an object')
    expect(() => applyMappings('string', { rootMappings: [], storyMappings: [] })).toThrow('Input data must be an object')
  })
})

describe('fieldAliases', () => {
  it('contains common project field aliases', () => {
    expect(fieldAliases.projectName).toContain('name')
    expect(fieldAliases.projectDescription).toContain('description')
    expect(fieldAliases.userStories).toContain('stories')
    expect(fieldAliases.userStories).toContain('tasks')
  })

  it('contains common story field aliases', () => {
    expect(fieldAliases.id).toContain('storyId')
    expect(fieldAliases.title).toContain('name')
    expect(fieldAliases.description).toContain('desc')
    expect(fieldAliases.status).toContain('state')
    expect(fieldAliases.epic).toContain('category')
  })
})

describe('statusAliases', () => {
  it('maps common status values to pending', () => {
    expect(statusAliases['todo']).toBe('pending')
    expect(statusAliases['open']).toBe('pending')
    expect(statusAliases['new']).toBe('pending')
  })

  it('maps common status values to in_progress', () => {
    expect(statusAliases['wip']).toBe('in_progress')
    expect(statusAliases['active']).toBe('in_progress')
    expect(statusAliases['working']).toBe('in_progress')
  })

  it('maps common status values to done', () => {
    expect(statusAliases['complete']).toBe('done')
    expect(statusAliases['closed']).toBe('done')
    expect(statusAliases['finished']).toBe('done')
  })

  it('maps common status values to failed', () => {
    expect(statusAliases['error']).toBe('failed')
    expect(statusAliases['blocked']).toBe('failed')
    expect(statusAliases['rejected']).toBe('failed')
  })

  it('maps common status values to review', () => {
    expect(statusAliases['review']).toBe('review')
    expect(statusAliases['testing']).toBe('review')
    expect(statusAliases['qa']).toBe('review')
    expect(statusAliases['in-review']).toBe('review')
    expect(statusAliases['verification']).toBe('review')
  })
})

describe('storyStatusEnum review status', () => {
  it('accepts review as a valid status', () => {
    const story = {
      id: 'FEAT-001',
      title: 'Test Story',
      description: 'A test story description',
      priority: 1,
      status: 'review',
      epic: 'Testing',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: [],
    }

    const result = storySchema.safeParse(story)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('review')
    }
  })
})

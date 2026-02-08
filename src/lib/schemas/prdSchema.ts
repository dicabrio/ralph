import { z } from 'zod'

// Ralph's standard PRD.json schema

export const storyStatusEnum = z.enum(['pending', 'in_progress', 'done', 'failed', 'backlog'])

export const storySchema = z.object({
  id: z.string().min(1, 'Story ID is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.number().int().positive('Priority must be a positive integer'),
  status: storyStatusEnum,
  epic: z.string().min(1, 'Epic is required'),
  dependencies: z.array(z.string()).default([]),
  recommendedSkills: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
})

export const epicSchema = z.object({
  name: z.string().min(1, 'Epic name is required'),
  description: z.string().optional(),
})

export const implementationGuideSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
  topics: z.array(z.string()).optional(),
})

export const prdSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  branchName: z.string().optional(),
  projectDescription: z.string().optional(),
  implementationGuides: z.array(implementationGuideSchema).optional().default([]),
  availableSkills: z.array(z.string()).optional().default([]),
  epics: z.array(epicSchema).optional().default([]),
  userStories: z.array(storySchema).min(1, 'At least one user story is required'),
})

export type Story = z.infer<typeof storySchema>
export type Epic = z.infer<typeof epicSchema>
export type ImplementationGuide = z.infer<typeof implementationGuideSchema>
export type Prd = z.infer<typeof prdSchema>
export type StoryStatus = z.infer<typeof storyStatusEnum>

// Validation result type
export interface PrdValidationResult {
  isValid: boolean
  errors: PrdValidationError[]
  warnings: PrdValidationWarning[]
  data?: Prd
}

export interface PrdValidationError {
  path: string
  message: string
  expected?: string
  received?: string
}

export interface PrdValidationWarning {
  path: string
  message: string
  suggestion?: string
}

// Field mapping types for conversion
export interface FieldMapping {
  sourceField: string
  targetField: string
  transform?: 'direct' | 'rename' | 'valueMap' | 'nested'
  valueMap?: Record<string, string>
  isNested?: boolean
  nestedMappings?: FieldMapping[]
}

export interface ConversionMapping {
  rootMappings: FieldMapping[]
  storyMappings: FieldMapping[]
  epicMappings?: FieldMapping[]
  statusValueMap?: Record<string, StoryStatus>
}

export interface ConversionResult {
  success: boolean
  convertedPrd?: Prd
  errors: string[]
  warnings: string[]
  backup?: {
    created: boolean
    path?: string
  }
}

// Helper to detect common alternative field names
export const fieldAliases: Record<string, string[]> = {
  // Root level aliases
  projectName: ['name', 'project', 'projectTitle', 'title'],
  projectDescription: ['description', 'desc', 'about', 'summary'],
  branchName: ['branch', 'gitBranch', 'defaultBranch'],
  userStories: ['stories', 'tasks', 'items', 'tickets', 'issues', 'features'],
  epics: ['categories', 'modules', 'areas'],
  availableSkills: ['skills', 'technologies', 'tech'],

  // Story level aliases
  id: ['storyId', 'taskId', 'ticketId', 'issueId', 'key', '_id'],
  title: ['name', 'summary', 'subject'],
  description: ['desc', 'body', 'content', 'details'],
  priority: ['order', 'rank', 'importance', 'weight'],
  status: ['state', 'stage', 'phase', 'progress'],
  epic: ['category', 'module', 'area', 'type', 'component'],
  dependencies: ['dependsOn', 'blockedBy', 'requires', 'deps'],
  recommendedSkills: ['skills', 'technologies', 'requiredSkills'],
  acceptanceCriteria: ['criteria', 'requirements', 'definition', 'dod', 'definitionOfDone', 'ac'],
}

// Common status value mappings
export const statusAliases: Record<string, StoryStatus> = {
  // pending aliases
  pending: 'pending',
  todo: 'pending',
  'to-do': 'pending',
  'to do': 'pending',
  open: 'pending',
  new: 'pending',
  created: 'pending',
  queued: 'pending',
  waiting: 'pending',

  // in_progress aliases
  in_progress: 'in_progress',
  'in-progress': 'in_progress',
  'in progress': 'in_progress',
  inprogress: 'in_progress',
  active: 'in_progress',
  started: 'in_progress',
  working: 'in_progress',
  wip: 'in_progress',
  running: 'in_progress',

  // done aliases
  done: 'done',
  complete: 'done',
  completed: 'done',
  finished: 'done',
  closed: 'done',
  resolved: 'done',
  merged: 'done',
  shipped: 'done',

  // failed aliases
  failed: 'failed',
  error: 'failed',
  blocked: 'failed',
  rejected: 'failed',
  cancelled: 'failed',
  canceled: 'failed',

  // backlog aliases
  backlog: 'backlog',
  icebox: 'backlog',
  later: 'backlog',
  someday: 'backlog',
  future: 'backlog',
}

/**
 * Validates a prd.json object against Ralph's schema
 */
export function validatePrd(data: unknown): PrdValidationResult {
  const errors: PrdValidationError[] = []
  const warnings: PrdValidationWarning[] = []

  // Try strict validation first
  const result = prdSchema.safeParse(data)

  if (result.success) {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      data: result.data,
    }
  }

  // Parse Zod errors into our format
  for (const issue of result.error.issues) {
    errors.push({
      path: issue.path.join('.'),
      message: issue.message,
      expected: issue.code === 'invalid_type' ? String((issue as { expected?: string }).expected) : undefined,
      received: issue.code === 'invalid_type' ? String((issue as { received?: string }).received) : undefined,
    })
  }

  // Check for common field name mismatches and add as warnings
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>

    // Check for aliased field names at root level
    for (const [standardField, aliases] of Object.entries(fieldAliases)) {
      if (!(standardField in obj)) {
        for (const alias of aliases) {
          if (alias in obj) {
            warnings.push({
              path: alias,
              message: `Field '${alias}' appears to be '${standardField}'`,
              suggestion: `Map '${alias}' to '${standardField}'`,
            })
            break
          }
        }
      }
    }

    // Check for alternative story array names
    const storyArrayAliases = ['stories', 'tasks', 'items', 'tickets', 'issues', 'features']
    if (!('userStories' in obj)) {
      for (const alias of storyArrayAliases) {
        if (alias in obj && Array.isArray(obj[alias])) {
          warnings.push({
            path: alias,
            message: `Field '${alias}' appears to be 'userStories'`,
            suggestion: `Map '${alias}' to 'userStories'`,
          })
          break
        }
      }
    }
  }

  return {
    isValid: false,
    errors,
    warnings,
  }
}

/**
 * Detects potential field mappings from a non-conforming prd.json
 */
export function detectMappings(data: unknown): ConversionMapping {
  const rootMappings: FieldMapping[] = []
  const storyMappings: FieldMapping[] = []
  const epicMappings: FieldMapping[] = []
  const statusValueMap: Record<string, StoryStatus> = {}

  if (typeof data !== 'object' || data === null) {
    return { rootMappings, storyMappings, epicMappings, statusValueMap }
  }

  const obj = data as Record<string, unknown>

  // Detect root level mappings
  for (const [standardField, aliases] of Object.entries(fieldAliases)) {
    // Skip story-level fields when checking root
    const storyFields = ['id', 'title', 'description', 'priority', 'status', 'epic', 'dependencies', 'recommendedSkills', 'acceptanceCriteria']
    if (storyFields.includes(standardField)) continue

    if (!(standardField in obj)) {
      for (const alias of aliases) {
        if (alias in obj) {
          rootMappings.push({
            sourceField: alias,
            targetField: standardField,
            transform: 'rename',
          })
          break
        }
      }
    }
  }

  // Find the stories array
  let storiesArray: unknown[] | null = null

  if ('userStories' in obj && Array.isArray(obj.userStories)) {
    storiesArray = obj.userStories
  } else {
    const storyArrayAliases = ['stories', 'tasks', 'items', 'tickets', 'issues', 'features']
    for (const alias of storyArrayAliases) {
      if (alias in obj && Array.isArray(obj[alias])) {
        storiesArray = obj[alias] as unknown[]
        rootMappings.push({
          sourceField: alias,
          targetField: 'userStories',
          transform: 'rename',
        })
        break
      }
    }
  }

  // Detect story-level mappings from first story
  if (storiesArray && storiesArray.length > 0) {
    const sampleStory = storiesArray[0] as Record<string, unknown>

    const storyFieldAliases: Record<string, string[]> = {
      id: ['storyId', 'taskId', 'ticketId', 'issueId', 'key', '_id'],
      title: ['name', 'summary', 'subject'],
      description: ['desc', 'body', 'content', 'details'],
      priority: ['order', 'rank', 'importance', 'weight'],
      status: ['state', 'stage', 'phase', 'progress'],
      epic: ['category', 'module', 'area', 'type', 'component'],
      dependencies: ['dependsOn', 'blockedBy', 'requires', 'deps'],
      recommendedSkills: ['skills', 'technologies', 'requiredSkills'],
      acceptanceCriteria: ['criteria', 'requirements', 'definition', 'dod', 'definitionOfDone', 'ac'],
    }

    for (const [standardField, aliases] of Object.entries(storyFieldAliases)) {
      if (!(standardField in sampleStory)) {
        for (const alias of aliases) {
          if (alias in sampleStory) {
            storyMappings.push({
              sourceField: alias,
              targetField: standardField,
              transform: 'rename',
            })
            break
          }
        }
      }
    }

    // Detect status value mappings
    const statusFieldName = 'status' in sampleStory ? 'status' :
      storyMappings.find(m => m.targetField === 'status')?.sourceField

    if (statusFieldName) {
      const uniqueStatuses = new Set<string>()
      for (const story of storiesArray) {
        const storyObj = story as Record<string, unknown>
        const statusValue = storyObj[statusFieldName]
        if (typeof statusValue === 'string') {
          uniqueStatuses.add(statusValue.toLowerCase())
        }
      }

      for (const status of uniqueStatuses) {
        const normalizedStatus = status.toLowerCase().trim()
        if (normalizedStatus in statusAliases) {
          if (normalizedStatus !== statusAliases[normalizedStatus]) {
            statusValueMap[status] = statusAliases[normalizedStatus]
          }
        }
      }
    }
  }

  return { rootMappings, storyMappings, epicMappings, statusValueMap }
}

/**
 * Applies field mappings to convert non-conforming prd.json to Ralph format
 */
export function applyMappings(
  data: unknown,
  mappings: ConversionMapping
): { converted: Prd; errors: string[] } {
  const errors: string[] = []

  if (typeof data !== 'object' || data === null) {
    throw new Error('Input data must be an object')
  }

  const source = data as Record<string, unknown>
  const converted: Record<string, unknown> = {}

  // Apply root-level mappings
  for (const key of Object.keys(source)) {
    const mapping = mappings.rootMappings.find(m => m.sourceField === key)
    if (mapping) {
      converted[mapping.targetField] = source[key]
    } else {
      converted[key] = source[key]
    }
  }

  // Find and convert stories array
  const storiesKey = mappings.rootMappings.find(m => m.targetField === 'userStories')?.sourceField || 'userStories'
  const storiesArray = source[storiesKey]

  if (Array.isArray(storiesArray)) {
    const convertedStories: Record<string, unknown>[] = []

    for (let i = 0; i < storiesArray.length; i++) {
      const story = storiesArray[i]
      if (typeof story !== 'object' || story === null) {
        errors.push(`Story at index ${i} is not an object`)
        continue
      }

      const storySource = story as Record<string, unknown>
      const convertedStory: Record<string, unknown> = {}

      // Apply story-level mappings
      for (const key of Object.keys(storySource)) {
        const mapping = mappings.storyMappings.find(m => m.sourceField === key)
        if (mapping) {
          let value = storySource[key]

          // Apply status value mapping
          if (mapping.targetField === 'status' && typeof value === 'string' && mappings.statusValueMap) {
            const lowerValue = value.toLowerCase()
            if (lowerValue in mappings.statusValueMap) {
              value = mappings.statusValueMap[lowerValue]
            } else if (lowerValue in statusAliases) {
              value = statusAliases[lowerValue]
            }
          }

          convertedStory[mapping.targetField] = value
        } else {
          // Apply status value mapping for direct status field
          if (key === 'status' && typeof storySource[key] === 'string' && mappings.statusValueMap) {
            const statusValue = storySource[key] as string
            const lowerValue = statusValue.toLowerCase()
            if (lowerValue in mappings.statusValueMap) {
              convertedStory[key] = mappings.statusValueMap[lowerValue]
            } else if (lowerValue in statusAliases) {
              convertedStory[key] = statusAliases[lowerValue]
            } else {
              convertedStory[key] = storySource[key]
            }
          } else {
            convertedStory[key] = storySource[key]
          }
        }
      }

      // Ensure required arrays exist with defaults
      if (!('dependencies' in convertedStory)) {
        convertedStory.dependencies = []
      }
      if (!('recommendedSkills' in convertedStory)) {
        convertedStory.recommendedSkills = []
      }
      if (!('acceptanceCriteria' in convertedStory)) {
        convertedStory.acceptanceCriteria = []
      }

      convertedStories.push(convertedStory)
    }

    converted.userStories = convertedStories
  }

  // Ensure required root fields have defaults
  if (!converted.implementationGuides) {
    converted.implementationGuides = []
  }
  if (!converted.availableSkills) {
    converted.availableSkills = []
  }
  if (!converted.epics) {
    converted.epics = []
  }

  // Validate the converted result
  const validation = prdSchema.safeParse(converted)
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`)
    }
    // Still return the converted object for preview
    return { converted: converted as Prd, errors }
  }

  return { converted: validation.data, errors }
}

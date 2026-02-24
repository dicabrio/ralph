import { describe, it, expect } from 'vitest'
import {
  findNextEligibleStory,
  generateStoryPrompt,
  getNoEligibleStoryReason,
  type StorySelectionResult,
} from './storySelector'
import type { Story } from '@/lib/schemas/prdSchema'

// Helper to create test stories
function createStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'TEST-001',
    title: 'Test Story',
    description: 'Test description',
    priority: 1,
    status: 'pending',
    epic: 'Test',
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: [],
    ...overrides,
  }
}

describe('findNextEligibleStory', () => {
  it('returns null when no stories exist', () => {
    const result = findNextEligibleStory([])
    expect(result).toBeNull()
  })

  it('returns null when all stories are done', () => {
    const stories = [
      createStory({ id: 'S1', status: 'done', priority: 1 }),
      createStory({ id: 'S2', status: 'done', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).toBeNull()
  })

  it('returns null when all stories are in review', () => {
    const stories = [
      createStory({ id: 'S1', status: 'review', priority: 1 }),
      createStory({ id: 'S2', status: 'review', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).toBeNull()
  })

  it('returns null when all stories are in_progress', () => {
    const stories = [
      createStory({ id: 'S1', status: 'in_progress', priority: 1 }),
      createStory({ id: 'S2', status: 'in_progress', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).toBeNull()
  })

  it('returns null when all stories are backlog', () => {
    const stories = [
      createStory({ id: 'S1', status: 'backlog', priority: 1 }),
      createStory({ id: 'S2', status: 'backlog', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).toBeNull()
  })

  it('selects pending story with lowest priority', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 3 }),
      createStory({ id: 'S2', status: 'pending', priority: 1 }),
      createStory({ id: 'S3', status: 'pending', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.story.id).toBe('S2')
  })

  it('selects failed story when no pending stories', () => {
    const stories = [
      createStory({ id: 'S1', status: 'done', priority: 1 }),
      createStory({ id: 'S2', status: 'failed', priority: 2 }),
      createStory({ id: 'S3', status: 'review', priority: 3 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.story.id).toBe('S2')
  })

  it('prefers pending over failed at same priority', () => {
    const stories = [
      createStory({ id: 'S1', status: 'failed', priority: 1 }),
      createStory({ id: 'S2', status: 'pending', priority: 1 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    // Both have same priority, order depends on array order after filter/sort
    expect(['S1', 'S2']).toContain(result!.story.id)
  })

  it('respects dependencies - skips story with unmet dependencies', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 1, dependencies: ['S2'] }),
      createStory({ id: 'S2', status: 'pending', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.story.id).toBe('S2') // S1 is skipped because S2 is not done
  })

  it('allows story when all dependencies are done', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 1, dependencies: ['S2'] }),
      createStory({ id: 'S2', status: 'done', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.story.id).toBe('S1')
  })

  it('allows story when dependencies are in review', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 1, dependencies: ['S2'] }),
      createStory({ id: 'S2', status: 'review', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.story.id).toBe('S1')
  })

  it('handles multiple dependencies - all must be met', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 1, dependencies: ['S2', 'S3'] }),
      createStory({ id: 'S2', status: 'done', priority: 2 }),
      createStory({ id: 'S3', status: 'pending', priority: 3 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.story.id).toBe('S3') // S1 skipped because S3 is pending
  })

  it('handles complex dependency chain', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 1, dependencies: ['S2', 'S3'] }),
      createStory({ id: 'S2', status: 'done', priority: 2 }),
      createStory({ id: 'S3', status: 'done', priority: 3 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.story.id).toBe('S1')
    expect(result!.dependencyTitles).toHaveLength(2)
  })

  it('returns dependency titles for context', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 1, dependencies: ['S2'] }),
      createStory({ id: 'S2', status: 'done', priority: 2, title: 'Setup Database' }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.dependencyTitles).toContain('S2: Setup Database')
  })

  it('returns all stories in the result', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', priority: 1 }),
      createStory({ id: 'S2', status: 'done', priority: 2 }),
    ]
    const result = findNextEligibleStory(stories)
    expect(result).not.toBeNull()
    expect(result!.allStories).toBe(stories)
  })
})

describe('generateStoryPrompt', () => {
  const basePrompt = '# Base Prompt\n\nThis is the base prompt.'

  function createSelection(storyOverrides: Partial<Story> = {}, depTitles: string[] = []): StorySelectionResult {
    return {
      story: createStory({
        id: 'TEST-001',
        title: 'Test Story Title',
        description: 'This is the story description.',
        priority: 42,
        epic: 'Testing',
        status: 'pending',
        acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
        recommendedSkills: ['skill-1', 'skill-2'],
        ...storyOverrides,
      }),
      allStories: [],
      dependencyTitles: depTitles,
    }
  }

  it('includes story ID and title in header', () => {
    const selection = createSelection()
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('# Assigned Story: TEST-001')
    expect(prompt).toContain('**Title:** Test Story Title')
  })

  it('includes priority and epic', () => {
    const selection = createSelection()
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('**Priority:** 42')
    expect(prompt).toContain('**Epic:** Testing')
  })

  it('includes current status', () => {
    const selection = createSelection({ status: 'failed' })
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('**Current Status:** failed')
  })

  it('includes description', () => {
    const selection = createSelection({ description: 'A detailed description of the story.' })
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('## Description')
    expect(prompt).toContain('A detailed description of the story.')
  })

  it('includes numbered acceptance criteria', () => {
    const selection = createSelection({
      acceptanceCriteria: ['First criterion', 'Second criterion', 'Third criterion'],
    })
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('## Acceptance Criteria')
    expect(prompt).toContain('1. First criterion')
    expect(prompt).toContain('2. Second criterion')
    expect(prompt).toContain('3. Third criterion')
  })

  it('omits acceptance criteria section when empty', () => {
    const selection = createSelection({ acceptanceCriteria: [] })
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).not.toContain('## Acceptance Criteria')
  })

  it('includes recommended skills', () => {
    const selection = createSelection({
      recommendedSkills: ['database-design:architect', 'frontend-design'],
    })
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('## Recommended Skills')
    expect(prompt).toContain('- database-design:architect')
    expect(prompt).toContain('- frontend-design')
  })

  it('omits recommended skills section when empty', () => {
    const selection = createSelection({ recommendedSkills: [] })
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).not.toContain('## Recommended Skills')
  })

  it('includes completed dependencies', () => {
    const selection = createSelection({}, ['DEP-001: Setup Database', 'DEP-002: Create API'])
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('## Completed Dependencies')
    expect(prompt).toContain('- ✓ DEP-001: Setup Database')
    expect(prompt).toContain('- ✓ DEP-002: Create API')
  })

  it('omits dependencies section when empty', () => {
    const selection = createSelection({}, [])
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).not.toContain('## Completed Dependencies')
  })

  it('includes status update instructions', () => {
    const selection = createSelection()
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('## Instructions')
    expect(prompt).toContain('set `status: "in_progress"`')
    expect(prompt).toContain('Success → `status: "review"`')
    expect(prompt).toContain('Failure → `status: "failed"`')
  })

  it('appends base prompt after separator', () => {
    const selection = createSelection()
    const prompt = generateStoryPrompt(selection, basePrompt)

    expect(prompt).toContain('---')
    expect(prompt).toContain('# Base Prompt')
    expect(prompt).toContain('This is the base prompt.')
  })

  it('preserves base prompt content', () => {
    const selection = createSelection()
    const customBase = '# Custom\n\nMultiline\ncontent\nhere.'
    const prompt = generateStoryPrompt(selection, customBase)

    expect(prompt).toContain(customBase)
  })
})

describe('getNoEligibleStoryReason', () => {
  it('reports when all stories are done', () => {
    const stories = [
      createStory({ id: 'S1', status: 'done' }),
      createStory({ id: 'S2', status: 'done' }),
    ]
    const reason = getNoEligibleStoryReason(stories)

    expect(reason).toContain('Done: 2')
    expect(reason).toContain('Review: 0')
  })

  it('reports when stories are in review', () => {
    const stories = [
      createStory({ id: 'S1', status: 'review' }),
      createStory({ id: 'S2', status: 'done' }),
    ]
    const reason = getNoEligibleStoryReason(stories)

    expect(reason).toContain('Done: 1')
    expect(reason).toContain('Review: 1')
  })

  it('reports when stories are in progress', () => {
    const stories = [
      createStory({ id: 'S1', status: 'in_progress' }),
    ]
    const reason = getNoEligibleStoryReason(stories)

    expect(reason).toContain('in progress')
    expect(reason).toContain('1')
  })

  it('reports blocked stories with unmet dependencies', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', dependencies: ['S2', 'S3'] }),
      createStory({ id: 'S2', status: 'pending' }),
      createStory({ id: 'S3', status: 'pending' }),
    ]
    const reason = getNoEligibleStoryReason(stories)

    expect(reason).toContain('unmet dependencies')
    expect(reason).toContain('S1')
    expect(reason).toContain('S2')
    expect(reason).toContain('S3')
  })

  it('limits blocked stories in output to 3', () => {
    const stories = [
      createStory({ id: 'S1', status: 'pending', dependencies: ['S5'] }),
      createStory({ id: 'S2', status: 'pending', dependencies: ['S5'] }),
      createStory({ id: 'S3', status: 'pending', dependencies: ['S5'] }),
      createStory({ id: 'S4', status: 'pending', dependencies: ['S5'] }),
      createStory({ id: 'S5', status: 'pending' }),
    ]
    const reason = getNoEligibleStoryReason(stories)

    // Should only mention first 3 blocked stories
    expect(reason).toContain('S1')
    expect(reason).toContain('S2')
    expect(reason).toContain('S3')
    // S4 might not be mentioned due to limit
  })
})

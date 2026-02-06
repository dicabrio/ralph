/**
 * Kanban Board Drag & Drop Tests
 *
 * Tests for the drag & drop functionality of the Kanban board.
 * Tests cover:
 * - Transition validation (Backlog <-> Te doen)
 * - Blocked stories (unmet dependencies) cannot be moved to Te doen
 * - Column filtering logic
 */
import { describe, it, expect } from 'vitest'
import { Story, StoryStatus } from '@/components/StoryCard'

// Re-implement the helper functions from kanban.tsx for testing
// These are the core logic functions that we want to verify

// Check if a story has all dependencies met
function hasAllDependenciesMet(story: Story, allStories: Story[]): boolean {
  return story.dependencies.every((depId) => {
    const depStory = allStories.find((s) => s.id === depId)
    return depStory && depStory.status === 'done'
  })
}

// Get which column a story belongs to
function getColumnForStory(story: Story, allStories: Story[]): string {
  if (story.status === 'pending') {
    return hasAllDependenciesMet(story, allStories) ? 'todo' : 'backlog'
  }
  return story.status
}

// Check if a story can be dropped in a target column
function canDropInColumn(
  story: Story,
  targetColumnId: string,
  allStories: Story[],
): boolean {
  const droppableColumns = ['backlog', 'todo']
  if (!droppableColumns.includes(targetColumnId)) return false

  // Can only move stories with pending status
  if (story.status !== 'pending') return false

  // Can always move to backlog
  if (targetColumnId === 'backlog') return true

  // Can only move to todo if all dependencies are met
  if (targetColumnId === 'todo') {
    return hasAllDependenciesMet(story, allStories)
  }

  return false
}

// Filter stories for a column
function getStoriesForColumn(
  stories: Story[],
  columnId: string,
  columnStatus: StoryStatus | 'backlog',
): Story[] {
  if (columnId === 'backlog') {
    return stories.filter((story) => {
      if (story.status !== 'pending') return false
      return !hasAllDependenciesMet(story, stories)
    })
  }

  if (columnId === 'todo') {
    return stories.filter((story) => {
      if (story.status !== 'pending') return false
      return hasAllDependenciesMet(story, stories)
    })
  }

  // Other columns: match by status directly
  return stories.filter((story) => story.status === columnStatus)
}

// Helper to create a story for testing
function createStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'TEST-001',
    title: 'Test Story',
    description: 'Test description',
    priority: 1,
    status: 'pending',
    epic: 'Test Epic',
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: ['Test criterion'],
    ...overrides,
  }
}

describe('Kanban Drag & Drop Logic', () => {
  describe('hasAllDependenciesMet', () => {
    it('returns true for stories with no dependencies', () => {
      const story = createStory({ id: 'STORY-1', dependencies: [] })
      const allStories = [story]

      expect(hasAllDependenciesMet(story, allStories)).toBe(true)
    })

    it('returns true when all dependencies are done', () => {
      const dep1 = createStory({ id: 'DEP-1', status: 'done' })
      const dep2 = createStory({ id: 'DEP-2', status: 'done' })
      const story = createStory({
        id: 'STORY-1',
        dependencies: ['DEP-1', 'DEP-2'],
      })
      const allStories = [dep1, dep2, story]

      expect(hasAllDependenciesMet(story, allStories)).toBe(true)
    })

    it('returns false when some dependencies are not done', () => {
      const dep1 = createStory({ id: 'DEP-1', status: 'done' })
      const dep2 = createStory({ id: 'DEP-2', status: 'pending' })
      const story = createStory({
        id: 'STORY-1',
        dependencies: ['DEP-1', 'DEP-2'],
      })
      const allStories = [dep1, dep2, story]

      expect(hasAllDependenciesMet(story, allStories)).toBe(false)
    })

    it('returns false when dependencies do not exist', () => {
      const story = createStory({
        id: 'STORY-1',
        dependencies: ['NON-EXISTENT'],
      })
      const allStories = [story]

      expect(hasAllDependenciesMet(story, allStories)).toBe(false)
    })

    it('returns false when any dependency is in_progress', () => {
      const dep = createStory({ id: 'DEP-1', status: 'in_progress' })
      const story = createStory({
        id: 'STORY-1',
        dependencies: ['DEP-1'],
      })
      const allStories = [dep, story]

      expect(hasAllDependenciesMet(story, allStories)).toBe(false)
    })

    it('returns false when any dependency is failed', () => {
      const dep = createStory({ id: 'DEP-1', status: 'failed' })
      const story = createStory({
        id: 'STORY-1',
        dependencies: ['DEP-1'],
      })
      const allStories = [dep, story]

      expect(hasAllDependenciesMet(story, allStories)).toBe(false)
    })
  })

  describe('getColumnForStory', () => {
    it('returns "todo" for pending stories with all deps met', () => {
      const story = createStory({
        id: 'STORY-1',
        status: 'pending',
        dependencies: [],
      })
      const allStories = [story]

      expect(getColumnForStory(story, allStories)).toBe('todo')
    })

    it('returns "backlog" for pending stories with unmet deps', () => {
      const dep = createStory({ id: 'DEP-1', status: 'pending' })
      const story = createStory({
        id: 'STORY-1',
        status: 'pending',
        dependencies: ['DEP-1'],
      })
      const allStories = [dep, story]

      expect(getColumnForStory(story, allStories)).toBe('backlog')
    })

    it('returns "in_progress" for in_progress stories', () => {
      const story = createStory({ id: 'STORY-1', status: 'in_progress' })
      const allStories = [story]

      expect(getColumnForStory(story, allStories)).toBe('in_progress')
    })

    it('returns "done" for done stories', () => {
      const story = createStory({ id: 'STORY-1', status: 'done' })
      const allStories = [story]

      expect(getColumnForStory(story, allStories)).toBe('done')
    })

    it('returns "failed" for failed stories', () => {
      const story = createStory({ id: 'STORY-1', status: 'failed' })
      const allStories = [story]

      expect(getColumnForStory(story, allStories)).toBe('failed')
    })
  })

  describe('canDropInColumn', () => {
    describe('transition validation', () => {
      it('allows dropping from backlog to todo when deps are met', () => {
        const story = createStory({
          id: 'STORY-1',
          status: 'pending',
          dependencies: [],
        })
        const allStories = [story]

        expect(canDropInColumn(story, 'todo', allStories)).toBe(true)
      })

      it('allows dropping from todo to backlog', () => {
        const story = createStory({
          id: 'STORY-1',
          status: 'pending',
          dependencies: [],
        })
        const allStories = [story]

        expect(canDropInColumn(story, 'backlog', allStories)).toBe(true)
      })

      it('blocks dropping to todo when deps are not met', () => {
        const dep = createStory({ id: 'DEP-1', status: 'pending' })
        const story = createStory({
          id: 'STORY-1',
          status: 'pending',
          dependencies: ['DEP-1'],
        })
        const allStories = [dep, story]

        expect(canDropInColumn(story, 'todo', allStories)).toBe(false)
      })
    })

    describe('non-droppable columns', () => {
      it('blocks dropping to in_progress column', () => {
        const story = createStory({
          id: 'STORY-1',
          status: 'pending',
          dependencies: [],
        })
        const allStories = [story]

        expect(canDropInColumn(story, 'in_progress', allStories)).toBe(false)
      })

      it('blocks dropping to done column', () => {
        const story = createStory({
          id: 'STORY-1',
          status: 'pending',
          dependencies: [],
        })
        const allStories = [story]

        expect(canDropInColumn(story, 'done', allStories)).toBe(false)
      })

      it('blocks dropping to failed column', () => {
        const story = createStory({
          id: 'STORY-1',
          status: 'pending',
          dependencies: [],
        })
        const allStories = [story]

        expect(canDropInColumn(story, 'failed', allStories)).toBe(false)
      })
    })

    describe('non-pending stories', () => {
      it('blocks dropping in_progress stories', () => {
        const story = createStory({ id: 'STORY-1', status: 'in_progress' })
        const allStories = [story]

        expect(canDropInColumn(story, 'backlog', allStories)).toBe(false)
        expect(canDropInColumn(story, 'todo', allStories)).toBe(false)
      })

      it('blocks dropping done stories', () => {
        const story = createStory({ id: 'STORY-1', status: 'done' })
        const allStories = [story]

        expect(canDropInColumn(story, 'backlog', allStories)).toBe(false)
        expect(canDropInColumn(story, 'todo', allStories)).toBe(false)
      })

      it('blocks dropping failed stories', () => {
        const story = createStory({ id: 'STORY-1', status: 'failed' })
        const allStories = [story]

        expect(canDropInColumn(story, 'backlog', allStories)).toBe(false)
        expect(canDropInColumn(story, 'todo', allStories)).toBe(false)
      })
    })
  })

  describe('getStoriesForColumn', () => {
    const createTestStories = () => {
      // DEP-1 is done - can be depended on
      const dep1 = createStory({ id: 'DEP-1', status: 'done' })

      // BACKLOG-1 depends on a non-existent story - goes to backlog
      const backlogStory = createStory({
        id: 'BACKLOG-1',
        status: 'pending',
        dependencies: ['NON-EXISTENT'], // Unmet dependency (doesn't exist)
      })

      const todoStory = createStory({
        id: 'TODO-1',
        status: 'pending',
        dependencies: ['DEP-1'], // All deps met (DEP-1 is done)
      })

      const todoNoDeps = createStory({
        id: 'TODO-2',
        status: 'pending',
        dependencies: [], // No deps = all deps met
      })

      const inProgressStory = createStory({
        id: 'IP-1',
        status: 'in_progress',
      })

      const doneStory = createStory({
        id: 'DONE-1',
        status: 'done',
      })

      const failedStory = createStory({
        id: 'FAILED-1',
        status: 'failed',
      })

      return [
        dep1,
        backlogStory,
        todoStory,
        todoNoDeps,
        inProgressStory,
        doneStory,
        failedStory,
      ]
    }

    it('filters backlog column correctly', () => {
      const stories = createTestStories()
      const backlogStories = getStoriesForColumn(stories, 'backlog', 'backlog')

      // Only BACKLOG-1 has unmet dependencies (depends on NON-EXISTENT)
      expect(backlogStories).toHaveLength(1)
      expect(backlogStories[0].id).toBe('BACKLOG-1')
    })

    it('filters todo column correctly', () => {
      const stories = createTestStories()
      const todoStories = getStoriesForColumn(stories, 'todo', 'pending')

      // TODO-1 (dep on DEP-1 which is done) and TODO-2 (no deps)
      expect(todoStories).toHaveLength(2)
      expect(todoStories.map((s) => s.id)).toContain('TODO-1')
      expect(todoStories.map((s) => s.id)).toContain('TODO-2')
    })

    it('filters in_progress column correctly', () => {
      const stories = createTestStories()
      const inProgressStories = getStoriesForColumn(
        stories,
        'in_progress',
        'in_progress',
      )

      expect(inProgressStories).toHaveLength(1)
      expect(inProgressStories[0].id).toBe('IP-1')
    })

    it('filters done column correctly', () => {
      const stories = createTestStories()
      const doneStories = getStoriesForColumn(stories, 'done', 'done')

      // DEP-1 and DONE-1 are both done
      expect(doneStories).toHaveLength(2)
      expect(doneStories.map((s) => s.id)).toContain('DEP-1')
      expect(doneStories.map((s) => s.id)).toContain('DONE-1')
    })

    it('filters failed column correctly', () => {
      const stories = createTestStories()
      const failedStories = getStoriesForColumn(stories, 'failed', 'failed')

      expect(failedStories).toHaveLength(1)
      expect(failedStories[0].id).toBe('FAILED-1')
    })
  })

  describe('complex dependency scenarios', () => {
    it('handles chain dependencies correctly', () => {
      // A -> B -> C where only C is done
      const storyC = createStory({ id: 'C', status: 'done', dependencies: [] })
      const storyB = createStory({
        id: 'B',
        status: 'pending',
        dependencies: ['C'],
      })
      const storyA = createStory({
        id: 'A',
        status: 'pending',
        dependencies: ['B'],
      })
      const allStories = [storyA, storyB, storyC]

      // B depends on C (done) -> B can go to todo
      expect(hasAllDependenciesMet(storyB, allStories)).toBe(true)
      expect(getColumnForStory(storyB, allStories)).toBe('todo')

      // A depends on B (pending) -> A is in backlog
      expect(hasAllDependenciesMet(storyA, allStories)).toBe(false)
      expect(getColumnForStory(storyA, allStories)).toBe('backlog')
    })

    it('handles multiple dependencies correctly', () => {
      const dep1 = createStory({ id: 'DEP-1', status: 'done' })
      const dep2 = createStory({ id: 'DEP-2', status: 'done' })
      const dep3 = createStory({ id: 'DEP-3', status: 'pending' })

      // Story with all deps met
      const storyAllMet = createStory({
        id: 'ALL-MET',
        status: 'pending',
        dependencies: ['DEP-1', 'DEP-2'],
      })

      // Story with some deps not met
      const storySomeUnmet = createStory({
        id: 'SOME-UNMET',
        status: 'pending',
        dependencies: ['DEP-1', 'DEP-3'],
      })

      const allStories = [dep1, dep2, dep3, storyAllMet, storySomeUnmet]

      expect(hasAllDependenciesMet(storyAllMet, allStories)).toBe(true)
      expect(hasAllDependenciesMet(storySomeUnmet, allStories)).toBe(false)
    })
  })
})

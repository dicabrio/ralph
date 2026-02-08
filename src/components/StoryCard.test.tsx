import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryCard, Story, StoryStatus } from './StoryCard'

// Helper to create a story with optional overrides
function createStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'TEST-001',
    title: 'Test Story Title',
    description: 'Test story description',
    priority: 1,
    status: 'pending' as StoryStatus,
    epic: 'Testing',
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
    ...overrides,
  }
}

describe('StoryCard', () => {
  describe('rendering', () => {
    it('renders story ID', () => {
      const story = createStory({ id: 'API-007' })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('story-id')).toHaveTextContent('API-007')
    })

    it('renders story title', () => {
      const story = createStory({ title: 'Implement user authentication' })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('story-title')).toHaveTextContent(
        'Implement user authentication',
      )
    })

    it('renders priority badge', () => {
      const story = createStory({ priority: 5 })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('priority-badge')).toHaveTextContent('P5')
    })

    it('renders epic label', () => {
      const story = createStory({ epic: 'Authentication' })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('story-epic')).toHaveTextContent(
        'Authentication',
      )
    })
  })

  describe('dependencies', () => {
    it('renders dependency badges when story has dependencies', () => {
      const story = createStory({
        dependencies: ['API-001', 'API-002'],
      })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('dependencies')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-API-001')).toHaveTextContent(
        'API-001',
      )
      expect(screen.getByTestId('dependency-API-002')).toHaveTextContent(
        'API-002',
      )
    })

    it('does not render dependencies section when story has no dependencies', () => {
      const story = createStory({ dependencies: [] })
      render(<StoryCard story={story} />)

      expect(screen.queryByTestId('dependencies')).not.toBeInTheDocument()
    })

    it('renders single dependency correctly', () => {
      const story = createStory({ dependencies: ['SETUP-001'] })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('dependency-SETUP-001')).toBeInTheDocument()
    })
  })

  describe('failed status', () => {
    it('renders failed badge when status is failed', () => {
      const story = createStory({ status: 'failed' })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('failed-badge')).toBeInTheDocument()
      expect(screen.getByTestId('failed-badge')).toHaveTextContent('Failed')
    })

    it('does not render failed badge when status is pending', () => {
      const story = createStory({ status: 'pending' })
      render(<StoryCard story={story} />)

      expect(screen.queryByTestId('failed-badge')).not.toBeInTheDocument()
    })

    it('does not render failed badge when status is in_progress', () => {
      const story = createStory({ status: 'in_progress' })
      render(<StoryCard story={story} />)

      expect(screen.queryByTestId('failed-badge')).not.toBeInTheDocument()
    })

    it('does not render failed badge when status is done', () => {
      const story = createStory({ status: 'done' })
      render(<StoryCard story={story} />)

      expect(screen.queryByTestId('failed-badge')).not.toBeInTheDocument()
    })

    it('applies failed styling to card when status is failed', () => {
      const story = createStory({ status: 'failed' })
      render(<StoryCard story={story} />)

      const card = screen.getByTestId('story-card')
      expect(card).toHaveClass('border-destructive/30')
      expect(card).toHaveClass('bg-destructive/5')
    })
  })

  describe('click handling', () => {
    it('calls onClick when card is clicked', () => {
      const onClick = vi.fn()
      const story = createStory()
      render(<StoryCard story={story} onClick={onClick} />)

      fireEvent.click(screen.getByTestId('story-card'))

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not add button role when onClick is not provided', () => {
      const story = createStory()
      render(<StoryCard story={story} />)

      const card = screen.getByTestId('story-card')
      expect(card).not.toHaveAttribute('role', 'button')
    })

    it('adds button role when onClick is provided', () => {
      const story = createStory()
      render(<StoryCard story={story} onClick={() => {}} />)

      const card = screen.getByTestId('story-card')
      expect(card).toHaveAttribute('role', 'button')
    })

    it('calls onClick when Enter key is pressed', () => {
      const onClick = vi.fn()
      const story = createStory()
      render(<StoryCard story={story} onClick={onClick} />)

      const card = screen.getByTestId('story-card')
      fireEvent.keyDown(card, { key: 'Enter' })

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('calls onClick when Space key is pressed', () => {
      const onClick = vi.fn()
      const story = createStory()
      render(<StoryCard story={story} onClick={onClick} />)

      const card = screen.getByTestId('story-card')
      fireEvent.keyDown(card, { key: ' ' })

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not call onClick for other keys', () => {
      const onClick = vi.fn()
      const story = createStory()
      render(<StoryCard story={story} onClick={onClick} />)

      const card = screen.getByTestId('story-card')
      fireEvent.keyDown(card, { key: 'Escape' })

      expect(onClick).not.toHaveBeenCalled()
    })

    it('has cursor-pointer class when onClick is provided', () => {
      const story = createStory()
      render(<StoryCard story={story} onClick={() => {}} />)

      const card = screen.getByTestId('story-card')
      expect(card).toHaveClass('cursor-pointer')
    })

    it('is focusable when onClick is provided', () => {
      const story = createStory()
      render(<StoryCard story={story} onClick={() => {}} />)

      const card = screen.getByTestId('story-card')
      expect(card).toHaveAttribute('tabIndex', '0')
    })

    it('is not focusable when onClick is not provided', () => {
      const story = createStory()
      render(<StoryCard story={story} />)

      const card = screen.getByTestId('story-card')
      expect(card).not.toHaveAttribute('tabIndex')
    })
  })

  describe('different story states', () => {
    it('renders pending story correctly', () => {
      const story = createStory({
        id: 'UI-007',
        title: 'Kanban story cards',
        priority: 21,
        status: 'pending',
        epic: 'Kanban',
        dependencies: ['UI-006'],
      })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('story-id')).toHaveTextContent('UI-007')
      expect(screen.getByTestId('story-title')).toHaveTextContent(
        'Kanban story cards',
      )
      expect(screen.getByTestId('priority-badge')).toHaveTextContent('P21')
      expect(screen.getByTestId('story-epic')).toHaveTextContent('Kanban')
      expect(screen.getByTestId('dependency-UI-006')).toBeInTheDocument()
      expect(screen.queryByTestId('failed-badge')).not.toBeInTheDocument()
    })

    it('renders in_progress story correctly', () => {
      const story = createStory({
        id: 'API-001',
        title: 'tRPC setup met TanStack Start',
        priority: 8,
        status: 'in_progress',
        epic: 'Core API',
        dependencies: ['SETUP-001'],
      })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('story-id')).toHaveTextContent('API-001')
      expect(screen.getByTestId('priority-badge')).toHaveTextContent('P8')
      expect(screen.queryByTestId('failed-badge')).not.toBeInTheDocument()
    })

    it('renders done story correctly', () => {
      const story = createStory({
        id: 'SETUP-001',
        title: 'TanStack Start project initialisatie',
        priority: 1,
        status: 'done',
        epic: 'Project Setup',
        dependencies: [],
      })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('story-id')).toHaveTextContent('SETUP-001')
      expect(screen.getByTestId('priority-badge')).toHaveTextContent('P1')
      expect(screen.queryByTestId('dependencies')).not.toBeInTheDocument()
      expect(screen.queryByTestId('failed-badge')).not.toBeInTheDocument()
    })

    it('renders failed story correctly', () => {
      const story = createStory({
        id: 'RUNNER-001',
        title: 'Runner process manager',
        priority: 32,
        status: 'failed',
        epic: 'Runner',
        dependencies: ['SETUP-003', 'DB-004'],
      })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('story-id')).toHaveTextContent('RUNNER-001')
      expect(screen.getByTestId('priority-badge')).toHaveTextContent('P32')
      expect(screen.getByTestId('failed-badge')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-SETUP-003')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-DB-004')).toBeInTheDocument()
    })

    it('renders story with many dependencies', () => {
      const story = createStory({
        dependencies: ['A-001', 'B-002', 'C-003', 'D-004', 'E-005'],
      })
      render(<StoryCard story={story} />)

      expect(screen.getByTestId('dependencies')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-A-001')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-B-002')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-C-003')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-D-004')).toBeInTheDocument()
      expect(screen.getByTestId('dependency-E-005')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('is keyboard navigable when clickable', () => {
      const story = createStory()
      render(<StoryCard story={story} onClick={() => {}} />)

      const card = screen.getByTestId('story-card')
      expect(card).toHaveAttribute('tabIndex', '0')
      expect(card).toHaveAttribute('role', 'button')
    })
  })

  describe('drag handle styling', () => {
    it('has rounded corners on all sides by default', () => {
      const story = createStory()
      render(<StoryCard story={story} />)

      const card = screen.getByTestId('story-card')
      expect(card).toHaveClass('rounded-lg')
      expect(card).not.toHaveClass('rounded-l-none')
      expect(card).not.toHaveClass('border-l-0')
    })

    it('removes left border radius when hasDragHandle is true', () => {
      const story = createStory()
      render(<StoryCard story={story} hasDragHandle />)

      const card = screen.getByTestId('story-card')
      expect(card).toHaveClass('rounded-l-none')
      expect(card).toHaveClass('border-l-0')
    })

    it('has left border radius when hasDragHandle is false', () => {
      const story = createStory()
      render(<StoryCard story={story} hasDragHandle={false} />)

      const card = screen.getByTestId('story-card')
      expect(card).not.toHaveClass('rounded-l-none')
      expect(card).not.toHaveClass('border-l-0')
    })

    it('still has rounded-lg base class when hasDragHandle is true', () => {
      const story = createStory()
      render(<StoryCard story={story} hasDragHandle />)

      const card = screen.getByTestId('story-card')
      // The rounded-lg provides right-side corners, rounded-l-none removes left
      expect(card).toHaveClass('rounded-lg')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryDetailModal } from './StoryDetailModal'
import type { Story } from './StoryCard'

// Mock trpc
const mockInvalidate = vi.fn()
const mockMutate = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      stories: {
        listByProject: {
          invalidate: mockInvalidate,
        },
      },
    }),
    skills: {
      listByProject: {
        useQuery: () => ({
          data: [
            { id: 'frontend-design', name: 'Frontend Design' },
            { id: 'backend-development', name: 'Backend Development' },
            { id: 'database-design', name: 'Database Design' },
          ],
        }),
      },
    },
    stories: {
      updateSkills: {
        useMutation: () => ({
          mutate: mockMutate,
          isPending: false,
        }),
      },
    },
  },
}))

// Sample test data
const mockStory: Story = {
  id: 'UI-009',
  title: 'Story detail modal',
  description: 'Modal met volledige story details en edit mogelijkheden',
  priority: 23,
  status: 'in_progress',
  epic: 'Kanban',
  dependencies: ['UI-007', 'UI-008'],
  recommendedSkills: ['frontend-design'],
  acceptanceCriteria: [
    'Modal opent bij klik op story card',
    'Toont alle story velden',
    'Skills sectie: gekoppelde skills tonen',
  ],
}

const mockAllStories: Story[] = [
  mockStory,
  {
    id: 'UI-007',
    title: 'Kanban story cards',
    description: 'Story cards met alle relevante informatie',
    priority: 21,
    status: 'done',
    epic: 'Kanban',
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: [],
  },
  {
    id: 'UI-008',
    title: 'Kanban drag & drop',
    description: 'Drag & drop functionaliteit voor story cards',
    priority: 22,
    status: 'pending',
    epic: 'Kanban',
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: [],
  },
]

describe('StoryDetailModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    projectId: 1,
    story: mockStory,
    allStories: mockAllStories,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<StoryDetailModal {...defaultProps} isOpen={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders nothing when story is null', () => {
      render(<StoryDetailModal {...defaultProps} story={null} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders modal when isOpen is true and story is provided', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('displays story ID', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByText('UI-009')).toBeInTheDocument()
    })

    it('displays story title', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByText('Story detail modal')).toBeInTheDocument()
    })

    it('displays story description', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(
        screen.getByText('Modal met volledige story details en edit mogelijkheden'),
      ).toBeInTheDocument()
    })

    it('displays story priority badge', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByText('P23')).toBeInTheDocument()
    })

    it('displays story epic', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByText('Kanban')).toBeInTheDocument()
    })

    it('displays story status', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByText('In Progress')).toBeInTheDocument()
    })

    it('displays all acceptance criteria', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByText('Modal opent bij klik op story card')).toBeInTheDocument()
      expect(screen.getByText('Toont alle story velden')).toBeInTheDocument()
      expect(screen.getByText('Skills sectie: gekoppelde skills tonen')).toBeInTheDocument()
    })

    it('displays empty state when no acceptance criteria', () => {
      const storyNoAC = { ...mockStory, acceptanceCriteria: [] }
      render(<StoryDetailModal {...defaultProps} story={storyNoAC} />)
      expect(screen.getByText('No acceptance criteria defined')).toBeInTheDocument()
    })
  })

  describe('dependencies section', () => {
    it('displays dependencies with their status', () => {
      render(<StoryDetailModal {...defaultProps} />)

      // UI-007 is done
      expect(screen.getByTestId('dependency-story-UI-007')).toBeInTheDocument()
      expect(screen.getByText('Kanban story cards')).toBeInTheDocument()

      // UI-008 is pending
      expect(screen.getByTestId('dependency-story-UI-008')).toBeInTheDocument()
      expect(screen.getByText('Kanban drag & drop')).toBeInTheDocument()
    })

    it('shows "No dependencies" when story has no dependencies', () => {
      const storyNoDeps = { ...mockStory, dependencies: [] }
      render(<StoryDetailModal {...defaultProps} story={storyNoDeps} />)
      expect(screen.getByText('No dependencies')).toBeInTheDocument()
    })

    it('shows dependency status badges', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByText('Done')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  describe('skills section', () => {
    it('displays current skills as tags', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByTestId('skill-tag-frontend-design')).toBeInTheDocument()
    })

    it('shows "No skills assigned" when story has no skills', () => {
      const storyNoSkills = { ...mockStory, recommendedSkills: [] }
      render(<StoryDetailModal {...defaultProps} story={storyNoSkills} />)
      expect(screen.getByText('No skills assigned')).toBeInTheDocument()
    })

    it('renders remove skill button for each skill', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByTestId('remove-skill-frontend-design')).toBeInTheDocument()
    })

    it('calls updateSkills mutation when removing a skill', () => {
      render(<StoryDetailModal {...defaultProps} />)

      const removeButton = screen.getByTestId('remove-skill-frontend-design')
      fireEvent.click(removeButton)

      expect(mockMutate).toHaveBeenCalledWith({
        projectId: 1,
        storyId: 'UI-009',
        recommendedSkills: [],
      })
    })

    it('renders Add skill button', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByTestId('add-skill-button')).toBeInTheDocument()
    })

    it('shows skill input when Add skill is clicked', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))

      expect(screen.getByTestId('skill-input')).toBeInTheDocument()
      expect(screen.getByTestId('confirm-add-skill')).toBeInTheDocument()
      expect(screen.getByTestId('cancel-add-skill')).toBeInTheDocument()
    })

    it('shows suggested skills when adding', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))

      // Should show backend-development and database-design (frontend-design is already added)
      expect(screen.getByTestId('suggested-skill-backend-development')).toBeInTheDocument()
      expect(screen.getByTestId('suggested-skill-database-design')).toBeInTheDocument()
    })

    it('fills input when clicking suggested skill', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))
      fireEvent.click(screen.getByTestId('suggested-skill-backend-development'))

      expect(screen.getByTestId('skill-input')).toHaveValue('backend-development')
    })

    it('calls updateSkills mutation when adding a skill', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))
      fireEvent.change(screen.getByTestId('skill-input'), { target: { value: 'new-skill' } })
      fireEvent.click(screen.getByTestId('confirm-add-skill'))

      expect(mockMutate).toHaveBeenCalledWith({
        projectId: 1,
        storyId: 'UI-009',
        recommendedSkills: ['frontend-design', 'new-skill'],
      })
    })

    it('adds skill when pressing Enter', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))
      fireEvent.change(screen.getByTestId('skill-input'), { target: { value: 'new-skill' } })
      fireEvent.keyDown(screen.getByTestId('skill-input'), { key: 'Enter' })

      expect(mockMutate).toHaveBeenCalledWith({
        projectId: 1,
        storyId: 'UI-009',
        recommendedSkills: ['frontend-design', 'new-skill'],
      })
    })

    it('cancels adding skill when clicking cancel', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))
      expect(screen.getByTestId('skill-input')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('cancel-add-skill'))

      expect(screen.queryByTestId('skill-input')).not.toBeInTheDocument()
      expect(screen.getByTestId('add-skill-button')).toBeInTheDocument()
    })

    it('cancels adding skill when pressing Escape in input', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))
      fireEvent.keyDown(screen.getByTestId('skill-input'), { key: 'Escape' })

      expect(screen.queryByTestId('skill-input')).not.toBeInTheDocument()
    })

    it('does not add duplicate skill', () => {
      render(<StoryDetailModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('add-skill-button'))
      fireEvent.change(screen.getByTestId('skill-input'), { target: { value: 'frontend-design' } })
      fireEvent.keyDown(screen.getByTestId('skill-input'), { key: 'Enter' })

      // Should not call mutate since skill already exists
      expect(mockMutate).not.toHaveBeenCalled()
    })
  })

  describe('modal close behavior', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      render(<StoryDetailModal {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByTestId('close-button'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when clicking backdrop', () => {
      const onClose = vi.fn()
      render(<StoryDetailModal {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByTestId('modal-backdrop'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when pressing Escape', () => {
      const onClose = vi.fn()
      render(<StoryDetailModal {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('different story statuses', () => {
    it('displays pending status correctly', () => {
      const pendingStory = { ...mockStory, status: 'pending' as const }
      render(<StoryDetailModal {...defaultProps} story={pendingStory} />)
      // "Pending" may appear multiple times (story status + dependency status)
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    })

    it('displays done status correctly', () => {
      const doneStory = { ...mockStory, status: 'done' as const }
      render(<StoryDetailModal {...defaultProps} story={doneStory} />)
      // "Done" appears in both status badge and dependency status
      expect(screen.getAllByText('Done').length).toBeGreaterThan(0)
    })

    it('displays failed status correctly', () => {
      const failedStory = { ...mockStory, status: 'failed' as const }
      render(<StoryDetailModal {...defaultProps} story={failedStory} />)
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has correct role dialog', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('has aria-modal attribute', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('has aria-labelledby pointing to title', () => {
      render(<StoryDetailModal {...defaultProps} />)
      const dialog = screen.getByRole('dialog')
      const titleId = dialog.getAttribute('aria-labelledby')
      expect(document.getElementById(titleId!)).toHaveTextContent('Story detail modal')
    })

    it('close button has aria-label', () => {
      render(<StoryDetailModal {...defaultProps} />)
      expect(screen.getByTestId('close-button')).toHaveAttribute('aria-label', 'Close')
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryPreviewCard, type GeneratedStory } from './StoryPreviewCard'

const mockStory: GeneratedStory = {
  id: 'TEST-001',
  title: 'Test Story Title',
  description: 'Test story description with details',
  priority: 1,
  epic: 'Testing',
  dependencies: ['DEP-001', 'DEP-002'],
  recommendedSkills: ['frontend-design', 'api-design'],
  acceptanceCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3'],
}

describe('StoryPreviewCard', () => {
  describe('Rendering', () => {
    it('renders story ID', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('story-id')).toHaveTextContent('TEST-001')
    })

    it('renders story title', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('story-title')).toHaveTextContent(
        'Test Story Title',
      )
    })

    it('renders story description', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('story-description')).toHaveTextContent(
        'Test story description with details',
      )
    })

    it('renders priority badge', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('priority-badge')).toHaveTextContent('P1')
    })

    it('renders epic label', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('story-epic')).toHaveTextContent('Epic: Testing')
    })

    it('renders skills list', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      const skillsList = screen.getByTestId('skills-list')
      expect(skillsList).toBeInTheDocument()
      expect(skillsList).toHaveTextContent('frontend-design')
      expect(skillsList).toHaveTextContent('api-design')
    })

    it('renders dependencies list', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      const depsList = screen.getByTestId('dependencies-list')
      expect(depsList).toBeInTheDocument()
      expect(depsList).toHaveTextContent('DEP-001')
      expect(depsList).toHaveTextContent('DEP-002')
    })

    it('does not render skills list when empty', () => {
      const storyNoSkills = { ...mockStory, recommendedSkills: [] }
      render(
        <StoryPreviewCard
          story={storyNoSkills}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('skills-list')).not.toBeInTheDocument()
    })

    it('does not render dependencies list when empty', () => {
      const storyNoDeps = { ...mockStory, dependencies: [] }
      render(
        <StoryPreviewCard
          story={storyNoDeps}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('dependencies-list')).not.toBeInTheDocument()
    })
  })

  describe('Buttons', () => {
    it('renders edit button', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('edit-button')).toBeInTheDocument()
    })

    it('renders approve button', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('approve-button')).toBeInTheDocument()
    })

    it('calls onEdit when edit button is clicked', () => {
      const onEdit = vi.fn()
      render(
        <StoryPreviewCard story={mockStory} onEdit={onEdit} onApprove={vi.fn()} />,
      )
      fireEvent.click(screen.getByTestId('edit-button'))
      expect(onEdit).toHaveBeenCalledTimes(1)
    })

    it('calls onApprove when approve button is clicked', () => {
      const onApprove = vi.fn()
      render(
        <StoryPreviewCard story={mockStory} onEdit={vi.fn()} onApprove={onApprove} />,
      )
      fireEvent.click(screen.getByTestId('approve-button'))
      expect(onApprove).toHaveBeenCalledTimes(1)
    })
  })

  describe('Approving state', () => {
    it('shows loading state when isApproving is true', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          isApproving={true}
        />,
      )
      expect(screen.getByTestId('approve-button')).toHaveTextContent('Adding...')
    })

    it('disables approve button when isApproving is true', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          isApproving={true}
        />,
      )
      expect(screen.getByTestId('approve-button')).toBeDisabled()
    })
  })

  describe('Approved state', () => {
    it('shows approved badge when isApproved is true', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          isApproved={true}
        />,
      )
      expect(screen.getByTestId('approved-badge')).toBeInTheDocument()
      expect(screen.getByTestId('approved-badge')).toHaveTextContent('Added')
    })

    it('hides edit and approve buttons when isApproved is true', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          isApproved={true}
        />,
      )
      expect(screen.queryByTestId('edit-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('approve-button')).not.toBeInTheDocument()
    })
  })

  describe('Acceptance Criteria', () => {
    it('renders toggle button for criteria', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.getByTestId('toggle-criteria')).toBeInTheDocument()
      expect(screen.getByTestId('toggle-criteria')).toHaveTextContent(
        '3 Acceptance Criteria',
      )
    })

    it('criteria list is collapsed by default', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('criteria-list')).not.toBeInTheDocument()
    })

    it('expands criteria list when toggle is clicked', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByTestId('toggle-criteria'))
      expect(screen.getByTestId('criteria-list')).toBeInTheDocument()
    })

    it('displays all criteria when expanded', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByTestId('toggle-criteria'))
      const criteriaList = screen.getByTestId('criteria-list')
      expect(criteriaList).toHaveTextContent('Criterion 1')
      expect(criteriaList).toHaveTextContent('Criterion 2')
      expect(criteriaList).toHaveTextContent('Criterion 3')
    })

    it('collapses criteria when toggle is clicked again', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByTestId('toggle-criteria'))
      expect(screen.getByTestId('criteria-list')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('toggle-criteria'))
      expect(screen.queryByTestId('criteria-list')).not.toBeInTheDocument()
    })

    it('does not render toggle when no criteria', () => {
      const storyNoCriteria = { ...mockStory, acceptanceCriteria: [] }
      render(
        <StoryPreviewCard
          story={storyNoCriteria}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('toggle-criteria')).not.toBeInTheDocument()
    })
  })

  describe('Discard functionality', () => {
    it('renders discard button when onDiscard is provided', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDiscard={vi.fn()}
        />,
      )
      expect(screen.getByTestId('discard-button')).toBeInTheDocument()
    })

    it('does not render discard button when onDiscard is not provided', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('discard-button')).not.toBeInTheDocument()
    })

    it('calls onDiscard when discard button is clicked', () => {
      const onDiscard = vi.fn()
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDiscard={onDiscard}
        />,
      )
      fireEvent.click(screen.getByTestId('discard-button'))
      expect(onDiscard).toHaveBeenCalledTimes(1)
    })

    it('returns null when isDiscarded is true', () => {
      const { container } = render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDiscard={vi.fn()}
          isDiscarded={true}
        />,
      )
      expect(container.firstChild).toBeNull()
    })

    it('hides discard button when isApproved is true', () => {
      render(
        <StoryPreviewCard
          story={mockStory}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDiscard={vi.fn()}
          isApproved={true}
        />,
      )
      expect(screen.queryByTestId('discard-button')).not.toBeInTheDocument()
    })
  })
})

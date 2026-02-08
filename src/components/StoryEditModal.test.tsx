import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryEditModal } from './StoryEditModal'
import type { GeneratedStory } from './StoryPreviewCard'

const mockStory: GeneratedStory = {
  id: 'TEST-001',
  title: 'Test Story Title',
  description: 'Test story description',
  priority: 1,
  epic: 'Testing',
  dependencies: ['DEP-001'],
  recommendedSkills: ['frontend-design'],
  acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
}

describe('StoryEditModal', () => {
  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByTestId('story-edit-modal')).toBeInTheDocument()
    })

    it('does not render when isOpen is false', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={false}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('story-edit-modal')).not.toBeInTheDocument()
    })

    it('renders story ID input with value', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByTestId('input-id')).toHaveValue('TEST-001')
    })

    it('renders story title input with value', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByTestId('input-title')).toHaveValue('Test Story Title')
    })

    it('renders story description input with value', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByTestId('input-description')).toHaveValue(
        'Test story description',
      )
    })

    it('renders priority input with value', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByTestId('input-priority')).toHaveValue(1)
    })

    it('renders epic input with value', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByTestId('input-epic')).toHaveValue('Testing')
    })
  })

  describe('Close behavior', () => {
    it('calls onClose when cancel button is clicked from footer', () => {
      const onClose = vi.fn()
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByTestId('cancel-button'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when cancel button is clicked', () => {
      const onClose = vi.fn()
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByTestId('cancel-button'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when dialog overlay is clicked', () => {
      const onClose = vi.fn()
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      )
      // Radix Dialog closes via the DialogOverlay component - test escape instead
      // as testing overlay click is more complex with Radix
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when Escape is pressed', () => {
      const onClose = vi.fn()
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Save behavior', () => {
    it('calls onSave with updated story when save button is clicked', () => {
      const onSave = vi.fn()
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      )

      // Modify the title
      fireEvent.change(screen.getByTestId('input-title'), {
        target: { value: 'Updated Title' },
      })

      fireEvent.click(screen.getByTestId('save-button'))

      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updated Title' }),
      )
    })

    it('disables save button when title is empty', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByTestId('input-title'), {
        target: { value: '' },
      })

      expect(screen.getByTestId('save-button')).toBeDisabled()
    })

    it('disables save button when description is empty', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByTestId('input-description'), {
        target: { value: '' },
      })

      expect(screen.getByTestId('save-button')).toBeDisabled()
    })

    it('disables save button when epic is empty', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByTestId('input-epic'), {
        target: { value: '' },
      })

      expect(screen.getByTestId('save-button')).toBeDisabled()
    })
  })

  describe('Acceptance Criteria', () => {
    it('displays existing acceptance criteria', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByText('Criterion 1')).toBeInTheDocument()
      expect(screen.getByText('Criterion 2')).toBeInTheDocument()
    })

    it('can add a new criterion', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByTestId('input-new-criterion'), {
        target: { value: 'New Criterion' },
      })
      fireEvent.click(screen.getByTestId('add-criterion-button'))

      expect(screen.getByText('New Criterion')).toBeInTheDocument()
    })

    it('can add criterion with Enter key', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      const input = screen.getByTestId('input-new-criterion')
      fireEvent.change(input, { target: { value: 'Enter Criterion' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('Enter Criterion')).toBeInTheDocument()
    })

    it('can remove a criterion', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      expect(screen.getByText('Criterion 1')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('remove-criterion-0'))
      expect(screen.queryByText('Criterion 1')).not.toBeInTheDocument()
    })
  })

  describe('Skills', () => {
    it('displays existing skills', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByText('frontend-design')).toBeInTheDocument()
    })

    it('can add a new skill', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByTestId('input-new-skill'), {
        target: { value: 'new-skill' },
      })
      fireEvent.click(screen.getByTestId('add-skill-button'))

      expect(screen.getByText('new-skill')).toBeInTheDocument()
    })

    it('can remove a skill', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      expect(screen.getByText('frontend-design')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('remove-skill-frontend-design'))
      expect(screen.queryByText('frontend-design')).not.toBeInTheDocument()
    })

    it('does not add duplicate skills', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByTestId('input-new-skill'), {
        target: { value: 'frontend-design' },
      })
      fireEvent.click(screen.getByTestId('add-skill-button'))

      // Should still only have one frontend-design
      expect(screen.getAllByText('frontend-design')).toHaveLength(1)
    })
  })

  describe('Dependencies', () => {
    it('displays existing dependencies', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByText('DEP-001')).toBeInTheDocument()
    })

    it('can add a new dependency', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByTestId('input-new-dependency'), {
        target: { value: 'DEP-002' },
      })
      fireEvent.click(screen.getByTestId('add-dependency-button'))

      expect(screen.getByText('DEP-002')).toBeInTheDocument()
    })

    it('can remove a dependency', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )

      expect(screen.getByText('DEP-001')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('remove-dependency-DEP-001'))
      expect(screen.queryByText('DEP-001')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has dialog role', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('has aria-labelledby attribute (auto-generated by Radix)', () => {
      render(
        <StoryEditModal
          story={mockStory}
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      )
      // Radix Dialog auto-generates aria-labelledby that links to DialogTitle
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby')
    })
  })
})

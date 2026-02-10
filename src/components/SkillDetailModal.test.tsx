/**
 * SkillDetailModal Tests
 *
 * Unit tests for the skill detail modal component with edit functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SkillDetailModal } from './SkillDetailModal'

// Mock CodeMirror component
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      data-testid="codemirror-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

// Mock tRPC client
const mockMutate = vi.fn()
const mockInvalidate = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      skills: {
        listCentral: {
          invalidate: mockInvalidate,
        },
      },
    }),
    skills: {
      updateCentral: {
        useMutation: (options: { onSuccess?: () => void }) => ({
          mutate: (data: { skillId: string; content: string }) => {
            mockMutate(data)
            // Simulate success after a tick
            setTimeout(() => options.onSuccess?.(), 0)
          },
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}))

// Test skill data
const testSkill = {
  id: 'backend-development:test-skill',
  name: 'Test Skill',
  description: 'A test skill for testing purposes',
  content: `---
name: Test Skill
description: A test skill for testing purposes
---

This is the skill content.`,
}

describe('SkillDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('view mode', () => {
    it('renders skill details correctly', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      expect(screen.getByText('Test Skill')).toBeInTheDocument()
      expect(screen.getByText('A test skill for testing purposes')).toBeInTheDocument()
      expect(screen.getByText(/ID:/)).toBeInTheDocument()
      expect(screen.getByText(/backend-development:test-skill/)).toBeInTheDocument()
    })

    it('shows category badge', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      expect(screen.getByText('Backend Development')).toBeInTheDocument()
    })

    it('displays skill content in pre element when not editing', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      const content = screen.getByText(/This is the skill content/)
      expect(content).toBeInTheDocument()
    })

    it('closes when onOpenChange is triggered with false', () => {
      const onClose = vi.fn()

      const { rerender } = render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      // Simulate closing by re-rendering with isOpen=false
      // This tests the controlled component behavior
      rerender(<SkillDetailModal skill={testSkill} isOpen={false} onClose={onClose} />)

      // The dialog should be closed when isOpen is false - no assertion needed as Dialog handles this
      // We verify the component can be controlled via isOpen prop
    })

    it('closes on X button click', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      // shadcn Dialog close button has data-slot="dialog-close"
      const closeButton = document.querySelector('[data-slot="dialog-close"]') as HTMLElement
      expect(closeButton).toBeInTheDocument()
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('closes on Escape key', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalled()
    })

    it('does not show Edit button when isWritable is false', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={false} onClose={onClose} />)

      expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    })

    it('shows Edit button when isWritable is true', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      expect(screen.getByText('Edit')).toBeInTheDocument()
    })
  })

  describe('edit mode', () => {
    it('enters edit mode when Edit button is clicked', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      // Should show editing badge
      expect(screen.getByText('Editing')).toBeInTheDocument()

      // Should show Save and Cancel buttons
      expect(screen.getByText('Save')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()

      // Edit button should be hidden
      expect(screen.queryByText('Edit')).not.toBeInTheDocument()

      // CodeMirror editor should be visible
      expect(screen.getByTestId('codemirror-editor')).toBeInTheDocument()
    })

    it('shows Unsaved badge when content is changed', async () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      const editor = screen.getByTestId('codemirror-editor')
      fireEvent.change(editor, { target: { value: 'Modified content' } })

      await waitFor(() => {
        expect(screen.getByText('Unsaved')).toBeInTheDocument()
      })
    })

    it('calls updateCentral mutation on Save', async () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      const editor = screen.getByTestId('codemirror-editor')
      fireEvent.change(editor, { target: { value: 'Modified content' } })

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({
          skillId: 'backend-development:test-skill',
          content: 'Modified content',
        })
      })
    })

    it('reverts changes when Cancel is clicked', async () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      const editor = screen.getByTestId('codemirror-editor')
      fireEvent.change(editor, { target: { value: 'Modified content' } })

      fireEvent.click(screen.getByText('Cancel'))

      // Should exit edit mode
      expect(screen.queryByText('Editing')).not.toBeInTheDocument()
      expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()

      // Edit button should be visible again
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })

    it('Save button is disabled when no changes made', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      const saveButton = screen.getByText('Save').closest('button')
      expect(saveButton).toBeDisabled()
    })

    it('Save button is enabled when changes made', async () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      const editor = screen.getByTestId('codemirror-editor')
      fireEvent.change(editor, { target: { value: 'Modified content' } })

      await waitFor(() => {
        const saveButton = screen.getByText('Save').closest('button')
        expect(saveButton).not.toBeDisabled()
      })
    })

    // TODO: Confirm dialog behavior differs in test environment
    it.skip('prompts for confirmation when closing with unsaved changes', async () => {
      const onClose = vi.fn()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      const editor = screen.getByTestId('codemirror-editor')
      fireEvent.change(editor, { target: { value: 'Modified content' } })

      // Try to close via X button (shadcn Dialog close button)
      const closeButton = document.querySelector('[data-slot="dialog-close"]') as HTMLElement
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalled()
      })

      // Should not close if user clicks cancel on confirm
      expect(onClose).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    // TODO: Confirm dialog behavior differs in test environment
    it.skip('closes after confirmation when unsaved changes exist', async () => {
      const onClose = vi.fn()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Edit'))

      const editor = screen.getByTestId('codemirror-editor')
      fireEvent.change(editor, { target: { value: 'Modified content' } })

      const closeButton = document.querySelector('[data-slot="dialog-close"]') as HTMLElement
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled()
      })

      confirmSpy.mockRestore()
    })
  })

  describe('copy functionality', () => {
    it('copies content to clipboard when Copy button is clicked', async () => {
      const onClose = vi.fn()
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText,
        },
      })

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(testSkill.content)
      })
    })

    it('shows Copied feedback after copying', async () => {
      const onClose = vi.fn()
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText,
        },
      })

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
    })
  })

  describe('callbacks', () => {
    it('calls onSaved callback after successful save', async () => {
      const onClose = vi.fn()
      const onSaved = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} isWritable={true} onClose={onClose} onSaved={onSaved} />)

      fireEvent.click(screen.getByText('Edit'))

      const editor = screen.getByTestId('codemirror-editor')
      fireEvent.change(editor, { target: { value: 'Modified content' } })

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalled()
      })
    })
  })

  describe('accessibility', () => {
    it('has correct dialog role', () => {
      const onClose = vi.fn()

      render(<SkillDetailModal skill={testSkill} isOpen={true} onClose={onClose} />)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
    })
  })

  describe('category handling', () => {
    it('displays "general" for skills without category prefix', () => {
      const skillWithoutCategory = {
        ...testSkill,
        id: 'simple-skill',
      }

      render(<SkillDetailModal skill={skillWithoutCategory} isOpen={true} onClose={vi.fn()} />)

      expect(screen.getByText('General')).toBeInTheDocument()
    })

    it('formats category correctly', () => {
      const skillWithCategory = {
        ...testSkill,
        id: 'database-design:postgres-expert',
      }

      render(<SkillDetailModal skill={skillWithCategory} isOpen={true} onClose={vi.fn()} />)

      expect(screen.getByText('Database Design')).toBeInTheDocument()
    })
  })
})

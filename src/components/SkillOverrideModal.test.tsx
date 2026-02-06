import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SkillOverrideModal } from './SkillOverrideModal'

// Mock CodeMirror since it's complex to render in tests
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) => (
    <textarea
      data-testid="codemirror"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  EditorView: {
    lineWrapping: {},
  },
}))

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({}),
}))

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: {},
}))

// Create mock functions at module level
const mockInvalidate = vi.fn()
const mockCreateOverrideMutate = vi.fn()
const mockUpdateOverrideMutate = vi.fn()
const mockDeleteOverrideMutate = vi.fn()

// Mock the tRPC client
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      skills: {
        listByProject: { invalidate: mockInvalidate },
        diff: { invalidate: mockInvalidate },
      },
    }),
    skills: {
      diff: {
        useQuery: () => ({
          data: {
            original: '---\nname: Test Skill\ndescription: Original description\n---\n\nOriginal content here.',
            override: '---\nname: Test Skill\ndescription: Modified description\n---\n\nModified content here.',
            diff: '--- original\n+++ override\n @@ -1,4 +1,4 @@\n---\nname: Test Skill\n-description: Original description\n+description: Modified description\n---\n-Original content here.\n+Modified content here.',
            hasChanges: true,
          },
          isLoading: false,
          error: null,
        }),
      },
      getById: {
        useQuery: () => ({
          data: {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
            content: '---\nname: Test Skill\ndescription: Original description\n---\n\nOriginal content here.',
          },
          isLoading: false,
        }),
      },
      createOverride: {
        useMutation: () => ({
          mutate: mockCreateOverrideMutate,
          isPending: false,
          error: null,
        }),
      },
      updateOverride: {
        useMutation: () => ({
          mutate: mockUpdateOverrideMutate,
          isPending: false,
          error: null,
        }),
      },
      deleteOverride: {
        useMutation: () => ({
          mutate: mockDeleteOverrideMutate,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}))

const mockSkill = {
  id: 'backend-development:test-skill',
  name: 'Test Skill',
  description: 'A test skill for testing',
  content: '---\nname: Test Skill\ndescription: A test skill\n---\n\nContent here.',
  isOverride: false,
  hasOverride: false,
}

const mockOverrideSkill = {
  ...mockSkill,
  isOverride: true,
  hasOverride: true,
}

describe('SkillOverrideModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()
  const projectId = 1

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.confirm by default to return true
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders modal with skill name and description', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('Test Skill')).toBeInTheDocument()
    expect(screen.getByText('A test skill for testing')).toBeInTheDocument()
  })

  it('displays skill ID', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('ID: backend-development:test-skill')).toBeInTheDocument()
  })

  it('displays category badge with formatted name', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('Backend Development')).toBeInTheDocument()
  })

  it('shows "New Override" badge for non-override skills', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('New Override')).toBeInTheDocument()
  })

  it('shows "Override" badge in header for existing override skills', () => {
    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Use getAllByText since "Override" appears in header badge and in side panel label
    const overrideElements = screen.getAllByText('Override')
    expect(overrideElements.length).toBeGreaterThan(0)
    // First one should be the header badge with amber styling
    expect(overrideElements[0].className).toContain('amber')
  })

  it('closes modal when clicking backdrop', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const backdrop = screen.getByRole('dialog').querySelector('[aria-hidden="true"]')
    fireEvent.click(backdrop!)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('closes modal when clicking close button', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('closes modal when pressing Escape key', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('displays view mode toggle buttons', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('Side by Side')).toBeInTheDocument()
    expect(screen.getByText('Unified')).toBeInTheDocument()
  })

  it('shows save button with "Create Override" text for new overrides', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('Create Override')).toBeInTheDocument()
  })

  it('shows save button with "Save Override" text for existing overrides', () => {
    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('Save Override')).toBeInTheDocument()
  })

  it('shows "Revert to Original" button only for existing overrides', () => {
    const { rerender } = render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.queryByText('Revert to Original')).not.toBeInTheDocument()

    rerender(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('Revert to Original')).toBeInTheDocument()
  })

  it('switches between side-by-side and unified view modes', async () => {
    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Initially in side-by-side mode
    expect(screen.getByText('Original')).toBeInTheDocument()

    // Switch to unified mode
    fireEvent.click(screen.getByText('Unified'))

    // Wait for unified view to render
    await waitFor(() => {
      expect(screen.getByText('Changes')).toBeInTheDocument()
    })
  })

  it('displays accessibility attributes on modal', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'skill-override-modal-title')
  })

  it('renders original content panel in side-by-side view', () => {
    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('Original')).toBeInTheDocument()
  })

  it('handles general category for skills without category prefix', () => {
    const skillWithoutCategory = {
      ...mockSkill,
      id: 'simple-skill',
    }

    render(
      <SkillOverrideModal
        skill={skillWithoutCategory}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Should display 'General' as the category
    expect(screen.getByText('General')).toBeInTheDocument()
  })
})

describe('SkillOverrideModal confirmation dialogs', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()
  const projectId = 1

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('asks for confirmation when reverting to original', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const revertButton = screen.getByText('Revert to Original')
    fireEvent.click(revertButton)

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this override and revert to the original skill?')
  })

  it('calls deleteOverride mutation when revert is confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const revertButton = screen.getByText('Revert to Original')
    fireEvent.click(revertButton)

    expect(mockDeleteOverrideMutate).toHaveBeenCalledWith({
      projectId: 1,
      skillId: 'backend-development:test-skill',
    })
  })

  it('does not call deleteOverride mutation when revert is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const revertButton = screen.getByText('Revert to Original')
    fireEvent.click(revertButton)

    expect(mockDeleteOverrideMutate).not.toHaveBeenCalled()
  })
})

describe('SkillOverrideModal unsaved changes', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()
  const projectId = 1

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows "Unsaved" badge when content is modified', async () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Find the CodeMirror mock and change its value
    const editor = screen.getByTestId('codemirror')
    fireEvent.change(editor, { target: { value: 'Modified content' } })

    await waitFor(() => {
      expect(screen.getByText('Unsaved')).toBeInTheDocument()
    })
  })

  it('asks for confirmation when closing with unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Make a change
    const editor = screen.getByTestId('codemirror')
    fireEvent.change(editor, { target: { value: 'Modified content' } })

    // Wait for unsaved state
    await waitFor(() => {
      expect(screen.getByText('Unsaved')).toBeInTheDocument()
    })

    // Try to close
    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Discard them?')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('does not close when user cancels the confirmation dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Make a change
    const editor = screen.getByTestId('codemirror')
    fireEvent.change(editor, { target: { value: 'Modified content' } })

    // Wait for unsaved state
    await waitFor(() => {
      expect(screen.getByText('Unsaved')).toBeInTheDocument()
    })

    // Try to close
    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)

    expect(confirmSpy).toHaveBeenCalled()
    expect(mockOnClose).not.toHaveBeenCalled()
  })
})

describe('SkillOverrideModal save functionality', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()
  const projectId = 1

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders save button for new overrides', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Save button should be present with "Create Override" text
    const saveButton = screen.getByText('Create Override')
    expect(saveButton).toBeInTheDocument()
  })

  it('renders save button disabled initially for existing overrides (no changes yet)', () => {
    render(
      <SkillOverrideModal
        skill={mockOverrideSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Save button should be present but disabled when no changes are made
    const saveButton = screen.getByText('Save Override')
    expect(saveButton).toBeInTheDocument()
    expect(saveButton.closest('button')).toBeDisabled()
  })

  it('renders CodeMirror editor for editing', () => {
    render(
      <SkillOverrideModal
        skill={mockSkill}
        projectId={projectId}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // The editor (mocked as textarea) should be present
    const editor = screen.getByTestId('codemirror')
    expect(editor).toBeInTheDocument()
  })
})

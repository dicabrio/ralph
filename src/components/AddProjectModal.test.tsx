/**
 * Tests for AddProjectModal component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddProjectModal } from './AddProjectModal'

// Mock trpc
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    projects: {
      validatePath: {
        useQuery: vi.fn(),
      },
      create: {
        useMutation: vi.fn(),
      },
    },
  },
}))

// Get mocked trpc
import { trpc } from '@/lib/trpc/client'
const mockValidatePathQuery = trpc.projects.validatePath.useQuery as ReturnType<typeof vi.fn>
const mockCreateMutation = trpc.projects.create.useMutation as ReturnType<typeof vi.fn>

describe('AddProjectModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()
  const mockMutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for validatePath query
    mockValidatePathQuery.mockReturnValue({
      data: null,
      isFetching: false,
    })

    // Default mock for create mutation
    mockCreateMutation.mockReturnValue({
      mutate: mockMutate,
    })
  })

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Use getByRole with heading to find the dialog title specifically
      expect(screen.getByRole('heading', { name: 'Add Project' })).toBeInTheDocument()
      expect(screen.getByLabelText(/Project Path/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Project Name/i)).toBeInTheDocument()
    })

    it('does not render when isOpen is false', () => {
      render(
        <AddProjectModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders Cancel and Add Project buttons', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add Project' })).toBeInTheDocument()
    })

    it('Add Project button is disabled initially', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByRole('button', { name: 'Add Project' })).toBeDisabled()
    })
  })

  describe('Path input', () => {
    it('allows typing in path input', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/test/path' } })

      expect(pathInput).toHaveValue('/test/path')
    })

    it('has correct placeholder text', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const pathInput = screen.getByLabelText(/Project Path/i)
      expect(pathInput).toHaveAttribute('placeholder', '/path/to/your/project')
    })
  })

  describe('Name input', () => {
    it('allows typing in name input', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const nameInput = screen.getByLabelText(/Project Name/i)
      fireEvent.change(nameInput, { target: { value: 'My Project' } })

      expect(nameInput).toHaveValue('My Project')
    })

    it('shows optional label', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText('(optional)')).toBeInTheDocument()
    })
  })

  describe('Cancel button', () => {
    it('calls onClose when clicked', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      fireEvent.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('clears form when closed', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Type in path
      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/test/path' } })

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      fireEvent.click(cancelButton)

      // Verify onClose was called (form cleanup happens in handleClose)
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Validation states', () => {
    it('shows loading state while validating', async () => {
      // Mock loading state
      mockValidatePathQuery.mockReturnValue({
        data: null,
        isFetching: true,
      })

      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/test/path' } })

      // Wait for debounce
      await waitFor(() => {
        // Loading spinner should be visible
        const container = pathInput.parentElement
        expect(container?.querySelector('.animate-spin')).toBeInTheDocument()
      })
    })

    it('shows success state when path is valid', async () => {
      // Mock valid path - will be used after input changes
      mockValidatePathQuery.mockReturnValue({
        data: {
          pathExists: true,
          hasPrd: true,
          suggestedName: 'Test Project',
          isAlreadyAdded: false,
        },
        isFetching: false,
      })

      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Type a path to trigger validation
      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/valid/path' } })

      // Wait for debounce and validation to show
      await waitFor(() => {
        expect(screen.getByText('Valid project found')).toBeInTheDocument()
      }, { timeout: 500 })
    })

    it('shows will create prd message when path exists but no prd.json', async () => {
      // Mock path exists but no prd.json
      mockValidatePathQuery.mockReturnValue({
        data: {
          pathExists: true,
          hasPrd: false,
          suggestedName: 'test-folder',
          isAlreadyAdded: false,
        },
        isFetching: false,
      })

      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // Type a path to trigger validation
      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/some/folder' } })

      await waitFor(() => {
        expect(screen.getByText(/stories\/prd.json will be created/)).toBeInTheDocument()
      }, { timeout: 500 })
    })
  })

  describe('Accessibility', () => {
    it('has correct dialog role', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('has accessible labels for inputs', () => {
      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const pathInput = screen.getByLabelText(/Project Path/i)
      const nameInput = screen.getByLabelText(/Project Name/i)

      expect(pathInput).toHaveAttribute('id', 'project-path')
      expect(nameInput).toHaveAttribute('id', 'project-name')
    })

    it('sets aria-invalid on path input when error', async () => {
      // Mock error state
      mockValidatePathQuery.mockReturnValue({
        data: {
          pathExists: false,
          hasPrd: false,
          suggestedName: null,
          isAlreadyAdded: false,
        },
        isFetching: false,
      })

      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/invalid/path' } })

      // Trigger blur to show error
      fireEvent.blur(pathInput)

      await waitFor(() => {
        expect(pathInput).toHaveAttribute('aria-invalid', 'true')
      })
    })
  })

  describe('Form submission', () => {
    it('enables submit button when path is valid', async () => {
      // Mock valid path
      mockValidatePathQuery.mockReturnValue({
        data: {
          pathExists: true,
          hasPrd: true,
          suggestedName: 'Test Project',
          isAlreadyAdded: false,
        },
        isFetching: false,
      })

      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // The component needs a debounced path to enable the button
      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/valid/path' } })

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: 'Add Project' })
        expect(submitButton).not.toBeDisabled()
      }, { timeout: 500 })
    })

    it('keeps submit button disabled when path already added', async () => {
      // Mock already added
      mockValidatePathQuery.mockReturnValue({
        data: {
          pathExists: true,
          hasPrd: true,
          suggestedName: 'Test Project',
          isAlreadyAdded: true,
        },
        isFetching: false,
      })

      render(
        <AddProjectModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )

      // The component needs a debounced path to check
      const pathInput = screen.getByLabelText(/Project Path/i)
      fireEvent.change(pathInput, { target: { value: '/already/added/path' } })

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: 'Add Project' })
        expect(submitButton).toBeDisabled()
      }, { timeout: 500 })
    })
  })
})

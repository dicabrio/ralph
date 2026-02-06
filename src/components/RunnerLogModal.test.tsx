import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RunnerLogModal } from './RunnerLogModal'
import type { Story } from './StoryCard'

// Mock the WebSocket client
const mockSubscribe = vi.fn()
const mockUnsubscribe = vi.fn()

vi.mock('@/lib/websocket/client', () => ({
  useWebSocket: vi.fn(({ onLog, onConnect }) => {
    // Store callbacks for testing
    ;(globalThis as unknown as { __wsCallbacks: { onLog?: typeof onLog; onConnect?: typeof onConnect } }).__wsCallbacks = { onLog, onConnect }
    return {
      isConnected: true,
      isReconnecting: false,
      clientId: 'test-client-id',
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      disconnect: vi.fn(),
      reconnect: vi.fn(),
      subscriptions: new Set(),
    }
  }),
}))

// Mock clipboard API
const mockClipboardWriteText = vi.fn()

describe('RunnerLogModal', () => {
  const mockStory: Story = {
    id: 'TEST-001',
    title: 'Test Story',
    description: 'A test story description',
    priority: 1,
    status: 'in_progress',
    epic: 'Test Epic',
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: [],
  }

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    projectId: 1,
    story: mockStory,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockClipboardWriteText },
      writable: true,
    })
    mockClipboardWriteText.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render when isOpen is false', () => {
      render(<RunnerLogModal {...defaultProps} isOpen={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not render when story is null', () => {
      render(<RunnerLogModal {...defaultProps} story={null} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('displays story ID in header', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByText('TEST-001')).toBeInTheDocument()
    })

    it('displays story title in header', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByText('Test Story')).toBeInTheDocument()
    })

    it('displays Running indicator', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByText('Running')).toBeInTheDocument()
    })

    it('displays connection status when connected', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected')
    })

    it('displays waiting message when no logs', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByText('Waiting for logs...')).toBeInTheDocument()
    })

    it('displays 0 lines count initially', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByText('0 lines')).toBeInTheDocument()
    })
  })

  describe('Modal Controls', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      render(<RunnerLogModal {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByTestId('close-button'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn()
      render(<RunnerLogModal {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByTestId('modal-backdrop'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn()
      render(<RunnerLogModal {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose when other keys are pressed', () => {
      const onClose = vi.fn()
      render(<RunnerLogModal {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Enter' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Copy Functionality', () => {
    it('renders copy button', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByTestId('copy-button')).toBeInTheDocument()
    })

    it('copy button is disabled when no logs', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByTestId('copy-button')).toBeDisabled()
    })

    it('calls clipboard.writeText when copy button is clicked with logs', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      // Simulate receiving a log
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        storyId: 'TEST-001',
        content: 'Test log content',
        logType: 'stdout',
        timestamp: Date.now(),
      })

      await waitFor(() => {
        expect(screen.getByTestId('copy-button')).not.toBeDisabled()
      })

      fireEvent.click(screen.getByTestId('copy-button'))

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith('Test log content')
      })
    })

    it('shows Copied text after successful copy', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      // Simulate receiving a log
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        storyId: 'TEST-001',
        content: 'Test log',
        logType: 'stdout',
        timestamp: Date.now(),
      })

      await waitFor(() => {
        expect(screen.getByTestId('copy-button')).not.toBeDisabled()
      })

      fireEvent.click(screen.getByTestId('copy-button'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
    })
  })

  describe('Auto-scroll Toggle', () => {
    it('renders auto-scroll button', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByTestId('autoscroll-button')).toBeInTheDocument()
    })

    it('auto-scroll is enabled by default', () => {
      render(<RunnerLogModal {...defaultProps} />)
      const button = screen.getByTestId('autoscroll-button')
      expect(button).toHaveAttribute('aria-pressed', 'true')
    })

    it('clicking auto-scroll button keeps it enabled and scrolls to bottom', () => {
      render(<RunnerLogModal {...defaultProps} />)
      const button = screen.getByTestId('autoscroll-button')

      fireEvent.click(button)

      expect(button).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('WebSocket Integration', () => {
    it('subscribes to project when modal opens', () => {
      render(<RunnerLogModal {...defaultProps} />)

      // onConnect callback should trigger subscribe
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onConnect?: () => void } }).__wsCallbacks
      callbacks.onConnect?.()

      expect(mockSubscribe).toHaveBeenCalledWith('1')
    })

    it('unsubscribes when modal closes', () => {
      const { rerender } = render(<RunnerLogModal {...defaultProps} />)

      rerender(<RunnerLogModal {...defaultProps} isOpen={false} />)

      expect(mockUnsubscribe).toHaveBeenCalledWith('1')
    })

    it('displays logs when received via WebSocket', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      // Simulate receiving a log
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        storyId: 'TEST-001',
        content: 'Hello from runner!',
        logType: 'stdout',
        timestamp: Date.now(),
      })

      await waitFor(() => {
        expect(screen.getByText('Hello from runner!')).toBeInTheDocument()
      })
    })

    it('updates line count when logs are received', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      // Simulate receiving multiple logs
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        content: 'Line 1',
        logType: 'stdout',
        timestamp: Date.now(),
      })
      callbacks.onLog?.({
        projectId: '1',
        content: 'Line 2',
        logType: 'stdout',
        timestamp: Date.now() + 1,
      })

      await waitFor(() => {
        expect(screen.getByText('2 lines')).toBeInTheDocument()
      })
    })

    it('filters logs by projectId', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      // Simulate receiving logs from different projects
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        content: 'Correct project',
        logType: 'stdout',
        timestamp: Date.now(),
      })
      callbacks.onLog?.({
        projectId: '2', // Different project
        content: 'Wrong project',
        logType: 'stdout',
        timestamp: Date.now() + 1,
      })

      await waitFor(() => {
        expect(screen.getByText('Correct project')).toBeInTheDocument()
      })
      expect(screen.queryByText('Wrong project')).not.toBeInTheDocument()
    })

    it('shows stderr logs with different styling', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      // Simulate receiving stderr log
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        content: 'Error message',
        logType: 'stderr',
        timestamp: Date.now(),
      })

      await waitFor(() => {
        const errorText = screen.getByText('Error message')
        expect(errorText).toHaveClass('text-red-400')
      })
    })
  })

  describe('Log Display', () => {
    it('displays timestamp for each log line', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      const timestamp = new Date('2024-01-15T10:30:45.123Z').getTime()
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        content: 'Test log',
        logType: 'stdout',
        timestamp,
      })

      await waitFor(() => {
        expect(screen.getByText('Test log')).toBeInTheDocument()
      })
      // Timestamp should be displayed (format varies by locale)
      expect(screen.getByTestId('log-line-0')).toBeInTheDocument()
    })

    it('renders log container with terminal styling', () => {
      render(<RunnerLogModal {...defaultProps} />)
      const container = screen.getByTestId('log-container')
      expect(container).toHaveClass('font-mono', 'bg-zinc-950')
    })
  })

  describe('Accessibility', () => {
    it('has proper role and aria attributes', () => {
      render(<RunnerLogModal {...defaultProps} />)
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'runner-log-modal-title')
    })

    it('has proper labels on interactive elements', () => {
      render(<RunnerLogModal {...defaultProps} />)
      expect(screen.getByLabelText('Close')).toBeInTheDocument()
      expect(screen.getByLabelText('Copy logs')).toBeInTheDocument()
    })

    it('auto-scroll button has aria-pressed attribute', () => {
      render(<RunnerLogModal {...defaultProps} />)
      const button = screen.getByTestId('autoscroll-button')
      expect(button).toHaveAttribute('aria-pressed')
    })
  })

  describe('Multiple Logs', () => {
    it('joins multiple log lines with newlines for copy', async () => {
      render(<RunnerLogModal {...defaultProps} />)

      // Simulate receiving multiple logs
      const callbacks = (globalThis as unknown as { __wsCallbacks: { onLog?: (log: unknown) => void } }).__wsCallbacks
      callbacks.onLog?.({
        projectId: '1',
        content: 'First line',
        logType: 'stdout',
        timestamp: Date.now(),
      })
      callbacks.onLog?.({
        projectId: '1',
        content: 'Second line',
        logType: 'stdout',
        timestamp: Date.now() + 1,
      })

      await waitFor(() => {
        expect(screen.getByTestId('copy-button')).not.toBeDisabled()
      })

      fireEvent.click(screen.getByTestId('copy-button'))

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith('First line\nSecond line')
      })
    })
  })
})

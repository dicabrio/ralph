import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AlertTriangle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'

describe('AlertDialog', () => {
  it('renders trigger button', () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Dialog Title</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    )

    expect(screen.getByText('Open Dialog')).toBeInTheDocument()
  })

  it('opens dialog when trigger is clicked', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dialog Title</AlertDialogTitle>
            <AlertDialogDescription>Dialog description</AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Open Dialog'))

    await waitFor(() => {
      expect(screen.getByText('Dialog Title')).toBeInTheDocument()
      expect(screen.getByText('Dialog description')).toBeInTheDocument()
    })
  })

  it('closes dialog when cancel button is clicked', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dialog Title</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Open Dialog'))

    await waitFor(() => {
      expect(screen.getByText('Dialog Title')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Dialog Title')).not.toBeInTheDocument()
    })
  })

  it('calls action onClick when action button is clicked', async () => {
    const onAction = vi.fn()

    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onAction}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Open Dialog'))

    await waitFor(() => {
      expect(screen.getByText('Confirm Action')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Confirm'))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders with media icon', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangle className="w-8 h-8" data-testid="dialog-icon" />
            </AlertDialogMedia>
            <AlertDialogTitle>Warning</AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Open Dialog'))

    await waitFor(() => {
      expect(screen.getByTestId('dialog-icon')).toBeInTheDocument()
    })
  })

  it('renders with destructive action variant', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Delete Item</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Delete Item'))

    await waitFor(() => {
      expect(screen.getByText('Delete Confirmation')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })
  })

  it('respects disabled state on action button', async () => {
    const onAction = vi.fn()

    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disabled Action</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled onClick={onAction}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Open Dialog'))

    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument()
    })

    const confirmButton = screen.getByText('Confirm').closest('button')
    expect(confirmButton).toBeDisabled()
  })

  it('respects disabled state on cancel button', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disabled Cancel</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled>Cancel</AlertDialogCancel>
            <AlertDialogAction>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Open Dialog'))

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    const cancelButton = screen.getByText('Cancel').closest('button')
    expect(cancelButton).toBeDisabled()
  })

  it('controlled dialog state works correctly', async () => {
    const onOpenChange = vi.fn()

    render(
      <AlertDialog open={true} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Controlled Dialog</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    expect(screen.getByText('Controlled Dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Close'))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders with small size', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Small Dialog</AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Small Dialog</AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByText('Open Small Dialog'))

    await waitFor(() => {
      const content = screen.getByText('Small Dialog').closest('[data-slot="alert-dialog-content"]')
      expect(content).toHaveAttribute('data-size', 'sm')
    })
  })
})

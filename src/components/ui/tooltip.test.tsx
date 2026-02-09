import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

// Mock ResizeObserver which is not available in jsdom
beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

describe('Tooltip', () => {
  it('renders trigger content', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('shows tooltip content on hover', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByText('Hover me')
    fireEvent.mouseEnter(trigger)
    fireEvent.focus(trigger)

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument()
    })
  })

  it('renders with custom className', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent className="custom-class">Tooltip content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByText('Hover me')
    fireEvent.mouseEnter(trigger)
    fireEvent.focus(trigger)

    await waitFor(() => {
      // Check that the tooltip content element has the custom class
      const tooltipContent = document.querySelector('[data-slot="tooltip-content"]')
      expect(tooltipContent).toHaveClass('custom-class')
    })
  })

  it('works with button trigger', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>
            <span>Button Text</span>
          </TooltipTrigger>
          <TooltipContent>Button tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const button = screen.getByText('Button Text')
    fireEvent.mouseEnter(button)
    fireEvent.focus(button)

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument()
    })
  })

  it('has correct data-slot attributes', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByText('Trigger')
    expect(trigger).toHaveAttribute('data-slot', 'tooltip-trigger')
  })

  it('supports multiple tooltips with provider', () => {
    render(
      <TooltipProvider>
        <div>
          <Tooltip>
            <TooltipTrigger>First</TooltipTrigger>
            <TooltipContent>First tooltip</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>Second</TooltipTrigger>
            <TooltipContent>Second tooltip</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    )

    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReviewBadge } from './ReviewBadge'

describe('ReviewBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<ReviewBadge count={0} showTooltip={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders badge when count is greater than 0', () => {
    render(<ReviewBadge count={3} showTooltip={false} />)
    const badge = screen.getByText('3')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('aria-label', '3 stories in review')
  })

  it('renders with correct styling', () => {
    render(<ReviewBadge count={5} showTooltip={false} />)
    const badge = screen.getByText('5')
    expect(badge).toHaveClass('bg-amber-500')
    expect(badge).toHaveClass('text-white')
    expect(badge).toHaveClass('rounded-full')
  })

  it('applies custom className', () => {
    render(<ReviewBadge count={2} showTooltip={false} className="custom-class" />)
    const badge = screen.getByText('2')
    expect(badge).toHaveClass('custom-class')
  })

  it('renders with tooltip by default', () => {
    render(<ReviewBadge count={1} />)
    const badge = screen.getByText('1')
    expect(badge).toBeInTheDocument()
  })

  it('renders without tooltip when showTooltip is false', () => {
    render(<ReviewBadge count={1} showTooltip={false} />)
    const badge = screen.getByText('1')
    expect(badge).toBeInTheDocument()
  })

  it('displays correct singular aria-label for 1 story', () => {
    render(<ReviewBadge count={1} showTooltip={false} />)
    const badge = screen.getByText('1')
    expect(badge).toHaveAttribute('aria-label', '1 story in review')
  })

  it('displays correct plural aria-label for multiple stories', () => {
    render(<ReviewBadge count={5} showTooltip={false} />)
    const badge = screen.getByText('5')
    expect(badge).toHaveAttribute('aria-label', '5 stories in review')
  })
})

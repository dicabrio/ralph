import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunnerStatusIndicator } from './RunnerStatusIndicator'

describe('RunnerStatusIndicator', () => {
  it('renders idle status with gray color', () => {
    render(<RunnerStatusIndicator status="idle" showTooltip={false} />)
    const indicator = screen.getByLabelText('Runner status: Idle')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveClass('bg-gray-400')
  })

  it('renders running status with green color and pulse animation', () => {
    render(<RunnerStatusIndicator status="running" showTooltip={false} />)
    const indicator = screen.getByLabelText('Runner status: Running')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveClass('bg-green-500')
    expect(indicator).toHaveClass('animate-pulse')
  })

  it('renders stopping status with yellow color', () => {
    render(<RunnerStatusIndicator status="stopping" showTooltip={false} />)
    const indicator = screen.getByLabelText('Runner status: Stopping')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveClass('bg-yellow-500')
  })

  it('applies custom className', () => {
    render(<RunnerStatusIndicator status="idle" showTooltip={false} className="custom-class" />)
    const indicator = screen.getByLabelText('Runner status: Idle')
    expect(indicator).toHaveClass('custom-class')
  })

  it('renders with tooltip by default', () => {
    render(<RunnerStatusIndicator status="running" provider="claude" />)
    // With tooltip, the indicator is wrapped in tooltip components
    const indicator = screen.getByLabelText('Runner status: Running')
    expect(indicator).toBeInTheDocument()
  })

  it('renders without tooltip when showTooltip is false', () => {
    render(<RunnerStatusIndicator status="running" provider="claude" showTooltip={false} />)
    const indicator = screen.getByLabelText('Runner status: Running')
    expect(indicator).toBeInTheDocument()
  })
})

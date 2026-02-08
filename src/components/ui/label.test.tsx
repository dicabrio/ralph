import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Label } from './label'
import { Input } from './input'

describe('Label', () => {
  it('renders with text content', () => {
    render(<Label>Field Label</Label>)
    expect(screen.getByText('Field Label')).toBeInTheDocument()
  })

  it('renders with data-slot attribute', () => {
    render(<Label data-testid="label">Test</Label>)
    const label = screen.getByTestId('label')
    expect(label).toHaveAttribute('data-slot', 'label')
  })

  it('associates with input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="test-input">Email</Label>
        <Input id="test-input" type="email" />
      </>,
    )
    const label = screen.getByText('Email')
    const input = screen.getByRole('textbox')

    // Click on label should focus the input
    expect(label).toHaveAttribute('for', 'test-input')
    expect(input).toHaveAttribute('id', 'test-input')
  })

  it('applies custom className', () => {
    render(
      <Label className="custom-class text-lg" data-testid="label">
        Custom Label
      </Label>,
    )
    const label = screen.getByTestId('label')
    expect(label).toHaveClass('custom-class')
    expect(label).toHaveClass('text-lg')
  })

  it('renders children correctly', () => {
    render(
      <Label>
        <span>Required</span>
        <span className="text-destructive">*</span>
      </Label>,
    )
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('has correct base styling', () => {
    render(<Label data-testid="label">Styled Label</Label>)
    const label = screen.getByTestId('label')
    expect(label).toHaveClass('text-sm')
    expect(label).toHaveClass('font-medium')
  })
})

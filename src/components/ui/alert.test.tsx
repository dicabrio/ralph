import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from './alert'

describe('Alert', () => {
  it('renders with default variant', () => {
    render(
      <Alert>
        <AlertTitle>Default Alert</AlertTitle>
        <AlertDescription>This is a default alert message.</AlertDescription>
      </Alert>
    )

    expect(screen.getByText('Default Alert')).toBeInTheDocument()
    expect(screen.getByText('This is a default alert message.')).toBeInTheDocument()
  })

  it('renders with destructive variant', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Error Alert</AlertTitle>
        <AlertDescription>This is an error message.</AlertDescription>
      </Alert>
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('text-destructive')
  })

  it('renders with icon', () => {
    render(
      <Alert>
        <AlertCircle className="h-4 w-4" data-testid="alert-icon" />
        <AlertTitle>Alert with Icon</AlertTitle>
        <AlertDescription>This alert has an icon.</AlertDescription>
      </Alert>
    )

    expect(screen.getByTestId('alert-icon')).toBeInTheDocument()
  })

  it('has correct role attribute', () => {
    render(
      <Alert>
        <AlertTitle>Accessible Alert</AlertTitle>
      </Alert>
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('applies custom className to Alert', () => {
    render(
      <Alert className="custom-alert-class">
        <AlertTitle>Custom Class Alert</AlertTitle>
      </Alert>
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('custom-alert-class')
  })

  it('applies custom className to AlertTitle', () => {
    render(
      <Alert>
        <AlertTitle className="custom-title-class">Custom Title</AlertTitle>
      </Alert>
    )

    const title = screen.getByText('Custom Title')
    expect(title).toHaveClass('custom-title-class')
  })

  it('applies custom className to AlertDescription', () => {
    render(
      <Alert>
        <AlertDescription className="custom-desc-class">
          Custom Description
        </AlertDescription>
      </Alert>
    )

    const description = screen.getByText('Custom Description')
    expect(description).toHaveClass('custom-desc-class')
  })

  it('renders with success icon for success messages', () => {
    render(
      <Alert>
        <CheckCircle className="h-4 w-4 text-green-500" data-testid="success-icon" />
        <AlertTitle>Success!</AlertTitle>
        <AlertDescription>Operation completed successfully.</AlertDescription>
      </Alert>
    )

    expect(screen.getByTestId('success-icon')).toBeInTheDocument()
    expect(screen.getByText('Success!')).toBeInTheDocument()
  })

  it('renders with info icon for info messages', () => {
    render(
      <Alert>
        <Info className="h-4 w-4 text-blue-500" data-testid="info-icon" />
        <AlertTitle>Information</AlertTitle>
        <AlertDescription>Here is some helpful information.</AlertDescription>
      </Alert>
    )

    expect(screen.getByTestId('info-icon')).toBeInTheDocument()
    expect(screen.getByText('Information')).toBeInTheDocument()
  })

  it('renders with error icon for destructive variant', () => {
    render(
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" data-testid="error-icon" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Something went wrong.</AlertDescription>
      </Alert>
    )

    expect(screen.getByTestId('error-icon')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('text-destructive')
  })

  it('renders without title', () => {
    render(
      <Alert>
        <AlertDescription>Description only alert</AlertDescription>
      </Alert>
    )

    expect(screen.getByText('Description only alert')).toBeInTheDocument()
    expect(screen.queryByText('Title')).not.toBeInTheDocument()
  })

  it('renders without description', () => {
    render(
      <Alert>
        <AlertTitle>Title only alert</AlertTitle>
      </Alert>
    )

    expect(screen.getByText('Title only alert')).toBeInTheDocument()
  })
})

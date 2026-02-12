/**
 * Tests for Card components
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from './card'

describe('Card', () => {
  describe('Card', () => {
    it('renders with default props', () => {
      render(<Card>Card content</Card>)
      const card = screen.getByText('Card content')
      expect(card).toBeInTheDocument()
      expect(card).toHaveAttribute('data-slot', 'card')
    })

    it('applies custom className', () => {
      render(<Card className="custom-card">Content</Card>)
      const card = screen.getByText('Content')
      expect(card).toHaveClass('custom-card')
    })

    it('spreads additional props', () => {
      render(<Card data-testid="test-card">Content</Card>)
      expect(screen.getByTestId('test-card')).toBeInTheDocument()
    })
  })

  describe('CardHeader', () => {
    it('renders with default props', () => {
      render(<CardHeader>Header content</CardHeader>)
      const header = screen.getByText('Header content')
      expect(header).toBeInTheDocument()
      expect(header).toHaveAttribute('data-slot', 'card-header')
    })

    it('applies custom className', () => {
      render(<CardHeader className="custom-header">Content</CardHeader>)
      const header = screen.getByText('Content')
      expect(header).toHaveClass('custom-header')
    })
  })

  describe('CardTitle', () => {
    it('renders with default props', () => {
      render(<CardTitle>Title content</CardTitle>)
      const title = screen.getByText('Title content')
      expect(title).toBeInTheDocument()
      expect(title).toHaveAttribute('data-slot', 'card-title')
    })

    it('applies custom className', () => {
      render(<CardTitle className="custom-title">Title</CardTitle>)
      const title = screen.getByText('Title')
      expect(title).toHaveClass('custom-title')
    })

    it('has font-semibold class by default', () => {
      render(<CardTitle>Title</CardTitle>)
      const title = screen.getByText('Title')
      expect(title).toHaveClass('font-semibold')
    })
  })

  describe('CardDescription', () => {
    it('renders with default props', () => {
      render(<CardDescription>Description content</CardDescription>)
      const description = screen.getByText('Description content')
      expect(description).toBeInTheDocument()
      expect(description).toHaveAttribute('data-slot', 'card-description')
    })

    it('applies custom className', () => {
      render(<CardDescription className="custom-desc">Content</CardDescription>)
      const description = screen.getByText('Content')
      expect(description).toHaveClass('custom-desc')
    })

    it('has muted text styling by default', () => {
      render(<CardDescription>Description</CardDescription>)
      const description = screen.getByText('Description')
      expect(description).toHaveClass('text-muted-foreground')
    })
  })

  describe('CardAction', () => {
    it('renders with default props', () => {
      render(<CardAction>Action content</CardAction>)
      const action = screen.getByText('Action content')
      expect(action).toBeInTheDocument()
      expect(action).toHaveAttribute('data-slot', 'card-action')
    })

    it('applies custom className', () => {
      render(<CardAction className="custom-action">Content</CardAction>)
      const action = screen.getByText('Content')
      expect(action).toHaveClass('custom-action')
    })
  })

  describe('CardContent', () => {
    it('renders with default props', () => {
      render(<CardContent>Main content</CardContent>)
      const content = screen.getByText('Main content')
      expect(content).toBeInTheDocument()
      expect(content).toHaveAttribute('data-slot', 'card-content')
    })

    it('applies custom className', () => {
      render(<CardContent className="custom-content">Content</CardContent>)
      const content = screen.getByText('Content')
      expect(content).toHaveClass('custom-content')
    })

    it('has padding by default', () => {
      render(<CardContent>Content</CardContent>)
      const content = screen.getByText('Content')
      expect(content).toHaveClass('px-6')
    })
  })

  describe('CardFooter', () => {
    it('renders with default props', () => {
      render(<CardFooter>Footer content</CardFooter>)
      const footer = screen.getByText('Footer content')
      expect(footer).toBeInTheDocument()
      expect(footer).toHaveAttribute('data-slot', 'card-footer')
    })

    it('applies custom className', () => {
      render(<CardFooter className="custom-footer">Content</CardFooter>)
      const footer = screen.getByText('Content')
      expect(footer).toHaveClass('custom-footer')
    })

    it('has flex layout by default', () => {
      render(<CardFooter>Content</CardFooter>)
      const footer = screen.getByText('Content')
      expect(footer).toHaveClass('flex')
    })
  })

  describe('Composed Card', () => {
    it('renders complete card with all subcomponents', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card description goes here</CardDescription>
            <CardAction>Action Button</CardAction>
          </CardHeader>
          <CardContent>
            <p>This is the main content of the card.</p>
          </CardContent>
          <CardFooter>
            <span>Footer text</span>
          </CardFooter>
        </Card>
      )

      expect(screen.getByText('Card Title')).toBeInTheDocument()
      expect(screen.getByText('Card description goes here')).toBeInTheDocument()
      expect(screen.getByText('Action Button')).toBeInTheDocument()
      expect(screen.getByText('This is the main content of the card.')).toBeInTheDocument()
      expect(screen.getByText('Footer text')).toBeInTheDocument()
    })
  })
})

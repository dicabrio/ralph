/**
 * Tests for Button component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button, buttonVariants } from './button'

describe('Button', () => {
  describe('Rendering', () => {
    it('renders with default props', () => {
      render(<Button>Click me</Button>)
      const button = screen.getByRole('button', { name: 'Click me' })
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('data-slot', 'button')
    })

    it('renders children correctly', () => {
      render(<Button>Submit Form</Button>)
      expect(screen.getByText('Submit Form')).toBeInTheDocument()
    })

    it('renders as child element when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      )
      const link = screen.getByRole('link', { name: 'Link Button' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/test')
    })
  })

  describe('Variants', () => {
    it('applies default variant', () => {
      render(<Button>Default</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'default')
    })

    it('applies destructive variant', () => {
      render(<Button variant="destructive">Delete</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'destructive')
    })

    it('applies outline variant', () => {
      render(<Button variant="outline">Outline</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'outline')
    })

    it('applies secondary variant', () => {
      render(<Button variant="secondary">Secondary</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'secondary')
    })

    it('applies ghost variant', () => {
      render(<Button variant="ghost">Ghost</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'ghost')
    })

    it('applies link variant', () => {
      render(<Button variant="link">Link</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'link')
    })
  })

  describe('Sizes', () => {
    it('applies default size', () => {
      render(<Button>Default Size</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'default')
    })

    it('applies xs size', () => {
      render(<Button size="xs">XS Size</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'xs')
    })

    it('applies sm size', () => {
      render(<Button size="sm">SM Size</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'sm')
    })

    it('applies lg size', () => {
      render(<Button size="lg">LG Size</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'lg')
    })

    it('applies icon size', () => {
      render(<Button size="icon">Icon</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'icon')
    })

    it('applies icon-xs size', () => {
      render(<Button size="icon-xs">Icon XS</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'icon-xs')
    })

    it('applies icon-sm size', () => {
      render(<Button size="icon-sm">Icon SM</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'icon-sm')
    })

    it('applies icon-lg size', () => {
      render(<Button size="icon-lg">Icon LG</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'icon-lg')
    })
  })

  describe('States', () => {
    it('applies disabled state', () => {
      render(<Button disabled>Disabled</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('does not trigger onClick when disabled', () => {
      const onClick = vi.fn()
      render(<Button disabled onClick={onClick}>Disabled</Button>)
      const button = screen.getByRole('button')
      fireEvent.click(button)
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe('Click handling', () => {
    it('calls onClick when clicked', () => {
      const onClick = vi.fn()
      render(<Button onClick={onClick}>Click me</Button>)
      const button = screen.getByRole('button')
      fireEvent.click(button)
      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('Custom className', () => {
    it('applies custom className', () => {
      render(<Button className="custom-class">Custom</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })

    it('merges custom className with default classes', () => {
      render(<Button className="my-class">Merge</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('my-class')
      expect(button).toHaveClass('inline-flex')
    })
  })

  describe('Button types', () => {
    it('defaults to button type', () => {
      render(<Button>Button</Button>)
      const button = screen.getByRole('button')
      expect(button).not.toHaveAttribute('type', 'submit')
    })

    it('accepts submit type', () => {
      render(<Button type="submit">Submit</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('type', 'submit')
    })

    it('accepts reset type', () => {
      render(<Button type="reset">Reset</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('type', 'reset')
    })
  })

  describe('buttonVariants helper', () => {
    it('generates correct classes for default variant', () => {
      const classes = buttonVariants({ variant: 'default' })
      expect(classes).toContain('bg-primary')
    })

    it('generates correct classes for destructive variant', () => {
      const classes = buttonVariants({ variant: 'destructive' })
      expect(classes).toContain('bg-destructive')
    })

    it('generates correct classes for sm size', () => {
      const classes = buttonVariants({ size: 'sm' })
      expect(classes).toContain('h-8')
    })
  })
})

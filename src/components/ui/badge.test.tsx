/**
 * Tests for Badge component
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge, badgeVariants } from './badge'

describe('Badge', () => {
  describe('Rendering', () => {
    it('renders with default props', () => {
      render(<Badge>Default Badge</Badge>)
      const badge = screen.getByText('Default Badge')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveAttribute('data-slot', 'badge')
    })

    it('renders children correctly', () => {
      render(<Badge>Status: Active</Badge>)
      expect(screen.getByText('Status: Active')).toBeInTheDocument()
    })

    it('renders as child element when asChild is true', () => {
      render(
        <Badge asChild>
          <a href="/test">Link Badge</a>
        </Badge>
      )
      const link = screen.getByRole('link', { name: 'Link Badge' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/test')
    })
  })

  describe('Variants', () => {
    it('applies default variant', () => {
      render(<Badge>Default</Badge>)
      const badge = screen.getByText('Default')
      expect(badge).toHaveAttribute('data-variant', 'default')
    })

    it('applies secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>)
      const badge = screen.getByText('Secondary')
      expect(badge).toHaveAttribute('data-variant', 'secondary')
    })

    it('applies destructive variant', () => {
      render(<Badge variant="destructive">Error</Badge>)
      const badge = screen.getByText('Error')
      expect(badge).toHaveAttribute('data-variant', 'destructive')
    })

    it('applies outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>)
      const badge = screen.getByText('Outline')
      expect(badge).toHaveAttribute('data-variant', 'outline')
    })

    it('applies ghost variant', () => {
      render(<Badge variant="ghost">Ghost</Badge>)
      const badge = screen.getByText('Ghost')
      expect(badge).toHaveAttribute('data-variant', 'ghost')
    })

    it('applies link variant', () => {
      render(<Badge variant="link">Link</Badge>)
      const badge = screen.getByText('Link')
      expect(badge).toHaveAttribute('data-variant', 'link')
    })
  })

  describe('Status variants (story statuses)', () => {
    it('applies pending variant', () => {
      render(<Badge variant="pending">Pending</Badge>)
      const badge = screen.getByText('Pending')
      expect(badge).toHaveAttribute('data-variant', 'pending')
      expect(badge).toHaveClass('bg-amber-100')
    })

    it('applies in_progress variant', () => {
      render(<Badge variant="in_progress">In Progress</Badge>)
      const badge = screen.getByText('In Progress')
      expect(badge).toHaveAttribute('data-variant', 'in_progress')
      expect(badge).toHaveClass('bg-blue-100')
    })

    it('applies done variant', () => {
      render(<Badge variant="done">Done</Badge>)
      const badge = screen.getByText('Done')
      expect(badge).toHaveAttribute('data-variant', 'done')
      expect(badge).toHaveClass('bg-emerald-100')
    })

    it('applies failed variant', () => {
      render(<Badge variant="failed">Failed</Badge>)
      const badge = screen.getByText('Failed')
      expect(badge).toHaveAttribute('data-variant', 'failed')
      expect(badge).toHaveClass('bg-red-100')
    })

    it('applies backlog variant', () => {
      render(<Badge variant="backlog">Backlog</Badge>)
      const badge = screen.getByText('Backlog')
      expect(badge).toHaveAttribute('data-variant', 'backlog')
      expect(badge).toHaveClass('bg-slate-100')
    })
  })

  describe('Custom className', () => {
    it('applies custom className', () => {
      render(<Badge className="custom-class">Custom</Badge>)
      const badge = screen.getByText('Custom')
      expect(badge).toHaveClass('custom-class')
    })

    it('merges custom className with default classes', () => {
      render(<Badge className="my-class">Merge</Badge>)
      const badge = screen.getByText('Merge')
      expect(badge).toHaveClass('my-class')
      expect(badge).toHaveClass('inline-flex')
    })
  })

  describe('badgeVariants helper', () => {
    it('generates correct classes for default variant', () => {
      const classes = badgeVariants({ variant: 'default' })
      expect(classes).toContain('bg-primary')
    })

    it('generates correct classes for destructive variant', () => {
      const classes = badgeVariants({ variant: 'destructive' })
      expect(classes).toContain('bg-destructive')
    })

    it('generates correct classes for status variants', () => {
      expect(badgeVariants({ variant: 'pending' })).toContain('bg-amber-100')
      expect(badgeVariants({ variant: 'in_progress' })).toContain('bg-blue-100')
      expect(badgeVariants({ variant: 'done' })).toContain('bg-emerald-100')
      expect(badgeVariants({ variant: 'failed' })).toContain('bg-red-100')
      expect(badgeVariants({ variant: 'backlog' })).toContain('bg-slate-100')
    })
  })
})

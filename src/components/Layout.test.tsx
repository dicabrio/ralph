import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Layout } from './Layout'

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    onClick,
    className,
  }: {
    children: React.ReactNode
    to: string
    onClick?: () => void
    className?: string
  }) => (
    <a href={to} onClick={onClick} className={className} data-testid={`link-${to}`}>
      {children}
    </a>
  ),
  useRouterState: () => ({
    location: {
      pathname: '/',
    },
  }),
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia
const mockMatchMedia = vi.fn()

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)

    // Default to desktop view
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? false : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    window.matchMedia = mockMatchMedia

    // Default to desktop width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders children content', () => {
    render(
      <Layout>
        <div data-testid="child-content">Test Content</div>
      </Layout>
    )

    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('renders sidebar on desktop', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Brainstorm')).toBeInTheDocument()
    expect(screen.getByText('Prompts')).toBeInTheDocument()
  })

  it('renders sidebar with correct navigation items', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    // There are two links to "/" (logo and Dashboard nav item)
    const homeLinks = screen.getAllByTestId('link-/')
    expect(homeLinks.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('link-/brainstorm')).toBeInTheDocument()
    expect(screen.getByTestId('link-/prompts')).toBeInTheDocument()
  })

  it('renders Ralph brand name in sidebar', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByText('Ralph')).toBeInTheDocument()
  })

  it('renders collapse toggle button', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(
      screen.getByRole('button', { name: /collapse sidebar/i })
    ).toBeInTheDocument()
  })

  it('toggles sidebar collapsed state when toggle is clicked', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    const toggleButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    })
    fireEvent.click(toggleButton)

    // After collapse, button text should change to expand
    expect(
      screen.getByRole('button', { name: /expand sidebar/i })
    ).toBeInTheDocument()
  })

  it('persists collapsed state to localStorage', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    const toggleButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    })
    fireEvent.click(toggleButton)

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'sidebar-collapsed',
      'true'
    )
  })

  it('applies main content margin based on sidebar state', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    const main = document.querySelector('main')
    expect(main).toHaveClass('pl-64') // Default expanded width
  })
})

describe('Layout responsive behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)

    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    window.matchMedia = mockMatchMedia
  })

  it('shows mobile header on small screens', () => {
    // Set mobile width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    })

    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    // Trigger resize event
    fireEvent(window, new Event('resize'))

    // On mobile, there should be a hamburger menu button
    const menuButton = screen.getByRole('button', { name: /open menu/i })
    expect(menuButton).toBeInTheDocument()
  })

  it('opens mobile sidebar when menu button is clicked', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    })

    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    // Trigger resize to ensure mobile state
    fireEvent(window, new Event('resize'))

    const menuButton = screen.getByRole('button', { name: /open menu/i })
    fireEvent.click(menuButton)

    // Sidebar should now be visible with navigation items
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})

describe('Layout dark mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('adds dark class when system prefers dark mode', () => {
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    window.matchMedia = mockMatchMedia

    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not add dark class when system prefers light mode', () => {
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    window.matchMedia = mockMatchMedia

    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

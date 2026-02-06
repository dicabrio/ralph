import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar, useSidebar } from './Sidebar'
import { renderHook, act } from '@testing-library/react'

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

describe('Sidebar', () => {
  const defaultProps = {
    isCollapsed: false,
    onToggle: vi.fn(),
    isMobile: false,
    isOpen: true,
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders navigation items', () => {
    render(<Sidebar {...defaultProps} />)

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Brainstorm')).toBeInTheDocument()
    expect(screen.getByText('Prompts')).toBeInTheDocument()
  })

  it('renders logo and brand name', () => {
    render(<Sidebar {...defaultProps} />)

    expect(screen.getByText('Ralph')).toBeInTheDocument()
  })

  it('shows collapse toggle button on desktop', () => {
    render(<Sidebar {...defaultProps} isMobile={false} />)

    const toggleButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    })
    expect(toggleButton).toBeInTheDocument()
  })

  it('does not show collapse toggle on mobile', () => {
    render(<Sidebar {...defaultProps} isMobile={true} />)

    expect(
      screen.queryByRole('button', { name: /collapse sidebar/i })
    ).not.toBeInTheDocument()
  })

  it('calls onToggle when collapse button is clicked', () => {
    const onToggle = vi.fn()
    render(<Sidebar {...defaultProps} onToggle={onToggle} />)

    const toggleButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    })
    fireEvent.click(toggleButton)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows expand button when collapsed', () => {
    render(<Sidebar {...defaultProps} isCollapsed={true} />)

    expect(
      screen.getByRole('button', { name: /expand sidebar/i })
    ).toBeInTheDocument()
  })

  it('calls onClose when nav link is clicked on mobile', () => {
    const onClose = vi.fn()
    render(<Sidebar {...defaultProps} isMobile={true} onClose={onClose} />)

    // There are two links to "/" (logo and Dashboard nav item), get the nav item
    const dashboardLinks = screen.getAllByTestId('link-/')
    const dashboardNavLink = dashboardLinks.find(link =>
      link.textContent?.includes('Dashboard')
    )
    if (dashboardNavLink) {
      fireEvent.click(dashboardNavLink)
    }

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows overlay on mobile when open', () => {
    render(<Sidebar {...defaultProps} isMobile={true} isOpen={true} />)

    // Overlay should be present - it has aria-hidden="true"
    const overlay = document.querySelector('[aria-hidden="true"]')
    expect(overlay).toBeInTheDocument()
  })

  it('calls onClose when overlay is clicked on mobile', () => {
    const onClose = vi.fn()
    render(<Sidebar {...defaultProps} isMobile={true} isOpen={true} onClose={onClose} />)

    const overlay = document.querySelector('[aria-hidden="true"]')
    if (overlay) {
      fireEvent.click(overlay)
    }

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not render when mobile and not open', () => {
    render(<Sidebar {...defaultProps} isMobile={true} isOpen={false} />)

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('has correct width class when collapsed', () => {
    render(<Sidebar {...defaultProps} isCollapsed={true} />)

    const sidebar = document.querySelector('aside')
    expect(sidebar).toHaveClass('w-16')
  })

  it('has correct width class when expanded', () => {
    render(<Sidebar {...defaultProps} isCollapsed={false} />)

    const sidebar = document.querySelector('aside')
    expect(sidebar).toHaveClass('w-64')
  })
})

describe('useSidebar hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default collapsed state', () => {
    const { result } = renderHook(() => useSidebar())

    expect(result.current.isCollapsed).toBe(false)
    expect(result.current.isMobileOpen).toBe(false)
  })

  it('loads collapsed state from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('true')

    renderHook(() => useSidebar())

    // Wait for useEffect to run
    expect(localStorageMock.getItem).toHaveBeenCalledWith('sidebar-collapsed')
  })

  it('toggles collapsed state', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => {
      result.current.toggleCollapsed()
    })

    expect(result.current.isCollapsed).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('sidebar-collapsed', 'true')
  })

  it('opens and closes mobile menu', () => {
    const { result } = renderHook(() => useSidebar())

    expect(result.current.isMobileOpen).toBe(false)

    act(() => {
      result.current.openMobile()
    })

    expect(result.current.isMobileOpen).toBe(true)

    act(() => {
      result.current.closeMobile()
    })

    expect(result.current.isMobileOpen).toBe(false)
  })
})

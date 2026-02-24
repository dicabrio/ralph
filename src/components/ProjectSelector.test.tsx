import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { ProjectSelector, useSelectedProject } from './ProjectSelector'

// Mock navigate function
const mockNavigate = vi.fn()

// Mock useParams
let mockParamsId: string | undefined = undefined

// Mock tRPC
const mockProjects = [
  { id: 1, name: 'Project Alpha', path: '/path/alpha', description: 'First project', branchName: 'main', createdAt: new Date(), updatedAt: new Date(), runnerStatus: 'idle' as const, runnerProvider: null, stats: { total: 10, done: 5, failed: 1, inProgress: 1, backlog: 2, review: 1, progress: 50 } },
  { id: 2, name: 'Project Beta', path: '/path/beta', description: 'Second project', branchName: 'develop', createdAt: new Date(), updatedAt: new Date(), runnerStatus: 'running' as const, runnerProvider: 'claude' as const, stats: { total: 5, done: 2, failed: 0, inProgress: 1, backlog: 2, review: 0, progress: 40 } },
  { id: 3, name: 'Project Gamma', path: '/path/gamma', description: 'Third project', branchName: 'feature', createdAt: new Date(), updatedAt: new Date(), runnerStatus: 'idle' as const, runnerProvider: null, stats: { total: 8, done: 8, failed: 0, inProgress: 0, backlog: 0, review: 0, progress: 100 } },
]

let mockQueryData = mockProjects
let mockIsLoading = false

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: mockParamsId }),
  useLocation: () => ({ pathname: '/project/1' }),
}))

// Mock tRPC client
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    projects: {
      list: {
        useQuery: () => ({
          data: mockQueryData,
          isLoading: mockIsLoading,
        }),
      },
    },
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('ProjectSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParamsId = undefined
    mockQueryData = mockProjects
    mockIsLoading = false
    localStorageMock.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state', () => {
    mockIsLoading = true
    render(<ProjectSelector />)

    // Loading state shows skeleton
    expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument()
  })

  it('renders no projects state with add button', () => {
    mockQueryData = []
    render(<ProjectSelector />)

    expect(screen.getByText('Project toevoegen')).toBeInTheDocument()
  })

  it('renders selected project name', () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
  })

  it('opens dropdown on click', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Zoeken...')).toBeInTheDocument()
    })
  })

  it('shows all projects in dropdown', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      // When dropdown is open, project names appear twice (trigger + list item)
      expect(screen.getAllByText('Project Alpha')).toHaveLength(2)
      expect(screen.getByText('Project Beta')).toBeInTheDocument()
      expect(screen.getByText('Project Gamma')).toBeInTheDocument()
    })
  })

  it('filters projects based on search input', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText('Zoeken...')
    fireEvent.change(searchInput, { target: { value: 'Beta' } })

    await waitFor(() => {
      expect(screen.getByText('Project Beta')).toBeInTheDocument()
    })
  })

  it('shows empty search results message', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText('Zoeken...')
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } })

    await waitFor(() => {
      expect(screen.getByText('Geen projecten gevonden')).toBeInTheDocument()
    })
  })

  it('selects project and navigates on click', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText('Project Beta')).toBeInTheDocument()
    })

    const betaButton = screen.getAllByRole('button').find(btn =>
      btn.textContent?.includes('Project Beta')
    )
    if (betaButton) {
      fireEvent.click(betaButton)
    }

    expect(localStorageMock.setItem).toHaveBeenCalledWith('ralph-selected-project', '2')
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/project/$id', params: { id: '2' } })
  })

  it('closes dropdown on Escape key', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText('Zoeken...')
    fireEvent.keyDown(searchInput, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Zoeken...')).not.toBeInTheDocument()
    })
  })

  it('selects first filtered project on Enter key', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText('Zoeken...')
    fireEvent.change(searchInput, { target: { value: 'Beta' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    expect(localStorageMock.setItem).toHaveBeenCalledWith('ralph-selected-project', '2')
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/project/$id', params: { id: '2' } })
  })

  it('syncs with URL when project ID changes', async () => {
    // Start with URL having project 2, but localStorage having 1
    // The component should use URL value and display Project Beta
    mockParamsId = '2'
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    // Component should display the project from URL, not localStorage
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('auto-selects first project when none selected', async () => {
    localStorageMock.getItem.mockReturnValue(null)
    render(<ProjectSelector />)

    // Should auto-select the first project
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('ralph-selected-project', '1')
    })
  })

  it('shows checkmark on selected project in dropdown', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      // The selected project (Alpha) should have an accent background
      const alphaButton = screen.getAllByRole('button').find(btn =>
        btn.textContent?.includes('Project Alpha') && btn.classList.contains('bg-accent')
      )
      expect(alphaButton).toBeTruthy()
    })
  })

  it('renders collapsed state with icon only', () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector isCollapsed={true} />)

    // In collapsed mode, should only show folder icon
    expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument()
  })

  it('calls onClose callback when project selected', async () => {
    const onClose = vi.fn()
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector onClose={onClose} />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText('Project Beta')).toBeInTheDocument()
    })

    const betaButton = screen.getAllByRole('button').find(btn =>
      btn.textContent?.includes('Project Beta')
    )
    if (betaButton) {
      fireEvent.click(betaButton)
    }

    expect(onClose).toHaveBeenCalled()
  })

  it('calls onProjectChange callback when project selected', async () => {
    const onProjectChange = vi.fn()
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector onProjectChange={onProjectChange} />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText('Project Beta')).toBeInTheDocument()
    })

    const betaButton = screen.getAllByRole('button').find(btn =>
      btn.textContent?.includes('Project Beta')
    )
    if (betaButton) {
      fireEvent.click(betaButton)
    }

    expect(onProjectChange).toHaveBeenCalledWith(2)
  })

  it('navigates to dashboard when add project button is clicked', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(<ProjectSelector />)

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText('Nieuw project')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Nieuw project'))

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('closes dropdown when clicking outside', async () => {
    localStorageMock.getItem.mockReturnValue('1')
    render(
      <div>
        <ProjectSelector />
        <div data-testid="outside">Outside</div>
      </div>
    )

    const trigger = screen.getByRole('button', { name: /project alpha/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Zoeken...')).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByTestId('outside'))

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Zoeken...')).not.toBeInTheDocument()
    })
  })
})

describe('useSelectedProject hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParamsId = undefined
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('returns project ID from URL when available', () => {
    mockParamsId = '5'
    const { result } = renderHook(() => useSelectedProject())

    expect(result.current).toBe(5)
  })

  it('returns project ID from localStorage when URL is empty', () => {
    localStorageMock.getItem.mockReturnValue('3')
    const { result } = renderHook(() => useSelectedProject())

    expect(result.current).toBe(3)
    expect(localStorageMock.getItem).toHaveBeenCalledWith('ralph-selected-project')
  })

  it('returns null when no project ID in URL or localStorage', () => {
    const { result } = renderHook(() => useSelectedProject())

    expect(result.current).toBe(null)
  })

  it('syncs with URL changes', () => {
    mockParamsId = '1'
    const { result, rerender } = renderHook(() => useSelectedProject())

    expect(result.current).toBe(1)

    // Simulate URL change
    mockParamsId = '2'
    rerender()

    // After rerender with new params, should update
    expect(result.current).toBe(2)
  })

  it('prefers URL over localStorage', () => {
    mockParamsId = '10'
    localStorageMock.getItem.mockReturnValue('5')
    const { result } = renderHook(() => useSelectedProject())

    expect(result.current).toBe(10)
  })
})

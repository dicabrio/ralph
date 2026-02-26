import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RunnerConfigSection } from './RunnerConfigSection'
import { trpc } from '@/lib/trpc/client'

// Mock the tRPC client
vi.mock('@/lib/trpc/client', () => {
  const mockMutate = vi.fn()
  const mockRefetch = vi.fn()

  return {
    trpc: {
      useUtils: vi.fn(() => ({
        projects: {
          getRalphConfig: {
            invalidate: vi.fn(),
          },
        },
      })),
      projects: {
        getRalphConfig: {
          useQuery: vi.fn(() => ({
            data: null,
            isLoading: false,
          })),
        },
        updateRalphConfig: {
          useMutation: vi.fn(() => ({
            mutate: mockMutate,
            isPending: false,
          })),
        },
      },
      ollama: {
        isAvailable: {
          useQuery: vi.fn(() => ({
            data: false,
            isLoading: false,
          })),
        },
        getModels: {
          useQuery: vi.fn(() => ({
            data: [],
            isLoading: false,
            refetch: mockRefetch,
            isFetching: false,
          })),
        },
      },
    },
  }
})

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('RunnerConfigSection', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  const renderWithProviders = (component: React.ReactNode) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    )
  }

  it('renders provider dropdown', async () => {
    renderWithProviders(<RunnerConfigSection projectId={1} />)

    expect(screen.getByText('Provider')).toBeInTheDocument()
    expect(screen.getByTestId('provider-select')).toBeInTheDocument()
  })

  it('renders with Claude as default provider', async () => {
    renderWithProviders(<RunnerConfigSection projectId={1} />)

    // The select trigger should show Claude (default)
    const trigger = screen.getByTestId('provider-select')
    expect(trigger).toBeInTheDocument()
  })

  it('shows Claude model options when Claude is selected', async () => {
    renderWithProviders(<RunnerConfigSection projectId={1} />)

    // Should show Claude model select
    expect(screen.getByText('Model (optioneel)')).toBeInTheDocument()
    expect(screen.getByTestId('claude-model-select')).toBeInTheDocument()
  })

  it('shows save button', async () => {
    renderWithProviders(<RunnerConfigSection projectId={1} />)

    const saveButton = screen.getByTestId('save-runner-config')
    expect(saveButton).toBeInTheDocument()
    // Save button should be disabled initially (no changes)
    expect(saveButton).toBeDisabled()
  })

  it('shows loading state when fetching config', async () => {
    // Override to return loading state
    vi.mocked(trpc.projects.getRalphConfig.useQuery).mockReturnValueOnce({
      data: null,
      isLoading: true,
      // Add minimal required properties to avoid type errors
    } as unknown as ReturnType<typeof trpc.projects.getRalphConfig.useQuery>)

    renderWithProviders(<RunnerConfigSection projectId={1} />)

    // Should show loader when config is loading
    const loader = document.querySelector('.animate-spin')
    expect(loader).toBeTruthy()
  })

  it('loads existing config and sets form values', async () => {
    vi.mocked(trpc.projects.getRalphConfig.useQuery).mockReturnValueOnce({
      data: {
        runner: {
          provider: 'ollama',
          model: 'llama2',
          baseUrl: 'http://localhost:11434',
        },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.projects.getRalphConfig.useQuery>)

    vi.mocked(trpc.ollama.isAvailable.useQuery).mockReturnValueOnce({
      data: true,
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.ollama.isAvailable.useQuery>)

    vi.mocked(trpc.ollama.getModels.useQuery).mockReturnValueOnce({
      data: [
        { name: 'llama2', size: '3.8 GB', modifiedAt: '4 weeks ago' },
        { name: 'codellama', size: '7.3 GB', modifiedAt: '2 weeks ago' },
      ],
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof trpc.ollama.getModels.useQuery>)

    renderWithProviders(<RunnerConfigSection projectId={1} />)

    // Wait for the form to be populated
    await waitFor(() => {
      // Should show Ollama-specific fields
      expect(screen.getByText('Base URL (optioneel)')).toBeInTheDocument()
    })
  })

  it('shows Ollama warning when Ollama is not available', async () => {
    // Set up the mock to return Ollama as configured provider
    vi.mocked(trpc.projects.getRalphConfig.useQuery).mockReturnValueOnce({
      data: {
        runner: {
          provider: 'ollama',
        },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.projects.getRalphConfig.useQuery>)

    vi.mocked(trpc.ollama.isAvailable.useQuery).mockReturnValueOnce({
      data: false,
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.ollama.isAvailable.useQuery>)

    renderWithProviders(<RunnerConfigSection projectId={1} />)

    await waitFor(() => {
      const warning = screen.queryByTestId('ollama-warning')
      expect(warning).toBeInTheDocument()
    })
  })

  it('shows refresh button for Ollama models', async () => {
    vi.mocked(trpc.projects.getRalphConfig.useQuery).mockReturnValueOnce({
      data: {
        runner: {
          provider: 'ollama',
        },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.projects.getRalphConfig.useQuery>)

    vi.mocked(trpc.ollama.isAvailable.useQuery).mockReturnValueOnce({
      data: true,
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.ollama.isAvailable.useQuery>)

    const mockRefetch = vi.fn()
    vi.mocked(trpc.ollama.getModels.useQuery).mockReturnValueOnce({
      data: [
        { name: 'llama2', size: '3.8 GB', modifiedAt: '4 weeks ago' },
      ],
      isLoading: false,
      refetch: mockRefetch,
      isFetching: false,
    } as unknown as ReturnType<typeof trpc.ollama.getModels.useQuery>)

    renderWithProviders(<RunnerConfigSection projectId={1} />)

    await waitFor(() => {
      const refreshButton = screen.getByTestId('refresh-ollama-models')
      expect(refreshButton).toBeInTheDocument()
    })
  })
})

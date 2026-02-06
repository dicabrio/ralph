import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
  CircleDashed,
  Clock,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/project/$id/kanban')({
  component: KanbanBoard,
})

// Story status type
type StoryStatus = 'pending' | 'in_progress' | 'done' | 'failed'

// Story type from the API
interface Story {
  id: string
  title: string
  description: string
  priority: number
  status: StoryStatus
  epic: string
  dependencies: string[]
  recommendedSkills: string[]
  acceptanceCriteria: string[]
}

// Runner status type
type RunnerStatus = 'idle' | 'running' | 'stopping'

// Kanban column definition
interface KanbanColumn {
  id: string
  title: string
  status: StoryStatus | 'backlog'
  icon: React.ReactNode
  headerColor: string
  bgColor: string
}

// Define the columns for the Kanban board
// Note: 'backlog' maps to 'pending' status for "Te doen" column
// 'pending' is used for "Backlog" column for stories not yet ready
const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    status: 'backlog',
    icon: <Clock className="w-4 h-4" />,
    headerColor: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-900/50',
  },
  {
    id: 'todo',
    title: 'Te doen',
    status: 'pending',
    icon: <CircleDashed className="w-4 h-4" />,
    headerColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  {
    id: 'failed',
    title: 'Gefaald',
    status: 'failed',
    icon: <AlertCircle className="w-4 h-4" />,
    headerColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    status: 'in_progress',
    icon: <PlayCircle className="w-4 h-4" />,
    headerColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  {
    id: 'done',
    title: 'Voltooid',
    status: 'done',
    icon: <CheckCircle2 className="w-4 h-4" />,
    headerColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
]

// Filter stories for a column
// For UI-006, we show basic cards without drag-and-drop (that's UI-007/UI-008)
function getStoriesForColumn(
  stories: Story[],
  column: KanbanColumn,
): Story[] {
  // The 'backlog' column shows stories that are pending but have unmet dependencies
  // The 'todo' (pending) column shows stories that are ready to be worked on
  if (column.id === 'backlog') {
    // Stories in backlog: pending status with unmet dependencies
    return stories.filter((story) => {
      if (story.status !== 'pending') return false
      // Check if all dependencies are done
      const hasUnmetDependencies = story.dependencies.some((depId) => {
        const depStory = stories.find((s) => s.id === depId)
        return !depStory || depStory.status !== 'done'
      })
      return hasUnmetDependencies
    })
  }

  if (column.id === 'todo') {
    // Stories in todo: pending status with all dependencies met
    return stories.filter((story) => {
      if (story.status !== 'pending') return false
      // Check if all dependencies are done (or no dependencies)
      const allDependenciesMet = story.dependencies.every((depId) => {
        const depStory = stories.find((s) => s.id === depId)
        return depStory && depStory.status === 'done'
      })
      return allDependenciesMet
    })
  }

  // Other columns: match by status directly
  return stories.filter((story) => story.status === column.status)
}

// Compute project stats from stories
function computeProjectStats(stories: Story[]) {
  const total = stories.length
  const done = stories.filter((s) => s.status === 'done').length
  const failed = stories.filter((s) => s.status === 'failed').length
  const inProgress = stories.filter((s) => s.status === 'in_progress').length
  const pending = stories.filter((s) => s.status === 'pending').length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return { total, done, failed, inProgress, pending, progress }
}

// Simple story card for initial implementation
// Will be enhanced in UI-007
interface StoryCardProps {
  story: Story
}

function StoryCard({ story }: StoryCardProps) {
  return (
    <div
      className={cn(
        'p-3 bg-card rounded-lg border shadow-sm',
        'hover:shadow-md hover:border-primary/30 transition-all',
        'cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-mono text-muted-foreground">
          {story.id}
        </span>
        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          P{story.priority}
        </span>
      </div>
      <h4 className="text-sm font-medium text-foreground line-clamp-2">
        {story.title}
      </h4>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
        {story.epic}
      </p>
    </div>
  )
}

// Column header component
interface ColumnHeaderProps {
  column: KanbanColumn
  count: number
}

function ColumnHeader({ column, count }: ColumnHeaderProps) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2', column.bgColor)}>
      <span className={column.headerColor}>{column.icon}</span>
      <span className={cn('text-sm font-semibold', column.headerColor)}>
        {column.title}
      </span>
      <span
        className={cn(
          'ml-auto text-xs font-medium px-2 py-0.5 rounded-full',
          column.bgColor,
          column.headerColor,
        )}
      >
        {count}
      </span>
    </div>
  )
}

// Kanban column component
interface KanbanColumnProps {
  column: KanbanColumn
  stories: Story[]
}

function KanbanColumnComponent({ column, stories }: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] bg-muted/30 rounded-lg border overflow-hidden">
      <ColumnHeader column={column} count={stories.length} />
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
        {stories.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No stories
          </p>
        ) : (
          stories
            .sort((a, b) => a.priority - b.priority)
            .map((story) => <StoryCard key={story.id} story={story} />)
        )}
      </div>
    </div>
  )
}

// Runner status badge component
interface RunnerStatusBadgeProps {
  status: RunnerStatus
  storyId?: string | null
}

function RunnerStatusBadge({ status, storyId }: RunnerStatusBadgeProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        status === 'running' &&
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        status === 'stopping' &&
          'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        status === 'idle' && 'bg-muted text-muted-foreground',
      )}
    >
      {status === 'running' && (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          {storyId ? `Running: ${storyId}` : 'Running'}
        </>
      )}
      {status === 'stopping' && (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Stopping
        </>
      )}
      {status === 'idle' && (
        <>
          <CircleDashed className="w-3 h-3" />
          Idle
        </>
      )}
    </div>
  )
}

// Compact runner controls for kanban header
interface KanbanRunnerControlsProps {
  projectId: number
  runnerStatus: RunnerStatus
  currentStoryId?: string | null
  onStart: () => void
  onStop: () => void
  isStarting: boolean
  isStopping: boolean
}

function KanbanRunnerControls({
  runnerStatus,
  currentStoryId,
  onStart,
  onStop,
  isStarting,
  isStopping,
}: KanbanRunnerControlsProps) {
  const isRunning = runnerStatus === 'running'
  const isBusy = isStarting || isStopping || runnerStatus === 'stopping'

  return (
    <div className="flex items-center gap-3">
      <RunnerStatusBadge status={runnerStatus} storyId={currentStoryId} />
      {!isRunning ? (
        <button
          type="button"
          onClick={onStart}
          disabled={isBusy}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-emerald-500 text-white',
            'hover:bg-emerald-600 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isStarting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Start
        </button>
      ) : (
        <button
          type="button"
          onClick={onStop}
          disabled={isBusy}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-destructive text-destructive-foreground',
            'hover:bg-destructive/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isStopping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
          Stop
        </button>
      )}
    </div>
  )
}

// Stats bar component
interface StatsBarProps {
  stats: {
    total: number
    done: number
    failed: number
    inProgress: number
    pending: number
    progress: number
  }
}

function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <span className="text-foreground font-medium">{stats.done}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <PlayCircle className="w-4 h-4 text-blue-500" />
        <span className="text-foreground font-medium">{stats.inProgress}</span>
      </div>
      {stats.failed > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-foreground font-medium">{stats.failed}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <CircleDashed className="w-4 h-4 text-muted-foreground" />
        <span className="text-foreground font-medium">{stats.pending}</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <span className="text-muted-foreground">
        {stats.progress}% complete ({stats.done}/{stats.total})
      </span>
    </div>
  )
}

function KanbanBoard() {
  const { id } = Route.useParams()
  const projectId = parseInt(id, 10)
  const utils = trpc.useUtils()

  // Fetch project data
  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !isNaN(projectId) },
  )

  // Fetch stories
  const { data: stories = [], isLoading: isLoadingStories } =
    trpc.stories.listByProject.useQuery(
      { projectId },
      { enabled: !isNaN(projectId), staleTime: 10000 },
    )

  // Fetch runner status
  const { data: runnerState } = trpc.runner.getStatus.useQuery(
    { projectId },
    { enabled: !isNaN(projectId), refetchInterval: 3000 },
  )

  // Mutations
  const startRunner = trpc.runner.start.useMutation({
    onSuccess: () => {
      utils.runner.getStatus.invalidate({ projectId })
    },
  })

  const stopRunner = trpc.runner.stop.useMutation({
    onSuccess: () => {
      utils.runner.getStatus.invalidate({ projectId })
    },
  })

  // Compute stats
  const stats = computeProjectStats(stories)
  const runnerStatus: RunnerStatus = runnerState?.status ?? 'idle'
  const hasFailedStories = stories.some((s) => s.status === 'failed')

  // Handle runner start/stop
  const handleStartRunner = () => {
    startRunner.mutate({ projectId })
  }

  const handleStopRunner = () => {
    stopRunner.mutate({ projectId })
  }

  // Filter columns: only show 'failed' column if there are failed stories
  const visibleColumns = KANBAN_COLUMNS.filter(
    (col) => col.id !== 'failed' || hasFailedStories,
  )

  // Loading state
  if (isLoadingProject || isLoadingStories) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (projectError || !project) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Project not found
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            The project you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4">
          {/* Top row: back link and project name */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <Link
                to="/project/$id"
                params={{ id }}
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back</span>
              </Link>
              <h1 className="text-xl font-bold text-foreground">
                {project.name}
              </h1>
            </div>
            <KanbanRunnerControls
              projectId={projectId}
              runnerStatus={runnerStatus}
              currentStoryId={runnerState?.storyId}
              onStart={handleStartRunner}
              onStop={handleStopRunner}
              isStarting={startRunner.isPending}
              isStopping={stopRunner.isPending}
            />
          </div>
          {/* Bottom row: stats */}
          <StatsBar stats={stats} />
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 min-w-max">
          {visibleColumns.map((column) => {
            const columnStories = getStoriesForColumn(stories, column)
            return (
              <KanbanColumnComponent
                key={column.id}
                column={column}
                stories={columnStories}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

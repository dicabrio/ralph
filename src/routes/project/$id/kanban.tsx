import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
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
  GripVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { StoryCard, Story, StoryStatus } from '@/components/StoryCard'
import { StoryDetailModal } from '@/components/StoryDetailModal'
import { RunnerLogModal } from '@/components/RunnerLogModal'

// Parse runner errors into user-friendly messages
function getRunnerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  // Check for common error patterns
  if (message.includes('ANTHROPIC_API_KEY') || message.includes('HOST_CLAUDE_CONFIG') || message.includes('authentication')) {
    return 'No authentication configured. Set ANTHROPIC_API_KEY or HOST_CLAUDE_CONFIG environment variable.'
  }
  if (message.includes('Failed to start container') || message.includes('docker')) {
    return 'Docker is not available or not running. Make sure Docker is installed and running.'
  }
  if (message.includes('currently stopping')) {
    return 'Runner is currently stopping. Please wait and try again.'
  }
  if (message.includes('not found') || message.includes('NOT_FOUND')) {
    return 'Project not found. It may have been deleted.'
  }
  if (message.includes('path') && (message.includes('exist') || message.includes('found'))) {
    return 'Project path does not exist. Check if the folder exists on the filesystem.'
  }
  if (message.includes('timeout')) {
    return 'Container start timeout. Docker may be overloaded or the image is still downloading.'
  }

  // Return a generic message if no pattern matches
  return message || 'An unexpected error occurred'
}

export const Route = createFileRoute('/project/$id/kanban')({
  component: KanbanBoard,
})

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
  isDraggable: boolean // Whether stories in this column can be dragged
  isDroppable: boolean // Whether stories can be dropped here
}

// Define the columns for the Kanban board
const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    status: 'backlog',
    icon: <Clock className="w-4 h-4" />,
    headerColor: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-900/50',
    isDraggable: true,
    isDroppable: true,
  },
  {
    id: 'todo',
    title: 'Te doen',
    status: 'pending',
    icon: <CircleDashed className="w-4 h-4" />,
    headerColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    isDraggable: true,
    isDroppable: true,
  },
  {
    id: 'failed',
    title: 'Gefaald',
    status: 'failed',
    icon: <AlertCircle className="w-4 h-4" />,
    headerColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    isDraggable: false,
    isDroppable: false,
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    status: 'in_progress',
    icon: <PlayCircle className="w-4 h-4" />,
    headerColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    isDraggable: false,
    isDroppable: false,
  },
  {
    id: 'done',
    title: 'Voltooid',
    status: 'done',
    icon: <CheckCircle2 className="w-4 h-4" />,
    headerColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    isDraggable: false,
    isDroppable: false,
  },
]

// Check if a story has all dependencies met
function hasAllDependenciesMet(story: Story, allStories: Story[]): boolean {
  return story.dependencies.every((depId) => {
    const depStory = allStories.find((s) => s.id === depId)
    return depStory && depStory.status === 'done'
  })
}

// Filter stories for a column
function getStoriesForColumn(
  stories: Story[],
  column: KanbanColumn,
): Story[] {
  if (column.id === 'backlog') {
    // Stories in backlog: pending status with unmet dependencies
    return stories.filter((story) => {
      if (story.status !== 'pending') return false
      return !hasAllDependenciesMet(story, stories)
    })
  }

  if (column.id === 'todo') {
    // Stories in todo: pending status with all dependencies met
    return stories.filter((story) => {
      if (story.status !== 'pending') return false
      return hasAllDependenciesMet(story, stories)
    })
  }

  // Other columns: match by status directly
  return stories.filter((story) => story.status === column.status)
}

// Get which column a story belongs to
function getColumnForStory(story: Story, allStories: Story[]): string {
  if (story.status === 'pending') {
    return hasAllDependenciesMet(story, allStories) ? 'todo' : 'backlog'
  }
  return story.status
}

// Check if a story can be dropped in a target column
function canDropInColumn(
  story: Story,
  targetColumnId: string,
  allStories: Story[],
): boolean {
  const targetColumn = KANBAN_COLUMNS.find((c) => c.id === targetColumnId)
  if (!targetColumn || !targetColumn.isDroppable) return false

  // Can only move between backlog and todo
  if (story.status !== 'pending') return false

  // Can always move to backlog
  if (targetColumnId === 'backlog') return true

  // Can only move to todo if all dependencies are met
  if (targetColumnId === 'todo') {
    return hasAllDependenciesMet(story, allStories)
  }

  return false
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

// Draggable Story Card component
interface DraggableStoryCardProps {
  story: Story
  allStories: Story[]
  isDraggable: boolean
  onClick?: () => void
}

function DraggableStoryCard({
  story,
  allStories,
  isDraggable,
  onClick,
}: DraggableStoryCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: story.id,
    disabled: !isDraggable,
    data: {
      story,
      sourceColumn: getColumnForStory(story, allStories),
    },
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative',
        isDragging && 'opacity-50 z-50',
      )}
    >
      {isDraggable && (
        <div
          {...listeners}
          {...attributes}
          className={cn(
            'absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center',
            'cursor-grab active:cursor-grabbing',
            'text-muted-foreground hover:text-foreground transition-colors',
            'opacity-0 group-hover:opacity-100 hover:opacity-100',
          )}
          style={{ zIndex: 10 }}
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      <div className={cn(isDraggable && 'group')}>
        <StoryCard story={story} onClick={onClick} />
      </div>
    </div>
  )
}

// Droppable Column component
interface DroppableColumnProps {
  column: KanbanColumn
  stories: Story[]
  allStories: Story[]
  isOver: boolean
  canDrop: boolean
  onStoryClick?: (story: Story) => void
}

function DroppableColumn({
  column,
  stories,
  allStories,
  isOver,
  canDrop,
  onStoryClick,
}: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    disabled: !column.isDroppable,
    data: { column },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[280px] max-w-[320px] bg-muted/30 rounded-lg border overflow-hidden transition-all',
        isOver && canDrop && 'ring-2 ring-primary border-primary/50',
        isOver && !canDrop && 'ring-2 ring-destructive border-destructive/50',
      )}
    >
      <ColumnHeader column={column} count={stories.length} />
      <div
        className={cn(
          'flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)] transition-colors',
          isOver && canDrop && 'bg-primary/5',
          isOver && !canDrop && 'bg-destructive/5',
        )}
      >
        {stories.length === 0 ? (
          <p
            className={cn(
              'text-xs text-muted-foreground text-center py-4',
              isOver && canDrop && 'text-primary',
            )}
          >
            {isOver && canDrop ? 'Drop here' : 'No stories'}
          </p>
        ) : (
          stories
            .sort((a, b) => a.priority - b.priority)
            .map((story) => (
              <DraggableStoryCard
                key={story.id}
                story={story}
                allStories={allStories}
                isDraggable={column.isDraggable}
                onClick={onStoryClick ? () => onStoryClick(story) : undefined}
              />
            ))
        )}
      </div>
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

// Drag overlay content (shows the card being dragged)
interface DragOverlayContentProps {
  story: Story
}

function DragOverlayContent({ story }: DragOverlayContentProps) {
  return (
    <div className="w-[280px] opacity-90 rotate-3 shadow-2xl">
      <StoryCard story={story} />
    </div>
  )
}

function KanbanBoard() {
  const { id } = Route.useParams()
  const projectId = parseInt(id, 10)
  const utils = trpc.useUtils()

  // Drag state
  const [activeStory, setActiveStory] = useState<Story | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)

  // Modal state
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const [logModalStory, setLogModalStory] = useState<Story | null>(null)

  // Configure sensors with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
  )

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
      toast.success('Runner started successfully')
    },
    onError: (error) => {
      toast.error('Failed to start runner', {
        description: getRunnerErrorMessage(error),
      })
    },
  })

  const stopRunner = trpc.runner.stop.useMutation({
    onSuccess: () => {
      utils.runner.getStatus.invalidate({ projectId })
      toast.success('Runner stopped successfully')
    },
    onError: (error) => {
      toast.error('Failed to stop runner', {
        description: getRunnerErrorMessage(error),
      })
    },
  })

  // Note: For drag & drop between backlog and todo, we don't need to update status
  // because both columns have the same status ('pending').
  // The column is determined by dependency status, not by a separate field.
  // This is intentional - we're just allowing users to visualize what they want,
  // but the actual column assignment is driven by dependency completion.

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
  const visibleColumns = useMemo(
    () =>
      KANBAN_COLUMNS.filter(
        (col) => col.id !== 'failed' || hasFailedStories,
      ),
    [hasFailedStories],
  )

  // Handle story click - opens log modal for in-progress, detail modal for others
  const handleStoryClick = useCallback((story: Story) => {
    if (story.status === 'in_progress') {
      // Open runner log modal for in-progress stories
      setLogModalStory(story)
      setIsLogModalOpen(true)
    } else {
      // Open detail modal for other stories
      setSelectedStory(story)
      setIsDetailModalOpen(true)
    }
  }, [])

  // Handle modal close
  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false)
    // Keep selectedStory for exit animation, clear after modal is hidden
    setTimeout(() => setSelectedStory(null), 200)
  }, [])

  // Handle log modal close
  const handleCloseLogModal = useCallback(() => {
    setIsLogModalOpen(false)
    // Keep logModalStory for exit animation, clear after modal is hidden
    setTimeout(() => setLogModalStory(null), 200)
  }, [])

  // Drag handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const story = stories.find((s) => s.id === event.active.id)
      if (story) {
        setActiveStory(story)
      }
    },
    [stories],
  )

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    setOverColumnId(over?.id as string | null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      setActiveStory(null)
      setOverColumnId(null)

      if (!over || !active) return

      const story = stories.find((s) => s.id === active.id)
      if (!story) return

      const targetColumnId = over.id as string
      const sourceColumnId = getColumnForStory(story, stories)

      // If dropped on the same column, do nothing
      if (sourceColumnId === targetColumnId) return

      // Check if the drop is valid
      if (!canDropInColumn(story, targetColumnId, stories)) {
        // Invalid drop - the visual feedback already showed this was not allowed
        return
      }

      // Since both backlog and todo have status 'pending', there's nothing to update
      // The column is determined by dependency status which we can't change via drag & drop
      // This drag & drop is for visual organization only
      // In a real app, you might want to add a 'manual_column' field to override this

      // For now, we'll just show that the drag happened
      // In the future, we could add a 'forceColumn' field to the story
      console.log(
        `Would move story ${story.id} from ${sourceColumnId} to ${targetColumnId}`,
      )
    },
    [stories],
  )

  // Calculate if current drag can drop in a column
  const canDropActiveStory = useCallback(
    (columnId: string): boolean => {
      if (!activeStory) return false
      return canDropInColumn(activeStory, columnId, stories)
    },
    [activeStory, stories],
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
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
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
              const isOver = overColumnId === column.id
              const canDrop = canDropActiveStory(column.id)
              return (
                <DroppableColumn
                  key={column.id}
                  column={column}
                  stories={columnStories}
                  allStories={stories}
                  isOver={isOver}
                  canDrop={canDrop}
                  onStoryClick={handleStoryClick}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeStory && <DragOverlayContent story={activeStory} />}
      </DragOverlay>

      {/* Story detail modal */}
      <StoryDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        projectId={projectId}
        story={selectedStory}
        allStories={stories}
      />

      {/* Runner log modal */}
      <RunnerLogModal
        isOpen={isLogModalOpen}
        onClose={handleCloseLogModal}
        projectId={projectId}
        story={logModalStory}
      />
    </DndContext>
  )
}

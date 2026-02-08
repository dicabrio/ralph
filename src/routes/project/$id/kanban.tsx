import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
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
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { StoryCard, Story, StoryStatus } from '@/components/StoryCard'
import { StoryDetailModal } from '@/components/StoryDetailModal'
import { RunnerLogModal } from '@/components/RunnerLogModal'
import { useWebSocket } from '@/lib/websocket/client'

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
  isLocked: boolean // Whether this column is locked (only runner can modify)
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
    isLocked: false,
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
    isLocked: false,
  },
  {
    id: 'failed',
    title: 'Gefaald',
    status: 'failed',
    icon: <AlertCircle className="w-4 h-4" />,
    headerColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    isDraggable: true,
    isDroppable: true,
    isLocked: false,
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    status: 'in_progress',
    icon: <PlayCircle className="w-4 h-4" />,
    headerColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    isDraggable: false,
    isDroppable: false, // Only runner can move stories here
    isLocked: true,
  },
  {
    id: 'done',
    title: 'Voltooid',
    status: 'done',
    icon: <CheckCircle2 className="w-4 h-4" />,
    headerColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    isDraggable: true,
    isDroppable: true,
    isLocked: false,
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

// Get the target status for a column
function getTargetStatusForColumn(columnId: string): StoryStatus | null {
  switch (columnId) {
    case 'backlog':
    case 'todo':
      return 'pending'
    case 'in_progress':
      return 'in_progress'
    case 'done':
      return 'done'
    case 'failed':
      return 'failed'
    default:
      return null
  }
}

// Valid status transitions (from stories router)
const validTransitions: Record<StoryStatus, StoryStatus[]> = {
  pending: ['in_progress', 'done'],
  in_progress: ['done', 'failed', 'pending'],
  done: ['pending'],
  failed: ['in_progress', 'pending'],
}

// Check if a status transition is valid
function isValidStatusTransition(from: StoryStatus, to: StoryStatus): boolean {
  if (from === to) return true // Same status is always valid (no-op)
  return validTransitions[from].includes(to)
}

// Check if a story can be dropped in a target column (basic check - ignores dependencies)
function canDropInColumn(
  story: Story,
  targetColumnId: string,
  _allStories: Story[],
): boolean {
  const targetColumn = KANBAN_COLUMNS.find((c) => c.id === targetColumnId)
  if (!targetColumn || !targetColumn.isDroppable) return false

  const sourceColumnId = getColumnForStory(story, _allStories)
  if (sourceColumnId === targetColumnId) return false // Same column

  const targetStatus = getTargetStatusForColumn(targetColumnId)
  if (!targetStatus) return false

  // in_progress can only be set by runner
  if (targetColumnId === 'in_progress') return false

  // Check if status transition is valid
  return isValidStatusTransition(story.status, targetStatus)
}

// Get unmet dependencies for a story
function getUnmetDependencies(story: Story, allStories: Story[]): Story[] {
  return story.dependencies
    .map((depId) => allStories.find((s) => s.id === depId))
    .filter((dep): dep is Story => dep !== undefined && dep.status !== 'done')
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
        'flex items-stretch',
        isDragging && 'opacity-50 z-50',
      )}
    >
      {isDraggable && (
        <div
          {...listeners}
          {...attributes}
          className={cn(
            'flex-shrink-0 w-6 flex items-center justify-center rounded-l-lg',
            'cursor-grab active:cursor-grabbing',
            'text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
            'border-y border-l bg-muted/30',
          )}
          data-testid="drag-handle"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <StoryCard story={story} onClick={onClick} hasDragHandle={isDraggable} />
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
        'flex flex-col flex-1 min-w-[200px] bg-muted/30 rounded-lg border overflow-hidden transition-all',
        isOver && canDrop && 'ring-2 ring-primary border-primary/50',
        isOver && !canDrop && 'ring-2 ring-destructive border-destructive/50',
      )}
      data-testid={`kanban-column-${column.id}`}
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
      {column.isLocked && (
        <Lock
          className={cn('w-3.5 h-3.5', column.headerColor)}
          data-testid="column-lock-icon"
          aria-label="Column locked - only runner can modify"
        />
      )}
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

// Dependency confirmation dialog
interface DependencyConfirmDialogProps {
  isOpen: boolean
  story: Story | null
  unmetDependencies: Story[]
  targetColumnTitle: string
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function DependencyConfirmDialog({
  isOpen,
  story,
  unmetDependencies,
  targetColumnTitle,
  onConfirm,
  onCancel,
  isLoading,
}: DependencyConfirmDialogProps) {
  if (!isOpen || !story) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      data-testid="dependency-confirm-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="dialog-backdrop"
      />

      {/* Dialog content */}
      <div className="relative bg-card border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Unmet Dependencies
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Moving <strong>{story.title}</strong> to {targetColumnTitle} while
              some dependencies are not complete.
            </p>
          </div>
        </div>

        {/* Unmet dependencies list */}
        <div className="bg-muted/50 rounded-lg p-3 mb-6">
          <p className="text-sm font-medium text-foreground mb-2">
            Dependencies not complete:
          </p>
          <ul className="space-y-1.5">
            {unmetDependencies.map((dep) => (
              <li
                key={dep.id}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-xs font-medium',
                    dep.status === 'pending' &&
                      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
                    dep.status === 'in_progress' &&
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
                    dep.status === 'failed' &&
                      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
                  )}
                >
                  {dep.status}
                </span>
                <span className="text-foreground font-medium">{dep.id}</span>
                <span className="text-muted-foreground truncate">{dep.title}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
            data-testid="dialog-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            data-testid="dialog-confirm"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Move Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// Pending drop info for confirmation dialog
interface PendingDrop {
  story: Story
  targetColumnId: string
  unmetDependencies: Story[]
}

function KanbanBoard() {
  const { id } = Route.useParams()
  const projectId = parseInt(id, 10)
  const utils = trpc.useUtils()

  // Drag state
  const [activeStory, setActiveStory] = useState<Story | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)

  // Confirmation dialog state
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)

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

  // Track if this component triggered the last update (to avoid refetching our own changes)
  const lastOwnUpdateRef = useRef<number>(0)

  // WebSocket for real-time prd.json updates
  const { subscribe, unsubscribe, isConnected } = useWebSocket({
    onStoriesUpdated: useCallback((data: { projectId: string }) => {
      // Only invalidate if this is for our project
      if (data.projectId === String(projectId)) {
        // Skip if we just made an update ourselves (within 500ms)
        const timeSinceOwnUpdate = Date.now() - lastOwnUpdateRef.current
        if (timeSinceOwnUpdate < 500) {
          console.log('[Kanban] Skipping refetch - own update')
          return
        }
        console.log('[Kanban] Stories updated via file watcher, invalidating cache')
        utils.stories.listByProject.invalidate({ projectId })
      }
    }, [projectId, utils]),
    onRunnerCompleted: useCallback((data: { projectId: string }) => {
      // Only invalidate if this is for our project
      if (data.projectId === String(projectId)) {
        console.log('[Kanban] Runner completed, invalidating stories cache')
        utils.stories.listByProject.invalidate({ projectId })
        utils.runner.getStatus.invalidate({ projectId })
      }
    }, [projectId, utils]),
  })

  // Subscribe to project updates when component mounts
  useEffect(() => {
    if (isConnected && !isNaN(projectId)) {
      const projectIdStr = String(projectId)
      subscribe(projectIdStr)
      console.log(`[Kanban] Subscribed to project ${projectIdStr} updates`)
      return () => {
        unsubscribe(projectIdStr)
        console.log(`[Kanban] Unsubscribed from project ${projectIdStr} updates`)
      }
    }
  }, [isConnected, projectId, subscribe, unsubscribe])

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

  // Status update mutation with optimistic updates
  const updateStatus = trpc.stories.updateStatus.useMutation({
    onMutate: async ({ storyId, status }) => {
      // Mark the timestamp of our own update to avoid duplicate refetch from file watcher
      lastOwnUpdateRef.current = Date.now()

      // Cancel any outgoing refetches
      await utils.stories.listByProject.cancel({ projectId })

      // Snapshot the previous value
      const previousStories = utils.stories.listByProject.getData({ projectId })

      // Optimistically update the cache
      utils.stories.listByProject.setData({ projectId }, (old) => {
        if (!old) return old
        return old.map((story) =>
          story.id === storyId ? { ...story, status } : story
        )
      })

      // Return the context with the previous value
      return { previousStories }
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousStories) {
        utils.stories.listByProject.setData({ projectId }, context.previousStories)
      }
      toast.error('Failed to update status', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
    onSuccess: (updatedStory) => {
      const targetColumn = KANBAN_COLUMNS.find(
        (c) => getTargetStatusForColumn(c.id) === updatedStory.status
      )
      toast.success('Story status updated', {
        description: `${updatedStory.id} moved to ${targetColumn?.title ?? updatedStory.status}`,
      })
    },
    onSettled: () => {
      // Invalidate to refetch and ensure consistency
      utils.stories.listByProject.invalidate({ projectId })
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

  // Execute a status change
  const executeStatusChange = useCallback(
    (story: Story, targetColumnId: string) => {
      const targetStatus = getTargetStatusForColumn(targetColumnId)
      if (!targetStatus) return

      // If status is the same (e.g., backlog to todo), no API call needed
      if (story.status === targetStatus) {
        toast.info('Story moved', {
          description: `${story.id} is already in ${targetStatus} status`,
        })
        return
      }

      // Make the API call
      updateStatus.mutate({
        projectId,
        storyId: story.id,
        status: targetStatus,
      })
    },
    [projectId, updateStatus],
  )

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

      // Check for unmet dependencies when moving to todo
      const unmetDeps = getUnmetDependencies(story, stories)
      if (targetColumnId === 'todo' && unmetDeps.length > 0) {
        // Show confirmation dialog
        setPendingDrop({
          story,
          targetColumnId,
          unmetDependencies: unmetDeps,
        })
        setIsConfirmDialogOpen(true)
        return
      }

      // Execute the status change
      executeStatusChange(story, targetColumnId)
    },
    [stories, executeStatusChange],
  )

  // Handle confirmation dialog confirm
  const handleConfirmDrop = useCallback(() => {
    if (!pendingDrop) return

    executeStatusChange(pendingDrop.story, pendingDrop.targetColumnId)
    setIsConfirmDialogOpen(false)
    setPendingDrop(null)
  }, [pendingDrop, executeStatusChange])

  // Handle confirmation dialog cancel
  const handleCancelDrop = useCallback(() => {
    setIsConfirmDialogOpen(false)
    setPendingDrop(null)
  }, [])

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
        <div className="flex-1 overflow-x-auto" data-testid="kanban-board">
          <div className="flex gap-4 p-6 h-full min-w-0">
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

      {/* Dependency confirmation dialog */}
      <DependencyConfirmDialog
        isOpen={isConfirmDialogOpen}
        story={pendingDrop?.story ?? null}
        unmetDependencies={pendingDrop?.unmetDependencies ?? []}
        targetColumnTitle={
          KANBAN_COLUMNS.find((c) => c.id === pendingDrop?.targetColumnId)?.title ?? ''
        }
        onConfirm={handleConfirmDrop}
        onCancel={handleCancelDrop}
        isLoading={updateStatus.isPending}
      />
    </DndContext>
  )
}

import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  Settings2,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
  CircleDashed,
  Pencil,
  Check,
  X,
  ExternalLink,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/project/$id')({
  component: ProjectDetail,
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

// Stats card component
interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  color: string
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
      <div className={cn('p-2 rounded-lg', color)}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// Progress bar component
interface ProgressBarProps {
  progress: number
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="p-4 bg-card rounded-lg border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">
          Overall Progress
        </span>
        <span className="text-2xl font-bold text-foreground">{progress}%</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

// Settings row component
interface SettingsRowProps {
  label: string
  value: string | null
  icon: React.ReactNode
  editable?: boolean
  onEdit?: (value: string) => void
  isLoading?: boolean
}

function SettingsRow({
  label,
  value,
  icon,
  editable = false,
  onEdit,
  isLoading = false,
}: SettingsRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value || '')

  const handleSave = () => {
    if (onEdit) {
      onEdit(editValue)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value || '')
    setIsEditing(false)
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className={cn(
                'px-2 py-1 text-sm rounded border bg-background text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
              )}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') handleCancel()
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading}
              className="p-1 rounded hover:bg-accent text-emerald-500"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-foreground font-mono">
              {value || '-'}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Runner controls component
interface RunnerControlsProps {
  projectId: number
  runnerStatus: RunnerStatus
  currentStoryId?: string | null
  onStart: () => void
  onStop: () => void
  isStarting: boolean
  isStopping: boolean
}

function RunnerControls({
  runnerStatus,
  currentStoryId,
  onStart,
  onStop,
  isStarting,
  isStopping,
}: RunnerControlsProps) {
  const isRunning = runnerStatus === 'running'
  const isBusy = isStarting || isStopping || runnerStatus === 'stopping'

  return (
    <div className="p-4 bg-card rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Runner</h3>
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            runnerStatus === 'running' &&
              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            runnerStatus === 'stopping' &&
              'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            runnerStatus === 'idle' && 'bg-muted text-muted-foreground',
          )}
        >
          {runnerStatus === 'running' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Running
            </>
          )}
          {runnerStatus === 'stopping' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Stopping
            </>
          )}
          {runnerStatus === 'idle' && (
            <>
              <CircleDashed className="w-3 h-3" />
              Idle
            </>
          )}
        </div>
      </div>

      {currentStoryId && isRunning && (
        <p className="text-xs text-muted-foreground mb-4">
          Working on:{' '}
          <span className="font-mono text-foreground">{currentStoryId}</span>
        </p>
      )}

      <div className="flex gap-2">
        {!isRunning ? (
          <button
            type="button"
            onClick={onStart}
            disabled={isBusy}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
              'bg-emerald-500 text-white font-medium',
              'hover:bg-emerald-600 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isStarting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Runner
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            disabled={isBusy}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
              'bg-destructive text-destructive-foreground font-medium',
              'hover:bg-destructive/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isStopping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            Stop Runner
          </button>
        )}
      </div>
    </div>
  )
}

// Quick links component
interface QuickLinksProps {
  projectId: string
}

function QuickLinks({ projectId }: QuickLinksProps) {
  return (
    <div className="p-4 bg-card rounded-lg border">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Quick Links
      </h3>
      <div className="space-y-2">
        <Link
          to="/project/$id/kanban"
          params={{ id: projectId }}
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg',
            'bg-background hover:bg-accent transition-colors',
            'text-foreground',
          )}
        >
          <LayoutGrid className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Kanban Board</p>
            <p className="text-xs text-muted-foreground">
              Manage stories and track progress
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link
          to="/project/$id/prompts"
          params={{ id: projectId }}
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg',
            'bg-background hover:bg-accent transition-colors',
            'text-foreground',
          )}
        >
          <Settings2 className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Project Prompts</p>
            <p className="text-xs text-muted-foreground">
              Configure skills and overrides
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  )
}

function ProjectDetail() {
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
  const { data: stories = [] } = trpc.stories.listByProject.useQuery(
    { projectId },
    { enabled: !isNaN(projectId), staleTime: 30000 },
  )

  // Fetch runner status
  const { data: runnerState } = trpc.runner.getStatus.useQuery(
    { projectId },
    { enabled: !isNaN(projectId), refetchInterval: 3000 },
  )

  // Mutations
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.getById.invalidate({ id: projectId })
    },
  })

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

  // Handle branch name update
  const handleBranchNameUpdate = (newBranchName: string) => {
    updateProject.mutate({
      id: projectId,
      branchName: newBranchName || null,
    })
  }

  // Handle runner start/stop
  const handleStartRunner = () => {
    startRunner.mutate({ projectId })
  }

  const handleStopRunner = () => {
    stopRunner.mutate({ projectId })
  }

  // Loading state
  if (isLoadingProject) {
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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      {/* Project header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {project.name}
        </h1>
        {project.description && (
          <p className="text-lg text-muted-foreground">{project.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - stats and settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats section */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Story Statistics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard
                label="Completed"
                value={stats.done}
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                color="bg-emerald-500/10"
              />
              <StatCard
                label="In Progress"
                value={stats.inProgress}
                icon={<PlayCircle className="w-5 h-5 text-blue-500" />}
                color="bg-blue-500/10"
              />
              <StatCard
                label="Failed"
                value={stats.failed}
                icon={<AlertCircle className="w-5 h-5 text-destructive" />}
                color="bg-destructive/10"
              />
              <StatCard
                label="Pending"
                value={stats.pending}
                icon={<CircleDashed className="w-5 h-5 text-muted-foreground" />}
                color="bg-muted"
              />
            </div>
            <ProgressBar progress={stats.progress} />
          </div>

          {/* Settings section */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Settings
            </h2>
            <div className="bg-card rounded-lg border p-4">
              <SettingsRow
                label="Project Path"
                value={project.path}
                icon={<FolderOpen className="w-4 h-4" />}
                editable={false}
              />
              <SettingsRow
                label="Branch Name"
                value={project.branchName}
                icon={<GitBranch className="w-4 h-4" />}
                editable={true}
                onEdit={handleBranchNameUpdate}
                isLoading={updateProject.isPending}
              />
            </div>
          </div>
        </div>

        {/* Sidebar - runner controls and quick links */}
        <div className="space-y-6">
          <RunnerControls
            projectId={projectId}
            runnerStatus={runnerStatus}
            currentStoryId={runnerState?.storyId}
            onStart={handleStartRunner}
            onStop={handleStopRunner}
            isStarting={startRunner.isPending}
            isStopping={stopRunner.isPending}
          />

          <QuickLinks projectId={id} />
        </div>
      </div>
    </div>
  )
}

import { useState, useCallback, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Plus,
  Search,
  FolderOpen,
  Clock,
  PlayCircle,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Loader2,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { AddProjectModal } from '@/components/AddProjectModal'
import { DiscoverProjectsModal } from '@/components/DiscoverProjectsModal'
import { PrdConversionWizard } from '@/components/PrdConversionWizard'
import { useWebSocket } from '@/lib/websocket/client'

// Discovered project type for conversion wizard
interface DiscoveredProjectForConversion {
  path: string
  name: string
}

export const Route = createFileRoute('/')({ component: Dashboard })

// Project stats from the API
interface ProjectStats {
  total: number
  done: number
  failed: number
  inProgress: number
  backlog: number
  progress: number
}

// Project type from the API (with stats)
interface Project {
  id: number
  name: string
  path: string
  description: string | null
  branchName: string | null
  createdAt: Date
  updatedAt: Date
  stats: ProjectStats
}

// Runner status type
type RunnerStatus = 'idle' | 'running' | 'stopping'

// Format relative time
function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return d.toLocaleDateString()
}

// Project card component
interface ProjectCardProps {
  project: Project
}

function ProjectCard({ project }: ProjectCardProps) {
  // Fetch runner status
  const { data: runnerState } = trpc.runner.getStatus.useQuery(
    { projectId: project.id },
    { staleTime: 5000 }
  )

  // Use stats from the project object (already included in projects.list response)
  const stats = project.stats
  const runnerStatus: RunnerStatus = runnerState?.status ?? 'idle'

  return (
    <Link
      to="/project/$id"
      params={{ id: String(project.id) }}
      className="block group"
    >
      <Card className={cn(
        'py-4 gap-3 transition-all duration-200',
        'hover:border-primary/50 hover:shadow-lg'
      )}>
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate group-hover:text-primary transition-colors">
                {project.name}
              </CardTitle>
              {project.description && (
                <CardDescription className="line-clamp-2 mt-1">
                  {project.description}
                </CardDescription>
              )}
            </div>

            {/* Runner status indicator */}
            <div
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                runnerStatus === 'running' &&
                  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                runnerStatus === 'stopping' &&
                  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                runnerStatus === 'idle' &&
                  'bg-muted text-muted-foreground'
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
                  <Clock className="w-3 h-3" />
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
        </CardHeader>

        <CardContent>
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium text-foreground">{stats.progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-0">
          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs w-full">
            {/* Done count */}
            <div
              className="flex items-center gap-1 text-muted-foreground"
              title={`${stats.done} ${stats.done === 1 ? 'story' : 'stories'} completed`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{stats.done}</span>
            </div>

            {/* In progress count */}
            {stats.inProgress > 0 && (
              <div
                className="flex items-center gap-1 text-muted-foreground"
                title={`${stats.inProgress} ${stats.inProgress === 1 ? 'story' : 'stories'} in progress`}
              >
                <PlayCircle className="w-3.5 h-3.5 text-blue-500" />
                <span>{stats.inProgress}</span>
              </div>
            )}

            {/* Failed count */}
            {stats.failed > 0 && (
              <div
                className="flex items-center gap-1 text-muted-foreground"
                title={`${stats.failed} ${stats.failed === 1 ? 'story' : 'stories'} failed`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-destructive">{stats.failed}</span>
              </div>
            )}

            {/* Backlog count */}
            <div
              className="flex items-center gap-1 text-muted-foreground"
              title={`${stats.backlog} ${stats.backlog === 1 ? 'story' : 'stories'} in backlog`}
              data-testid="backlog-count"
            >
              <CircleDashed className="w-3.5 h-3.5" />
              <span>{stats.backlog}</span>
            </div>

            {/* Total stories */}
            <span className="text-muted-foreground">
              {stats.total} {stats.total === 1 ? 'story' : 'stories'}
            </span>

            {/* Last updated */}
            <div className="flex items-center gap-1 text-muted-foreground ml-auto">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatRelativeTime(project.updatedAt)}</span>
            </div>
          </div>
        </CardFooter>
      </Card>
    </Link>
  )
}

// Empty state component
function EmptyState({
  onAddProject,
  onDiscover,
}: {
  onAddProject: () => void
  onDiscover: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <FolderOpen className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        No projects yet
      </h2>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Add your first project to start managing stories and running Claude
        agents on your codebase.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button onClick={onAddProject}>
          <Plus className="w-4 h-4" />
          Add Project
        </Button>
        <Button variant="secondary" onClick={onDiscover}>
          <Search className="w-4 h-4" />
          Discover Projects
        </Button>
      </div>
    </div>
  )
}

function Dashboard() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isDiscoverModalOpen, setIsDiscoverModalOpen] = useState(false)
  const [conversionProject, setConversionProject] = useState<DiscoveredProjectForConversion | null>(null)
  const utils = trpc.useUtils()

  // Fetch all projects
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery(
    undefined,
    { staleTime: 10000 }
  )

  // Subscribe to all projects for real-time updates
  const projectIds = projects.map(p => String(p.id))

  // WebSocket for real-time story updates
  const { subscribe, unsubscribe } = useWebSocket({
    onStoriesUpdated: useCallback(() => {
      // Any story update should refresh project stats
      console.log('[Dashboard] Stories updated, invalidating projects cache')
      utils.projects.list.invalidate()
    }, [utils]),
    onRunnerCompleted: useCallback(() => {
      // Runner completed should also refresh stats
      console.log('[Dashboard] Runner completed, invalidating projects cache')
      utils.projects.list.invalidate()
    }, [utils]),
  })

  // Subscribe to all projects when the list changes
  useEffect(() => {
    projectIds.forEach(id => subscribe(id))
    return () => {
      projectIds.forEach(id => unsubscribe(id))
    }
  }, [projectIds.join(','), subscribe, unsubscribe])

  const handleAddProject = () => {
    setIsAddModalOpen(true)
  }

  const handleAddModalClose = () => {
    setIsAddModalOpen(false)
  }

  const handleAddSuccess = () => {
    // Invalidate projects list to refetch
    utils.projects.list.invalidate()
  }

  const handleDiscover = () => {
    setIsDiscoverModalOpen(true)
  }

  const handleDiscoverModalClose = () => {
    setIsDiscoverModalOpen(false)
  }

  const handleDiscoverSuccess = () => {
    // Invalidate projects list to refetch
    utils.projects.list.invalidate()
  }

  const handleNeedsConversion = (project: { path: string; name: string }) => {
    setConversionProject(project)
    setIsDiscoverModalOpen(false) // Close discover modal when opening conversion wizard
  }

  const handleConversionClose = () => {
    setConversionProject(null)
  }

  const handleConversionSuccess = () => {
    // Invalidate projects list and re-open discover modal to add the project
    utils.projects.list.invalidate()
    utils.projects.discover.invalidate()
    setConversionProject(null)
    setIsDiscoverModalOpen(true)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your projects and track story progress
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={handleDiscover}>
            <Search className="w-4 h-4" />
            Discover
          </Button>
          <Button size="sm" onClick={handleAddProject}>
            <Plus className="w-4 h-4" />
            Add Project
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && projects.length === 0 && (
        <EmptyState onAddProject={handleAddProject} onDiscover={handleDiscover} />
      )}

      {/* Projects grid */}
      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Add Project Modal */}
      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={handleAddModalClose}
        onSuccess={handleAddSuccess}
      />

      {/* Discover Projects Modal */}
      <DiscoverProjectsModal
        isOpen={isDiscoverModalOpen}
        onClose={handleDiscoverModalClose}
        onSuccess={handleDiscoverSuccess}
        onNeedsConversion={handleNeedsConversion}
      />

      {/* PRD Conversion Wizard */}
      {conversionProject && (
        <PrdConversionWizard
          isOpen={true}
          onClose={handleConversionClose}
          onSuccess={handleConversionSuccess}
          projectPath={conversionProject.path}
          projectName={conversionProject.name}
        />
      )}
    </div>
  )
}

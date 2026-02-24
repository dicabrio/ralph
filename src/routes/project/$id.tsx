import { useEffect } from 'react'
import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { ProjectNavTabs } from '@/components/ProjectNavTabs'

export const Route = createFileRoute('/project/$id')({
  component: ProjectLayout,
})

function ProjectLayout() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const projectId = parseInt(id, 10)

  // Fetch project to validate it exists
  const { data: project, isLoading, error } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !isNaN(projectId), retry: false }
  )

  // Fetch all projects to get the first one for fallback selection
  const { data: projects = [] } = trpc.projects.list.useQuery()

  // Redirect to dashboard if project doesn't exist
  useEffect(() => {
    // Don't redirect while loading
    if (isLoading) return

    // Don't redirect if we have valid data
    if (project) return

    // Only redirect on error or when data is missing
    if (error || (!isLoading && !project)) {
      toast.error('Project niet gevonden', {
        description: 'Het project bestaat niet of is verwijderd.',
      })

      // Auto-select first available project in localStorage if exists
      if (projects.length > 0) {
        localStorage.setItem('ralph-selected-project', String(projects[0].id))
      }

      // Redirect to dashboard
      navigate({ to: '/' })
    }
  }, [project, isLoading, error, navigate, projects])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error or not found - let child routes handle this since redirect is in progress
  if (!project) {
    return null
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Project header with back link and name */}
      <header className="flex-shrink-0 border-b border-border bg-background sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <h1 className="text-base font-semibold text-foreground truncate">
              {project.name}
            </h1>
          </div>
        </div>
        {/* Navigation tabs */}
        <ProjectNavTabs projectId={id} />
      </header>

      {/* Main content area */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

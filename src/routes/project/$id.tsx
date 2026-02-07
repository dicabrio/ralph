import { useEffect } from 'react'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'

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

  // While loading, just render the outlet (child routes handle their own loading states)
  return <Outlet />
}

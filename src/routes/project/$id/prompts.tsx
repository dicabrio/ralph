import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/project/$id/prompts')({
  component: ProjectPrompts,
})

function ProjectPrompts() {
  const { id } = Route.useParams()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Link
        to="/project/$id"
        params={{ id }}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Project
      </Link>
      <h1 className="text-2xl font-bold text-foreground mb-4">Project Prompts</h1>
      <p className="text-muted-foreground">
        Project ID: {id}
      </p>
      <p className="text-muted-foreground mt-4 text-sm">
        This page will be implemented in UI-015.
      </p>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/project/$id')({
  component: ProjectDetail,
})

function ProjectDetail() {
  const { id } = Route.useParams()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-4">
        Project Detail
      </h1>
      <p className="text-muted-foreground">
        Project ID: {id}
      </p>
      <p className="text-muted-foreground mt-4 text-sm">
        This page will be implemented in UI-005.
      </p>
    </div>
  )
}

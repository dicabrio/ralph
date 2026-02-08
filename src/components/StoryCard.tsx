import { cn } from '@/lib/utils'
import { AlertCircle, Link as LinkIcon } from 'lucide-react'

// Story status type
export type StoryStatus = 'pending' | 'in_progress' | 'done' | 'failed'

// Story type from the API
export interface Story {
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

export interface StoryCardProps {
  story: Story
  onClick?: () => void
  /** When true, removes left border radius for adjacent drag handle */
  hasDragHandle?: boolean
}

export function StoryCard({ story, onClick, hasDragHandle }: StoryCardProps) {
  const hasDependencies = story.dependencies.length > 0
  const isFailed = story.status === 'failed'

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault()
          onClick()
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'p-3 bg-card rounded-lg border shadow-sm',
        'hover:shadow-md hover:border-primary/30 transition-all',
        onClick && 'cursor-pointer',
        isFailed && 'border-destructive/30 bg-destructive/5',
        hasDragHandle && 'rounded-l-none border-l-0',
      )}
      data-testid="story-card"
    >
      {/* Header row: story ID and priority badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="text-xs font-mono text-muted-foreground"
          data-testid="story-id"
        >
          {story.id}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Failed badge */}
          {isFailed && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded',
                'bg-destructive/10 text-destructive',
              )}
              data-testid="failed-badge"
            >
              <AlertCircle className="w-3 h-3" />
              Failed
            </span>
          )}
          {/* Priority badge */}
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary"
            data-testid="priority-badge"
          >
            P{story.priority}
          </span>
        </div>
      </div>

      {/* Title */}
      <h4
        className="text-sm font-medium text-foreground line-clamp-2"
        data-testid="story-title"
      >
        {story.title}
      </h4>

      {/* Epic label */}
      <p
        className="text-xs text-muted-foreground mt-1 line-clamp-1"
        data-testid="story-epic"
      >
        {story.epic}
      </p>

      {/* Dependencies badges */}
      {hasDependencies && (
        <div className="flex flex-wrap gap-1 mt-2" data-testid="dependencies">
          {story.dependencies.map((depId) => (
            <span
              key={depId}
              className={cn(
                'inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded',
                'bg-muted text-muted-foreground',
              )}
              data-testid={`dependency-${depId}`}
            >
              <LinkIcon className="w-2.5 h-2.5" />
              {depId}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

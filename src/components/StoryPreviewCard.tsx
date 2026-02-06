import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  Check,
  Pencil,
  ListChecks,
  Sparkles,
} from 'lucide-react'

// Generated story type (before approval, no status)
export interface GeneratedStory {
  id: string
  title: string
  description: string
  priority: number
  epic: string
  dependencies: string[]
  recommendedSkills: string[]
  acceptanceCriteria: string[]
}

export interface StoryPreviewCardProps {
  story: GeneratedStory
  onEdit: () => void
  onApprove: () => void
  isApproving?: boolean
  isApproved?: boolean
}

export function StoryPreviewCard({
  story,
  onEdit,
  onApprove,
  isApproving = false,
  isApproved = false,
}: StoryPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasCriteria = story.acceptanceCriteria.length > 0
  const hasSkills = story.recommendedSkills.length > 0
  const hasDependencies = story.dependencies.length > 0

  return (
    <div
      className={cn(
        'p-4 bg-card rounded-lg border shadow-sm',
        'transition-all',
        isApproved && 'border-green-500/30 bg-green-500/5',
      )}
      data-testid="story-preview-card"
    >
      {/* Header row: priority and actions */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {/* Priority badge */}
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary"
            data-testid="priority-badge"
          >
            P{story.priority}
          </span>
          {/* Story ID */}
          <span
            className="text-xs font-mono text-muted-foreground"
            data-testid="story-id"
          >
            {story.id}
          </span>
          {/* Approved badge */}
          {isApproved && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded',
                'bg-green-500/10 text-green-600 dark:text-green-400',
              )}
              data-testid="approved-badge"
            >
              <Check className="w-3 h-3" />
              Added
            </span>
          )}
        </div>
        {/* Action buttons */}
        {!isApproved && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-xs rounded',
                'border border-border text-muted-foreground',
                'hover:text-foreground hover:border-primary/50 transition-colors',
              )}
              data-testid="edit-button"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={isApproving}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-xs rounded',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              data-testid="approve-button"
            >
              {isApproving ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  Approve
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Title */}
      <h4
        className="text-sm font-medium text-foreground"
        data-testid="story-title"
      >
        {story.title}
      </h4>

      {/* Description */}
      <p
        className="text-xs text-muted-foreground mt-1 line-clamp-2"
        data-testid="story-description"
      >
        {story.description}
      </p>

      {/* Epic label */}
      <p
        className="text-xs text-muted-foreground/70 mt-2"
        data-testid="story-epic"
      >
        Epic: {story.epic}
      </p>

      {/* Skills tags */}
      {hasSkills && (
        <div className="flex flex-wrap gap-1 mt-2" data-testid="skills-list">
          {story.recommendedSkills.map((skill) => (
            <span
              key={skill}
              className={cn(
                'inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded',
                'bg-purple-500/10 text-purple-600 dark:text-purple-400',
              )}
            >
              <Sparkles className="w-2.5 h-2.5" />
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Dependencies */}
      {hasDependencies && (
        <div className="flex flex-wrap gap-1 mt-2" data-testid="dependencies-list">
          {story.dependencies.map((depId) => (
            <span
              key={depId}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >
              ↳ {depId}
            </span>
          ))}
        </div>
      )}

      {/* Expandable criteria section */}
      {hasCriteria && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex items-center justify-between w-full text-xs text-muted-foreground',
              'hover:text-foreground transition-colors',
            )}
            data-testid="toggle-criteria"
          >
            <span className="flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" />
              {story.acceptanceCriteria.length} Acceptance Criteria
            </span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {isExpanded && (
            <ul
              className="mt-2 space-y-1 pl-4"
              data-testid="criteria-list"
            >
              {story.acceptanceCriteria.map((criterion, index) => (
                <li
                  key={index}
                  className="text-xs text-muted-foreground flex items-start gap-1.5"
                >
                  <span className="text-primary mt-0.5">•</span>
                  {criterion}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

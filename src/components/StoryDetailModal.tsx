import { useState, useCallback } from 'react'
import {
  X,
  AlertCircle,
  CheckCircle2,
  PlayCircle,
  CircleDashed,
  Link as LinkIcon,
  Plus,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Story, StoryStatus } from './StoryCard'

interface StoryDetailModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  story: Story | null
  allStories: Story[]
}

// Status configuration for display
const STATUS_CONFIG: Record<
  StoryStatus,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  pending: {
    label: 'Pending',
    icon: <CircleDashed className="w-4 h-4" />,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  backlog: {
    label: 'Backlog',
    icon: <CircleDashed className="w-4 h-4" />,
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-500/10',
  },
  in_progress: {
    label: 'In Progress',
    icon: <PlayCircle className="w-4 h-4" />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  done: {
    label: 'Done',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  failed: {
    label: 'Failed',
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
  },
}

export function StoryDetailModal({
  isOpen,
  onClose,
  projectId,
  story,
  allStories,
}: StoryDetailModalProps) {
  const [isAddingSkill, setIsAddingSkill] = useState(false)
  const [newSkillInput, setNewSkillInput] = useState('')
  const utils = trpc.useUtils()

  // Fetch available skills for the project
  const { data: availableSkills = [] } = trpc.skills.listByProject.useQuery(
    { projectId },
    { enabled: isOpen && projectId > 0 },
  )

  // Mutation for updating story skills
  const updateSkills = trpc.stories.updateSkills.useMutation({
    onSuccess: () => {
      utils.stories.listByProject.invalidate({ projectId })
    },
  })

  // Get dependency stories with their status
  const getDependencyStories = useCallback(() => {
    if (!story) return []
    return story.dependencies.map((depId) => {
      const depStory = allStories.find((s) => s.id === depId)
      return {
        id: depId,
        title: depStory?.title || 'Unknown Story',
        status: depStory?.status || 'pending',
        found: !!depStory,
      }
    })
  }, [story, allStories])

  // Handle adding a skill
  const handleAddSkill = useCallback(() => {
    if (!story || !newSkillInput.trim()) return

    const trimmedSkill = newSkillInput.trim()

    // Don't add if already exists
    if (story.recommendedSkills.includes(trimmedSkill)) {
      setNewSkillInput('')
      setIsAddingSkill(false)
      return
    }

    updateSkills.mutate({
      projectId,
      storyId: story.id,
      recommendedSkills: [...story.recommendedSkills, trimmedSkill],
    })

    setNewSkillInput('')
    setIsAddingSkill(false)
  }, [story, newSkillInput, projectId, updateSkills])

  // Handle removing a skill
  const handleRemoveSkill = useCallback(
    (skillToRemove: string) => {
      if (!story) return

      updateSkills.mutate({
        projectId,
        storyId: story.id,
        recommendedSkills: story.recommendedSkills.filter(
          (s) => s !== skillToRemove,
        ),
      })
    },
    [story, projectId, updateSkills],
  )

  // Handle skill input keydown
  const handleSkillInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAddSkill()
      }
      if (e.key === 'Escape') {
        setIsAddingSkill(false)
        setNewSkillInput('')
      }
    },
    [handleAddSkill],
  )

  // Get suggested skills (available skills not already added)
  const suggestedSkills = availableSkills
    .filter((skill) => !story?.recommendedSkills.includes(skill.id))
    .slice(0, 5)

  if (!story) return null

  const statusConfig = STATUS_CONFIG[story.status]
  const dependencyStories = getDependencyStories()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton={false}>
        {/* Header */}
        <DialogHeader className="flex-shrink-0 pb-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-muted-foreground">
                  {story.id}
                </span>
                <Badge variant="default">
                  P{story.priority}
                </Badge>
                <Badge variant={story.status as 'pending' | 'in_progress' | 'done' | 'failed' | 'backlog'}>
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
              </div>
              <DialogTitle className="line-clamp-2">
                {story.title}
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="-mr-1.5 mt-0.5"
              aria-label="Close"
              data-testid="close-button"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto py-5 space-y-6">
          {/* Description */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Description
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {story.description}
            </p>
          </section>

          {/* Epic */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Epic</h3>
            <span className="inline-flex text-sm px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              {story.epic}
            </span>
          </section>

          {/* Acceptance Criteria */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Acceptance Criteria
            </h3>
            {story.acceptanceCriteria.length > 0 ? (
              <ul className="space-y-2">
                {story.acceptanceCriteria.map((criterion, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-muted-foreground/50 shrink-0" />
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No acceptance criteria defined
              </p>
            )}
          </section>

          {/* Dependencies */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Dependencies
            </h3>
            {dependencyStories.length > 0 ? (
              <div className="space-y-2">
                {dependencyStories.map((dep) => {
                  const depStatus = STATUS_CONFIG[dep.status]
                  return (
                    <div
                      key={dep.id}
                      className={cn(
                        'flex items-center gap-3 p-2.5 rounded-lg border',
                        'bg-muted/30',
                        !dep.found && 'opacity-60',
                      )}
                      data-testid={`dependency-story-${dep.id}`}
                    >
                      <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground">
                          {dep.id}
                        </span>
                        <p className="text-sm text-foreground truncate">
                          {dep.title}
                        </p>
                      </div>
                      <Badge variant={dep.status as 'pending' | 'in_progress' | 'done' | 'failed' | 'backlog'}>
                        {depStatus.icon}
                        {depStatus.label}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No dependencies
              </p>
            )}
          </section>

          {/* Skills */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Recommended Skills
            </h3>
            <div className="space-y-3">
              {/* Current skills */}
              {story.recommendedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {story.recommendedSkills.map((skill) => (
                    <span
                      key={skill}
                      className="group inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full bg-primary/10 text-primary"
                      data-testid={`skill-tag-${skill}`}
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill)}
                        className="p-0.5 rounded hover:bg-primary/20 transition-colors opacity-60 hover:opacity-100"
                        aria-label={`Remove skill ${skill}`}
                        data-testid={`remove-skill-${skill}`}
                        disabled={updateSkills.isPending}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No skills assigned
                </p>
              )}

              {/* Add skill */}
              {isAddingSkill ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={newSkillInput}
                      onChange={(e) => setNewSkillInput(e.target.value)}
                      onKeyDown={handleSkillInputKeyDown}
                      placeholder="Enter skill name..."
                      className="flex-1"
                      autoFocus
                      data-testid="skill-input"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddSkill}
                      disabled={!newSkillInput.trim() || updateSkills.isPending}
                      data-testid="confirm-add-skill"
                    >
                      {updateSkills.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Add'
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setIsAddingSkill(false)
                        setNewSkillInput('')
                      }}
                      data-testid="cancel-add-skill"
                    >
                      Cancel
                    </Button>
                  </div>

                  {/* Suggested skills */}
                  {suggestedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-muted-foreground py-1">
                        Suggestions:
                      </span>
                      {suggestedSkills.map((skill) => (
                        <Button
                          key={skill.id}
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setNewSkillInput(skill.id)
                          }}
                          className="rounded-full"
                          data-testid={`suggested-skill-${skill.id}`}
                        >
                          {skill.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingSkill(true)}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="add-skill-button"
                >
                  <Plus className="w-4 h-4" />
                  Add skill
                </Button>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default StoryDetailModal

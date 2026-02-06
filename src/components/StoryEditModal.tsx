import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X, Plus, Trash2 } from 'lucide-react'
import type { GeneratedStory } from './StoryPreviewCard'

export interface StoryEditModalProps {
  story: GeneratedStory
  isOpen: boolean
  onClose: () => void
  onSave: (updatedStory: GeneratedStory) => void
}

export function StoryEditModal({
  story,
  isOpen,
  onClose,
  onSave,
}: StoryEditModalProps) {
  const [editedStory, setEditedStory] = useState<GeneratedStory>(story)
  const [newCriterion, setNewCriterion] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [newDependency, setNewDependency] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Reset form when story changes
  useEffect(() => {
    setEditedStory(story)
    setNewCriterion('')
    setNewSkill('')
    setNewDependency('')
  }, [story])

  // Focus title input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === modalRef.current) {
        onClose()
      }
    },
    [onClose],
  )

  const handleSave = useCallback(() => {
    onSave(editedStory)
    onClose()
  }, [editedStory, onSave, onClose])

  const updateField = <K extends keyof GeneratedStory>(
    field: K,
    value: GeneratedStory[K],
  ) => {
    setEditedStory((prev) => ({ ...prev, [field]: value }))
  }

  const addCriterion = useCallback(() => {
    if (newCriterion.trim()) {
      updateField('acceptanceCriteria', [
        ...editedStory.acceptanceCriteria,
        newCriterion.trim(),
      ])
      setNewCriterion('')
    }
  }, [newCriterion, editedStory.acceptanceCriteria])

  const removeCriterion = useCallback(
    (index: number) => {
      updateField(
        'acceptanceCriteria',
        editedStory.acceptanceCriteria.filter((_, i) => i !== index),
      )
    },
    [editedStory.acceptanceCriteria],
  )

  const addSkill = useCallback(() => {
    if (newSkill.trim() && !editedStory.recommendedSkills.includes(newSkill.trim())) {
      updateField('recommendedSkills', [
        ...editedStory.recommendedSkills,
        newSkill.trim(),
      ])
      setNewSkill('')
    }
  }, [newSkill, editedStory.recommendedSkills])

  const removeSkill = useCallback(
    (skill: string) => {
      updateField(
        'recommendedSkills',
        editedStory.recommendedSkills.filter((s) => s !== skill),
      )
    },
    [editedStory.recommendedSkills],
  )

  const addDependency = useCallback(() => {
    if (
      newDependency.trim() &&
      !editedStory.dependencies.includes(newDependency.trim())
    ) {
      updateField('dependencies', [
        ...editedStory.dependencies,
        newDependency.trim(),
      ])
      setNewDependency('')
    }
  }, [newDependency, editedStory.dependencies])

  const removeDependency = useCallback(
    (dep: string) => {
      updateField(
        'dependencies',
        editedStory.dependencies.filter((d) => d !== dep),
      )
    },
    [editedStory.dependencies],
  )

  if (!isOpen) return null

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-story-title"
      data-testid="story-edit-modal"
    >
      <div
        className={cn(
          'bg-card rounded-xl border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden',
          'flex flex-col',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2
            id="edit-story-title"
            className="text-lg font-semibold text-foreground"
          >
            Edit Story
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
            aria-label="Close modal"
            data-testid="close-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Story ID (read-only) */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Story ID
            </label>
            <input
              type="text"
              value={editedStory.id}
              onChange={(e) => updateField('id', e.target.value)}
              className={cn(
                'w-full px-3 py-2 text-sm border rounded-lg',
                'bg-background text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
              )}
              data-testid="input-id"
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Title *
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={editedStory.title}
              onChange={(e) => updateField('title', e.target.value)}
              className={cn(
                'w-full px-3 py-2 text-sm border rounded-lg',
                'bg-background text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
              )}
              data-testid="input-title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Description *
            </label>
            <textarea
              value={editedStory.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              className={cn(
                'w-full px-3 py-2 text-sm border rounded-lg resize-none',
                'bg-background text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
              )}
              data-testid="input-description"
            />
          </div>

          {/* Priority and Epic row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Priority
              </label>
              <input
                type="number"
                min={1}
                value={editedStory.priority}
                onChange={(e) =>
                  updateField('priority', parseInt(e.target.value) || 1)
                }
                className={cn(
                  'w-full px-3 py-2 text-sm border rounded-lg',
                  'bg-background text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50',
                )}
                data-testid="input-priority"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Epic *
              </label>
              <input
                type="text"
                value={editedStory.epic}
                onChange={(e) => updateField('epic', e.target.value)}
                className={cn(
                  'w-full px-3 py-2 text-sm border rounded-lg',
                  'bg-background text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50',
                )}
                data-testid="input-epic"
              />
            </div>
          </div>

          {/* Acceptance Criteria */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Acceptance Criteria
            </label>
            <div className="space-y-2">
              {editedStory.acceptanceCriteria.map((criterion, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm bg-muted/50 px-3 py-2 rounded-lg"
                >
                  <span className="flex-1">{criterion}</span>
                  <button
                    type="button"
                    onClick={() => removeCriterion(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    aria-label={`Remove criterion ${index + 1}`}
                    data-testid={`remove-criterion-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCriterion()
                    }
                  }}
                  placeholder="Add a criterion..."
                  className={cn(
                    'flex-1 px-3 py-2 text-sm border rounded-lg',
                    'bg-background text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                  )}
                  data-testid="input-new-criterion"
                />
                <button
                  type="button"
                  onClick={addCriterion}
                  disabled={!newCriterion.trim()}
                  className={cn(
                    'p-2 rounded-lg shrink-0',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                  aria-label="Add criterion"
                  data-testid="add-criterion-button"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Recommended Skills
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {editedStory.recommendedSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="hover:text-destructive transition-colors"
                    aria-label={`Remove skill ${skill}`}
                    data-testid={`remove-skill-${skill}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSkill()
                  }
                }}
                placeholder="Add a skill..."
                className={cn(
                  'flex-1 px-3 py-2 text-sm border rounded-lg',
                  'bg-background text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50',
                )}
                data-testid="input-new-skill"
              />
              <button
                type="button"
                onClick={addSkill}
                disabled={!newSkill.trim()}
                className={cn(
                  'p-2 rounded-lg shrink-0',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                aria-label="Add skill"
                data-testid="add-skill-button"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dependencies */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Dependencies
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {editedStory.dependencies.map((dep) => (
                <span
                  key={dep}
                  className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-muted text-muted-foreground"
                >
                  {dep}
                  <button
                    type="button"
                    onClick={() => removeDependency(dep)}
                    className="hover:text-destructive transition-colors"
                    aria-label={`Remove dependency ${dep}`}
                    data-testid={`remove-dependency-${dep}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDependency}
                onChange={(e) => setNewDependency(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addDependency()
                  }
                }}
                placeholder="Add a dependency (story ID)..."
                className={cn(
                  'flex-1 px-3 py-2 text-sm border rounded-lg font-mono',
                  'bg-background text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50',
                )}
                data-testid="input-new-dependency"
              />
              <button
                type="button"
                onClick={addDependency}
                disabled={!newDependency.trim()}
                className={cn(
                  'p-2 rounded-lg shrink-0',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                aria-label="Add dependency"
                data-testid="add-dependency-button"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'px-4 py-2 text-sm rounded-lg',
              'border border-border text-muted-foreground',
              'hover:text-foreground hover:border-primary/50 transition-colors',
            )}
            data-testid="cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={
              !editedStory.title.trim() ||
              !editedStory.description.trim() ||
              !editedStory.epic.trim()
            }
            className={cn(
              'px-4 py-2 text-sm rounded-lg',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            data-testid="save-button"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="story-edit-modal"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Story</DialogTitle>
        </DialogHeader>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Story ID */}
          <div className="space-y-1.5">
            <Label htmlFor="story-id" className="text-xs text-muted-foreground">
              Story ID
            </Label>
            <Input
              id="story-id"
              type="text"
              value={editedStory.id}
              onChange={(e) => updateField('id', e.target.value)}
              data-testid="input-id"
            />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="story-title" className="text-xs text-muted-foreground">
              Title *
            </Label>
            <Input
              ref={titleInputRef}
              id="story-title"
              type="text"
              value={editedStory.title}
              onChange={(e) => updateField('title', e.target.value)}
              data-testid="input-title"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="story-description" className="text-xs text-muted-foreground">
              Description *
            </Label>
            <Textarea
              id="story-description"
              value={editedStory.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              className="resize-none"
              data-testid="input-description"
            />
          </div>

          {/* Priority and Epic row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="story-priority" className="text-xs text-muted-foreground">
                Priority
              </Label>
              <Input
                id="story-priority"
                type="number"
                min={1}
                value={editedStory.priority}
                onChange={(e) =>
                  updateField('priority', parseInt(e.target.value) || 1)
                }
                data-testid="input-priority"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="story-epic" className="text-xs text-muted-foreground">
                Epic *
              </Label>
              <Input
                id="story-epic"
                type="text"
                value={editedStory.epic}
                onChange={(e) => updateField('epic', e.target.value)}
                data-testid="input-epic"
              />
            </div>
          </div>

          {/* Acceptance Criteria */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Acceptance Criteria
            </Label>
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
                <Input
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
                  className="flex-1"
                  data-testid="input-new-criterion"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={addCriterion}
                  disabled={!newCriterion.trim()}
                  aria-label="Add criterion"
                  data-testid="add-criterion-button"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Recommended Skills
            </Label>
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
              <Input
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
                className="flex-1"
                data-testid="input-new-skill"
              />
              <Button
                type="button"
                size="icon"
                onClick={addSkill}
                disabled={!newSkill.trim()}
                aria-label="Add skill"
                data-testid="add-skill-button"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Dependencies */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Dependencies
            </Label>
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
              <Input
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
                className="flex-1 font-mono"
                data-testid="input-new-dependency"
              />
              <Button
                type="button"
                size="icon"
                onClick={addDependency}
                disabled={!newDependency.trim()}
                aria-label="Add dependency"
                data-testid="add-dependency-button"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 pt-4 border-t border-border">
          <Button
            variant="secondary"
            onClick={onClose}
            data-testid="cancel-button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !editedStory.title.trim() ||
              !editedStory.description.trim() ||
              !editedStory.epic.trim()
            }
            data-testid="save-button"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

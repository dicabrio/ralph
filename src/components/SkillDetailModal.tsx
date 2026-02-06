import { useEffect, useState, useCallback } from 'react'
import { X, FileCode2, Copy, Check, Pencil, Save, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'

// Skill type
interface Skill {
  id: string
  name: string
  description: string
  content: string
  isOverride?: boolean
  hasOverride?: boolean
}

interface SkillDetailModalProps {
  skill: Skill
  isWritable?: boolean
  onClose: () => void
  onSaved?: () => void
}

// Extract category from skill ID
function extractCategory(skillId: string): string {
  const colonIndex = skillId.indexOf(':')
  if (colonIndex > 0) {
    return skillId.slice(0, colonIndex)
  }
  return 'general'
}

// Format category for display
function formatCategory(category: string): string {
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Category badge colors
const categoryColors: Record<string, string> = {
  'backend-development': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'frontend-design': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'database-design': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'api-design': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  testing: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  devops: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  general: 'bg-muted text-muted-foreground',
}

function getCategoryColor(category: string): string {
  return categoryColors[category] || 'bg-muted text-muted-foreground'
}

export function SkillDetailModal({ skill, isWritable = false, onClose, onSaved }: SkillDetailModalProps) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(skill.content)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const category = extractCategory(skill.id)

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  // Update central skill mutation
  const updateCentralMutation = trpc.skills.updateCentral.useMutation({
    onSuccess: () => {
      // Invalidate skills list to refresh data
      utils.skills.listCentral.invalidate()
      setIsEditing(false)
      setHasUnsavedChanges(false)
      onSaved?.()
    },
  })

  // Track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(editedContent !== skill.content)
  }, [editedContent, skill.content])

  // Reset edited content when skill changes
  useEffect(() => {
    setEditedContent(skill.content)
    setIsEditing(false)
    setHasUnsavedChanges(false)
  }, [skill.id, skill.content])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing && hasUnsavedChanges) {
          // Ask for confirmation before discarding changes
          if (window.confirm('You have unsaved changes. Discard them?')) {
            handleCancel()
          }
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, isEditing, hasUnsavedChanges])

  // Handle copy content
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editedContent : skill.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available or failed
    }
  }

  // Handle edit mode toggle
  const handleEdit = useCallback(() => {
    setIsEditing(true)
    setEditedContent(skill.content)
  }, [skill.content])

  // Handle cancel editing
  const handleCancel = useCallback(() => {
    setEditedContent(skill.content)
    setIsEditing(false)
    setHasUnsavedChanges(false)
  }, [skill.content])

  // Handle save
  const handleSave = useCallback(() => {
    updateCentralMutation.mutate({
      skillId: skill.id,
      content: editedContent,
    })
  }, [skill.id, editedContent, updateCentralMutation])

  // Handle content change
  const handleContentChange = useCallback((value: string) => {
    setEditedContent(value)
  }, [])

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (isEditing && hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Discard them?')) {
        handleCancel()
        onClose()
      }
    } else {
      onClose()
    }
  }, [isEditing, hasUnsavedChanges, handleCancel, onClose])

  // Check if save button should be enabled
  const canSave = isEditing && hasUnsavedChanges && !updateCentralMutation.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-detail-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 max-h-[90vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-4 flex-1 min-w-0 pr-4">
            <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileCode2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', getCategoryColor(category))}>
                  {formatCategory(category)}
                </span>
                {isEditing && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    Editing
                  </span>
                )}
                {hasUnsavedChanges && isEditing && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    Unsaved
                  </span>
                )}
              </div>
              <h2 id="skill-detail-modal-title" className="text-lg font-semibold text-foreground">
                {skill.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 -mr-1.5 mt-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Skill ID bar + Actions */}
        <div className="flex items-center justify-between px-6 py-2 bg-muted/50 border-b border-border text-sm gap-4">
          <span className="font-mono text-muted-foreground shrink-0">ID: {skill.id}</span>
          <div className="flex items-center gap-2">
            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                copied ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'hover:bg-accent text-muted-foreground'
              )}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>

            {/* Edit/Save/Cancel buttons (only if writable) */}
            {isWritable && (
              <>
                {isEditing ? (
                  <>
                    {/* Cancel button */}
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={updateCentralMutation.isPending}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                        'hover:bg-accent text-muted-foreground',
                        updateCentralMutation.isPending && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Cancel
                    </button>

                    {/* Save button */}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!canSave}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors',
                        canSave
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      )}
                    >
                      {updateCentralMutation.isPending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          Save
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium hover:bg-accent text-muted-foreground transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        {updateCentralMutation.isError && (
          <div className="px-6 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm">
            {updateCentralMutation.error?.message || 'Failed to save changes'}
          </div>
        )}

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {isEditing ? (
            <CodeMirror
              value={editedContent}
              onChange={handleContentChange}
              extensions={[markdown()]}
              theme={oneDark}
              className="min-h-full"
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
                foldGutter: true,
                dropCursor: true,
                allowMultipleSelections: true,
                indentOnInput: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
              }}
              style={{
                fontSize: '14px',
              }}
            />
          ) : (
            <pre className="p-6 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {skill.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default SkillDetailModal

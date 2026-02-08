import { useEffect, useState, useCallback, useMemo } from 'react'
import { Save, RotateCcw, Loader2, AlertCircle, GitCompare, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
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

interface SkillOverrideModalProps {
  skill: Skill
  isOpen: boolean
  projectId: number
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

// Simple diff line component for the diff view
interface DiffLineProps {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  lineNumber?: number
}

function DiffLine({ type, content }: DiffLineProps) {
  const bgColor = {
    added: 'bg-green-500/10',
    removed: 'bg-red-500/10',
    unchanged: 'bg-transparent',
  }[type]

  const textColor = {
    added: 'text-green-600 dark:text-green-400',
    removed: 'text-red-600 dark:text-red-400',
    unchanged: 'text-foreground',
  }[type]

  const prefix = {
    added: '+',
    removed: '-',
    unchanged: ' ',
  }[type]

  return (
    <div className={cn('flex font-mono text-sm', bgColor)}>
      <span className={cn('px-2 w-4 select-none', textColor)}>{prefix}</span>
      <span className={cn('flex-1 whitespace-pre-wrap break-all', textColor)}>{content || ' '}</span>
    </div>
  )
}

// Side-by-side diff view component
interface SideBySideDiffProps {
  original: string
  modified: string
  onModifiedChange: (value: string) => void
  isEditing: boolean
}

function SideBySideDiff({ original, modified, onModifiedChange, isEditing }: SideBySideDiffProps) {
  // Simple diff visualization - show both sides
  return (
    <div className="flex h-full border-t border-border">
      {/* Original (left side - read-only) */}
      <div className="flex-1 flex flex-col border-r border-border min-w-0">
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-sm font-medium text-muted-foreground">
          Original
        </div>
        <div className="flex-1 overflow-auto">
          <pre className="p-4 text-sm font-mono text-foreground/70 whitespace-pre-wrap break-words leading-relaxed min-h-full">
            {original}
          </pre>
        </div>
      </div>

      {/* Modified (right side - editable) */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-sm font-medium text-muted-foreground flex items-center gap-2">
          <span>Override</span>
          {isEditing && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
              Editing
            </span>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {isEditing ? (
            <CodeMirror
              value={modified}
              onChange={onModifiedChange}
              extensions={[markdown(), EditorView.lineWrapping]}
              theme={oneDark}
              className="min-h-full [&_.cm-editor]:min-h-full"
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
                height: '100%',
              }}
            />
          ) : (
            <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed min-h-full">
              {modified}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

// Unified diff view component
interface UnifiedDiffViewProps {
  diff: string
}

function UnifiedDiffView({ diff }: UnifiedDiffViewProps) {
  const lines = useMemo(() => diff.split('\n'), [diff])

  return (
    <div className="overflow-auto h-full">
      <div className="px-4 py-2 bg-muted/30 border-b border-border text-sm font-medium text-muted-foreground">
        Changes
      </div>
      <div className="font-mono text-sm">
        {lines.map((line, index) => {
          let type: 'added' | 'removed' | 'unchanged' = 'unchanged'
          let content = line

          if (line.startsWith('+') && !line.startsWith('+++')) {
            type = 'added'
            content = line.slice(1)
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            type = 'removed'
            content = line.slice(1)
          } else if (line.startsWith(' ')) {
            content = line.slice(1)
          }

          // Skip header lines
          if (line.startsWith('---') || line.startsWith('+++')) {
            return null
          }

          return <DiffLine key={index} type={type} content={content} />
        })}
      </div>
    </div>
  )
}

type ViewMode = 'side-by-side' | 'unified'

export function SkillOverrideModal({ skill, isOpen, projectId, onClose, onSaved }: SkillOverrideModalProps) {
  const [editedContent, setEditedContent] = useState(skill.content)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side')
  const [showRevertConfirm, setShowRevertConfirm] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const category = extractCategory(skill.id)

  const utils = trpc.useUtils()

  // Fetch diff data for existing overrides
  const {
    data: diffData,
    isLoading: isDiffLoading,
    error: diffError,
  } = trpc.skills.diff.useQuery(
    { projectId, skillId: skill.id },
    {
      enabled: isOpen && (skill.isOverride || skill.hasOverride),
      staleTime: 30000,
    }
  )

  // Fetch central skill for new overrides
  const { data: centralSkill, isLoading: isCentralLoading } = trpc.skills.getById.useQuery(
    { skillId: skill.id },
    {
      enabled: isOpen && !skill.isOverride && !skill.hasOverride,
      staleTime: 60000,
    }
  )

  // Determine the original content
  const originalContent = useMemo(() => {
    if (diffData) {
      return diffData.original
    }
    if (centralSkill) {
      return centralSkill.content
    }
    return skill.content
  }, [diffData, centralSkill, skill.content])

  // Initialize edited content when data loads
  useEffect(() => {
    if (diffData) {
      setEditedContent(diffData.override)
    } else if (centralSkill) {
      setEditedContent(centralSkill.content)
    } else {
      setEditedContent(skill.content)
    }
  }, [diffData, centralSkill, skill.content])

  // Track unsaved changes
  useEffect(() => {
    const isExistingOverride = skill.isOverride || skill.hasOverride
    if (isExistingOverride && diffData) {
      setHasUnsavedChanges(editedContent !== diffData.override)
    } else {
      setHasUnsavedChanges(editedContent !== originalContent)
    }
  }, [editedContent, originalContent, diffData, skill.isOverride, skill.hasOverride])

  // Create override mutation
  const createOverrideMutation = trpc.skills.createOverride.useMutation({
    onSuccess: () => {
      utils.skills.listByProject.invalidate({ projectId })
      utils.skills.diff.invalidate({ projectId, skillId: skill.id })
      setHasUnsavedChanges(false)
      onSaved?.()
    },
  })

  // Update override mutation
  const updateOverrideMutation = trpc.skills.updateOverride.useMutation({
    onSuccess: () => {
      utils.skills.listByProject.invalidate({ projectId })
      utils.skills.diff.invalidate({ projectId, skillId: skill.id })
      setHasUnsavedChanges(false)
      onSaved?.()
    },
  })

  // Delete override mutation
  const deleteOverrideMutation = trpc.skills.deleteOverride.useMutation({
    onSuccess: () => {
      utils.skills.listByProject.invalidate({ projectId })
      utils.skills.diff.invalidate({ projectId, skillId: skill.id })
      onSaved?.()
      onClose()
    },
  })

  const isSaving = createOverrideMutation.isPending || updateOverrideMutation.isPending
  const isDeleting = deleteOverrideMutation.isPending
  const isExistingOverride = skill.isOverride || skill.hasOverride
  const isLoading = isDiffLoading || isCentralLoading

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }, [hasUnsavedChanges, onClose])

  // Handle discard confirmation
  const handleDiscardConfirm = useCallback(() => {
    setShowDiscardConfirm(false)
    onClose()
  }, [onClose])

  // Handle save
  const handleSave = useCallback(() => {
    if (isExistingOverride) {
      updateOverrideMutation.mutate({
        projectId,
        skillId: skill.id,
        content: editedContent,
      })
    } else {
      createOverrideMutation.mutate({
        projectId,
        skillId: skill.id,
        content: editedContent,
      })
    }
  }, [isExistingOverride, projectId, skill.id, editedContent, updateOverrideMutation, createOverrideMutation])

  // Handle revert to original - opens confirmation dialog
  const handleRevertClick = useCallback(() => {
    setShowRevertConfirm(true)
  }, [])

  // Confirm revert action
  const handleRevertConfirm = useCallback(() => {
    deleteOverrideMutation.mutate({
      projectId,
      skillId: skill.id,
    })
    setShowRevertConfirm(false)
  }, [projectId, skill.id, deleteOverrideMutation])

  // Handle content change
  const handleContentChange = useCallback((value: string) => {
    setEditedContent(value)
  }, [])

  // Check if save button should be enabled
  const canSave = hasUnsavedChanges && !isSaving && !isDeleting

  // Get mutation error
  const mutationError =
    createOverrideMutation.error || updateOverrideMutation.error || deleteOverrideMutation.error

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-6xl h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <GitCompare className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', getCategoryColor(category))}>
                  {formatCategory(category)}
                </span>
                {isExistingOverride && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    Override
                  </span>
                )}
                {!isExistingOverride && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    New Override
                  </span>
                )}
                {hasUnsavedChanges && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    Unsaved
                  </span>
                )}
              </div>
              <DialogTitle>
                {skill.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
            </div>
          </div>
        </DialogHeader>

        {/* Action bar */}
        <div className="flex items-center justify-between py-2 bg-muted/50 border-b border-border text-sm gap-4 flex-shrink-0 -mx-6 px-6">
          <div className="flex items-center gap-4">
            <span className="font-mono text-muted-foreground">ID: {skill.id}</span>
            {/* View mode toggle */}
            <div className="flex items-center gap-1 p-0.5 bg-background rounded border border-border">
              <Button
                variant={viewMode === 'side-by-side' ? 'default' : 'ghost'}
                size="xs"
                onClick={() => setViewMode('side-by-side')}
              >
                Side by Side
              </Button>
              <Button
                variant={viewMode === 'unified' ? 'default' : 'ghost'}
                size="xs"
                onClick={() => setViewMode('unified')}
              >
                Unified
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Revert to original button (only for existing overrides) */}
            {isExistingOverride && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevertClick}
                disabled={isDeleting || isSaving}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Reverting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Revert to Original
                  </>
                )}
              </Button>
            )}

            {/* Save button */}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  {isExistingOverride ? 'Save Override' : 'Create Override'}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error message */}
        {(mutationError || diffError) && (
          <div className="px-6 py-2 -mx-6 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm flex items-center gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4" />
            {mutationError?.message || diffError?.message || 'An error occurred'}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}

        {/* Content */}
        {!isLoading && (
          <div className="flex-1 overflow-hidden -mx-6">
            {viewMode === 'side-by-side' ? (
              <SideBySideDiff
                original={originalContent}
                modified={editedContent}
                onModifiedChange={handleContentChange}
                isEditing={true}
              />
            ) : (
              <div className="h-full flex flex-col">
                {/* Unified diff view - show diff + editor */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 flex border-t border-border min-h-0">
                    {/* Diff view */}
                    <div className="w-1/2 border-r border-border overflow-auto">
                      {diffData?.diff ? (
                        <UnifiedDiffView diff={diffData.diff} />
                      ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                          No changes yet. Edit the override on the right.
                        </div>
                      )}
                    </div>
                    {/* Editor */}
                    <div className="w-1/2 flex flex-col overflow-hidden">
                      <div className="px-4 py-2 bg-muted/30 border-b border-border text-sm font-medium text-muted-foreground">
                        Edit Override
                      </div>
                      <div className="flex-1 overflow-auto">
                        <CodeMirror
                          value={editedContent}
                          onChange={handleContentChange}
                          extensions={[markdown(), EditorView.lineWrapping]}
                          theme={oneDark}
                          className="min-h-full [&_.cm-editor]:min-h-full"
                          basicSetup={{
                            lineNumbers: true,
                            highlightActiveLineGutter: true,
                            highlightActiveLine: true,
                            foldGutter: true,
                          }}
                          style={{
                            fontSize: '14px',
                            height: '100%',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Revert confirmation dialog */}
      <AlertDialog open={showRevertConfirm} onOpenChange={setShowRevertConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Revert to Original?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this override and revert to the original skill?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRevertConfirm}>
              <RotateCcw className="w-4 h-4" />
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard changes confirmation dialog */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-500/10">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDiscardConfirm}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

export default SkillOverrideModal

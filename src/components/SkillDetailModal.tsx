import { useEffect, useState, useCallback } from 'react'
import { FileCode2, Copy, Check, Pencil, Save, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  isOpen: boolean
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

export function SkillDetailModal({ skill, isOpen, isWritable = false, onClose, onSaved }: SkillDetailModalProps) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(skill.content)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
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
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }, [isEditing, hasUnsavedChanges, onClose])

  // Handle discard confirmation
  const handleDiscardConfirm = useCallback(() => {
    handleCancel()
    setShowDiscardConfirm(false)
    onClose()
  }, [handleCancel, onClose])

  // Check if save button should be enabled
  const canSave = isEditing && hasUnsavedChanges && !updateCentralMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 pb-4 border-b border-border">
          <div className="flex items-start gap-4">
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
              <DialogTitle>
                {skill.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
            </div>
          </div>
        </DialogHeader>

        {/* Skill ID bar + Actions */}
        <div className="flex items-center justify-between py-2 bg-muted/50 border-b border-border text-sm gap-4 flex-shrink-0 -mx-6 px-6">
          <span className="font-mono text-muted-foreground shrink-0">ID: {skill.id}</span>
          <div className="flex items-center gap-2">
            {/* Copy button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className={cn(
                copied && 'text-emerald-600 dark:text-emerald-400'
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
            </Button>

            {/* Edit/Save/Cancel buttons (only if writable) */}
            {isWritable && (
              <>
                {isEditing ? (
                  <>
                    {/* Cancel button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      disabled={updateCentralMutation.isPending}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Cancel
                    </Button>

                    {/* Save button */}
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={!canSave}
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
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEdit}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        {updateCentralMutation.isError && (
          <div className="px-6 py-2 -mx-6 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm">
            {updateCentralMutation.error?.message || 'Failed to save changes'}
          </div>
        )}

        {/* Content - Scrollable */}
        <ScrollArea className="flex-1 -mx-6">
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
        </ScrollArea>
      </DialogContent>

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

export default SkillDetailModal

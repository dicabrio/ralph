/**
 * Agent Prompt Card Component
 *
 * Displays the agent prompt template as a card with preview and edit functionality.
 * Used on both central Prompts page and Project Prompts page.
 */
import { useState, useEffect, useCallback } from 'react'
import { FileText, ChevronRight, Copy, Check, Pencil, Save, RotateCcw, Loader2, X, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
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

interface AgentPromptCardProps {
  /**
   * If provided, shows project-specific prompt controls.
   * If undefined, shows central (default) template view.
   */
  projectId?: number
  /**
   * Called when edit modal is requested
   */
  onEdit?: () => void
}

/**
 * Card component for displaying agent prompt info
 */
export function AgentPromptCard({ projectId, onEdit }: AgentPromptCardProps) {
  const isProjectContext = projectId !== undefined

  // Fetch appropriate prompt data
  const { data: defaultData, isLoading: isLoadingDefault } = trpc.prompts.getDefaultTemplate.useQuery(
    undefined,
    { enabled: !isProjectContext }
  )

  const { data: projectData, isLoading: isLoadingProject } = trpc.prompts.getProjectPrompt.useQuery(
    { projectId: projectId! },
    { enabled: isProjectContext }
  )

  const data = isProjectContext ? projectData : defaultData
  const isLoading = isProjectContext ? isLoadingProject : isLoadingDefault

  if (isLoading) {
    return (
      <Card className="py-4 gap-3 animate-pulse">
        <CardHeader className="py-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-muted rounded mb-2" />
              <div className="h-3 w-48 bg-muted rounded" />
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  if (!data) {
    return null
  }

  const statusBadge = isProjectContext && projectData ? (
    projectData.isCustom ? (
      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
        Customized
      </span>
    ) : (
      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
        Using default
      </span>
    )
  ) : null

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full text-left group"
      data-testid="agent-prompt-card"
    >
      <Card
        className={cn(
          'py-4 gap-3',
          'hover:border-primary/50 hover:shadow-md',
          'transition-all duration-200'
        )}
      >
        <CardHeader className="py-0">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                  Agent Prompt
                </h3>
                {statusBadge}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {isProjectContext
                  ? 'Runner prompt template for Claude containers'
                  : 'Default prompt template for all projects'}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="py-0">
          {/* Preview lines */}
          <div className="p-2 bg-muted/50 rounded text-xs font-mono text-muted-foreground overflow-hidden">
            <div className="line-clamp-3">{data.preview}</div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {data.lineCount} lines
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

interface AgentPromptModalProps {
  /**
   * If provided, shows project-specific prompt with diff view.
   * If undefined, shows central (default) template view.
   */
  projectId?: number
  onClose: () => void
}

/**
 * Modal for viewing and editing agent prompts
 */
export function AgentPromptModal({ projectId, onClose }: AgentPromptModalProps) {
  const isProjectContext = projectId !== undefined
  const utils = trpc.useUtils()

  // State
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [viewMode, setViewMode] = useState<'editor' | 'diff'>('editor')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Fetch data
  const { data: defaultData, isLoading: isLoadingDefault } = trpc.prompts.getDefaultTemplate.useQuery(
    undefined,
    { enabled: !isProjectContext }
  )

  const { data: projectData, isLoading: isLoadingProject, refetch: refetchProject } = trpc.prompts.getProjectPrompt.useQuery(
    { projectId: projectId! },
    { enabled: isProjectContext }
  )

  const { data: diffData, isLoading: isLoadingDiff, refetch: refetchDiff } = trpc.prompts.getPromptDiff.useQuery(
    { projectId: projectId! },
    { enabled: isProjectContext && viewMode === 'diff' }
  )

  // Mutations
  const updateProjectMutation = trpc.prompts.updateProjectPrompt.useMutation({
    onSuccess: () => {
      utils.prompts.getProjectPrompt.invalidate({ projectId: projectId! })
      utils.prompts.getPromptDiff.invalidate({ projectId: projectId! })
      utils.prompts.hasCustomPrompt.invalidate({ projectId: projectId! })
      setIsEditing(false)
      setHasUnsavedChanges(false)
      refetchProject()
      refetchDiff()
    },
  })

  const resetProjectMutation = trpc.prompts.resetProjectPrompt.useMutation({
    onSuccess: () => {
      utils.prompts.getProjectPrompt.invalidate({ projectId: projectId! })
      utils.prompts.getPromptDiff.invalidate({ projectId: projectId! })
      utils.prompts.hasCustomPrompt.invalidate({ projectId: projectId! })
      setIsEditing(false)
      setHasUnsavedChanges(false)
      refetchProject()
    },
  })

  const data = isProjectContext ? projectData : defaultData
  const isLoading = isProjectContext ? isLoadingProject : isLoadingDefault

  // Initialize edited content when data loads
  useEffect(() => {
    if (data?.content) {
      setEditedContent(data.content)
    }
  }, [data?.content])

  // Track unsaved changes
  useEffect(() => {
    if (data?.content) {
      setHasUnsavedChanges(editedContent !== data.content)
    }
  }, [editedContent, data?.content])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing && hasUnsavedChanges) {
          setShowDiscardConfirm(true)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, isEditing, hasUnsavedChanges])

  // Handlers
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editedContent : (data?.content ?? ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  const handleEdit = useCallback(() => {
    setIsEditing(true)
    setEditedContent(data?.content ?? '')
  }, [data?.content])

  const handleCancel = useCallback(() => {
    setEditedContent(data?.content ?? '')
    setIsEditing(false)
    setHasUnsavedChanges(false)
  }, [data?.content])

  const handleSave = useCallback(() => {
    if (isProjectContext) {
      updateProjectMutation.mutate({
        projectId: projectId!,
        content: editedContent,
      })
    }
  }, [projectId, editedContent, updateProjectMutation, isProjectContext])

  const handleReset = useCallback(() => {
    setShowResetConfirm(true)
  }, [])

  const handleResetConfirm = useCallback(() => {
    resetProjectMutation.mutate({ projectId: projectId! })
    setShowResetConfirm(false)
  }, [projectId, resetProjectMutation])

  const handleContentChange = useCallback((value: string) => {
    setEditedContent(value)
  }, [])

  const handleClose = useCallback(() => {
    if (isEditing && hasUnsavedChanges) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }, [isEditing, hasUnsavedChanges])

  const handleDiscardConfirm = useCallback(() => {
    setShowDiscardConfirm(false)
    onClose()
  }, [onClose])

  const canSave = isEditing && hasUnsavedChanges && !updateProjectMutation.isPending
  const isSaving = updateProjectMutation.isPending
  const isResetting = resetProjectMutation.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-prompt-modal-title"
      data-testid="agent-prompt-modal"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-full max-w-5xl mx-4 max-h-[90vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-4 flex-1 min-w-0 pr-4">
            <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 id="agent-prompt-modal-title" className="text-lg font-semibold text-foreground">
                  Agent Prompt
                </h2>
                {isProjectContext && projectData && (
                  projectData.isCustom ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      Customized
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                      Using default
                    </span>
                  )
                )}
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
              <p className="text-sm text-muted-foreground">
                {isProjectContext
                  ? 'Project-specific runner prompt. Edit to customize instructions for Claude.'
                  : 'Default prompt template used by all projects. Override at project level.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 -mr-1.5 mt-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close"
            data-testid="close-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-2 bg-muted/50 border-b border-border text-sm gap-4">
          {/* View toggle for project context */}
          {isProjectContext && projectData?.isCustom && !isEditing && (
            <div className="flex items-center gap-1 p-1 bg-background rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors',
                  viewMode === 'editor'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Content
              </button>
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors',
                  viewMode === 'diff'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Diff
              </button>
            </div>
          )}
          {(!isProjectContext || !projectData?.isCustom || isEditing) && <div />}

          <div className="flex items-center gap-2">
            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                copied ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'hover:bg-accent text-muted-foreground'
              )}
              data-testid="copy-button"
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

            {/* Edit/Save/Cancel buttons (only for project context) */}
            {isProjectContext && (
              <>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isSaving}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                        'hover:bg-accent text-muted-foreground',
                        isSaving && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Cancel
                    </button>
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
                      data-testid="save-button"
                    >
                      {isSaving ? (
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
                  <>
                    <button
                      type="button"
                      onClick={handleEdit}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium hover:bg-accent text-muted-foreground transition-colors"
                      data-testid="edit-button"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    {/* Reset button (only if customized) */}
                    {projectData?.isCustom && (
                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={isResetting}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                          'text-destructive hover:bg-destructive/10',
                          isResetting && 'opacity-50 cursor-not-allowed'
                        )}
                        data-testid="reset-button"
                      >
                        {isResetting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Resetting...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reset to default
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        {(updateProjectMutation.isError || resetProjectMutation.isError) && (
          <div className="px-6 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {updateProjectMutation.error?.message || resetProjectMutation.error?.message || 'An error occurred'}
          </div>
        )}

        {/* Content */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : isEditing ? (
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
              style={{ fontSize: '14px' }}
              data-testid="code-editor"
            />
          ) : viewMode === 'diff' && isProjectContext && diffData ? (
            <DiffView diff={diffData} isLoading={isLoadingDiff} />
          ) : (
            <pre className="p-6 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {data?.content}
            </pre>
          )}
        </ScrollArea>
      </div>

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

      {/* Reset to default confirmation dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Reset to Default?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete your customizations and reset the prompt to the default template.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleResetConfirm}>
              <RefreshCw className="w-4 h-4" />
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface DiffViewProps {
  diff: {
    original: string
    modified: string
    diff: string[]
    hasChanges: boolean
  }
  isLoading: boolean
}

function DiffView({ diff, isLoading }: DiffViewProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!diff.hasChanges) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Check className="w-12 h-12 mb-4 text-green-500" />
        <p className="font-medium text-foreground">No changes</p>
        <p className="text-sm mt-1">Project prompt is identical to the default template</p>
      </div>
    )
  }

  return (
    <div className="flex h-full" data-testid="diff-view">
      {/* Original (left) */}
      <div className="flex-1 border-r border-border overflow-auto">
        <div className="sticky top-0 bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground border-b border-border">
          Default Template
        </div>
        <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {diff.original}
        </pre>
      </div>

      {/* Modified (right) */}
      <div className="flex-1 overflow-auto">
        <div className="sticky top-0 bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground border-b border-border">
          Project Prompt
        </div>
        <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {diff.modified}
        </pre>
      </div>
    </div>
  )
}

export default AgentPromptCard

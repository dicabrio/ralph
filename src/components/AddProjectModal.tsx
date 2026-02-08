import { useState, useEffect, useCallback, useRef } from 'react'
import { FolderOpen, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface AddProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AddProjectModal({ isOpen, onClose, onSuccess }: AddProjectModalProps) {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Track if field has been touched (blur event occurred)
  // "Reward Early, Punish Late" pattern:
  // - Only show errors after user has left the field (punish late)
  // - Show success immediately when input becomes valid (reward early)
  const [pathTouched, setPathTouched] = useState(false)

  // Debounced path for validation
  const [debouncedPath, setDebouncedPath] = useState('')

  // Debounce the path input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPath(path.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [path])

  // Validate path query
  const {
    data: validation,
    isFetching: isValidating,
  } = trpc.projects.validatePath.useQuery(
    { path: debouncedPath },
    {
      enabled: debouncedPath.length > 0,
      staleTime: 5000,
      retry: false,
    }
  )

  // Create project mutation
  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      onSuccess?.()
      handleClose()
    },
    onError: (error) => {
      setSubmitError(error.message)
      setIsSubmitting(false)
    },
  })

  // Update name from prd.json suggestion when path is validated
  useEffect(() => {
    if (validation?.suggestedName && !name) {
      setName(validation.suggestedName)
    }
  }, [validation?.suggestedName, name])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    setPath('')
    setName('')
    setSubmitError(null)
    setDebouncedPath('')
    setPathTouched(false)
    onClose()
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Mark as touched on submit to show any validation errors
    setPathTouched(true)

    // Only require path to exist - prd.json will be created if missing
    if (!validation?.pathExists) {
      return
    }

    if (validation?.isAlreadyAdded) {
      setSubmitError('This project has already been added')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    createProject.mutate({
      path: path.trim(),
      name: name.trim() || validation.suggestedName || path.split('/').pop() || 'Untitled',
    })
  }

  // Determine validation state
  const getValidationState = () => {
    if (!debouncedPath) return null
    if (isValidating) return 'loading'
    if (!validation) return null
    if (validation.isAlreadyAdded) return 'already_added'
    if (!validation.pathExists) return 'path_not_found'
    if (!validation.hasPrd) return 'will_create_prd' // Path exists, prd.json will be created
    return 'valid'
  }

  const validationState = getValidationState()

  // "Reward Early, Punish Late" pattern:
  // - Show errors only after blur (touched) OR after failed submit attempt
  // - Show success/info immediately when valid (reward early)
  const isError = validationState === 'path_not_found' ||
    validationState === 'already_added'
  const showError = isError && pathTouched
  const showSuccess = validationState === 'valid'
  const showWillCreate = validationState === 'will_create_prd'

  // Can submit if path exists (prd.json will be created if missing)
  const canSubmit =
    debouncedPath.length > 0 &&
    (validationState === 'valid' || validationState === 'will_create_prd') &&
    !isSubmitting

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            {/* Path field */}
            <div className="space-y-2">
              <label
                htmlFor="project-path"
                className="block text-sm font-medium text-foreground"
              >
                Project Path
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  ref={inputRef}
                  id="project-path"
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onBlur={() => setPathTouched(true)}
                  placeholder="/path/to/your/project"
                  className={cn(
                    'w-full pl-10 pr-10 py-2.5 rounded-lg border bg-background',
                    'text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                    'transition-colors',
                    showSuccess && 'border-emerald-500 focus:border-emerald-500',
                    showWillCreate && 'border-blue-500 focus:border-blue-500',
                    showError && 'border-destructive focus:border-destructive'
                  )}
                  autoComplete="off"
                  spellCheck="false"
                />
                {/* Validation indicator */}
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  {validationState === 'loading' && (
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                  )}
                  {showSuccess && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                  {showWillCreate && (
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                  )}
                  {showError && (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>
              </div>

              {/* Validation message - only show errors after blur (punish late), show success immediately (reward early) */}
              {showError && validationState === 'path_not_found' && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Path does not exist
                </p>
              )}
              {showError && validationState === 'already_added' && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  This project has already been added
                </p>
              )}
              {showSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Valid project found
                </p>
              )}
              {showWillCreate && (
                <p className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Folder found — stories/prd.json will be created
                </p>
              )}
            </div>

            {/* Name field */}
            <div className="space-y-2">
              <label
                htmlFor="project-name"
                className="block text-sm font-medium text-foreground"
              >
                Project Name
                <span className="text-muted-foreground font-normal ml-1">
                  (optional)
                </span>
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  validation?.suggestedName ||
                  'Default from prd.json or folder name'
                }
                className={cn(
                  'w-full px-3 py-2.5 rounded-lg border bg-background border-border',
                  'text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                  'transition-colors'
                )}
              />
              {validation?.suggestedName && !name && (
                <p className="text-xs text-muted-foreground">
                  Will use "{validation.suggestedName}"{validation.hasPrd ? ' from prd.json' : ' (folder name)'}
                </p>
              )}
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="mt-4">
            <Button variant="secondary" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AddProjectModal

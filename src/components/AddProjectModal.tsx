import { useState, useEffect, useCallback, useRef } from 'react'
import { X, FolderOpen, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'

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

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleClose = useCallback(() => {
    setPath('')
    setName('')
    setSubmitError(null)
    setDebouncedPath('')
    onClose()
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validation?.hasPrd) {
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
    if (!validation.hasPrd) return 'no_prd'
    return 'valid'
  }

  const validationState = getValidationState()

  const canSubmit =
    debouncedPath.length > 0 &&
    validationState === 'valid' &&
    !isSubmitting

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2
            id="add-project-modal-title"
            className="text-lg font-semibold text-foreground"
          >
            Add Project
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 -mr-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-5">
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
                  placeholder="/path/to/your/project"
                  className={cn(
                    'w-full pl-10 pr-10 py-2.5 rounded-lg border bg-background',
                    'text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                    'transition-colors',
                    validationState === 'valid' && 'border-emerald-500 focus:border-emerald-500',
                    (validationState === 'path_not_found' ||
                      validationState === 'no_prd' ||
                      validationState === 'already_added') &&
                      'border-destructive focus:border-destructive'
                  )}
                  autoComplete="off"
                  spellCheck="false"
                />
                {/* Validation indicator */}
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  {validationState === 'loading' && (
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                  )}
                  {validationState === 'valid' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                  {(validationState === 'path_not_found' ||
                    validationState === 'no_prd' ||
                    validationState === 'already_added') && (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>
              </div>

              {/* Validation message */}
              {validationState === 'path_not_found' && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Path does not exist
                </p>
              )}
              {validationState === 'no_prd' && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  No prd.json found. The project must have a stories/prd.json file.
                </p>
              )}
              {validationState === 'already_added' && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  This project has already been added
                </p>
              )}
              {validationState === 'valid' && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Valid project found
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
                  Will use "{validation.suggestedName}" from prd.json
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
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-secondary text-secondary-foreground',
                'hover:bg-secondary/80 transition-colors'
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddProjectModal

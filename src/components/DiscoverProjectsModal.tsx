import { useState, useEffect, useCallback } from 'react'
import { X, FolderSearch, Loader2, CheckCircle2, FolderOpen, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'

interface DiscoverProjectsModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface DiscoveredProject {
  path: string
  name: string
  description: string | null
  branchName: string | null
  hasPrdJson: boolean
  isAdded: boolean
}

export function DiscoverProjectsModal({ isOpen, onClose, onSuccess }: DiscoverProjectsModalProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const utils = trpc.useUtils()

  // Discover projects query
  const {
    data: discoveryData,
    isLoading: isDiscovering,
    error: discoverError,
    refetch,
  } = trpc.projects.discover.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 0, // Always refetch when modal opens
  })

  // Create project mutation
  const createProject = trpc.projects.create.useMutation({
    onError: (error) => {
      setAddError(error.message)
    },
  })

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPaths(new Set())
      setAddError(null)
      setIsAdding(false)
      refetch()
    }
  }, [isOpen, refetch])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isAdding) {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, isAdding])

  const handleClose = useCallback(() => {
    if (!isAdding) {
      setSelectedPaths(new Set())
      setAddError(null)
      onClose()
    }
  }, [isAdding, onClose])

  const toggleSelection = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const selectAll = () => {
    if (!discoveryData) return
    const addablePaths = discoveryData.projects
      .filter((p) => !p.isAdded)
      .map((p) => p.path)
    setSelectedPaths(new Set(addablePaths))
  }

  const deselectAll = () => {
    setSelectedPaths(new Set())
  }

  const handleAddSelected = async () => {
    if (selectedPaths.size === 0 || !discoveryData) return

    setIsAdding(true)
    setAddError(null)

    const projectsToAdd = discoveryData.projects.filter(
      (p) => selectedPaths.has(p.path) && !p.isAdded
    )

    let addedCount = 0
    const errors: string[] = []

    for (const project of projectsToAdd) {
      try {
        await createProject.mutateAsync({
          path: project.path,
          name: project.name,
          description: project.description ?? undefined,
          branchName: project.branchName ?? undefined,
        })
        addedCount++
      } catch (error) {
        if (error instanceof Error) {
          errors.push(`${project.name}: ${error.message}`)
        }
      }
    }

    setIsAdding(false)

    if (errors.length > 0) {
      setAddError(`Some projects failed to add: ${errors.join(', ')}`)
    }

    if (addedCount > 0) {
      // Invalidate projects list to refetch
      utils.projects.list.invalidate()
      onSuccess?.()

      if (errors.length === 0) {
        handleClose()
      } else {
        // Refresh discovery to update isAdded status
        refetch()
        setSelectedPaths(new Set())
      }
    }
  }

  // Get available (not yet added) projects
  const availableProjects = discoveryData?.projects.filter((p) => !p.isAdded) || []
  const addedProjects = discoveryData?.projects.filter((p) => p.isAdded) || []
  const allSelected =
    availableProjects.length > 0 &&
    availableProjects.every((p) => selectedPaths.has(p.path))

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discover-projects-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderSearch className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2
                id="discover-projects-modal-title"
                className="text-lg font-semibold text-foreground"
              >
                Discover Projects
              </h2>
              {discoveryData && (
                <p className="text-xs text-muted-foreground">
                  Scanning: {discoveryData.projectsRoot}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isAdding}
            className={cn(
              'p-1.5 -mr-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
              isAdding && 'opacity-50 cursor-not-allowed'
            )}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading state */}
          {isDiscovering && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Scanning for projects...</p>
            </div>
          )}

          {/* Error state */}
          {discoverError && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <p className="text-destructive text-center">
                Failed to discover projects: {discoverError.message}
              </p>
            </div>
          )}

          {/* Empty state */}
          {!isDiscovering && !discoverError && discoveryData?.projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FolderOpen className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium mb-1">No projects found</p>
              <p className="text-muted-foreground text-sm text-center max-w-sm">
                No directories with a stories/prd.json file were found in {discoveryData?.projectsRoot || 'the projects folder'}.
              </p>
            </div>
          )}

          {/* Projects list */}
          {!isDiscovering && !discoverError && discoveryData && discoveryData.projects.length > 0 && (
            <div className="space-y-4">
              {/* Select all toggle */}
              {availableProjects.length > 0 && (
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">
                    {selectedPaths.size} of {availableProjects.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={allSelected ? deselectAll : selectAll}
                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
              )}

              {/* Available projects section */}
              {availableProjects.length > 0 && (
                <div className="space-y-2">
                  {availableProjects.map((project) => (
                    <ProjectRow
                      key={project.path}
                      project={project}
                      isSelected={selectedPaths.has(project.path)}
                      onToggle={() => toggleSelection(project.path)}
                      disabled={isAdding}
                    />
                  ))}
                </div>
              )}

              {/* Already added projects section */}
              {addedProjects.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    Already added ({addedProjects.length})
                  </p>
                  <div className="space-y-2">
                    {addedProjects.map((project) => (
                      <ProjectRow
                        key={project.path}
                        project={project}
                        isSelected={false}
                        onToggle={() => {}}
                        disabled={true}
                        isAdded={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {addError && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {addError}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-muted/30 shrink-0">
          <p className="text-xs text-muted-foreground">
            {discoveryData && !isDiscovering && (
              <>Found {discoveryData.projects.length} project{discoveryData.projects.length !== 1 ? 's' : ''}</>
            )}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isAdding}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-secondary text-secondary-foreground',
                'hover:bg-secondary/80 transition-colors',
                isAdding && 'opacity-50 cursor-not-allowed'
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={selectedPaths.size === 0 || isAdding}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Selected ({selectedPaths.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Project row component
interface ProjectRowProps {
  project: DiscoveredProject
  isSelected: boolean
  onToggle: () => void
  disabled?: boolean
  isAdded?: boolean
}

function ProjectRow({ project, isSelected, onToggle, disabled, isAdded }: ProjectRowProps) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer',
        isAdded && 'bg-muted/50 opacity-60 cursor-not-allowed',
        !isAdded && !disabled && 'hover:bg-accent/50 hover:border-accent',
        isSelected && !isAdded && 'bg-primary/5 border-primary/50',
        !isSelected && !isAdded && 'border-border bg-card',
        disabled && !isAdded && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* Checkbox */}
      <div className="pt-0.5">
        {isAdded ? (
          <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
        ) : (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            disabled={disabled}
            className={cn(
              'w-5 h-5 rounded border-2 transition-colors',
              'text-primary focus:ring-primary focus:ring-offset-0',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          />
        )}
      </div>

      {/* Project info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">{project.name}</span>
          {isAdded && (
            <span className="shrink-0 px-1.5 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground">
              Added
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{project.path}</p>
        {project.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {project.description}
          </p>
        )}
        {project.branchName && (
          <p className="text-xs text-muted-foreground mt-1">
            Branch: <span className="font-mono">{project.branchName}</span>
          </p>
        )}
      </div>
    </label>
  )
}

export default DiscoverProjectsModal

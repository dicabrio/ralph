import { useState, useEffect, useCallback } from 'react'
import { FolderSearch, Loader2, CheckCircle2, FolderOpen, AlertCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface DiscoverProjectsModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  onNeedsConversion?: (project: DiscoveredProject) => void
}

interface DiscoveredProject {
  path: string
  name: string
  description: string | null
  branchName: string | null
  hasPrdJson: boolean
  isAdded: boolean
  needsConversion?: boolean
  validationErrors?: string[]
}

export function DiscoverProjectsModal({ isOpen, onClose, onSuccess, onNeedsConversion }: DiscoverProjectsModalProps) {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderSearch className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Discover Projects</DialogTitle>
              {discoveryData && (
                <p className="text-xs text-muted-foreground">
                  Scanning: {discoveryData.projectsRoot}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
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
                  <Button
                    variant="link"
                    size="sm"
                    onClick={allSelected ? deselectAll : selectAll}
                    className="h-auto p-0"
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </Button>
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
                      disabled={isAdding || project.needsConversion}
                      onConvertClick={() => onNeedsConversion?.(project)}
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
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{addError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 pt-4 border-t border-border bg-muted/30 -mx-6 -mb-6 px-6 pb-6">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-muted-foreground">
              {discoveryData && !isDiscovering && (
                <>Found {discoveryData.projects.length} project{discoveryData.projects.length !== 1 ? 's' : ''}</>
              )}
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={isAdding}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={selectedPaths.size === 0 || isAdding}
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Selected ({selectedPaths.size})
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Project row component
interface ProjectRowProps {
  project: DiscoveredProject
  isSelected: boolean
  onToggle: () => void
  disabled?: boolean
  isAdded?: boolean
  onConvertClick?: () => void
}

function ProjectRow({ project, isSelected, onToggle, disabled, isAdded, onConvertClick }: ProjectRowProps) {
  const needsConversion = project.needsConversion && !isAdded

  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer',
        isAdded && 'bg-muted/50 opacity-60 cursor-not-allowed',
        needsConversion && 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20',
        !isAdded && !disabled && !needsConversion && 'hover:bg-accent/50 hover:border-accent',
        isSelected && !isAdded && !needsConversion && 'bg-primary/5 border-primary/50',
        !isSelected && !isAdded && !needsConversion && 'border-border bg-card',
        disabled && !isAdded && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* Checkbox */}
      <div className="pt-0.5">
        {isAdded ? (
          <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
        ) : needsConversion ? (
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        ) : (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle()}
            disabled={disabled}
            className="w-5 h-5"
          />
        )}
      </div>

      {/* Project info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground truncate">{project.name}</span>
          {isAdded && (
            <Badge variant="secondary">
              Added
            </Badge>
          )}
          {needsConversion && (
            <Badge
              variant="pending"
              className="cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/50"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onConvertClick?.()
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onConvertClick?.()
                }
              }}
              data-testid="needs-conversion-badge"
            >
              Needs conversion
            </Badge>
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
        {needsConversion && project.validationErrors && project.validationErrors.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            {project.validationErrors.length} validation {project.validationErrors.length === 1 ? 'error' : 'errors'}
          </p>
        )}
      </div>
    </label>
  )
}

export default DiscoverProjectsModal

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Search, ChevronDown, Check, FolderOpen, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ProjectSelectorProps {
  isCollapsed?: boolean
  onProjectChange?: (projectId: number) => void
  onClose?: () => void // For mobile sidebar close
}

export function ProjectSelector({
  isCollapsed = false,
  onProjectChange,
  onClose,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Get project ID from URL params
  const params = useParams({ strict: false })
  const projectIdFromUrl = params.id ? Number(params.id) : null

  // Fetch projects
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery()

  // Get selected project ID from URL or localStorage
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
    if (projectIdFromUrl) return projectIdFromUrl
    // Only access localStorage in browser
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ralph-selected-project')
      return stored ? Number(stored) : null
    }
    return null
  })

  // Auto-select first project if none selected and projects exist
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      const firstProject = projects[0]
      setSelectedProjectId(firstProject.id)
      localStorage.setItem('ralph-selected-project', String(firstProject.id))
    }
  }, [projects, selectedProjectId])

  // Sync with URL when it changes
  useEffect(() => {
    if (projectIdFromUrl && projectIdFromUrl !== selectedProjectId) {
      setSelectedProjectId(projectIdFromUrl)
      localStorage.setItem('ralph-selected-project', String(projectIdFromUrl))
    }
  }, [projectIdFromUrl, selectedProjectId])

  // Get the currently selected project
  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Filter projects based on search
  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(search.toLowerCase())
  )

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearch('')
    } else if (e.key === 'Enter' && filteredProjects.length > 0) {
      handleSelectProject(filteredProjects[0].id)
    }
  }

  // Handle project selection
  const handleSelectProject = (projectId: number) => {
    setSelectedProjectId(projectId)
    localStorage.setItem('ralph-selected-project', String(projectId))
    setIsOpen(false)
    setSearch('')
    onProjectChange?.(projectId)
    onClose?.()

    // Navigate to project overview
    navigate({ to: '/project/$id', params: { id: String(projectId) } })
  }

  // Handle add project click
  const handleAddProject = () => {
    setIsOpen(false)
    onClose?.()
    navigate({ to: '/' })
    // Could open AddProjectModal here
  }

  if (isLoading) {
    return (
      <div className={cn(
        'mx-2 px-3 py-2 rounded-lg bg-sidebar-accent/30',
        isCollapsed && 'mx-1 px-2'
      )}>
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-sidebar-foreground/20 rounded" />
          {!isCollapsed && <div className="h-4 bg-sidebar-foreground/20 rounded flex-1" />}
        </div>
      </div>
    )
  }

  // No projects state
  if (projects.length === 0) {
    return (
      <button
        type="button"
        onClick={handleAddProject}
        className={cn(
          'mx-2 flex items-center gap-2 px-3 py-2 rounded-lg w-[calc(100%-16px)]',
          'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          'transition-colors border border-dashed border-sidebar-border',
          isCollapsed && 'mx-1 px-2 justify-center'
        )}
      >
        <Plus className="w-4 h-4" />
        {!isCollapsed && <span className="text-sm">Project toevoegen</span>}
      </button>
    )
  }

  // Collapsed state - just show icon button
  if (isCollapsed) {
    return (
      <div className="relative mx-1" ref={dropdownRef}>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                  'w-full flex items-center justify-center p-2 rounded-lg',
                  'bg-sidebar-accent text-sidebar-accent-foreground',
                  'hover:bg-sidebar-accent/80 transition-colors'
                )}
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {selectedProject?.name || 'Selecteer project'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Dropdown - positioned to the right in collapsed mode */}
        {isOpen && (
          <div className="absolute left-full top-0 ml-2 w-64 bg-popover border border-border rounded-lg shadow-lg z-50">
            {/* Search input */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Zoeken..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-8 h-8"
                />
              </div>
            </div>

            {/* Project list */}
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredProjects.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Geen projecten gevonden
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleSelectProject(project.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left',
                      'hover:bg-accent transition-colors',
                      project.id === selectedProjectId && 'bg-accent'
                    )}
                  >
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{project.name}</span>
                    {project.id === selectedProjectId && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Add project button */}
            <div className="p-1 border-t border-border">
              <button
                type="button"
                onClick={handleAddProject}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nieuw project</span>
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Expanded state
  return (
    <div className="relative mx-2" ref={dropdownRef}>
      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-sidebar-accent text-sidebar-accent-foreground',
          'hover:bg-sidebar-accent/80 transition-colors'
        )}
      >
        <FolderOpen className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-sm font-medium truncate text-left">
          {selectedProject?.name || 'Selecteer project'}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 shrink-0 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Zoeken..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-8 h-8"
              />
            </div>
          </div>

          {/* Project list */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredProjects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Geen projecten gevonden
              </div>
            ) : (
              filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleSelectProject(project.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left',
                    'hover:bg-accent transition-colors',
                    project.id === selectedProjectId && 'bg-accent'
                  )}
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{project.name}</span>
                  {project.id === selectedProjectId && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Add project button */}
          <div className="p-1 border-t border-border">
            <button
              type="button"
              onClick={handleAddProject}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nieuw project</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Hook to get the currently selected project ID
export function useSelectedProject() {
  const params = useParams({ strict: false })
  const projectIdFromUrl = params.id ? Number(params.id) : null

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
    if (projectIdFromUrl) return projectIdFromUrl
    // Only access localStorage in browser
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ralph-selected-project')
      return stored ? Number(stored) : null
    }
    return null
  })

  useEffect(() => {
    if (projectIdFromUrl && projectIdFromUrl !== selectedProjectId) {
      setSelectedProjectId(projectIdFromUrl)
    }
  }, [projectIdFromUrl, selectedProjectId])

  return selectedProjectId
}

export default ProjectSelector

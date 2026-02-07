import { Link, useRouterState } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  MessageSquareText,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  Zap,
  FolderKanban,
  Home,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { ProjectSelector, useSelectedProject } from './ProjectSelector'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

// Global navigation items (always visible)
const globalNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Prompts', href: '/prompts', icon: FileCode2 },
]

// Project-specific navigation items
const projectNavItems: { label: string; path: string; icon: React.ElementType }[] = [
  { label: 'Overview', path: '', icon: Home },
  { label: 'Kanban', path: '/kanban', icon: FolderKanban },
  { label: 'Brainstorm', path: '/brainstorm', icon: MessageSquareText },
  { label: 'Prompts', path: '/prompts', icon: FileCode2 },
  { label: 'Settings', path: '/settings', icon: Settings },
]

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({
  isCollapsed,
  onToggle,
  isMobile = false,
  isOpen = true,
  onClose,
}: SidebarProps) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const selectedProjectId = useSelectedProject()

  // Fetch projects to check if any exist
  const { data: projects = [] } = trpc.projects.list.useQuery()
  const hasProjects = projects.length > 0

  // Check if a global nav item is active
  const isGlobalActive = (href: string) => {
    if (href === '/') {
      return currentPath === '/'
    }
    // For global prompts, check if we're on /prompts but NOT on /project/:id/prompts
    if (href === '/prompts') {
      return currentPath === '/prompts'
    }
    return false
  }

  // Check if a project sub-nav item is active
  const isProjectNavActive = (path: string) => {
    if (!selectedProjectId) return false
    const projectBasePath = `/project/${selectedProjectId}`

    if (path === '') {
      // Overview is active when we're exactly on /project/:id
      return currentPath === projectBasePath
    }
    // For other items, check if path matches
    return currentPath === `${projectBasePath}${path}`
  }

  if (isMobile && !isOpen) {
    return null
  }

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 h-full z-50 flex flex-col',
          'bg-sidebar border-r border-sidebar-border',
          'transition-all duration-300 ease-out',
          isMobile
            ? 'w-72 shadow-2xl'
            : isCollapsed
              ? 'w-16'
              : 'w-64',
          isMobile && !isOpen && '-translate-x-full',
          isMobile && isOpen && 'translate-x-0'
        )}
      >
        {/* Logo section */}
        <div className="h-16 flex items-center border-b border-sidebar-border px-4">
          <Link
            to="/"
            className="flex items-center gap-3 overflow-hidden"
            onClick={isMobile ? onClose : undefined}
          >
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <span
              className={cn(
                'font-bold text-lg tracking-tight text-sidebar-foreground whitespace-nowrap',
                'transition-opacity duration-200',
                !isMobile && isCollapsed ? 'opacity-0' : 'opacity-100'
              )}
            >
              Ralph
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {/* Global Navigation */}
          <div className="px-2 mb-4">
            {!isCollapsed && !isMobile && (
              <div className="px-3 mb-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                Algemeen
              </div>
            )}
            <ul className="space-y-1">
              {globalNavItems.map((item) => {
                const Icon = item.icon
                const active = isGlobalActive(item.href)

                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      onClick={isMobile ? onClose : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                        'transition-all duration-150',
                        'group relative',
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-5 h-5 shrink-0 transition-colors',
                          active
                            ? 'text-sidebar-primary'
                            : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'
                        )}
                      />
                      <span
                        className={cn(
                          'whitespace-nowrap transition-opacity duration-200',
                          !isMobile && isCollapsed ? 'opacity-0 w-0' : 'opacity-100'
                        )}
                      >
                        {item.label}
                      </span>

                      {/* Active indicator */}
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-sidebar-primary" />
                      )}

                      {/* Tooltip for collapsed state */}
                      {!isMobile && isCollapsed && (
                        <div
                          className={cn(
                            'absolute left-full ml-2 px-2 py-1 rounded-md',
                            'bg-popover text-popover-foreground text-sm font-medium',
                            'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
                            'transition-all duration-150 whitespace-nowrap',
                            'shadow-lg border border-border z-50'
                          )}
                        >
                          {item.label}
                        </div>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Project Section */}
          <div className="px-2">
            {!isCollapsed && !isMobile && (
              <div className="px-3 mb-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                Project
              </div>
            )}

            {/* Project Selector */}
            <ProjectSelector
              isCollapsed={!isMobile && isCollapsed}
              onClose={onClose}
            />

            {/* Project Sub-navigation - only show when projects exist */}
            {selectedProjectId && hasProjects && (
              <ul className="mt-2 space-y-1">
                {projectNavItems.map((item) => {
                  const Icon = item.icon
                  const active = isProjectNavActive(item.path)
                  const href = `/project/${selectedProjectId}${item.path}`

                  return (
                    <li key={item.path}>
                      <Link
                        to={href}
                        onClick={isMobile ? onClose : undefined}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg',
                          'transition-all duration-150',
                          'group relative',
                          !isMobile && !isCollapsed && 'ml-2',
                          active
                            ? 'text-sidebar-accent-foreground font-semibold'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}
                      >
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0 transition-colors',
                            active
                              ? 'text-sidebar-primary'
                              : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'
                          )}
                        />
                        <span
                          className={cn(
                            'whitespace-nowrap transition-opacity duration-200 text-sm',
                            !isMobile && isCollapsed ? 'opacity-0 w-0' : 'opacity-100'
                          )}
                        >
                          {item.label}
                        </span>

                        {/* Active indicator line */}
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-sidebar-primary" />
                        )}

                        {/* Tooltip for collapsed state */}
                        {!isMobile && isCollapsed && (
                          <div
                            className={cn(
                              'absolute left-full ml-2 px-2 py-1 rounded-md',
                              'bg-popover text-popover-foreground text-sm font-medium',
                              'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
                              'transition-all duration-150 whitespace-nowrap',
                              'shadow-lg border border-border z-50'
                            )}
                          >
                            {item.label}
                          </div>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </nav>

        {/* Collapse toggle - only on desktop */}
        {!isMobile && (
          <div className="p-2 border-t border-sidebar-border">
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                'w-full flex items-center justify-center py-2 rounded-lg',
                'text-sidebar-foreground/60 hover:text-sidebar-foreground',
                'hover:bg-sidebar-accent/50 transition-colors'
              )}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

// Hook to manage sidebar state
export function useSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Persist collapsed state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [])

  const toggleCollapsed = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  const openMobile = () => setIsMobileOpen(true)
  const closeMobile = () => setIsMobileOpen(false)

  return {
    isCollapsed,
    isMobileOpen,
    toggleCollapsed,
    openMobile,
    closeMobile,
  }
}

export default Sidebar

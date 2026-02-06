import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar, useSidebar } from './Sidebar'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: React.ReactNode
}

// Hook to detect if we're on mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }

    // Check on mount
    checkMobile()

    // Listen for resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

// Hook to handle dark mode based on system preference
function useDarkMode() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateTheme = (e: MediaQueryList | MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    // Set initial theme
    updateTheme(mediaQuery)

    // Listen for changes
    mediaQuery.addEventListener('change', updateTheme)
    return () => mediaQuery.removeEventListener('change', updateTheme)
  }, [])
}

export function Layout({ children }: LayoutProps) {
  const isMobile = useIsMobile()
  const { isCollapsed, isMobileOpen, toggleCollapsed, openMobile, closeMobile } =
    useSidebar()

  // Enable dark mode based on system preference
  useDarkMode()

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - desktop: permanent, mobile: overlay */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggle={toggleCollapsed}
        isMobile={isMobile}
        isOpen={isMobileOpen}
        onClose={closeMobile}
      />

      {/* Mobile header bar */}
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 h-16 bg-background border-b border-border z-30 flex items-center px-4">
          <button
            type="button"
            onClick={openMobile}
            className="p-2 -ml-2 rounded-lg text-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 font-bold text-lg tracking-tight text-foreground">
            Ralph
          </span>
        </header>
      )}

      {/* Main content area */}
      <main
        className={cn(
          'transition-all duration-300 ease-out',
          isMobile
            ? 'pt-16' // Account for mobile header
            : isCollapsed
              ? 'pl-16'
              : 'pl-64'
        )}
      >
        <div className="min-h-screen">{children}</div>
      </main>
    </div>
  )
}

export default Layout

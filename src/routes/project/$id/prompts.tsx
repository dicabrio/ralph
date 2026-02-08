import { useState, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
  AlertCircle,
  FolderOpen,
  Check,
  Sparkles,
  GitBranch,
  Filter,
  GitCompare,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { SkillDetailModal } from '@/components/SkillDetailModal'
import { SkillOverrideModal } from '@/components/SkillOverrideModal'
import { AgentPromptCard, AgentPromptModal } from '@/components/AgentPromptCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/project/$id/prompts')({
  component: ProjectPrompts,
})

// Skill type from API
interface Skill {
  id: string
  name: string
  description: string
  content: string
  isOverride?: boolean
  hasOverride?: boolean
}

// Filter options
type FilterType = 'all' | 'active' | 'overridden'

// Extract category from skill ID (e.g., "backend-development:api-patterns" -> "backend-development")
function extractCategory(skillId: string): string {
  const colonIndex = skillId.indexOf(':')
  if (colonIndex > 0) {
    return skillId.slice(0, colonIndex)
  }
  return 'general'
}

// Format category for display (e.g., "backend-development" -> "Backend Development")
function formatCategory(category: string): string {
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Group skills by category
function groupSkillsByCategory(skills: Skill[]): Map<string, Skill[]> {
  const grouped = new Map<string, Skill[]>()

  for (const skill of skills) {
    const category = extractCategory(skill.id)
    const existing = grouped.get(category) || []
    grouped.set(category, [...existing, skill])
  }

  // Sort categories alphabetically, but put "general" first if it exists
  const sortedMap = new Map<string, Skill[]>()
  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
    if (a === 'general') return -1
    if (b === 'general') return 1
    return a.localeCompare(b)
  })

  for (const key of sortedKeys) {
    sortedMap.set(key, grouped.get(key)!)
  }

  return sortedMap
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

// Skill card component for project prompts
interface ProjectSkillCardProps {
  skill: Skill
  isActive: boolean
  onToggleActive: () => void
  onClick: () => void
  onOverrideClick: () => void
  isToggling: boolean
}

function ProjectSkillCard({ skill, isActive, onToggleActive, onClick, onOverrideClick, isToggling }: ProjectSkillCardProps) {
  const category = extractCategory(skill.id)

  return (
    <div
      className={cn(
        'w-full p-4 rounded-lg border bg-card',
        'transition-all duration-200 group',
        isActive && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Toggle button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleActive()
          }}
          disabled={isToggling}
          className={cn(
            'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
            'border-2 transition-all duration-200',
            isActive
              ? 'bg-primary border-primary text-primary-foreground'
              : 'bg-background border-muted-foreground/30 hover:border-primary/50',
            isToggling && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={isActive ? `Deactivate ${skill.name}` : `Activate ${skill.name}`}
        >
          {isToggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isActive ? (
            <Check className="w-5 h-5" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          )}
        </button>

        {/* Skill info - clickable to open detail */}
        <button
          type="button"
          onClick={onClick}
          className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
              {skill.name}
            </h3>
            <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', getCategoryColor(category))}>
              {formatCategory(category)}
            </span>
            {skill.isOverride && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                Override
              </span>
            )}
            {isActive && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{skill.description}</p>
        </button>

        {/* Override button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOverrideClick()
          }}
          className={cn(
            'shrink-0 p-2 rounded-lg transition-all duration-200',
            'text-muted-foreground hover:text-primary hover:bg-primary/10',
            skill.isOverride && 'text-amber-600 dark:text-amber-400'
          )}
          aria-label={skill.isOverride ? `Edit override for ${skill.name}` : `Create override for ${skill.name}`}
          title={skill.isOverride ? 'Edit override' : 'Create override'}
        >
          <GitCompare className="w-5 h-5" />
        </button>

        <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
      </div>
    </div>
  )
}

// Category group component
interface CategoryGroupProps {
  category: string
  skills: Skill[]
  activeSkills: Set<string>
  onToggleActive: (skillId: string, active: boolean) => void
  onSkillClick: (skill: Skill) => void
  onOverrideClick: (skill: Skill) => void
  togglingSkills: Set<string>
  defaultExpanded?: boolean
}

function CategoryGroup({
  category,
  skills,
  activeSkills,
  onToggleActive,
  onSkillClick,
  onOverrideClick,
  togglingSkills,
  defaultExpanded = true,
}: CategoryGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const activeCount = skills.filter((s) => activeSkills.has(s.id)).length

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{formatCategory(category)}</h2>
        <span className="text-xs text-muted-foreground">
          ({skills.length}){activeCount > 0 && <span className="text-green-600 dark:text-green-400 ml-1">{activeCount} active</span>}
        </span>
      </button>

      {isExpanded && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <ProjectSkillCard
              key={skill.id}
              skill={skill}
              isActive={activeSkills.has(skill.id)}
              onToggleActive={() => onToggleActive(skill.id, !activeSkills.has(skill.id))}
              onClick={() => onSkillClick(skill)}
              onOverrideClick={() => onOverrideClick(skill)}
              isToggling={togglingSkills.has(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Filter tabs component
interface FilterTabsProps {
  currentFilter: FilterType
  onFilterChange: (filter: FilterType) => void
  counts: { all: number; active: number; overridden: number }
}

function FilterTabs({ currentFilter, onFilterChange, counts }: FilterTabsProps) {
  const tabs: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'overridden', label: 'Overridden', count: counts.overridden },
  ]

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onFilterChange(tab.key)}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
            currentFilter === tab.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          )}
        >
          {tab.label}
          <span
            className={cn(
              'ml-2 px-1.5 py-0.5 rounded text-xs',
              currentFilter === tab.key ? 'bg-muted' : 'bg-muted/50'
            )}
          >
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  )
}

function ProjectPrompts() {
  const { id } = Route.useParams()
  const projectId = parseInt(id, 10)

  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [overrideSkill, setOverrideSkill] = useState<Skill | null>(null)
  const [togglingSkills, setTogglingSkills] = useState<Set<string>>(new Set())
  const [showAgentPromptModal, setShowAgentPromptModal] = useState(false)

  const utils = trpc.useUtils()

  // Fetch project info
  const { data: project, isLoading: isLoadingProject } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !isNaN(projectId) }
  )

  // Fetch skills for this project (merged central + overrides)
  const {
    data: skills = [],
    isLoading: isLoadingSkills,
    error: skillsError,
  } = trpc.skills.listByProject.useQuery({ projectId }, { enabled: !isNaN(projectId), staleTime: 60000 })

  // Fetch available skills (active skills for this project)
  const { data: availableSkills = [] } = trpc.skills.getAvailableSkills.useQuery(
    { projectId },
    { enabled: !isNaN(projectId), staleTime: 30000 }
  )

  // Toggle skill active mutation
  const toggleSkillActive = trpc.skills.toggleSkillActive.useMutation({
    onMutate: (variables) => {
      setTogglingSkills((prev) => new Set(prev).add(variables.skillId))
    },
    onSettled: (_, __, variables) => {
      setTogglingSkills((prev) => {
        const next = new Set(prev)
        next.delete(variables.skillId)
        return next
      })
    },
    onSuccess: () => {
      utils.skills.getAvailableSkills.invalidate({ projectId })
    },
  })

  // Compute active skills set for quick lookup
  const activeSkillsSet = useMemo(() => new Set(availableSkills), [availableSkills])

  // Filter skills based on search query and filter type
  const filteredSkills = useMemo(() => {
    let filtered = skills

    // Apply filter type
    if (filter === 'active') {
      filtered = filtered.filter((skill) => activeSkillsSet.has(skill.id))
    } else if (filter === 'overridden') {
      filtered = filtered.filter((skill) => skill.isOverride || skill.hasOverride)
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          skill.id.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [skills, filter, activeSkillsSet, searchQuery])

  // Compute counts for filter tabs
  const filterCounts = useMemo(
    () => ({
      all: skills.length,
      active: skills.filter((s) => activeSkillsSet.has(s.id)).length,
      overridden: skills.filter((s) => s.isOverride || s.hasOverride).length,
    }),
    [skills, activeSkillsSet]
  )

  // Group filtered skills by category
  const groupedSkills = useMemo(() => groupSkillsByCategory(filteredSkills), [filteredSkills])

  // Handle toggle skill active
  const handleToggleActive = (skillId: string, active: boolean) => {
    toggleSkillActive.mutate({ projectId, skillId, active })
  }

  // Handle skill click
  const handleSkillClick = (skill: Skill) => {
    setSelectedSkill(skill)
  }

  // Handle override click
  const handleOverrideClick = (skill: Skill) => {
    setOverrideSkill(skill)
  }

  // Handle modal close
  const handleCloseModal = () => {
    setSelectedSkill(null)
  }

  // Handle override modal close
  const handleCloseOverrideModal = () => {
    setOverrideSkill(null)
  }

  const isLoading = isLoadingProject || isLoadingSkills

  if (isNaN(projectId)) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="w-8 h-8 mb-4" />
          <p className="font-medium">Invalid project ID</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back link */}
      <Link
        to="/project/$id"
        params={{ id }}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Project
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Prompts</h1>
          <p className="text-muted-foreground mt-1">
            {project?.name ? `Skills configuration for ${project.name}` : 'Manage skills for this project'}
          </p>
        </div>

        {/* Filter tabs */}
        <FilterTabs currentFilter={filter} onFilterChange={setFilter} counts={filterCounts} />
      </div>

      {/* Agent Prompt Section */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Agent Prompt</h2>
        <div className="max-w-md">
          <AgentPromptCard projectId={projectId} onEdit={() => setShowAgentPromptModal(true)} />
        </div>
      </div>

      {/* Skills Section */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Skills</h2>
      </div>

      {/* Search bar */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search skills by name, description, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10 h-11"
        />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p>Loading skills...</p>
        </div>
      )}

      {/* Error state */}
      {skillsError && (
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="w-8 h-8 mb-4" />
          <p className="font-medium">Failed to load skills</p>
          <p className="text-sm text-muted-foreground mt-1">{skillsError.message}</p>
        </div>
      )}

      {/* Empty state - no skills in system */}
      {!isLoading && !skillsError && skills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mb-4" />
          <p className="font-medium text-foreground">No skills found</p>
          <p className="text-sm mt-1">Skills directory is empty or not configured</p>
        </div>
      )}

      {/* No search results */}
      {!isLoading && !skillsError && skills.length > 0 && filteredSkills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Filter className="w-12 h-12 mb-4" />
          <p className="font-medium text-foreground">No matching skills</p>
          <p className="text-sm mt-1">
            {filter !== 'all'
              ? `No ${filter === 'active' ? 'active' : 'overridden'} skills match your search`
              : 'Try a different search term'}
          </p>
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-4 px-4 py-2 text-sm font-medium text-primary hover:underline"
            >
              Show all skills
            </button>
          )}
        </div>
      )}

      {/* Skills list grouped by category */}
      {!isLoading && !skillsError && filteredSkills.length > 0 && (
        <div>
          {/* Stats bar */}
          <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
            <span>{filteredSkills.length} skills</span>
            <span className="w-px h-4 bg-border" />
            <span>{groupedSkills.size} categories</span>
            <span className="w-px h-4 bg-border" />
            <span className="text-green-600 dark:text-green-400">
              {filterCounts.active} active
            </span>
            {filterCounts.overridden > 0 && (
              <>
                <span className="w-px h-4 bg-border" />
                <span className="text-amber-600 dark:text-amber-400">
                  {filterCounts.overridden} overridden
                </span>
              </>
            )}
          </div>

          {/* Category groups */}
          {Array.from(groupedSkills.entries()).map(([category, categorySkills]) => (
            <CategoryGroup
              key={category}
              category={category}
              skills={categorySkills}
              activeSkills={activeSkillsSet}
              onToggleActive={handleToggleActive}
              onSkillClick={handleSkillClick}
              onOverrideClick={handleOverrideClick}
              togglingSkills={togglingSkills}
            />
          ))}
        </div>
      )}

      {/* Skill detail modal */}
      <SkillDetailModal
        skill={selectedSkill ?? { id: '', name: '', description: '', content: '' }}
        isOpen={selectedSkill !== null}
        isWritable={false}
        onClose={handleCloseModal}
        onSaved={() => {
          utils.skills.listByProject.invalidate({ projectId })
        }}
      />

      {/* Skill override modal */}
      <SkillOverrideModal
        skill={overrideSkill ?? { id: '', name: '', description: '', content: '' }}
        isOpen={overrideSkill !== null}
        projectId={projectId}
        onClose={handleCloseOverrideModal}
        onSaved={() => {
          utils.skills.listByProject.invalidate({ projectId })
        }}
      />

      {/* Agent Prompt modal */}
      {showAgentPromptModal && (
        <AgentPromptModal
          projectId={projectId}
          onClose={() => setShowAgentPromptModal(false)}
        />
      )}
    </div>
  )
}

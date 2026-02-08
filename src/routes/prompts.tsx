import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Search,
  FileCode2,
  ChevronDown,
  ChevronRight,
  X,
  PencilLine,
  Lock,
  FolderOpen,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { SkillDetailModal } from '@/components/SkillDetailModal'
import { AgentPromptCard, AgentPromptModal } from '@/components/AgentPromptCard'

export const Route = createFileRoute('/prompts')({ component: PromptsPage })

// Skill type from API
interface Skill {
  id: string
  name: string
  description: string
  content: string
  isOverride?: boolean
  hasOverride?: boolean
}

// Extract category from skill ID (e.g., "backend-development:api-patterns" -> "backend-development")
function extractCategory(skillId: string): string {
  const colonIndex = skillId.indexOf(':')
  if (colonIndex > 0) {
    return skillId.slice(0, colonIndex)
  }
  // If no category prefix, use "general"
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

// Skill card component
interface SkillCardProps {
  skill: Skill
  onClick: () => void
}

function SkillCard({ skill, onClick }: SkillCardProps) {
  const category = extractCategory(skill.id)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-lg border bg-card',
        'hover:border-primary/50 hover:shadow-md',
        'transition-all duration-200 group'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileCode2 className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
              {skill.name}
            </h3>
            <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', getCategoryColor(category))}>
              {formatCategory(category)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{skill.description}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
      </div>
    </button>
  )
}

// Category group component
interface CategoryGroupProps {
  category: string
  skills: Skill[]
  defaultExpanded?: boolean
  onSkillClick: (skill: Skill) => void
}

function CategoryGroup({ category, skills, defaultExpanded = true, onSkillClick }: CategoryGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

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
        <span className="text-xs text-muted-foreground">({skills.length})</span>
      </button>

      {isExpanded && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onClick={() => onSkillClick(skill)} />
          ))}
        </div>
      )}
    </div>
  )
}

function PromptsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [showAgentPromptModal, setShowAgentPromptModal] = useState(false)

  // Fetch central skills
  const {
    data: skills = [],
    isLoading,
    error,
  } = trpc.skills.listCentral.useQuery(undefined, {
    staleTime: 60000, // 1 minute
  })

  // Check if SKILLS_PATH is writable
  const { data: writableStatus } = trpc.skills.isWritable.useQuery(undefined, {
    staleTime: 300000, // 5 minutes
  })

  // Filter skills based on search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return skills
    }

    const query = searchQuery.toLowerCase()
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.id.toLowerCase().includes(query)
    )
  }, [skills, searchQuery])

  // Group filtered skills by category
  const groupedSkills = useMemo(() => groupSkillsByCategory(filteredSkills), [filteredSkills])

  // Handle skill click
  const handleSkillClick = (skill: Skill) => {
    setSelectedSkill(skill)
  }

  // Handle modal close
  const handleCloseModal = () => {
    setSelectedSkill(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prompts</h1>
          <p className="text-muted-foreground mt-1">Centrale skills bibliotheek voor AI-gestuurde development</p>
        </div>

        {/* Writable indicator */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
            writableStatus?.writable
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {writableStatus?.writable ? (
            <>
              <PencilLine className="w-4 h-4" />
              <span>Edit mode enabled</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Read-only mode</span>
            </>
          )}
        </div>
      </div>

      {/* Agent Prompt Section */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Agent Prompt</h2>
        <div className="max-w-md">
          <AgentPromptCard onEdit={() => setShowAgentPromptModal(true)} />
        </div>
      </div>

      {/* Skills Section */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Skills</h2>
      </div>

      {/* Search bar */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search skills by name, description, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            'w-full pl-10 pr-10 py-3 rounded-lg border bg-background',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
            'transition-colors'
          )}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
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
      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="w-8 h-8 mb-4" />
          <p className="font-medium">Failed to load skills</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && skills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mb-4" />
          <p className="font-medium text-foreground">No skills found</p>
          <p className="text-sm mt-1">Skills directory is empty or not configured</p>
        </div>
      )}

      {/* No search results */}
      {!isLoading && !error && skills.length > 0 && filteredSkills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Search className="w-12 h-12 mb-4" />
          <p className="font-medium text-foreground">No matching skills</p>
          <p className="text-sm mt-1">Try a different search term</p>
        </div>
      )}

      {/* Skills list grouped by category */}
      {!isLoading && !error && filteredSkills.length > 0 && (
        <div>
          {/* Stats bar */}
          <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
            <span>{filteredSkills.length} skills</span>
            <span className="w-px h-4 bg-border" />
            <span>{groupedSkills.size} categories</span>
            {searchQuery && (
              <>
                <span className="w-px h-4 bg-border" />
                <span>Filtered from {skills.length} total</span>
              </>
            )}
          </div>

          {/* Category groups */}
          {Array.from(groupedSkills.entries()).map(([category, categorySkills]) => (
            <CategoryGroup
              key={category}
              category={category}
              skills={categorySkills}
              onSkillClick={handleSkillClick}
            />
          ))}
        </div>
      )}

      {/* Skill detail modal */}
      <SkillDetailModal
        skill={selectedSkill ?? { id: '', name: '', description: '', content: '' }}
        isOpen={selectedSkill !== null}
        isWritable={writableStatus?.writable ?? false}
        onClose={handleCloseModal}
        onSaved={() => {
          // Optionally update selected skill with new content
          // The modal will invalidate the cache
        }}
      />

      {/* Agent Prompt modal */}
      {showAgentPromptModal && (
        <AgentPromptModal onClose={() => setShowAgentPromptModal(false)} />
      )}
    </div>
  )
}

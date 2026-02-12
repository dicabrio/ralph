/**
 * Route Helper Utilities
 *
 * Pure utility functions extracted from route components for testability.
 * These functions handle formatting, categorization, and computation logic.
 */

import type { Story } from '@/components/StoryCard'

// ============================================
// Date/Time Formatting
// ============================================

/**
 * Format relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return d.toLocaleDateString()
}

/**
 * Format time as HH:MM:SS
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Format date for display (e.g., "Jan 15, 2024")
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ============================================
// Skill Category Helpers
// ============================================

/**
 * Category badge colors mapping
 */
export const categoryColors: Record<string, string> = {
  'backend-development': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'frontend-design': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'database-design': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'api-design': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  testing: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  devops: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  general: 'bg-muted text-muted-foreground',
}

/**
 * Extract category from skill ID (e.g., "backend-development:api-patterns" -> "backend-development")
 */
export function extractCategory(skillId: string): string {
  const colonIndex = skillId.indexOf(':')
  if (colonIndex > 0) {
    return skillId.slice(0, colonIndex)
  }
  // If no category prefix, use "general"
  return 'general'
}

/**
 * Format category for display (e.g., "backend-development" -> "Backend Development")
 */
export function formatCategory(category: string): string {
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Get category color class
 */
export function getCategoryColor(category: string): string {
  return categoryColors[category] || 'bg-muted text-muted-foreground'
}

/**
 * Skill interface for grouping
 */
interface SkillLike {
  id: string
}

/**
 * Group skills by category
 */
export function groupSkillsByCategory<T extends SkillLike>(skills: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()

  for (const skill of skills) {
    const category = extractCategory(skill.id)
    const existing = grouped.get(category) || []
    grouped.set(category, [...existing, skill])
  }

  // Sort categories alphabetically, but put "general" first if it exists
  const sortedMap = new Map<string, T[]>()
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

// ============================================
// Runner Error Handling
// ============================================

/**
 * Extract user-friendly error message from runner errors
 */
export function getRunnerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message

    // Check for specific error patterns
    if (message.includes('No authentication configured')) {
      return 'Claude authentication not configured. Set ANTHROPIC_API_KEY or mount ~/.claude.json'
    }
    if (message.includes('Docker')) {
      return 'Docker is not available or not running'
    }
    if (message.includes('ENOENT') || message.includes('not found')) {
      return 'Project path or required file not found'
    }
    if (message.includes('EACCES') || message.includes('permission')) {
      return 'Permission denied accessing project files'
    }
    if (message.includes('timeout')) {
      return 'Operation timed out'
    }

    return message
  }

  return 'An unexpected error occurred'
}

// ============================================
// Story/Project Stats
// ============================================

/**
 * Compute project statistics from stories
 */
export function computeProjectStats(stories: Story[]) {
  const total = stories.length
  const done = stories.filter((s) => s.status === 'done').length
  const failed = stories.filter((s) => s.status === 'failed').length
  const inProgress = stories.filter((s) => s.status === 'in_progress').length
  const pending = stories.filter((s) => s.status === 'pending').length

  // Backlog = pending with unmet dependencies (handled separately in UI)
  // For stats, we just count pending
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return {
    total,
    done,
    failed,
    inProgress,
    pending,
    progress,
  }
}

// ============================================
// Exponential Backoff (from WebSocket client)
// ============================================

/**
 * Calculate exponential backoff delay with jitter for reconnection
 */
export function calculateBackoff(attempt: number, baseInterval: number): number {
  const exponentialDelay = Math.min(baseInterval * 2 ** attempt, 30000)
  const jitter = Math.random() * 1000
  return exponentialDelay + jitter
}

/**
 * Calculate exponential backoff delay without jitter (for testing)
 */
export function calculateBackoffDeterministic(attempt: number, baseInterval: number): number {
  return Math.min(baseInterval * 2 ** attempt, 30000)
}

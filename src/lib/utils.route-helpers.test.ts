/**
 * Tests for Route Helper Utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatRelativeTime,
  formatTime,
  formatDate,
  extractCategory,
  formatCategory,
  getCategoryColor,
  groupSkillsByCategory,
  getRunnerErrorMessage,
  computeProjectStats,
  calculateBackoffDeterministic,
  categoryColors,
} from './utils.route-helpers'
import type { Story } from '@/components/StoryCard'

describe('Route Helper Utilities', () => {
  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-02-15T12:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns "Just now" for dates less than 1 minute ago', () => {
      const date = new Date('2024-02-15T11:59:30.000Z') // 30 seconds ago
      expect(formatRelativeTime(date)).toBe('Just now')
    })

    it('returns minutes ago for dates less than 1 hour ago', () => {
      const date = new Date('2024-02-15T11:55:00.000Z') // 5 minutes ago
      expect(formatRelativeTime(date)).toBe('5m ago')
    })

    it('returns hours ago for dates less than 24 hours ago', () => {
      const date = new Date('2024-02-15T09:00:00.000Z') // 3 hours ago
      expect(formatRelativeTime(date)).toBe('3h ago')
    })

    it('returns days ago for dates less than 7 days ago', () => {
      const date = new Date('2024-02-12T12:00:00.000Z') // 3 days ago
      expect(formatRelativeTime(date)).toBe('3d ago')
    })

    it('returns formatted date for dates 7+ days ago', () => {
      const date = new Date('2024-02-01T12:00:00.000Z') // 14 days ago
      const result = formatRelativeTime(date)
      expect(result).toMatch(/\d+\/\d+\/\d+/) // Matches date format
    })

    it('handles string dates', () => {
      const date = '2024-02-15T11:55:00.000Z'
      expect(formatRelativeTime(date)).toBe('5m ago')
    })

    it('handles edge case of exactly 1 minute ago', () => {
      const date = new Date('2024-02-15T11:59:00.000Z')
      expect(formatRelativeTime(date)).toBe('1m ago')
    })

    it('handles edge case of exactly 1 hour ago', () => {
      const date = new Date('2024-02-15T11:00:00.000Z')
      expect(formatRelativeTime(date)).toBe('1h ago')
    })

    it('handles edge case of exactly 1 day ago', () => {
      const date = new Date('2024-02-14T12:00:00.000Z')
      expect(formatRelativeTime(date)).toBe('1d ago')
    })
  })

  describe('formatTime', () => {
    it('formats time as HH:MM:SS', () => {
      const date = new Date('2024-02-15T14:30:45.000Z')
      const result = formatTime(date)
      // The exact format depends on locale, but should be HH:MM:SS format
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('handles midnight', () => {
      const date = new Date('2024-02-15T00:00:00.000Z')
      const result = formatTime(date)
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('handles noon', () => {
      const date = new Date('2024-02-15T12:00:00.000Z')
      const result = formatTime(date)
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('formatDate', () => {
    it('formats date correctly', () => {
      const date = new Date('2024-02-15T12:00:00.000Z')
      const result = formatDate(date)
      expect(result).toContain('Feb')
      expect(result).toContain('2024')
    })

    it('handles string dates', () => {
      const date = '2024-12-25T00:00:00.000Z'
      const result = formatDate(date)
      expect(result).toContain('Dec')
      expect(result).toContain('2024')
    })

    it('handles January date', () => {
      const date = new Date('2024-01-01T00:00:00.000Z')
      const result = formatDate(date)
      expect(result).toContain('Jan')
    })
  })

  describe('extractCategory', () => {
    it('extracts category from skill ID with colon', () => {
      expect(extractCategory('backend-development:api-patterns')).toBe('backend-development')
      expect(extractCategory('frontend-design:react-patterns')).toBe('frontend-design')
      expect(extractCategory('database-design:schema-patterns')).toBe('database-design')
    })

    it('returns "general" for skill ID without colon', () => {
      expect(extractCategory('some-skill')).toBe('general')
      expect(extractCategory('another-skill-name')).toBe('general')
    })

    it('handles skill ID with multiple colons', () => {
      expect(extractCategory('category:sub:skill')).toBe('category')
    })

    it('handles empty string', () => {
      expect(extractCategory('')).toBe('general')
    })

    it('handles colon at the start', () => {
      expect(extractCategory(':skill-name')).toBe('general')
    })
  })

  describe('formatCategory', () => {
    it('formats category with hyphens to title case', () => {
      expect(formatCategory('backend-development')).toBe('Backend Development')
      expect(formatCategory('frontend-design')).toBe('Frontend Design')
      expect(formatCategory('database-design')).toBe('Database Design')
    })

    it('handles single word', () => {
      expect(formatCategory('general')).toBe('General')
      expect(formatCategory('testing')).toBe('Testing')
    })

    it('handles multiple hyphens', () => {
      expect(formatCategory('api-design-patterns')).toBe('Api Design Patterns')
    })

    it('handles empty string', () => {
      expect(formatCategory('')).toBe('')
    })
  })

  describe('getCategoryColor', () => {
    it('returns correct color for known categories', () => {
      expect(getCategoryColor('backend-development')).toBe(categoryColors['backend-development'])
      expect(getCategoryColor('frontend-design')).toBe(categoryColors['frontend-design'])
      expect(getCategoryColor('database-design')).toBe(categoryColors['database-design'])
      expect(getCategoryColor('testing')).toBe(categoryColors.testing)
      expect(getCategoryColor('general')).toBe(categoryColors.general)
    })

    it('returns default color for unknown categories', () => {
      expect(getCategoryColor('unknown-category')).toBe('bg-muted text-muted-foreground')
      expect(getCategoryColor('')).toBe('bg-muted text-muted-foreground')
    })
  })

  describe('groupSkillsByCategory', () => {
    it('groups skills by their category', () => {
      const skills = [
        { id: 'backend-development:skill1', name: 'Skill 1' },
        { id: 'backend-development:skill2', name: 'Skill 2' },
        { id: 'frontend-design:skill3', name: 'Skill 3' },
        { id: 'general-skill', name: 'Skill 4' }, // No colon, should go to "general"
      ]

      const grouped = groupSkillsByCategory(skills)

      expect(grouped.get('backend-development')).toHaveLength(2)
      expect(grouped.get('frontend-design')).toHaveLength(1)
      expect(grouped.get('general')).toHaveLength(1)
    })

    it('puts "general" category first', () => {
      const skills = [
        { id: 'backend-development:skill1', name: 'Skill 1' },
        { id: 'general-skill', name: 'Skill 2' },
        { id: 'api-design:skill3', name: 'Skill 3' },
      ]

      const grouped = groupSkillsByCategory(skills)
      const keys = Array.from(grouped.keys())

      expect(keys[0]).toBe('general')
    })

    it('sorts remaining categories alphabetically', () => {
      const skills = [
        { id: 'zebra:skill1', name: 'Skill 1' },
        { id: 'apple:skill2', name: 'Skill 2' },
        { id: 'banana:skill3', name: 'Skill 3' },
      ]

      const grouped = groupSkillsByCategory(skills)
      const keys = Array.from(grouped.keys())

      expect(keys).toEqual(['apple', 'banana', 'zebra'])
    })

    it('handles empty array', () => {
      const grouped = groupSkillsByCategory([])
      expect(grouped.size).toBe(0)
    })

    it('handles single skill', () => {
      const skills = [{ id: 'category:skill', name: 'Skill' }]
      const grouped = groupSkillsByCategory(skills)

      expect(grouped.size).toBe(1)
      expect(grouped.get('category')).toHaveLength(1)
    })
  })

  describe('getRunnerErrorMessage', () => {
    it('handles authentication error', () => {
      const error = new Error('No authentication configured for Claude')
      expect(getRunnerErrorMessage(error)).toBe(
        'Claude authentication not configured. Set ANTHROPIC_API_KEY or mount ~/.claude.json'
      )
    })

    it('handles Docker error', () => {
      const error = new Error('Docker daemon is not running')
      expect(getRunnerErrorMessage(error)).toBe('Docker is not available or not running')
    })

    it('handles ENOENT error', () => {
      const error = new Error('ENOENT: no such file or directory')
      expect(getRunnerErrorMessage(error)).toBe('Project path or required file not found')
    })

    it('handles "not found" error', () => {
      const error = new Error('File not found at path')
      expect(getRunnerErrorMessage(error)).toBe('Project path or required file not found')
    })

    it('handles EACCES error', () => {
      const error = new Error('EACCES: permission denied')
      expect(getRunnerErrorMessage(error)).toBe('Permission denied accessing project files')
    })

    it('handles permission error', () => {
      const error = new Error('permission denied for operation')
      expect(getRunnerErrorMessage(error)).toBe('Permission denied accessing project files')
    })

    it('handles timeout error', () => {
      const error = new Error('Operation timeout after 30s')
      expect(getRunnerErrorMessage(error)).toBe('Operation timed out')
    })

    it('returns original message for unknown errors', () => {
      const error = new Error('Some specific error message')
      expect(getRunnerErrorMessage(error)).toBe('Some specific error message')
    })

    it('handles non-Error objects', () => {
      expect(getRunnerErrorMessage('string error')).toBe('An unexpected error occurred')
      expect(getRunnerErrorMessage(null)).toBe('An unexpected error occurred')
      expect(getRunnerErrorMessage(undefined)).toBe('An unexpected error occurred')
      expect(getRunnerErrorMessage({ message: 'object' })).toBe('An unexpected error occurred')
    })
  })

  describe('computeProjectStats', () => {
    const createStory = (overrides: Partial<Story>): Story => ({
      id: 'TEST-001',
      title: 'Test Story',
      description: 'Test description',
      priority: 1,
      status: 'pending',
      epic: 'Test Epic',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: [],
      ...overrides,
    })

    it('computes stats correctly for mixed statuses', () => {
      const stories = [
        createStory({ id: '1', status: 'done' }),
        createStory({ id: '2', status: 'done' }),
        createStory({ id: '3', status: 'in_progress' }),
        createStory({ id: '4', status: 'failed' }),
        createStory({ id: '5', status: 'pending' }),
        createStory({ id: '6', status: 'pending' }),
      ]

      const stats = computeProjectStats(stories)

      expect(stats.total).toBe(6)
      expect(stats.done).toBe(2)
      expect(stats.inProgress).toBe(1)
      expect(stats.failed).toBe(1)
      expect(stats.pending).toBe(2)
      expect(stats.progress).toBe(33) // 2/6 = 33%
    })

    it('computes 0% progress for empty stories', () => {
      const stats = computeProjectStats([])

      expect(stats.total).toBe(0)
      expect(stats.done).toBe(0)
      expect(stats.progress).toBe(0)
    })

    it('computes 100% progress when all done', () => {
      const stories = [
        createStory({ id: '1', status: 'done' }),
        createStory({ id: '2', status: 'done' }),
        createStory({ id: '3', status: 'done' }),
      ]

      const stats = computeProjectStats(stories)

      expect(stats.total).toBe(3)
      expect(stats.done).toBe(3)
      expect(stats.progress).toBe(100)
    })

    it('computes 50% progress correctly', () => {
      const stories = [
        createStory({ id: '1', status: 'done' }),
        createStory({ id: '2', status: 'pending' }),
      ]

      const stats = computeProjectStats(stories)

      expect(stats.progress).toBe(50)
    })

    it('rounds progress to nearest integer', () => {
      const stories = [
        createStory({ id: '1', status: 'done' }),
        createStory({ id: '2', status: 'pending' }),
        createStory({ id: '3', status: 'pending' }),
      ]

      const stats = computeProjectStats(stories)

      expect(stats.progress).toBe(33) // 1/3 = 33.33% rounded to 33
    })

    it('handles all pending stories', () => {
      const stories = [
        createStory({ id: '1', status: 'pending' }),
        createStory({ id: '2', status: 'pending' }),
      ]

      const stats = computeProjectStats(stories)

      expect(stats.pending).toBe(2)
      expect(stats.done).toBe(0)
      expect(stats.progress).toBe(0)
    })
  })

  describe('calculateBackoffDeterministic', () => {
    it('calculates correct delays for reconnection attempts', () => {
      const baseInterval = 1000

      expect(calculateBackoffDeterministic(0, baseInterval)).toBe(1000) // 1s
      expect(calculateBackoffDeterministic(1, baseInterval)).toBe(2000) // 2s
      expect(calculateBackoffDeterministic(2, baseInterval)).toBe(4000) // 4s
      expect(calculateBackoffDeterministic(3, baseInterval)).toBe(8000) // 8s
      expect(calculateBackoffDeterministic(4, baseInterval)).toBe(16000) // 16s
    })

    it('caps delay at 30 seconds', () => {
      const baseInterval = 1000

      expect(calculateBackoffDeterministic(5, baseInterval)).toBe(30000) // capped at 30s
      expect(calculateBackoffDeterministic(6, baseInterval)).toBe(30000) // still 30s
      expect(calculateBackoffDeterministic(10, baseInterval)).toBe(30000) // still 30s
    })

    it('works with different base intervals', () => {
      expect(calculateBackoffDeterministic(0, 500)).toBe(500)
      expect(calculateBackoffDeterministic(1, 500)).toBe(1000)
      expect(calculateBackoffDeterministic(2, 500)).toBe(2000)
    })
  })
})

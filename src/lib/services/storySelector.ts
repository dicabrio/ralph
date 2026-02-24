/**
 * Story Selector Service
 *
 * Pre-selects the next eligible story for the runner and generates
 * an inline prompt with full story details.
 *
 * This optimizes the runner flow by:
 * - Preventing the LLM from needing to parse prd.json for story selection
 * - Saving tokens by providing only the selected story's context
 * - Guaranteeing correct dependency checking on the server side
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type Story, type Prd, prdSchema } from '@/lib/schemas/prdSchema'

/**
 * Story status types that are considered "complete" for dependency checking
 */
const COMPLETED_STATUSES = ['done', 'review'] as const

/**
 * Story status types that are eligible for selection
 */
const ELIGIBLE_STATUSES = ['pending', 'failed'] as const

/**
 * Result of story selection
 */
export interface StorySelectionResult {
  story: Story
  allStories: Story[]
  dependencyTitles: string[]
}

/**
 * Read and parse prd.json from a project path
 *
 * @param projectPath - Path to the project root
 * @returns Parsed PRD data or null if file doesn't exist
 */
export async function readPrdJson(projectPath: string): Promise<Prd | null> {
  const prdPath = join(projectPath, 'stories', 'prd.json')

  if (!existsSync(prdPath)) {
    return null
  }

  const content = await readFile(prdPath, 'utf-8')
  const data = JSON.parse(content)
  const result = prdSchema.safeParse(data)

  if (!result.success) {
    throw new Error(`Invalid prd.json: ${result.error.message}`)
  }

  return result.data
}

/**
 * Select the next eligible story for execution
 *
 * Selection criteria:
 * 1. Story must have status 'pending' or 'failed'
 * 2. All dependencies must have status 'done' or 'review'
 * 3. Sort by priority (lowest number first)
 *
 * @param stories - Array of all stories from prd.json
 * @returns The selected story with metadata, or null if no eligible story
 */
export function findNextEligibleStory(stories: Story[]): StorySelectionResult | null {
  // Filter eligible stories (pending or failed)
  const eligibleStories = stories
    .filter((s) => (ELIGIBLE_STATUSES as readonly string[]).includes(s.status))
    .sort((a, b) => a.priority - b.priority)

  // Build set of completed story IDs for dependency checking
  const completedStoryIds = new Set(
    stories
      .filter((s) => (COMPLETED_STATUSES as readonly string[]).includes(s.status))
      .map((s) => s.id)
  )

  // Find first story with all dependencies satisfied
  for (const story of eligibleStories) {
    const dependenciesMet = story.dependencies.every((depId) =>
      completedStoryIds.has(depId)
    )

    if (dependenciesMet) {
      // Get titles of done dependencies for context
      const dependencyTitles = story.dependencies
        .map((depId) => {
          const depStory = stories.find((s) => s.id === depId)
          return depStory ? `${depId}: ${depStory.title}` : depId
        })

      return {
        story,
        allStories: stories,
        dependencyTitles,
      }
    }
  }

  return null
}

/**
 * Select the next story from a project's prd.json
 *
 * @param projectPath - Path to the project root
 * @returns Story selection result or null if no eligible story
 */
export async function selectNextStory(projectPath: string): Promise<StorySelectionResult | null> {
  const prd = await readPrdJson(projectPath)

  if (!prd) {
    throw new Error(`No prd.json found at ${projectPath}/stories/prd.json`)
  }

  return findNextEligibleStory(prd.userStories)
}

/**
 * Generate an inline prompt with full story details
 *
 * The prompt includes:
 * - Story ID, title, description
 * - Priority and epic
 * - Acceptance criteria (numbered)
 * - Recommended skills
 * - Completed dependencies with titles
 * - Instructions for status updates
 *
 * @param selection - The story selection result
 * @param basePrompt - The base prompt template
 * @returns Complete prompt with story context prepended
 */
export function generateStoryPrompt(
  selection: StorySelectionResult,
  basePrompt: string
): string {
  const { story, dependencyTitles } = selection

  const sections: string[] = []

  // Header
  sections.push(`# Assigned Story: ${story.id}`)
  sections.push('')
  sections.push(`**Title:** ${story.title}`)
  sections.push(`**Priority:** ${story.priority}`)
  sections.push(`**Epic:** ${story.epic}`)
  sections.push(`**Current Status:** ${story.status}`)
  sections.push('')

  // Description
  sections.push('## Description')
  sections.push('')
  sections.push(story.description)
  sections.push('')

  // Acceptance Criteria
  if (story.acceptanceCriteria.length > 0) {
    sections.push('## Acceptance Criteria')
    sections.push('')
    story.acceptanceCriteria.forEach((criterion, index) => {
      sections.push(`${index + 1}. ${criterion}`)
    })
    sections.push('')
  }

  // Recommended Skills
  if (story.recommendedSkills.length > 0) {
    sections.push('## Recommended Skills')
    sections.push('')
    sections.push('Invoke these skills for domain expertise:')
    story.recommendedSkills.forEach((skill) => {
      sections.push(`- ${skill}`)
    })
    sections.push('')
  }

  // Dependencies (completed)
  if (dependencyTitles.length > 0) {
    sections.push('## Completed Dependencies')
    sections.push('')
    sections.push('These stories have been completed and may provide context:')
    dependencyTitles.forEach((dep) => {
      sections.push(`- ✓ ${dep}`)
    })
    sections.push('')
  }

  // Instructions
  sections.push('## Instructions')
  sections.push('')
  sections.push('1. **Immediately** set `status: "in_progress"` in `stories/prd.json`')
  sections.push('2. Implement this story following the acceptance criteria')
  sections.push('3. Run tests and verify all criteria are met')
  sections.push('4. Set final status:')
  sections.push('   - Success → `status: "review"`')
  sections.push('   - Failure → `status: "failed"`')
  sections.push('5. Document learnings in `stories/progress.txt`')
  sections.push('')

  // Separator
  sections.push('---')
  sections.push('')

  // Append base prompt
  sections.push(basePrompt)

  return sections.join('\n')
}

/**
 * Get a human-readable reason why no story was selected
 *
 * @param stories - Array of all stories
 * @returns Description of why no story could be selected
 */
export function getNoEligibleStoryReason(stories: Story[]): string {
  const pendingOrFailed = stories.filter((s) =>
    (ELIGIBLE_STATUSES as readonly string[]).includes(s.status)
  )

  if (pendingOrFailed.length === 0) {
    const doneCount = stories.filter((s) => s.status === 'done').length
    const reviewCount = stories.filter((s) => s.status === 'review').length
    const inProgressCount = stories.filter((s) => s.status === 'in_progress').length

    if (inProgressCount > 0) {
      return `All eligible stories are currently in progress (${inProgressCount} story/stories)`
    }

    return `No pending or failed stories. Done: ${doneCount}, Review: ${reviewCount}`
  }

  // Find stories with unmet dependencies
  const completedIds = new Set(
    stories
      .filter((s) => (COMPLETED_STATUSES as readonly string[]).includes(s.status))
      .map((s) => s.id)
  )

  const blockedStories = pendingOrFailed.filter((s) =>
    s.dependencies.some((depId) => !completedIds.has(depId))
  )

  if (blockedStories.length > 0) {
    const blockedInfo = blockedStories.slice(0, 3).map((s) => {
      const unmetDeps = s.dependencies.filter((d) => !completedIds.has(d))
      return `${s.id} (blocked by: ${unmetDeps.join(', ')})`
    })

    return `${pendingOrFailed.length} story/stories have unmet dependencies: ${blockedInfo.join('; ')}`
  }

  return 'Unknown reason - no eligible stories found'
}

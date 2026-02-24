/**
 * Test Scenario Generator Service
 *
 * Generates test scenarios when stories transition to review status.
 * Uses OpenAI to create structured test scenarios from acceptance criteria.
 */
import { join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  type TestScenario,
  type TestScenarioSection,
  type TestScenarioItem,
  SECTION_IDS,
  DEFAULT_QUALITY_GATES,
  testScenarioSchema,
} from '@/lib/schemas/testScenarioSchema'
import { streamChatCompletion, isOpenAIConfigured } from './openaiService'

/**
 * Minimal story interface for test scenario generation
 * Compatible with both PrdStory (loop services) and Story (tRPC)
 */
export interface StoryForTestScenario {
  id: string
  title: string
  description?: string
  epic?: string
  acceptanceCriteria?: string[]
}

/**
 * Get the test scenarios directory path for a project
 */
export function getTestScenariosDir(projectPath: string): string {
  return join(projectPath, 'stories', 'test-scenarios')
}

/**
 * Get the path for a specific story's test scenario JSON file
 */
export function getTestScenarioJsonPath(projectPath: string, storyId: string): string {
  return join(getTestScenariosDir(projectPath), `${storyId}.json`)
}

/**
 * Get the path for a specific story's test scenario Markdown file
 */
export function getTestScenarioMdPath(projectPath: string, storyId: string): string {
  return join(getTestScenariosDir(projectPath), `${storyId}.md`)
}

/**
 * Ensure the test scenarios directory exists
 */
async function ensureTestScenariosDir(projectPath: string): Promise<void> {
  const dir = getTestScenariosDir(projectPath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

/**
 * Generate the system prompt for test scenario generation
 */
function generateSystemPrompt(story: StoryForTestScenario): string {
  const description = story.description || story.title
  const epic = story.epic || 'General'
  const criteria = story.acceptanceCriteria || []

  return `You are a test scenario generator for software development.

Given a user story with acceptance criteria, generate a structured test scenario document.

## Story Information

**ID:** ${story.id}
**Title:** ${story.title}
**Description:** ${description}
**Epic:** ${epic}

## Acceptance Criteria

${criteria.length > 0 ? criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'No specific criteria provided - generate basic tests for the story.'}

## Instructions

Generate test scenarios in the following JSON format. Create specific, actionable test items based on the acceptance criteria.

**Categories:**
1. **Functional Tests** - Test that each acceptance criterion works correctly
2. **UI Verification** - Test visual elements, user interactions, and accessibility (only if the story involves UI)

Do NOT include quality gates (build, lint, test) - those are added automatically.

## Response Format

Respond ONLY with a JSON object (no markdown code blocks, no explanation):

{
  "sections": [
    {
      "id": "functional-tests",
      "title": "Functional Tests",
      "items": [
        { "id": "ft-1", "text": "Description of what to test", "checked": false }
      ]
    },
    {
      "id": "ui-verification",
      "title": "UI Verification",
      "items": [
        { "id": "ui-1", "text": "Description of UI element to verify", "checked": false }
      ]
    }
  ]
}

Important:
- Each item ID must be unique within the scenario
- Use descriptive, specific test descriptions
- Include both positive and negative test cases where applicable
- If the story has no UI components, omit the ui-verification section entirely
- Base functional tests directly on the acceptance criteria`
}

/**
 * Parse the AI response into test scenario sections
 */
function parseTestScenariosFromResponse(content: string): TestScenarioSection[] {
  try {
    // Try to find JSON in the response (with or without code blocks)
    let jsonContent = content.trim()

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonContent)

    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      console.log('[TestScenarioGenerator] Invalid response format: missing sections array')
      return []
    }

    // Validate and normalize each section
    const sections: TestScenarioSection[] = []

    for (const section of parsed.sections) {
      if (!section.id || !section.title || !Array.isArray(section.items)) {
        continue
      }

      const items: TestScenarioItem[] = section.items
        .filter((item: unknown): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).id === 'string' &&
          typeof (item as Record<string, unknown>).text === 'string'
        )
        .map((item: Record<string, unknown>) => ({
          id: String(item.id),
          text: String(item.text),
          checked: item.checked === true,
        }))

      if (items.length > 0) {
        sections.push({
          id: String(section.id),
          title: String(section.title),
          items,
        })
      }
    }

    return sections
  } catch (error) {
    console.error('[TestScenarioGenerator] Failed to parse AI response:', error)
    return []
  }
}

/**
 * Generate test scenario markdown from the structured data
 */
function generateMarkdown(scenario: TestScenario): string {
  const lines: string[] = [
    `# Test Scenarios: ${scenario.storyId}`,
    '',
    `## Story: ${scenario.title}`,
    '',
    scenario.description,
    '',
    `*Generated: ${new Date(scenario.generatedAt).toLocaleString('nl-NL')}*`,
    '',
  ]

  for (const section of scenario.sections) {
    lines.push(`## ${section.title}`)
    lines.push('')

    for (const item of section.items) {
      const checkbox = item.checked ? '[x]' : '[ ]'
      lines.push(`- ${checkbox} ${item.text}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Create a fallback test scenario when AI generation fails
 */
function createFallbackScenario(story: StoryForTestScenario): TestScenarioSection[] {
  const sections: TestScenarioSection[] = []
  const criteria = story.acceptanceCriteria || []

  // Generate functional tests from acceptance criteria
  const functionalItems: TestScenarioItem[] = criteria.map((criterion, index) => ({
    id: `ft-${index + 1}`,
    text: `Verify: ${criterion}`,
    checked: false,
  }))

  if (functionalItems.length > 0) {
    sections.push({
      id: SECTION_IDS.FUNCTIONAL,
      title: 'Functional Tests',
      items: functionalItems,
    })
  }

  return sections
}

/**
 * Generate test scenarios for a story
 *
 * @param story - The story to generate test scenarios for
 * @param projectPath - Path to the project
 * @returns The generated test scenario
 */
export async function generateTestScenarios(
  story: StoryForTestScenario,
  projectPath: string,
): Promise<TestScenario> {
  console.log(`[TestScenarioGenerator] Generating test scenarios for ${story.id}`)

  // Ensure directory exists
  await ensureTestScenariosDir(projectPath)

  let sections: TestScenarioSection[] = []

  // Try to generate with AI if configured
  if (isOpenAIConfigured()) {
    const prompt = generateSystemPrompt(story)
    let aiResponse = ''

    try {
      await new Promise<void>((resolve, reject) => {
        streamChatCompletion(
          prompt,
          'Generate test scenarios for this story.',
          {
            onChunk: (chunk) => {
              aiResponse += chunk
            },
            onComplete: () => {
              resolve()
            },
            onError: (error) => {
              reject(new Error(error))
            },
          },
        )
      })

      sections = parseTestScenariosFromResponse(aiResponse)
      console.log(`[TestScenarioGenerator] AI generated ${sections.length} sections`)
    } catch (error) {
      console.error('[TestScenarioGenerator] AI generation failed:', error)
    }
  } else {
    console.log('[TestScenarioGenerator] OpenAI not configured, using fallback')
  }

  // Use fallback if AI generation failed or returned empty
  if (sections.length === 0) {
    sections = createFallbackScenario(story)
    console.log('[TestScenarioGenerator] Using fallback scenario')
  }

  // Always add quality gates section
  sections.push({
    id: SECTION_IDS.QUALITY,
    title: 'Quality Gates',
    items: DEFAULT_QUALITY_GATES.map(item => ({ ...item })),
  })

  // Create the complete test scenario
  const scenario: TestScenario = {
    storyId: story.id,
    title: story.title,
    description: story.description || story.title,
    generatedAt: new Date().toISOString(),
    sections,
  }

  // Validate the scenario
  const validated = testScenarioSchema.parse(scenario)

  // Write both JSON and Markdown files
  const jsonPath = getTestScenarioJsonPath(projectPath, story.id)
  const mdPath = getTestScenarioMdPath(projectPath, story.id)

  await writeFile(jsonPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf-8')
  await writeFile(mdPath, generateMarkdown(validated), 'utf-8')

  console.log(`[TestScenarioGenerator] Saved test scenarios to ${jsonPath} and ${mdPath}`)

  return validated
}

/**
 * Read existing test scenario for a story
 *
 * @param projectPath - Path to the project
 * @param storyId - The story ID
 * @returns The test scenario or null if not found
 */
export async function readTestScenario(
  projectPath: string,
  storyId: string,
): Promise<TestScenario | null> {
  const jsonPath = getTestScenarioJsonPath(projectPath, storyId)

  if (!existsSync(jsonPath)) {
    return null
  }

  try {
    const content = await readFile(jsonPath, 'utf-8')
    const data = JSON.parse(content)
    return testScenarioSchema.parse(data)
  } catch (error) {
    console.error(`[TestScenarioGenerator] Failed to read test scenario for ${storyId}:`, error)
    return null
  }
}

/**
 * Update a test item's checked status
 *
 * @param projectPath - Path to the project
 * @param storyId - The story ID
 * @param itemId - The item ID to update
 * @param checked - New checked status
 * @returns The updated test scenario
 */
export async function updateTestItem(
  projectPath: string,
  storyId: string,
  itemId: string,
  checked: boolean,
): Promise<TestScenario> {
  const scenario = await readTestScenario(projectPath, storyId)

  if (!scenario) {
    throw new Error(`Test scenario not found for story ${storyId}`)
  }

  // Find and update the item
  let found = false
  for (const section of scenario.sections) {
    const item = section.items.find(i => i.id === itemId)
    if (item) {
      item.checked = checked
      found = true
      break
    }
  }

  if (!found) {
    throw new Error(`Test item ${itemId} not found in scenario for story ${storyId}`)
  }

  // Write both files
  const jsonPath = getTestScenarioJsonPath(projectPath, storyId)
  const mdPath = getTestScenarioMdPath(projectPath, storyId)

  await writeFile(jsonPath, `${JSON.stringify(scenario, null, 2)}\n`, 'utf-8')
  await writeFile(mdPath, generateMarkdown(scenario), 'utf-8')

  return scenario
}

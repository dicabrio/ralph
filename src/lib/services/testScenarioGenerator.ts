/**
 * Test Scenario Generator Service
 *
 * Generates test scenarios when stories transition to review status.
 * Uses OpenAI to create user flow test scenarios from acceptance criteria.
 *
 * Flow-based approach: Instead of many individual test items, generates
 * 3-5 end-to-end user flows that reviewers can walk through.
 */
import { join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  type TestScenario,
  type TestFlow,
  testScenarioSchema,
  parseTestScenario,
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

Given a user story with acceptance criteria, generate **3-5 user flows** that a reviewer can walk through to verify the implementation is correct.

## Story Information

**ID:** ${story.id}
**Title:** ${story.title}
**Description:** ${description}
**Epic:** ${epic}

## Acceptance Criteria

${criteria.length > 0 ? criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'No specific criteria provided - generate basic test flows for the story.'}

## Instructions

Generate **3-5 user flows** (not individual test items). Each flow is a complete end-to-end scenario that tests multiple acceptance criteria together.

**Flow types to consider:**
1. **Happy path** - The main success scenario where everything works as expected
2. **Error handling** - What happens when things go wrong (validation errors, network issues, etc.)
3. **Edge cases** - Boundary conditions, empty states, maximum values, etc.
4. **Alternative paths** - Secondary ways to achieve the same goal

**Each flow should have:**
- A clear, descriptive name (e.g., "Happy path: Create new project", "Error: Invalid form submission")
- 4-8 concrete steps the reviewer should take
- Steps should be actionable (click, type, verify, wait for, etc.)

## Response Format

Respond ONLY with a JSON object (no markdown code blocks, no explanation):

{
  "flows": [
    {
      "id": "flow-1",
      "name": "Happy path: [description]",
      "steps": [
        "Navigate to the [page/feature]",
        "Click on [button/element]",
        "Enter [value] in [field]",
        "Verify [expected result]"
      ],
      "checked": false
    },
    {
      "id": "flow-2",
      "name": "Error handling: [description]",
      "steps": [
        "Navigate to the [page/feature]",
        "Submit without filling required fields",
        "Verify error message appears",
        "Verify form state is preserved"
      ],
      "checked": false
    }
  ]
}

Important:
- Generate 3-5 flows maximum (prefer quality over quantity)
- Each flow should have 4-8 steps maximum
- Steps should be concrete and actionable
- Cover the most important acceptance criteria across the flows
- Do NOT generate separate flows for "pnpm test", "pnpm lint", "pnpm build" - focus on user-facing functionality`
}

/**
 * Parse the AI response into test flows
 */
function parseFlowsFromResponse(content: string): TestFlow[] {
  try {
    // Try to find JSON in the response (with or without code blocks)
    let jsonContent = content.trim()

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonContent)

    if (!parsed.flows || !Array.isArray(parsed.flows)) {
      console.log('[TestScenarioGenerator] Invalid response format: missing flows array')
      return []
    }

    // Validate and normalize each flow
    const flows: TestFlow[] = []

    for (const flow of parsed.flows) {
      if (!flow.id || !flow.name || !Array.isArray(flow.steps)) {
        continue
      }

      // Filter and convert steps to strings
      const steps: string[] = flow.steps
        .filter((step: unknown): step is string => typeof step === 'string' && step.trim().length > 0)
        .map((step: string) => step.trim())

      if (steps.length > 0) {
        flows.push({
          id: String(flow.id),
          name: String(flow.name),
          steps,
          checked: flow.checked === true,
        })
      }
    }

    return flows
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
    `# Test Flows: ${scenario.storyId}`,
    '',
    `## Story: ${scenario.title}`,
    '',
    scenario.description,
    '',
    `*Generated: ${new Date(scenario.generatedAt).toLocaleString('nl-NL')}*`,
    '',
  ]

  for (const flow of scenario.flows) {
    const checkbox = flow.checked ? '[x]' : '[ ]'
    lines.push(`## ${checkbox} ${flow.name}`)
    lines.push('')

    flow.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`)
    })

    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Create a fallback test scenario when AI generation fails
 * Groups acceptance criteria into logical flows
 */
function createFallbackFlows(story: StoryForTestScenario): TestFlow[] {
  const criteria = story.acceptanceCriteria || []

  if (criteria.length === 0) {
    return [{
      id: 'flow-1',
      name: 'Happy path: Basic functionality',
      steps: [
        'Navigate to the relevant page/feature',
        `Verify ${story.title} is implemented`,
        'Check for expected behavior',
      ],
      checked: false,
    }]
  }

  // Group criteria into a single verification flow
  // Each criterion becomes a step
  const verificationSteps = criteria.slice(0, 8).map(criterion =>
    criterion.startsWith('Verify') || criterion.startsWith('Check')
      ? criterion
      : `Verify: ${criterion}`
  )

  const flows: TestFlow[] = [{
    id: 'flow-1',
    name: 'Happy path: Verify acceptance criteria',
    steps: verificationSteps,
    checked: false,
  }]

  // If there are more than 8 criteria, add a second flow
  if (criteria.length > 8) {
    flows.push({
      id: 'flow-2',
      name: 'Additional verification',
      steps: criteria.slice(8, 16).map(criterion =>
        criterion.startsWith('Verify') || criterion.startsWith('Check')
          ? criterion
          : `Verify: ${criterion}`
      ),
      checked: false,
    })
  }

  return flows
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
  console.log(`[TestScenarioGenerator] Generating test flows for ${story.id}`)

  // Ensure directory exists
  await ensureTestScenariosDir(projectPath)

  let flows: TestFlow[] = []

  // Try to generate with AI if configured
  if (isOpenAIConfigured()) {
    const prompt = generateSystemPrompt(story)
    let aiResponse = ''

    try {
      await new Promise<void>((resolve, reject) => {
        streamChatCompletion(
          prompt,
          'Generate user flows for testing this story.',
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

      flows = parseFlowsFromResponse(aiResponse)
      console.log(`[TestScenarioGenerator] AI generated ${flows.length} flows`)
    } catch (error) {
      console.error('[TestScenarioGenerator] AI generation failed:', error)
    }
  } else {
    console.log('[TestScenarioGenerator] OpenAI not configured, using fallback')
  }

  // Use fallback if AI generation failed or returned empty
  if (flows.length === 0) {
    flows = createFallbackFlows(story)
    console.log('[TestScenarioGenerator] Using fallback flows')
  }

  // Create the complete test scenario
  const scenario: TestScenario = {
    storyId: story.id,
    title: story.title,
    description: story.description || story.title,
    generatedAt: new Date().toISOString(),
    flows,
  }

  // Validate the scenario
  const validated = testScenarioSchema.parse(scenario)

  // Write both JSON and Markdown files
  const jsonPath = getTestScenarioJsonPath(projectPath, story.id)
  const mdPath = getTestScenarioMdPath(projectPath, story.id)

  await writeFile(jsonPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf-8')
  await writeFile(mdPath, generateMarkdown(validated), 'utf-8')

  console.log(`[TestScenarioGenerator] Saved test flows to ${jsonPath} and ${mdPath}`)

  return validated
}

/**
 * Read existing test scenario for a story
 * Handles both v1 (sections) and v2 (flows) formats automatically
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
    // parseTestScenario handles both v1 (sections) and v2 (flows) formats
    return parseTestScenario(data)
  } catch (error) {
    console.error(`[TestScenarioGenerator] Failed to read test scenario for ${storyId}:`, error)
    return null
  }
}

/**
 * Update a flow's checked status
 *
 * @param projectPath - Path to the project
 * @param storyId - The story ID
 * @param flowId - The flow ID to update
 * @param checked - New checked status
 * @returns The updated test scenario
 */
export async function updateFlowChecked(
  projectPath: string,
  storyId: string,
  flowId: string,
  checked: boolean,
): Promise<TestScenario> {
  const scenario = await readTestScenario(projectPath, storyId)

  if (!scenario) {
    throw new Error(`Test scenario not found for story ${storyId}`)
  }

  // Find and update the flow
  const flow = scenario.flows.find(f => f.id === flowId)
  if (!flow) {
    throw new Error(`Flow ${flowId} not found in scenario for story ${storyId}`)
  }

  flow.checked = checked

  // Write both files
  const jsonPath = getTestScenarioJsonPath(projectPath, storyId)
  const mdPath = getTestScenarioMdPath(projectPath, storyId)

  await writeFile(jsonPath, `${JSON.stringify(scenario, null, 2)}\n`, 'utf-8')
  await writeFile(mdPath, generateMarkdown(scenario), 'utf-8')

  return scenario
}

/**
 * @deprecated Use updateFlowChecked instead
 * Kept for backwards compatibility with existing code
 */
export async function updateTestItem(
  projectPath: string,
  storyId: string,
  itemId: string,
  checked: boolean,
): Promise<TestScenario> {
  // itemId is now a flowId in the new schema
  return updateFlowChecked(projectPath, storyId, itemId, checked)
}

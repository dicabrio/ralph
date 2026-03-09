/**
 * Test Scenario Schema
 *
 * Defines the structure for test scenarios generated when stories
 * transition to review status.
 *
 * New format (v2): Uses flows[] with steps instead of sections[].items[]
 * Old format (v1): Used sections[].items[] with SECTION_IDS and DEFAULT_QUALITY_GATES
 */
import { z } from 'zod'

/**
 * A single user flow with numbered steps
 * Each flow represents a complete user journey (happy path or error scenario)
 */
export const testFlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(z.string()),
  checked: z.boolean(),
})

export type TestFlow = z.infer<typeof testFlowSchema>

/**
 * Complete test scenario for a story (v2 format with flows)
 */
export const testScenarioSchema = z.object({
  storyId: z.string(),
  title: z.string(),
  description: z.string(),
  generatedAt: z.string(),
  flows: z.array(testFlowSchema),
})

export type TestScenario = z.infer<typeof testScenarioSchema>

// ============================================================================
// LEGACY TYPES (v1) - for backwards compatibility parsing
// ============================================================================

/**
 * Individual test item within a section (v1 format - LEGACY)
 */
export const testScenarioItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
})

export type TestScenarioItem = z.infer<typeof testScenarioItemSchema>

/**
 * Section of related test items (v1 format - LEGACY)
 */
export const testScenarioSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(testScenarioItemSchema),
})

export type TestScenarioSection = z.infer<typeof testScenarioSectionSchema>

/**
 * Legacy test scenario format (v1) with sections
 */
export const legacyTestScenarioSchema = z.object({
  storyId: z.string(),
  title: z.string(),
  description: z.string(),
  generatedAt: z.string(),
  sections: z.array(testScenarioSectionSchema),
})

export type LegacyTestScenario = z.infer<typeof legacyTestScenarioSchema>

/**
 * Convert legacy sections format to flows format
 * Each section becomes a flow, with items becoming steps
 */
export function convertLegacyToFlows(legacy: LegacyTestScenario): TestScenario {
  const flows: TestFlow[] = legacy.sections.map((section, index) => ({
    id: `flow-${index + 1}`,
    name: section.title,
    steps: section.items.map(item => item.text),
    // Flow is checked if all its items were checked
    checked: section.items.every(item => item.checked),
  }))

  return {
    storyId: legacy.storyId,
    title: legacy.title,
    description: legacy.description,
    generatedAt: legacy.generatedAt,
    flows,
  }
}

/**
 * Parse a test scenario, handling both v1 (sections) and v2 (flows) formats
 */
export function parseTestScenario(data: unknown): TestScenario {
  // Try v2 format first (flows)
  const v2Result = testScenarioSchema.safeParse(data)
  if (v2Result.success) {
    return v2Result.data
  }

  // Try v1 format (sections) and convert
  const v1Result = legacyTestScenarioSchema.safeParse(data)
  if (v1Result.success) {
    return convertLegacyToFlows(v1Result.data)
  }

  // Neither format works, throw with v2 error (the expected format)
  throw v2Result.error
}

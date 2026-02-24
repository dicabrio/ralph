/**
 * Test Scenario Schema
 *
 * Defines the structure for test scenarios generated when stories
 * transition to review status.
 */
import { z } from 'zod'

/**
 * Individual test item within a section
 */
export const testScenarioItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
})

export type TestScenarioItem = z.infer<typeof testScenarioItemSchema>

/**
 * Section of related test items
 */
export const testScenarioSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(testScenarioItemSchema),
})

export type TestScenarioSection = z.infer<typeof testScenarioSectionSchema>

/**
 * Complete test scenario for a story
 */
export const testScenarioSchema = z.object({
  storyId: z.string(),
  title: z.string(),
  description: z.string(),
  generatedAt: z.string(),
  sections: z.array(testScenarioSectionSchema),
})

export type TestScenario = z.infer<typeof testScenarioSchema>

/**
 * Standard section IDs
 */
export const SECTION_IDS = {
  FUNCTIONAL: 'functional-tests',
  UI: 'ui-verification',
  QUALITY: 'quality-gates',
} as const

/**
 * Default quality gates that are always included
 */
export const DEFAULT_QUALITY_GATES: TestScenarioItem[] = [
  { id: 'qg-test', text: 'pnpm test passes', checked: false },
  { id: 'qg-lint', text: 'pnpm lint passes', checked: false },
  { id: 'qg-build', text: 'pnpm build succeeds', checked: false },
]

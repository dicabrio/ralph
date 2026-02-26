import { z } from 'zod'

/**
 * Ralph Config Schema
 *
 * Defines the structure for per-project configuration stored in stories/ralph.config.json.
 * Allows users to configure the runner provider and model for each project.
 */

/**
 * Runner provider enum
 * Supported runner providers for story execution
 */
export const runnerProviderEnum = z.enum(['claude', 'ollama', 'gemini', 'codex'])
export type RunnerProvider = z.infer<typeof runnerProviderEnum>

/**
 * Runner configuration schema
 */
export const runnerConfigSchema = z.object({
  /** Runner provider to use for this project */
  provider: runnerProviderEnum.default('claude'),
  /** Model name/identifier (optional, provider uses default if not specified) */
  model: z.string().optional(),
  /** Base URL for provider API (optional, used for Ollama custom endpoints) */
  baseUrl: z.string().url().optional(),
})

export type RunnerConfig = z.infer<typeof runnerConfigSchema>

/**
 * Ralph configuration schema
 * Root configuration object for a project
 */
export const ralphConfigSchema = z.object({
  /** Runner configuration */
  runner: runnerConfigSchema.optional(),
})

export type RalphConfig = z.infer<typeof ralphConfigSchema>

/**
 * Default configuration values
 */
export const DEFAULT_RALPH_CONFIG: RalphConfig = {
  runner: {
    provider: 'claude',
  },
}

/**
 * Validates a ralph.config.json object
 */
export function validateRalphConfig(data: unknown): {
  isValid: boolean
  errors: string[]
  data?: RalphConfig
} {
  const result = ralphConfigSchema.safeParse(data)

  if (result.success) {
    return {
      isValid: true,
      errors: [],
      data: result.data,
    }
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`
  )

  return {
    isValid: false,
    errors,
  }
}

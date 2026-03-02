/**
 * Ralph Config Service
 *
 * Manages per-project configuration stored in stories/ralph.config.json.
 * Provides read/write operations and fallback defaults when config doesn't exist.
 */
import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import {
  type RalphConfig,
  type RunnerProvider,
  ralphConfigSchema,
  DEFAULT_RALPH_CONFIG,
} from '@/lib/schemas/ralphConfigSchema'

/** Config file name */
const CONFIG_FILE_NAME = 'ralph.config.json'

/** Config directory relative to project root */
const CONFIG_DIR = 'stories'

/**
 * Gets the path to the ralph.config.json file for a project
 */
export function getConfigPath(projectPath: string): string {
  return join(projectPath, CONFIG_DIR, CONFIG_FILE_NAME)
}

/**
 * Reads and parses ralph.config.json from a project path
 *
 * @param projectPath - Root path of the project
 * @returns Parsed configuration or null if file doesn't exist or is invalid
 */
export async function readRalphConfig(
  projectPath: string
): Promise<RalphConfig | null> {
  const configPath = getConfigPath(projectPath)

  if (!existsSync(configPath)) {
    return null
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const data = JSON.parse(content)
    const result = ralphConfigSchema.safeParse(data)

    if (result.success) {
      return result.data
    }

    // Log validation errors but return null (graceful degradation)
    console.warn(
      `[ralphConfig] Invalid config at ${configPath}:`,
      result.error.issues.map((i) => i.message).join(', ')
    )
    return null
  } catch (error) {
    // Log parse errors but return null (graceful degradation)
    console.warn(`[ralphConfig] Failed to read config at ${configPath}:`, error)
    return null
  }
}

/**
 * Reads ralph.config.json synchronously
 * Used in contexts where async is not available
 *
 * @param projectPath - Root path of the project
 * @returns Parsed configuration or null if file doesn't exist or is invalid
 */
export function readRalphConfigSync(projectPath: string): RalphConfig | null {
  const configPath = getConfigPath(projectPath)

  if (!existsSync(configPath)) {
    return null
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const data = JSON.parse(content)
    const result = ralphConfigSchema.safeParse(data)

    if (result.success) {
      return result.data
    }

    console.warn(
      `[ralphConfig] Invalid config at ${configPath}:`,
      result.error.issues.map((i) => i.message).join(', ')
    )
    return null
  } catch (error) {
    console.warn(`[ralphConfig] Failed to read config at ${configPath}:`, error)
    return null
  }
}

/**
 * Writes configuration to ralph.config.json
 *
 * @param projectPath - Root path of the project
 * @param config - Configuration to write
 * @throws Error if writing fails
 */
export async function writeRalphConfig(
  projectPath: string,
  config: RalphConfig
): Promise<void> {
  const configPath = getConfigPath(projectPath)
  const configDir = dirname(configPath)

  // Validate config before writing
  const result = ralphConfigSchema.safeParse(config)
  if (!result.success) {
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => i.message).join(', ')}`
    )
  }

  // Ensure stories directory exists
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }

  // Write formatted JSON
  await writeFile(configPath, JSON.stringify(result.data, null, 2), 'utf-8')
}

/**
 * Gets the effective provider for a project
 * Returns the configured provider or falls back to 'claude' if not configured
 *
 * @param projectPath - Root path of the project
 * @returns The effective runner provider
 */
export async function getEffectiveProvider(
  projectPath: string
): Promise<RunnerProvider> {
  const config = await readRalphConfig(projectPath)
  return config?.runner?.provider ?? DEFAULT_RALPH_CONFIG.runner?.provider ?? 'claude'
}

/**
 * Gets the effective provider synchronously
 *
 * @param projectPath - Root path of the project
 * @returns The effective runner provider
 */
export function getEffectiveProviderSync(projectPath: string): RunnerProvider {
  const config = readRalphConfigSync(projectPath)
  return config?.runner?.provider ?? DEFAULT_RALPH_CONFIG.runner?.provider ?? 'claude'
}

/**
 * Gets the effective model for a project
 * Returns the configured model or undefined if not configured
 *
 * @param projectPath - Root path of the project
 * @returns The configured model or undefined
 */
export async function getEffectiveModel(
  projectPath: string
): Promise<string | undefined> {
  const config = await readRalphConfig(projectPath)
  return config?.runner?.model
}

/**
 * Gets the effective base URL for a project (used for Ollama)
 * Returns the configured baseUrl or undefined if not configured
 *
 * @param projectPath - Root path of the project
 * @returns The configured base URL or undefined
 */
export async function getEffectiveBaseUrl(
  projectPath: string
): Promise<string | undefined> {
  const config = await readRalphConfig(projectPath)
  return config?.runner?.baseUrl
}

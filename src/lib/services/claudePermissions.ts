/**
 * Claude Permissions Service
 *
 * Manages Claude Code permissions for projects via .claude/settings.local.json
 * Creates safe default permissions when a project is added to Ralph.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Claude settings.local.json structure
 * Matches the Claude Code settings schema
 */
export interface ClaudeSettings {
  permissions: {
    allow: string[]
    deny: string[]
  }
}

/**
 * Default permissions for Claude Code projects managed by Ralph
 *
 * Allow list:
 * - Skill: Use skills for specialized knowledge
 * - WebSearch: Search the web for information
 * - WebFetch: Fetch specific URLs for documentation
 * - Read: Read files in the project
 * - Edit: Edit existing files
 * - Write: Create new files
 * - MultiEdit: Edit multiple files atomically
 * - Bash: Execute safe commands
 *
 * Deny list:
 * - Dangerous bash commands (rm -rf, sudo)
 * - Sensitive file reads (.env files, AWS credentials)
 */
export const DEFAULT_CLAUDE_PERMISSIONS: ClaudeSettings = {
  permissions: {
    allow: [
      'Skill',
      'WebSearch',
      'WebFetch',
      'Read',
      'Edit',
      'Write',
      'MultiEdit',
      'Bash',
    ],
    deny: [
      'Bash(rm -rf:*)',
      'Bash(sudo:*)',
      'Bash(chmod 777:*)',
      'Bash(chown:*)',
      'Read(.env*)',
      'Read(~/.aws/**)',
      'Read(~/.ssh/**)',
      'Read(~/.gnupg/**)',
      'Write(.env*)',
      'Write(~/.aws/**)',
      'Write(~/.ssh/**)',
    ],
  },
}

/**
 * Path to the .claude folder within a project
 */
export function getClaudeFolderPath(projectPath: string): string {
  return join(projectPath, '.claude')
}

/**
 * Path to the settings.local.json file within a project's .claude folder
 */
export function getSettingsFilePath(projectPath: string): string {
  return join(getClaudeFolderPath(projectPath), 'settings.local.json')
}

/**
 * Checks if a project already has a settings.local.json file
 */
export function hasExistingSettings(projectPath: string): boolean {
  return existsSync(getSettingsFilePath(projectPath))
}

/**
 * Reads existing settings from a project's settings.local.json
 * Returns null if file doesn't exist or can't be parsed
 */
export function readExistingSettings(projectPath: string): ClaudeSettings | null {
  const settingsPath = getSettingsFilePath(projectPath)

  if (!existsSync(settingsPath)) {
    return null
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content) as ClaudeSettings
  } catch {
    return null
  }
}

/**
 * Ensures Claude permissions are set up for a project
 *
 * - Creates .claude folder if it doesn't exist
 * - Creates settings.local.json with default permissions if it doesn't exist
 * - Does NOT overwrite existing settings.local.json (respects user customization)
 *
 * @param projectPath - Absolute path to the project
 * @returns Object indicating what was created
 */
export function ensureClaudePermissions(projectPath: string): {
  claudeFolderCreated: boolean
  settingsFileCreated: boolean
  settingsPath: string
} {
  const claudeFolderPath = getClaudeFolderPath(projectPath)
  const settingsPath = getSettingsFilePath(projectPath)

  let claudeFolderCreated = false
  let settingsFileCreated = false

  // Create .claude folder if it doesn't exist
  if (!existsSync(claudeFolderPath)) {
    mkdirSync(claudeFolderPath, { recursive: true })
    claudeFolderCreated = true
  }

  // Only create settings.local.json if it doesn't already exist
  // This respects any existing user configuration
  if (!existsSync(settingsPath)) {
    const settingsContent = JSON.stringify(DEFAULT_CLAUDE_PERMISSIONS, null, 2) + '\n'
    writeFileSync(settingsPath, settingsContent, 'utf-8')
    settingsFileCreated = true
  }

  return {
    claudeFolderCreated,
    settingsFileCreated,
    settingsPath,
  }
}

/**
 * Validates that a settings object has the expected structure
 */
export function isValidClaudeSettings(settings: unknown): settings is ClaudeSettings {
  if (typeof settings !== 'object' || settings === null) {
    return false
  }

  const s = settings as Record<string, unknown>

  if (typeof s.permissions !== 'object' || s.permissions === null) {
    return false
  }

  const p = s.permissions as Record<string, unknown>

  return (
    Array.isArray(p.allow) &&
    p.allow.every((item: unknown) => typeof item === 'string') &&
    Array.isArray(p.deny) &&
    p.deny.every((item: unknown) => typeof item === 'string')
  )
}

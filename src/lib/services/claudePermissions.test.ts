/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  DEFAULT_CLAUDE_PERMISSIONS,
  ensureClaudePermissions,
  getClaudeFolderPath,
  getSettingsFilePath,
  hasExistingSettings,
  readExistingSettings,
  isValidClaudeSettings,
  type ClaudeSettings,
} from './claudePermissions'

describe('claudePermissions', () => {
  let testDir: string
  let projectPath: string

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(tmpdir(), `claude-permissions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    projectPath = join(testDir, 'test-project')
    mkdirSync(projectPath, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('DEFAULT_CLAUDE_PERMISSIONS', () => {
    it('should have a valid structure', () => {
      expect(DEFAULT_CLAUDE_PERMISSIONS).toHaveProperty('permissions')
      expect(DEFAULT_CLAUDE_PERMISSIONS.permissions).toHaveProperty('allow')
      expect(DEFAULT_CLAUDE_PERMISSIONS.permissions).toHaveProperty('deny')
      expect(Array.isArray(DEFAULT_CLAUDE_PERMISSIONS.permissions.allow)).toBe(true)
      expect(Array.isArray(DEFAULT_CLAUDE_PERMISSIONS.permissions.deny)).toBe(true)
    })

    it('should include essential allow permissions', () => {
      const { allow } = DEFAULT_CLAUDE_PERMISSIONS.permissions
      expect(allow).toContain('Skill')
      expect(allow).toContain('WebSearch')
      expect(allow).toContain('WebFetch')
      expect(allow).toContain('Read')
      expect(allow).toContain('Edit')
      expect(allow).toContain('Write')
      expect(allow).toContain('Bash')
    })

    it('should include dangerous command denials', () => {
      const { deny } = DEFAULT_CLAUDE_PERMISSIONS.permissions
      expect(deny).toContain('Bash(rm -rf:*)')
      expect(deny).toContain('Bash(sudo:*)')
    })

    it('should include sensitive file denials', () => {
      const { deny } = DEFAULT_CLAUDE_PERMISSIONS.permissions
      expect(deny).toContain('Read(.env*)')
      expect(deny).toContain('Read(~/.aws/**)')
      expect(deny).toContain('Read(~/.ssh/**)')
    })
  })

  describe('getClaudeFolderPath', () => {
    it('should return the correct .claude folder path', () => {
      const result = getClaudeFolderPath('/path/to/project')
      expect(result).toBe('/path/to/project/.claude')
    })
  })

  describe('getSettingsFilePath', () => {
    it('should return the correct settings.local.json path', () => {
      const result = getSettingsFilePath('/path/to/project')
      expect(result).toBe('/path/to/project/.claude/settings.local.json')
    })
  })

  describe('hasExistingSettings', () => {
    it('should return false when .claude folder does not exist', () => {
      expect(hasExistingSettings(projectPath)).toBe(false)
    })

    it('should return false when settings.local.json does not exist', () => {
      mkdirSync(join(projectPath, '.claude'), { recursive: true })
      expect(hasExistingSettings(projectPath)).toBe(false)
    })

    it('should return true when settings.local.json exists', () => {
      const claudeDir = join(projectPath, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      writeFileSync(join(claudeDir, 'settings.local.json'), '{}', 'utf-8')
      expect(hasExistingSettings(projectPath)).toBe(true)
    })
  })

  describe('readExistingSettings', () => {
    it('should return null when file does not exist', () => {
      expect(readExistingSettings(projectPath)).toBeNull()
    })

    it('should return null when file is invalid JSON', () => {
      const claudeDir = join(projectPath, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      writeFileSync(join(claudeDir, 'settings.local.json'), 'invalid json', 'utf-8')
      expect(readExistingSettings(projectPath)).toBeNull()
    })

    it('should return parsed settings when file is valid', () => {
      const claudeDir = join(projectPath, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      const settings: ClaudeSettings = {
        permissions: {
          allow: ['Read'],
          deny: ['Write'],
        },
      }
      writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify(settings), 'utf-8')

      const result = readExistingSettings(projectPath)
      expect(result).toEqual(settings)
    })
  })

  describe('ensureClaudePermissions', () => {
    it('should create .claude folder if it does not exist', () => {
      const result = ensureClaudePermissions(projectPath)

      expect(result.claudeFolderCreated).toBe(true)
      expect(existsSync(join(projectPath, '.claude'))).toBe(true)
    })

    it('should not recreate .claude folder if it already exists', () => {
      mkdirSync(join(projectPath, '.claude'), { recursive: true })

      const result = ensureClaudePermissions(projectPath)

      expect(result.claudeFolderCreated).toBe(false)
    })

    it('should create settings.local.json if it does not exist', () => {
      const result = ensureClaudePermissions(projectPath)

      expect(result.settingsFileCreated).toBe(true)
      expect(existsSync(join(projectPath, '.claude', 'settings.local.json'))).toBe(true)
    })

    it('should NOT overwrite existing settings.local.json', () => {
      const claudeDir = join(projectPath, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      const existingSettings = { permissions: { allow: ['Custom'], deny: [] } }
      writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify(existingSettings), 'utf-8')

      const result = ensureClaudePermissions(projectPath)

      expect(result.settingsFileCreated).toBe(false)

      // Verify content was not changed
      const content = JSON.parse(readFileSync(join(claudeDir, 'settings.local.json'), 'utf-8'))
      expect(content).toEqual(existingSettings)
    })

    it('should create settings with default permissions', () => {
      ensureClaudePermissions(projectPath)

      const settingsPath = join(projectPath, '.claude', 'settings.local.json')
      const content = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      expect(content).toEqual(DEFAULT_CLAUDE_PERMISSIONS)
    })

    it('should return the correct settings path', () => {
      const result = ensureClaudePermissions(projectPath)

      expect(result.settingsPath).toBe(join(projectPath, '.claude', 'settings.local.json'))
    })

    it('should handle both folder and file creation in one call', () => {
      const result = ensureClaudePermissions(projectPath)

      expect(result.claudeFolderCreated).toBe(true)
      expect(result.settingsFileCreated).toBe(true)
    })

    it('should handle existing folder but missing file', () => {
      mkdirSync(join(projectPath, '.claude'), { recursive: true })

      const result = ensureClaudePermissions(projectPath)

      expect(result.claudeFolderCreated).toBe(false)
      expect(result.settingsFileCreated).toBe(true)
    })
  })

  describe('isValidClaudeSettings', () => {
    it('should return true for valid settings', () => {
      const settings: ClaudeSettings = {
        permissions: {
          allow: ['Read', 'Write'],
          deny: ['Bash(rm -rf:*)'],
        },
      }
      expect(isValidClaudeSettings(settings)).toBe(true)
    })

    it('should return true for empty arrays', () => {
      const settings: ClaudeSettings = {
        permissions: {
          allow: [],
          deny: [],
        },
      }
      expect(isValidClaudeSettings(settings)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isValidClaudeSettings(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isValidClaudeSettings(undefined)).toBe(false)
    })

    it('should return false for non-object', () => {
      expect(isValidClaudeSettings('string')).toBe(false)
      expect(isValidClaudeSettings(123)).toBe(false)
    })

    it('should return false for missing permissions', () => {
      expect(isValidClaudeSettings({})).toBe(false)
    })

    it('should return false for null permissions', () => {
      expect(isValidClaudeSettings({ permissions: null })).toBe(false)
    })

    it('should return false for missing allow array', () => {
      expect(isValidClaudeSettings({ permissions: { deny: [] } })).toBe(false)
    })

    it('should return false for missing deny array', () => {
      expect(isValidClaudeSettings({ permissions: { allow: [] } })).toBe(false)
    })

    it('should return false for non-string items in allow', () => {
      expect(isValidClaudeSettings({ permissions: { allow: [123], deny: [] } })).toBe(false)
    })

    it('should return false for non-string items in deny', () => {
      expect(isValidClaudeSettings({ permissions: { allow: [], deny: [null] } })).toBe(false)
    })
  })
})

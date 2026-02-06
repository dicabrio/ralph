/**
 * @vitest-environment node
 *
 * Prompt Generator Service Tests
 *
 * Unit tests for the prompt generation functionality.
 * Uses mocked filesystem for isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PathLike } from 'node:fs'

// Mock the filesystem modules BEFORE importing anything that uses them
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn((path: PathLike) => {
      // Default to real existsSync for database paths
      if (String(path).includes('ralph.db') || String(path).includes('/data')) {
        return actual.existsSync(path)
      }
      // Return mocked value for project paths
      return false
    }),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
  }
})

import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  generateRunnerPrompt,
  writePromptToProject,
  readProjectConfig,
  generatePromptForProject,
} from './promptGenerator'
import type { PromptConfig } from './promptGenerator'

describe('promptGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset SKILLS_PATH env
    delete process.env.SKILLS_PATH
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generateRunnerPrompt', () => {
    it('generates a prompt with project name and base instructions', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('# Test Project')
      expect(result).toContain('# Agent Instructions')
      expect(result).toContain('## Your Task')
      expect(result).toContain('stories/prd.json')
      expect(result).toContain('stories/progress.txt')
    })

    it('includes branch name when provided', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        branchName: 'feature/my-feature',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('**Branch:** `feature/my-feature`')
    })

    it('does not include branch section when not provided', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).not.toContain('**Branch:**')
    })

    it('includes prd.json format documentation', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## prd.json Format')
      expect(result).toContain('projectName')
      expect(result).toContain('userStories')
      expect(result).toContain('acceptanceCriteria')
    })

    it('includes story status lifecycle documentation', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Story Status Lifecycle')
      expect(result).toContain('`pending`')
      expect(result).toContain('`in_progress`')
      expect(result).toContain('`done`')
      expect(result).toContain('`failed`')
    })

    it('includes failure protocol documentation', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Failure Protocol')
      expect(result).toContain('FAILED')
      expect(result).toContain('Learnings for next attempt')
    })

    it('loads and includes project-specific skills from override path', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        // Project override exists
        if (p.includes('.ralph/skills/frontend-design/SKILL.md')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('frontend-design/SKILL.md')) {
          return `---
name: Frontend Design
description: Create beautiful UI components
---

# Frontend Design

Build responsive and accessible UI components using React and TailwindCSS.`
        }
        throw new Error('File not found')
      })

      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: ['frontend-design'],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('# Available Skills')
      expect(result).toContain('## Skill: Frontend Design')
      expect(result).toContain('Build responsive and accessible UI components')
    })

    it('falls back to central skill when no project override exists', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        // Project override does not exist
        if (p.includes('.ralph/skills/')) return false
        // Central skill exists
        if (p.includes('skills/backend-api/SKILL.md')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('backend-api/SKILL.md')) {
          return `---
name: Backend API Design
description: Design RESTful APIs
---

# Backend API Design

Best practices for REST API design.`
        }
        throw new Error('File not found')
      })

      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: ['backend-api'],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Skill: Backend API Design')
      expect(result).toContain('Best practices for REST API design')
    })

    it('skips skills that cannot be loaded', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: ['nonexistent-skill'],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).not.toContain('# Available Skills')
      expect(result).toContain('# Agent Instructions')
    })

    it('loads multiple skills', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('skills/skill1/SKILL.md')) return true
        if (p.includes('skills/skill2/SKILL.md')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('skill1')) {
          return `---
name: Skill One
description: First skill
---

# Skill One Content`
        }
        if (String(path).includes('skill2')) {
          return `---
name: Skill Two
description: Second skill
---

# Skill Two Content`
        }
        throw new Error('File not found')
      })

      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: ['skill1', 'skill2'],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Skill: Skill One')
      expect(result).toContain('## Skill: Skill Two')
      expect(result).toContain('# Skill One Content')
      expect(result).toContain('# Skill Two Content')
    })

    it('handles skills with invalid frontmatter', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('skills/invalid-skill/SKILL.md')) return true
        if (p.includes('skills/valid-skill/SKILL.md')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('invalid-skill')) {
          return `No frontmatter here, just content`
        }
        if (String(path).includes('valid-skill')) {
          return `---
name: Valid Skill
description: Works correctly
---

# Valid Content`
        }
        throw new Error('File not found')
      })

      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: ['invalid-skill', 'valid-skill'],
      }

      const result = await generateRunnerPrompt(config)

      // Invalid skill is skipped, valid skill is included
      expect(result).toContain('## Skill: Valid Skill')
      expect(result).not.toContain('invalid-skill')
    })

    it('includes commit convention documentation', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Commit Convention')
      expect(result).toContain('feat([Scope]): [ID] - [Title]')
    })

    it('includes stop condition documentation', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Stop Condition')
      expect(result).toContain('<promise>DONE_ONE</promise>')
      expect(result).toContain('<promise>FAILED_ONE</promise>')
      expect(result).toContain('<promise>COMPLETE</promise>')
    })
  })

  describe('writePromptToProject', () => {
    it('creates .ralph directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      await writePromptToProject(config)

      expect(mkdir).toHaveBeenCalledWith('/projects/test-project/.ralph', { recursive: true })
    })

    it('writes CLAUDE.md to .ralph directory', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const config: PromptConfig = {
        projectPath: '/projects/test-project',
        projectName: 'Test Project',
        skills: [],
      }

      const result = await writePromptToProject(config)

      expect(result).toBe('/projects/test-project/.ralph/CLAUDE.md')
      expect(writeFile).toHaveBeenCalledWith(
        '/projects/test-project/.ralph/CLAUDE.md',
        expect.stringContaining('# Test Project'),
        'utf-8'
      )
    })

    it('returns the path to the generated file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const config: PromptConfig = {
        projectPath: '/my/custom/path',
        projectName: 'Custom Project',
        skills: [],
      }

      const result = await writePromptToProject(config)

      expect(result).toBe('/my/custom/path/.ralph/CLAUDE.md')
    })
  })

  describe('readProjectConfig', () => {
    it('returns null when prd.json does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await readProjectConfig('/projects/no-prd')

      expect(result).toBeNull()
    })

    it('reads and parses prd.json correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'My Project',
        branchName: 'develop',
        availableSkills: ['frontend-design', 'database-design:postgresql'],
      }))

      const result = await readProjectConfig('/projects/my-project')

      expect(result).toEqual({
        projectName: 'My Project',
        branchName: 'develop',
        availableSkills: ['frontend-design', 'database-design:postgresql'],
      })
    })

    it('uses default values for missing fields', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        // Only userStories, no projectName, branchName, or availableSkills
        userStories: [],
      }))

      const result = await readProjectConfig('/projects/minimal')

      expect(result).toEqual({
        projectName: 'Unnamed Project',
        branchName: undefined,
        availableSkills: [],
      })
    })

    it('returns null on JSON parse error', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('not valid json')

      const result = await readProjectConfig('/projects/invalid')

      expect(result).toBeNull()
    })

    it('returns null on read error', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'))

      const result = await readProjectConfig('/projects/restricted')

      expect(result).toBeNull()
    })
  })

  describe('generatePromptForProject', () => {
    it('returns null when project config cannot be read', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await generatePromptForProject('/projects/nonexistent')

      expect(result).toBeNull()
    })

    it('generates and writes prompt for valid project', async () => {
      // Mock prd.json exists and can be read
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === '/projects/valid/stories/prd.json') return true
        if (p === '/projects/valid/.ralph') return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('prd.json')) {
          return JSON.stringify({
            projectName: 'Valid Project',
            branchName: 'main',
            availableSkills: [],
          })
        }
        throw new Error('File not found')
      })
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await generatePromptForProject('/projects/valid')

      expect(result).toBe('/projects/valid/.ralph/CLAUDE.md')
      expect(writeFile).toHaveBeenCalled()
    })

    it('includes skills from prd.json availableSkills', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === '/projects/skilled/stories/prd.json') return true
        if (p === '/projects/skilled/.ralph') return true
        if (p.includes('skills/my-skill/SKILL.md')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('prd.json')) {
          return JSON.stringify({
            projectName: 'Skilled Project',
            availableSkills: ['my-skill'],
          })
        }
        if (String(path).includes('my-skill/SKILL.md')) {
          return `---
name: My Skill
description: A custom skill
---

# My Skill Content`
        }
        throw new Error('File not found')
      })
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await generatePromptForProject('/projects/skilled')

      // Verify writeFile was called with content containing the skill
      expect(writeFile).toHaveBeenCalledWith(
        '/projects/skilled/.ralph/CLAUDE.md',
        expect.stringContaining('## Skill: My Skill'),
        'utf-8'
      )
    })
  })

  describe('prompt content quality', () => {
    it('includes all essential agent workflow steps', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test',
        projectName: 'Test',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      // Essential workflow steps
      expect(result).toContain('Read `stories/prd.json`')
      expect(result).toContain('Read `stories/progress.txt`')
      expect(result).toContain('Mark as in_progress')
      expect(result).toContain('Run typecheck and tests')
      expect(result).toContain('Commit:')
      expect(result).toContain('Append learnings to progress.txt')
    })

    it('includes dependency handling instructions', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test',
        projectName: 'Test',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('dependencies')
      expect(result).toContain('status: "done"')
    })

    it('includes progress.txt format instructions', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test',
        projectName: 'Test',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Progress Format')
      expect(result).toContain('**Title:**')
      expect(result).toContain('**Implemented:**')
      expect(result).toContain('**Files changed:**')
      expect(result).toContain('**Learnings:**')
    })

    it('includes codebase patterns section instructions', async () => {
      const config: PromptConfig = {
        projectPath: '/projects/test',
        projectName: 'Test',
        skills: [],
      }

      const result = await generateRunnerPrompt(config)

      expect(result).toContain('## Codebase Patterns')
      expect(result).toContain('Updated by Agents')
    })
  })
})

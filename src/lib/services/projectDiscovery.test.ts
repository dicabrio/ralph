/**
 * @vitest-environment node
 *
 * Project Discovery Service Tests
 *
 * Unit tests for the project discovery functionality.
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
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(),
  }
})

import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { discoverProjects, isValidProjectPath } from './projectDiscovery'

describe('projectDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset PROJECTS_ROOT env
    delete process.env.PROJECTS_ROOT
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('discoverProjects', () => {
    it('returns empty array when PROJECTS_ROOT does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await discoverProjects()

      expect(result.projects).toEqual([])
      expect(result.projectsRoot).toBe('./projects')
      expect(result.scannedAt).toBeInstanceOf(Date)
    })

    it('returns empty array when PROJECTS_ROOT is empty', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue([])

      const result = await discoverProjects()

      expect(result.projects).toEqual([])
    })

    it('discovers projects with prd.json files', async () => {
      // Setup: two directories, but only project1 has prd.json
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        // These paths should exist (join strips ./ prefix)
        if (p === './projects') return true
        if (p.includes('project1/stories/prd.json')) return true
        if (p.includes('project2/stories/prd.json')) return false
        return true // directories exist
      })
      vi.mocked(readdirSync).mockReturnValue(['project1', 'project2'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Test Project',
        projectDescription: 'A test project',
        branchName: 'main',
      }))

      const result = await discoverProjects()

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]).toMatchObject({
        path: 'projects/project1',
        name: 'Test Project',
        description: 'A test project',
        branchName: 'main',
        hasPrdJson: true,
      })
    })

    it('uses directory name when prd.json has no projectName', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === './projects') return true
        if (p === './projects/my-project/stories/prd.json') return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['my-project'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        // No projectName
        projectDescription: 'Description only',
      }))

      const result = await discoverProjects()

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('my-project')
      expect(result.projects[0].description).toBe('Description only')
    })

    it('uses PROJECTS_ROOT from environment', async () => {
      process.env.PROJECTS_ROOT = '/custom/path'

      vi.mocked(existsSync).mockReturnValue(false)

      const result = await discoverProjects()

      expect(result.projectsRoot).toBe('/custom/path')
    })

    it('skips non-directory entries', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === './projects') return true
        if (p === './projects/dir1/stories/prd.json') return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['dir1', 'file.txt'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('file.txt')) {
          return { isDirectory: () => false } as ReturnType<typeof statSync>
        }
        return { isDirectory: () => true } as ReturnType<typeof statSync>
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Dir 1',
      }))

      const result = await discoverProjects()

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('Dir 1')
    })

    it('handles prd.json parse errors gracefully', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === './projects') return true
        if (p === './projects/project1/stories/prd.json') return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['project1'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockRejectedValue(new Error('Read error'))

      const result = await discoverProjects()

      // Project is still discovered but with defaults
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('project1')
      expect(result.projects[0].description).toBeNull()
    })

    it('handles invalid JSON in prd.json gracefully', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === './projects') return true
        if (p === './projects/project1/stories/prd.json') return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['project1'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockResolvedValue('not valid json')

      const result = await discoverProjects()

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('project1')
      expect(result.projects[0].description).toBeNull()
    })

    it('discovers multiple projects', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === './projects') return true
        if (p === './projects/project1/stories/prd.json') return true
        if (p === './projects/project2/stories/prd.json') return true
        if (p === './projects/project3/stories/prd.json') return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['project1', 'project2', 'project3'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('project1')) {
          return JSON.stringify({ projectName: 'Project 1' })
        }
        if (String(path).includes('project2')) {
          return JSON.stringify({ projectName: 'Project 2', projectDescription: 'Desc 2' })
        }
        return JSON.stringify({ projectName: 'Project 3', branchName: 'develop' })
      })

      const result = await discoverProjects()

      expect(result.projects).toHaveLength(3)
      expect(result.projects.map(p => p.name)).toEqual(['Project 1', 'Project 2', 'Project 3'])
      expect(result.projects[1].description).toBe('Desc 2')
      expect(result.projects[2].branchName).toBe('develop')
    })

    it('handles statSync errors for entries', async () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === './projects') return true
        if (p === './projects/valid-dir/stories/prd.json') return true
        return true
      })
      vi.mocked(readdirSync).mockReturnValue(['broken-entry', 'valid-dir'] as unknown as ReturnType<typeof readdirSync>)
      vi.mocked(statSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p.includes('broken-entry')) {
          throw new Error('Permission denied')
        }
        return { isDirectory: () => true } as ReturnType<typeof statSync>
      })
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        projectName: 'Valid Project',
      }))

      const result = await discoverProjects()

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('Valid Project')
    })
  })

  describe('isValidProjectPath', () => {
    it('returns false when path does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      expect(isValidProjectPath('/nonexistent/path')).toBe(false)
    })

    it('returns false when path is not a directory', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      expect(isValidProjectPath('/path/to/file.txt')).toBe(false)
    })

    it('returns false when path has no prd.json', () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === '/project') return true
        if (p === '/project/stories/prd.json') return false
        return true
      })
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)

      expect(isValidProjectPath('/project')).toBe(false)
    })

    it('returns true when path is a directory with prd.json', () => {
      vi.mocked(existsSync).mockImplementation((path: PathLike) => {
        const p = String(path)
        if (p === '/valid-project') return true
        if (p === '/valid-project/stories/prd.json') return true
        return false
      })
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)

      expect(isValidProjectPath('/valid-project')).toBe(true)
    })

    it('handles statSync errors', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      expect(isValidProjectPath('/restricted/path')).toBe(false)
    })
  })
})

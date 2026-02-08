/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as chokidar from 'chokidar'

// Mock dependencies before importing the module
vi.mock('chokidar', () => {
  const mockWatcher = {
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  }
  return {
    watch: vi.fn(() => mockWatcher),
  }
})

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => Promise.resolve([
        { id: 1, path: '/projects/test1' },
        { id: 2, path: '/projects/test2' },
      ])),
    })),
  },
}))

vi.mock('@/db/schema', () => ({
  projects: {},
}))

// Create a stable mock for the WebSocket server
const mockBroadcastToProject = vi.fn()
const mockWsServer = {
  broadcastToProject: mockBroadcastToProject,
}

vi.mock('@/lib/websocket/server', () => ({
  getWebSocketServer: vi.fn(() => mockWsServer),
}))

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof fs>()
  return {
    ...original,
    existsSync: vi.fn((p: string) => {
      // Simulate prd.json exists for test paths
      return p.includes('/stories/prd.json')
    }),
  }
})

// Import after mocking
import { getPrdFileWatcher, cleanupPrdFileWatcher } from './prdFileWatcher'

describe('prdFileWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBroadcastToProject.mockClear()
    cleanupPrdFileWatcher()
  })

  afterEach(() => {
    cleanupPrdFileWatcher()
  })

  describe('getPrdFileWatcher', () => {
    it('should return a singleton instance', () => {
      const watcher1 = getPrdFileWatcher()
      const watcher2 = getPrdFileWatcher()
      expect(watcher1).toBe(watcher2)
    })

    it('should have all required methods', () => {
      const watcher = getPrdFileWatcher()
      expect(typeof watcher.addProject).toBe('function')
      expect(typeof watcher.removeProject).toBe('function')
      expect(typeof watcher.syncWithDatabase).toBe('function')
      expect(typeof watcher.close).toBe('function')
      expect(typeof watcher.getWatchedProjects).toBe('function')
      expect(typeof watcher.isInitialized).toBe('function')
    })
  })

  describe('addProject', () => {
    it('should create a file watcher for valid project', () => {
      const watcher = getPrdFileWatcher()
      watcher.addProject(1, '/projects/test1')

      expect(chokidar.watch).toHaveBeenCalledWith(
        '/projects/test1/stories/prd.json',
        expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
        })
      )
      expect(watcher.getWatchedProjects()).toContain(1)
    })

    it('should not add duplicate watchers for same project', () => {
      const watcher = getPrdFileWatcher()
      watcher.addProject(1, '/projects/test1')
      watcher.addProject(1, '/projects/test1')

      // Should only call watch once
      expect(chokidar.watch).toHaveBeenCalledTimes(1)
    })

    it('should skip projects without prd.json', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false)

      const watcher = getPrdFileWatcher()
      watcher.addProject(3, '/projects/no-prd')

      expect(chokidar.watch).not.toHaveBeenCalled()
      expect(watcher.getWatchedProjects()).not.toContain(3)
    })
  })

  describe('removeProject', () => {
    it('should close watcher and remove from list', () => {
      const watcher = getPrdFileWatcher()
      watcher.addProject(1, '/projects/test1')

      expect(watcher.getWatchedProjects()).toContain(1)

      watcher.removeProject(1)

      expect(watcher.getWatchedProjects()).not.toContain(1)
    })

    it('should handle removing non-existent project gracefully', () => {
      const watcher = getPrdFileWatcher()
      // Should not throw
      expect(() => watcher.removeProject(999)).not.toThrow()
    })
  })

  describe('syncWithDatabase', () => {
    it('should add watchers for all projects in database', async () => {
      const watcher = getPrdFileWatcher()
      await watcher.syncWithDatabase()

      expect(watcher.isInitialized()).toBe(true)
      expect(watcher.getWatchedProjects()).toHaveLength(2)
    })
  })

  describe('close', () => {
    it('should close all watchers and reset state', async () => {
      const watcher = getPrdFileWatcher()
      await watcher.syncWithDatabase()

      expect(watcher.getWatchedProjects().length).toBeGreaterThan(0)

      watcher.close()

      expect(watcher.getWatchedProjects()).toHaveLength(0)
      expect(watcher.isInitialized()).toBe(false)
    })
  })

  describe('file change handling', () => {
    it('should broadcast stories_updated on file change', async () => {
      // Setup mock to capture the change handler
      let changeHandler: (() => void) | undefined
      const mockWatcher = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'change') {
            changeHandler = handler
          }
          return mockWatcher
        }),
        close: vi.fn(),
      }
      vi.mocked(chokidar.watch).mockReturnValue(mockWatcher as unknown as chokidar.FSWatcher)

      const watcher = getPrdFileWatcher()
      watcher.addProject(1, '/projects/test1')

      // Simulate file change
      expect(changeHandler).toBeDefined()
      changeHandler!()

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150))

      // Check that broadcast was called
      expect(mockBroadcastToProject).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          type: 'stories_updated',
          payload: { projectId: '1' },
        })
      )
    })

    it('should debounce multiple rapid file changes', async () => {
      // Setup mock to capture the change handler
      let changeHandler: (() => void) | undefined
      const mockWatcher = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'change') {
            changeHandler = handler
          }
          return mockWatcher
        }),
        close: vi.fn(),
      }
      vi.mocked(chokidar.watch).mockReturnValue(mockWatcher as unknown as chokidar.FSWatcher)

      const watcher = getPrdFileWatcher()
      watcher.addProject(1, '/projects/test1')

      // Simulate multiple rapid file changes
      changeHandler!()
      changeHandler!()
      changeHandler!()

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should only broadcast once due to debouncing
      expect(mockBroadcastToProject).toHaveBeenCalledTimes(1)
    })
  })

  describe('cleanupPrdFileWatcher', () => {
    it('should clean up and allow new instance creation', () => {
      const watcher1 = getPrdFileWatcher()
      cleanupPrdFileWatcher()

      const watcher2 = getPrdFileWatcher()
      expect(watcher1).not.toBe(watcher2)
    })
  })
})

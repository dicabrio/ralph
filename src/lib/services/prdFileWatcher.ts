/**
 * PRD File Watcher Service
 *
 * Watches prd.json files for all projects and broadcasts updates via WebSocket.
 * Uses chokidar for efficient file watching with debouncing.
 */
import { watch, type FSWatcher } from 'chokidar'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { getWebSocketServer } from '@/lib/websocket/server'

// Debounce timeout in milliseconds
const DEBOUNCE_MS = 100

// Global instance storage with explicit typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalStore = globalThis as any

interface WatchedProject {
  projectId: number
  path: string
  prdPath: string
}

export interface PrdFileWatcherService {
  /** Add a project to watch */
  addProject: (projectId: number, path: string) => void
  /** Remove a project from watching */
  removeProject: (projectId: number) => void
  /** Sync with database - add/remove watchers as needed */
  syncWithDatabase: () => Promise<void>
  /** Close all watchers and clean up */
  close: () => void
  /** Get list of currently watched projects */
  getWatchedProjects: () => number[]
  /** Check if service is initialized */
  isInitialized: () => boolean
}

/**
 * Creates the PRD file watcher service
 */
function createPrdFileWatcherService(): PrdFileWatcherService {
  // Map of projectId -> watcher instance
  const watchers = new Map<number, FSWatcher>()
  // Map of projectId -> project info
  const watchedProjects = new Map<number, WatchedProject>()
  // Debounce timers per project
  const debounceTimers = new Map<number, ReturnType<typeof setTimeout>>()
  // Track initialization
  let initialized = false

  /**
   * Broadcast stories_updated event for a project
   */
  function broadcastStoriesUpdated(projectId: number) {
    const wsServer = getWebSocketServer()
    if (!wsServer) {
      console.log(`[PrdWatcher] WebSocket server not available, skipping broadcast for project ${projectId}`)
      return
    }

    const projectIdStr = String(projectId)
    wsServer.broadcastToProject(projectIdStr, {
      type: 'stories_updated',
      payload: { projectId: projectIdStr },
      timestamp: Date.now(),
    })
    console.log(`[PrdWatcher] Broadcasted stories_updated for project ${projectId}`)
  }

  /**
   * Handle prd.json file change with debouncing
   */
  function handleFileChange(projectId: number) {
    // Clear existing debounce timer if any
    const existingTimer = debounceTimers.get(projectId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      debounceTimers.delete(projectId)
      broadcastStoriesUpdated(projectId)
    }, DEBOUNCE_MS)

    debounceTimers.set(projectId, timer)
  }

  /**
   * Add a project to watch
   */
  function addProject(projectId: number, path: string) {
    // Don't add if already watching
    if (watchers.has(projectId)) {
      console.log(`[PrdWatcher] Already watching project ${projectId}`)
      return
    }

    const prdPath = join(path, 'stories', 'prd.json')

    // Only watch if the prd.json file exists
    if (!existsSync(prdPath)) {
      console.log(`[PrdWatcher] prd.json not found at ${prdPath}, skipping project ${projectId}`)
      return
    }

    // Create watcher for this specific file
    const watcher = watch(prdPath, {
      persistent: true,
      ignoreInitial: true, // Don't trigger on initial add
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    })

    watcher.on('change', () => {
      console.log(`[PrdWatcher] prd.json changed for project ${projectId}`)
      handleFileChange(projectId)
    })

    watcher.on('error', (error) => {
      console.error(`[PrdWatcher] Error watching project ${projectId}:`, error)
    })

    watchers.set(projectId, watcher)
    watchedProjects.set(projectId, { projectId, path, prdPath })

    console.log(`[PrdWatcher] Started watching project ${projectId}: ${prdPath}`)
  }

  /**
   * Remove a project from watching
   */
  function removeProject(projectId: number) {
    const watcher = watchers.get(projectId)
    if (watcher) {
      watcher.close()
      watchers.delete(projectId)
      watchedProjects.delete(projectId)

      // Clear any pending debounce timer
      const timer = debounceTimers.get(projectId)
      if (timer) {
        clearTimeout(timer)
        debounceTimers.delete(projectId)
      }

      console.log(`[PrdWatcher] Stopped watching project ${projectId}`)
    }
  }

  /**
   * Sync watchers with database - add new projects, remove deleted ones
   */
  async function syncWithDatabase() {
    try {
      // Get all projects from database
      const allProjects = await db.select().from(projects)
      const dbProjectIds = new Set(allProjects.map((p) => p.id))

      // Remove watchers for projects no longer in database
      for (const projectId of watchers.keys()) {
        if (!dbProjectIds.has(projectId)) {
          removeProject(projectId)
        }
      }

      // Add watchers for new projects
      for (const project of allProjects) {
        if (!watchers.has(project.id)) {
          addProject(project.id, project.path)
        }
      }

      initialized = true
      console.log(`[PrdWatcher] Synced with database: watching ${watchers.size} projects`)
    } catch (error) {
      console.error('[PrdWatcher] Error syncing with database:', error)
    }
  }

  /**
   * Close all watchers and clean up
   */
  function close() {
    // Clear all debounce timers
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer)
    }
    debounceTimers.clear()

    // Close all watchers
    for (const [projectId, watcher] of watchers) {
      watcher.close()
      console.log(`[PrdWatcher] Closed watcher for project ${projectId}`)
    }
    watchers.clear()
    watchedProjects.clear()
    initialized = false

    console.log('[PrdWatcher] All watchers closed')
  }

  /**
   * Get list of currently watched project IDs
   */
  function getWatchedProjects(): number[] {
    return Array.from(watchers.keys())
  }

  /**
   * Check if service is initialized
   */
  function isInitialized(): boolean {
    return initialized
  }

  return {
    addProject,
    removeProject,
    syncWithDatabase,
    close,
    getWatchedProjects,
    isInitialized,
  }
}

/**
 * Get or create the global PRD file watcher service instance
 */
export function getPrdFileWatcher(): PrdFileWatcherService {
  if (!globalStore.__RALPH_PRD_FILE_WATCHER__) {
    globalStore.__RALPH_PRD_FILE_WATCHER__ = createPrdFileWatcherService()
  }
  return globalStore.__RALPH_PRD_FILE_WATCHER__ as PrdFileWatcherService
}

/**
 * Initialize the PRD file watcher and sync with database
 */
export async function initPrdFileWatcher(): Promise<PrdFileWatcherService> {
  const watcher = getPrdFileWatcher()
  if (!watcher.isInitialized()) {
    await watcher.syncWithDatabase()
  }
  return watcher
}

/**
 * Cleanup the PRD file watcher (for graceful shutdown)
 */
export function cleanupPrdFileWatcher(): void {
  const watcher = globalStore.__RALPH_PRD_FILE_WATCHER__ as PrdFileWatcherService | undefined
  if (watcher) {
    watcher.close()
    globalStore.__RALPH_PRD_FILE_WATCHER__ = undefined
  }
}

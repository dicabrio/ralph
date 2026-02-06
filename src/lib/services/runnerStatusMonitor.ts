/**
 * Runner Status Monitor Service
 *
 * Monitors running containers for completion, detects exit status,
 * reads prd.json for story status updates, and handles auto-restart.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getWebSocketServer } from '@/lib/websocket/server'

/**
 * Story status from prd.json
 */
export type StoryStatus = 'pending' | 'in_progress' | 'done' | 'failed'

/**
 * Story from prd.json
 */
export interface PrdStory {
  id: string
  title: string
  status: StoryStatus
  dependencies: string[]
  priority: number
}

/**
 * Prd.json structure
 */
export interface PrdJson {
  userStories: PrdStory[]
}

/**
 * Exit result from container
 */
export interface ContainerExitResult {
  projectId: number
  containerId: string
  storyId?: string
  exitCode: number
  success: boolean
}

/**
 * Callback types for the monitor
 */
export interface RunnerStatusMonitorCallbacks {
  onContainerExit?: (result: ContainerExitResult) => Promise<void>
  getProjectPath?: (projectId: number) => Promise<string | null>
  restartRunner?: (projectId: number, storyId: string) => Promise<void>
}

/**
 * Active monitor handle
 */
interface MonitorHandle {
  projectId: number
  containerId: string
  containerName: string
  storyId?: string
  process: ChildProcess
  autoRestartEnabled: boolean
}

/**
 * RunnerStatusMonitor class
 *
 * Watches containers via `docker wait` to detect when they exit.
 * When a container exits, it:
 * 1. Parses the exit code (0 = success, non-zero = failure)
 * 2. Reads prd.json for updated story statuses
 * 3. Broadcasts status change via WebSocket
 * 4. Triggers auto-restart if enabled and pending stories exist
 */
class RunnerStatusMonitor {
  private activeMonitors: Map<number, MonitorHandle> = new Map()
  private callbacks: RunnerStatusMonitorCallbacks = {}
  private autoRestartEnabledByProject: Map<number, boolean> = new Map()

  /**
   * Set callbacks for external integration
   */
  setCallbacks(callbacks: RunnerStatusMonitorCallbacks): void {
    this.callbacks = callbacks
  }

  /**
   * Start monitoring a container for exit
   *
   * @param projectId - Database ID of the project
   * @param containerId - Docker container ID
   * @param containerName - Docker container name
   * @param storyId - Optional story ID being worked on
   */
  startMonitoring(
    projectId: number,
    containerId: string,
    containerName: string,
    storyId?: string
  ): void {
    // Don't start duplicate monitors
    if (this.activeMonitors.has(projectId)) {
      console.log(`[StatusMonitor] Monitor already active for project ${projectId}`)
      return
    }

    // Spawn docker wait process
    const waitProcess = spawn('docker', ['wait', containerName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const monitor: MonitorHandle = {
      projectId,
      containerId,
      containerName,
      storyId,
      process: waitProcess,
      autoRestartEnabled: this.autoRestartEnabledByProject.get(projectId) ?? false,
    }

    this.activeMonitors.set(projectId, monitor)

    console.log(`[StatusMonitor] Started monitoring container ${containerName} for project ${projectId}`)

    let exitCodeStr = ''

    // Handle stdout (contains exit code)
    waitProcess.stdout?.on('data', (data: Buffer) => {
      exitCodeStr += data.toString()
    })

    // Handle process close
    waitProcess.on('close', async () => {
      const exitCode = parseInt(exitCodeStr.trim(), 10) || 0
      console.log(`[StatusMonitor] Container ${containerName} exited with code ${exitCode}`)

      this.activeMonitors.delete(projectId)

      const result: ContainerExitResult = {
        projectId,
        containerId,
        storyId,
        exitCode,
        success: exitCode === 0,
      }

      // Handle container exit
      await this.handleContainerExit(result, monitor.autoRestartEnabled)
    })

    // Handle errors
    waitProcess.on('error', (error) => {
      console.error(`[StatusMonitor] Error monitoring container ${containerName}:`, error)
      this.activeMonitors.delete(projectId)
    })
  }

  /**
   * Stop monitoring a container
   *
   * @param projectId - Database ID of the project
   */
  stopMonitoring(projectId: number): void {
    const monitor = this.activeMonitors.get(projectId)
    if (!monitor) {
      return
    }

    // Kill the docker wait process
    monitor.process.kill('SIGTERM')
    this.activeMonitors.delete(projectId)

    console.log(`[StatusMonitor] Stopped monitoring for project ${projectId}`)
  }

  /**
   * Enable or disable auto-restart for a project
   *
   * @param projectId - Database ID of the project
   * @param enabled - Whether auto-restart is enabled
   */
  setAutoRestart(projectId: number, enabled: boolean): void {
    this.autoRestartEnabledByProject.set(projectId, enabled)

    // Update active monitor if exists
    const monitor = this.activeMonitors.get(projectId)
    if (monitor) {
      monitor.autoRestartEnabled = enabled
    }

    console.log(`[StatusMonitor] Auto-restart ${enabled ? 'enabled' : 'disabled'} for project ${projectId}`)
  }

  /**
   * Check if auto-restart is enabled for a project
   */
  isAutoRestartEnabled(projectId: number): boolean {
    return this.autoRestartEnabledByProject.get(projectId) ?? false
  }

  /**
   * Handle container exit
   */
  private async handleContainerExit(
    result: ContainerExitResult,
    autoRestartEnabled: boolean
  ): Promise<void> {
    const { projectId, storyId, exitCode, success } = result

    // Read prd.json to check story status
    let completedStoryStatus: StoryStatus | undefined
    let nextStoryId: string | undefined
    let projectPath: string | null = null

    if (this.callbacks.getProjectPath) {
      projectPath = await this.callbacks.getProjectPath(projectId)
    }

    if (projectPath) {
      try {
        const prdData = await this.readPrdJson(projectPath)

        // Find the completed story's status
        if (storyId) {
          const completedStory = prdData.userStories.find(s => s.id === storyId)
          completedStoryStatus = completedStory?.status
        }

        // Find next pending story for auto-restart
        if (autoRestartEnabled) {
          nextStoryId = this.findNextPendingStory(prdData.userStories)
        }
      } catch (error) {
        console.error(`[StatusMonitor] Failed to read prd.json:`, error)
      }
    }

    const willAutoRestart = autoRestartEnabled && !!nextStoryId

    // Broadcast completion event via WebSocket
    this.broadcastCompletion(
      projectId,
      storyId,
      exitCode,
      success,
      completedStoryStatus,
      nextStoryId,
      willAutoRestart
    )

    // Call external callback
    if (this.callbacks.onContainerExit) {
      await this.callbacks.onContainerExit(result)
    }

    // Trigger auto-restart if enabled and there's a next story
    if (willAutoRestart && nextStoryId && this.callbacks.restartRunner) {
      console.log(`[StatusMonitor] Auto-restarting runner for project ${projectId} with story ${nextStoryId}`)

      // Small delay to allow cleanup
      setTimeout(async () => {
        try {
          await this.callbacks.restartRunner!(projectId, nextStoryId!)
        } catch (error) {
          console.error(`[StatusMonitor] Failed to auto-restart runner:`, error)
          this.broadcastStatus(projectId, 'idle')
        }
      }, 1000)
    } else {
      // Broadcast idle status
      this.broadcastStatus(projectId, 'idle')
    }
  }

  /**
   * Read and parse prd.json from a project path
   */
  async readPrdJson(projectPath: string): Promise<PrdJson> {
    const prdPath = path.join(projectPath, 'stories', 'prd.json')
    const content = await readFile(prdPath, 'utf-8')
    return JSON.parse(content) as PrdJson
  }

  /**
   * Find the next pending story that can be worked on
   * (All dependencies must be done)
   */
  findNextPendingStory(stories: PrdStory[]): string | undefined {
    // Get all stories that are pending or failed, sorted by priority
    const eligibleStories = stories
      .filter(s => s.status === 'pending' || s.status === 'failed')
      .sort((a, b) => a.priority - b.priority)

    // Create a set of done story IDs for dependency checking
    const doneStoryIds = new Set(
      stories.filter(s => s.status === 'done').map(s => s.id)
    )

    // Find first story where all dependencies are done
    for (const story of eligibleStories) {
      const dependenciesMet = story.dependencies.every(depId => doneStoryIds.has(depId))
      if (dependenciesMet) {
        return story.id
      }
    }

    return undefined
  }

  /**
   * Broadcast runner completion event via WebSocket
   */
  private broadcastCompletion(
    projectId: number,
    storyId: string | undefined,
    exitCode: number,
    success: boolean,
    completedStoryStatus: StoryStatus | undefined,
    nextStoryId: string | undefined,
    willAutoRestart: boolean
  ): void {
    const wsServer = getWebSocketServer()
    if (!wsServer) {
      return
    }

    wsServer.broadcastToProject(String(projectId), {
      type: 'runner_completed',
      payload: {
        projectId: String(projectId),
        storyId,
        exitCode,
        success,
        completedStoryStatus,
        nextStoryId,
        willAutoRestart,
      },
      timestamp: Date.now(),
    })
  }

  /**
   * Broadcast runner status change via WebSocket
   */
  private broadcastStatus(
    projectId: number,
    status: 'idle' | 'running' | 'stopping',
    storyId?: string,
    containerId?: string,
    exitCode?: number
  ): void {
    const wsServer = getWebSocketServer()
    if (!wsServer) {
      return
    }

    wsServer.broadcastToProject(String(projectId), {
      type: 'runner_status',
      payload: {
        projectId: String(projectId),
        status,
        storyId,
        containerId,
        exitCode,
      },
      timestamp: Date.now(),
    })
  }

  /**
   * Broadcast running status (called externally when starting)
   */
  broadcastRunning(projectId: number, storyId?: string, containerId?: string): void {
    this.broadcastStatus(projectId, 'running', storyId, containerId)
  }

  /**
   * Check if monitoring is active for a project
   */
  isMonitoring(projectId: number): boolean {
    return this.activeMonitors.has(projectId)
  }

  /**
   * Get all active monitors info
   */
  getActiveMonitors(): Array<{
    projectId: number
    containerName: string
    storyId?: string
    autoRestartEnabled: boolean
  }> {
    return Array.from(this.activeMonitors.values()).map(monitor => ({
      projectId: monitor.projectId,
      containerName: monitor.containerName,
      storyId: monitor.storyId,
      autoRestartEnabled: monitor.autoRestartEnabled,
    }))
  }

  /**
   * Stop all active monitors (for cleanup on shutdown)
   */
  stopAllMonitors(): void {
    for (const [projectId] of this.activeMonitors) {
      this.stopMonitoring(projectId)
    }
    this.autoRestartEnabledByProject.clear()
  }
}

// Export singleton instance
export const runnerStatusMonitor = new RunnerStatusMonitor()

// Export class for testing (allows creating fresh instances)
export { RunnerStatusMonitor }

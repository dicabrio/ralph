/**
 * Runner Manager Service
 *
 * Manages Claude Docker containers for running stories.
 * Handles starting, stopping, and tracking container status.
 *
 * Uses Docker-out-of-Docker (DooD) pattern - spawns containers on the host
 * via the mounted Docker socket.
 */
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logStreamingService } from './logStreamingService'
import { runnerStatusMonitor } from './runnerStatusMonitor'

const execAsync = promisify(exec)

/**
 * Runner status enum
 */
export type RunnerStatus = 'idle' | 'running' | 'stopping'

/**
 * Runner state for a project
 */
export interface RunnerState {
  status: RunnerStatus
  projectId: number
  storyId?: string
  containerId?: string
  startedAt?: Date
}

/**
 * Container process handle
 */
interface ContainerProcess {
  projectId: number
  containerId: string
  storyId?: string
  startedAt: Date
  projectPath: string
}

/**
 * RunnerManager class
 *
 * Singleton that tracks running containers across the application.
 * Uses in-memory state tracking with Docker CLI for container operations.
 */
class RunnerManager {
  private containers: Map<number, ContainerProcess> = new Map()
  private stoppingContainers: Set<number> = new Set()
  // Store project paths for auto-restart (persists after container cleanup)
  private projectPaths: Map<number, string> = new Map()

  constructor() {
    // Set up status monitor callbacks for auto-restart
    runnerStatusMonitor.setCallbacks({
      onContainerExit: async (result) => {
        // Clean up container tracking (but keep projectPath for restart)
        this.containers.delete(result.projectId)
      },
      getProjectPath: async (projectId) => {
        return this.projectPaths.get(projectId) || null
      },
      restartRunner: async (projectId, storyId) => {
        // Re-start the runner for the next story
        const projectPath = this.projectPaths.get(projectId)
        if (projectPath) {
          await this.start(projectId, projectPath, storyId)
        }
      },
    })
  }

  /**
   * Get the container name for a project
   */
  private getContainerName(projectId: number): string {
    return `claude-runner-${projectId}`
  }

  /**
   * Execute a docker command and return output
   */
  private async dockerExec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const cmd = `docker ${args.join(' ')}`
    try {
      const { stdout, stderr } = await execAsync(cmd)
      return { stdout: stdout.trim(), stderr: stderr.trim() }
    } catch (error) {
      // exec throws when command exits with non-zero
      const execError = error as { stdout?: string; stderr?: string; code?: number }
      return {
        stdout: execError.stdout?.trim() || '',
        stderr: execError.stderr?.trim() || '',
      }
    }
  }

  /**
   * Check if a container exists (running or stopped)
   */
  private async containerExists(containerName: string): Promise<boolean> {
    const { stdout } = await this.dockerExec([
      'ps', '-a', '--format', '{{.Names}}', '--filter', `name=^${containerName}$`,
    ])
    return stdout.split('\n').some(name => name === containerName)
  }

  /**
   * Check if a container is currently running
   */
  private async containerIsRunning(containerName: string): Promise<boolean> {
    const { stdout } = await this.dockerExec([
      'ps', '--format', '{{.Names}}', '--filter', `name=^${containerName}$`,
    ])
    return stdout.split('\n').some(name => name === containerName)
  }

  /**
   * Get container ID by name
   */
  private async getContainerId(containerName: string): Promise<string | null> {
    const { stdout } = await this.dockerExec([
      'ps', '-a', '--format', '{{.ID}}', '--filter', `name=^${containerName}$`,
    ])
    return stdout.split('\n')[0] || null
  }

  /**
   * Remove a stopped container
   */
  private async removeContainer(containerName: string): Promise<void> {
    await this.dockerExec(['rm', containerName])
  }

  /**
   * Start a runner for a project
   *
   * @param projectId - Database ID of the project
   * @param projectPath - Filesystem path to the project (relative to PROJECTS_ROOT)
   * @param storyId - Optional story ID being worked on
   * @returns The runner state after starting
   */
  async start(
    projectId: number,
    projectPath: string,
    storyId?: string
  ): Promise<RunnerState> {
    const containerName = this.getContainerName(projectId)

    // Check if already running
    if (this.containers.has(projectId)) {
      const existing = this.containers.get(projectId)!
      return {
        status: 'running',
        projectId,
        storyId: existing.storyId,
        containerId: existing.containerId,
        startedAt: existing.startedAt,
      }
    }

    // Check if stopping
    if (this.stoppingContainers.has(projectId)) {
      throw new Error(`Runner for project ${projectId} is currently stopping`)
    }

    // Store project path for potential auto-restart
    this.projectPaths.set(projectId, projectPath)

    // Clean up any existing container
    if (await this.containerExists(containerName)) {
      if (await this.containerIsRunning(containerName)) {
        // Container is running but not tracked - adopt it
        const containerId = await this.getContainerId(containerName)
        if (containerId) {
          this.containers.set(projectId, {
            projectId,
            containerId,
            storyId,
            startedAt: new Date(),
            projectPath,
          })
          // Start log streaming for adopted container
          logStreamingService.startStreaming(projectId, containerName, storyId)
          // Start status monitoring for adopted container
          runnerStatusMonitor.startMonitoring(projectId, containerId, containerName, storyId)
          // Broadcast running status
          runnerStatusMonitor.broadcastRunning(projectId, storyId, containerId)
          return {
            status: 'running',
            projectId,
            storyId,
            containerId,
            startedAt: new Date(),
          }
        }
      } else {
        // Stopped container exists, remove it
        await this.removeContainer(containerName)
      }
    }

    // Build and start the container
    const hostProjectsRoot = process.env.HOST_PROJECTS_ROOT || process.env.PROJECTS_ROOT || '/projects'
    const hostSkillsPath = process.env.HOST_SKILLS_PATH || process.env.SKILLS_PATH || '/skills'
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    const hostClaudeConfig = process.env.HOST_CLAUDE_CONFIG

    // Require at least one authentication method
    if (!anthropicApiKey && !hostClaudeConfig) {
      throw new Error('Either ANTHROPIC_API_KEY or HOST_CLAUDE_CONFIG must be set for Claude authentication')
    }

    const hostProjectPath = `${hostProjectsRoot}/${projectPath}`

    // Spawn the container in detached mode
    const dockerArgs = [
      'run',
      '-d', // Detached mode
      '--name', containerName,
    ]

    // Add authentication: prefer config file over API key
    if (hostClaudeConfig) {
      // Use Claude Max/Pro subscription via config file
      dockerArgs.push('-v', `${hostClaudeConfig}:/root/.claude.json:ro`)
    } else if (anthropicApiKey) {
      // Use API key
      dockerArgs.push('-e', `ANTHROPIC_API_KEY=${anthropicApiKey}`)
    }

    // Add volume mounts and working directory
    dockerArgs.push(
      '-v', `${hostProjectPath}:/workspace`,
      '-v', `${hostSkillsPath}:/skills:ro`,
      '-w', '/workspace',
      'anthropics/claude-code:latest',
    )

    const { stdout, stderr } = await this.dockerExec(dockerArgs)

    if (stderr && !stdout) {
      throw new Error(`Failed to start container: ${stderr}`)
    }

    const containerId = stdout.substring(0, 12) // Docker returns full ID, we use short form

    // Track the container
    this.containers.set(projectId, {
      projectId,
      containerId,
      storyId,
      startedAt: new Date(),
      projectPath,
    })

    // Start log streaming
    logStreamingService.startStreaming(projectId, containerName, storyId)

    // Start status monitoring for exit detection
    runnerStatusMonitor.startMonitoring(projectId, containerId, containerName, storyId)

    // Broadcast running status
    runnerStatusMonitor.broadcastRunning(projectId, storyId, containerId)

    return {
      status: 'running',
      projectId,
      storyId,
      containerId,
      startedAt: new Date(),
    }
  }

  /**
   * Stop a running runner
   *
   * @param projectId - Database ID of the project
   * @param force - Force kill instead of graceful stop
   * @returns The runner state after stopping
   */
  async stop(projectId: number, force: boolean = false): Promise<RunnerState> {
    const containerName = this.getContainerName(projectId)

    // Mark as stopping
    this.stoppingContainers.add(projectId)

    try {
      // Stop status monitoring first
      runnerStatusMonitor.stopMonitoring(projectId)

      // Stop log streaming
      logStreamingService.stopStreaming(projectId)

      // Stop the container
      if (await this.containerIsRunning(containerName)) {
        if (force) {
          await this.dockerExec(['kill', containerName])
        } else {
          await this.dockerExec(['stop', '-t', '30', containerName])
        }
      }

      // Remove the container
      if (await this.containerExists(containerName)) {
        await this.removeContainer(containerName)
      }

      // Remove from tracking
      this.containers.delete(projectId)

      return {
        status: 'idle',
        projectId,
      }
    } finally {
      // Remove from stopping set
      this.stoppingContainers.delete(projectId)
    }
  }

  /**
   * Get the status of a runner
   *
   * @param projectId - Database ID of the project
   * @returns The current runner state
   */
  async getStatus(projectId: number): Promise<RunnerState> {
    const containerName = this.getContainerName(projectId)

    // Check if stopping
    if (this.stoppingContainers.has(projectId)) {
      return {
        status: 'stopping',
        projectId,
      }
    }

    // Check tracked state
    const tracked = this.containers.get(projectId)

    // Verify with Docker
    const isRunning = await this.containerIsRunning(containerName)

    if (isRunning) {
      const containerId = await this.getContainerId(containerName)

      // If running but not tracked, adopt it
      // Note: projectPath will be empty for adopted containers - they won't support auto-restart
      if (!tracked && containerId) {
        const existingPath = this.projectPaths.get(projectId) || ''
        this.containers.set(projectId, {
          projectId,
          containerId,
          startedAt: new Date(),
          projectPath: existingPath,
        })
        return {
          status: 'running',
          projectId,
          containerId,
        }
      }

      return {
        status: 'running',
        projectId,
        storyId: tracked?.storyId,
        containerId: containerId || tracked?.containerId,
        startedAt: tracked?.startedAt,
      }
    }

    // Not running - clean up tracking if needed
    if (tracked) {
      this.containers.delete(projectId)
    }

    return {
      status: 'idle',
      projectId,
    }
  }

  /**
   * Get status of all tracked runners
   */
  async getAllStatus(): Promise<RunnerState[]> {
    const states: RunnerState[] = []

    for (const [projectId] of this.containers) {
      states.push(await this.getStatus(projectId))
    }

    return states
  }

  /**
   * Enable or disable auto-restart for a project
   *
   * @param projectId - Database ID of the project
   * @param enabled - Whether auto-restart is enabled
   */
  setAutoRestart(projectId: number, enabled: boolean): void {
    runnerStatusMonitor.setAutoRestart(projectId, enabled)
  }

  /**
   * Check if auto-restart is enabled for a project
   *
   * @param projectId - Database ID of the project
   */
  isAutoRestartEnabled(projectId: number): boolean {
    return runnerStatusMonitor.isAutoRestartEnabled(projectId)
  }

  /**
   * Clean up orphaned containers
   * Should be called on application startup
   */
  async cleanupOrphanedContainers(): Promise<void> {
    const { stdout } = await this.dockerExec([
      'ps', '-a', '--filter', 'name=claude-runner-', '--format', '{{.Names}}',
    ])

    if (!stdout) return

    const containerNames = stdout.split('\n').filter(Boolean)

    for (const name of containerNames) {
      try {
        if (await this.containerIsRunning(name)) {
          await this.dockerExec(['stop', '-t', '5', name])
        }
        await this.dockerExec(['rm', name])
      } catch {
        // Ignore errors during cleanup
      }
    }
  }
}

// Export singleton instance
export const runnerManager = new RunnerManager()

// Export type for external use
export type { RunnerManager }

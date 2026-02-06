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
          })
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

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }

    const hostProjectPath = `${hostProjectsRoot}/${projectPath}`

    // Spawn the container in detached mode
    const dockerArgs = [
      'run',
      '-d', // Detached mode
      '--name', containerName,
      '-e', `ANTHROPIC_API_KEY=${anthropicApiKey}`,
      '-v', `${hostProjectPath}:/workspace`,
      '-v', `${hostSkillsPath}:/skills:ro`,
      '-w', '/workspace',
      'anthropics/claude-code:latest',
    ]

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
    })

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
      if (!tracked && containerId) {
        this.containers.set(projectId, {
          projectId,
          containerId,
          startedAt: new Date(),
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

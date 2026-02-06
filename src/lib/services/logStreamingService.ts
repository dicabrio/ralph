/**
 * Log Streaming Service
 *
 * Captures stdout/stderr from Claude Docker containers and:
 * 1. Broadcasts to WebSocket subscribers in real-time
 * 2. Buffers recent logs for late joiners
 * 3. Persists logs to the database
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { db } from '@/db'
import { runnerLogs } from '@/db/schema'
import { getWebSocketServer } from '@/lib/websocket/server'

/**
 * Buffer size for late joiners (number of log lines per project)
 */
const LOG_BUFFER_SIZE = 100

/**
 * Log entry structure
 */
interface LogEntry {
  projectId: number
  storyId?: string
  content: string
  logType: 'stdout' | 'stderr'
  timestamp: Date
}

/**
 * Active log stream handle
 */
interface LogStream {
  projectId: number
  containerName: string
  storyId?: string
  process: ChildProcess
  startedAt: Date
}

/**
 * LogStreamingService class
 *
 * Manages log streaming from Docker containers.
 * Singleton pattern for cross-request state tracking.
 */
class LogStreamingService {
  private activeStreams: Map<number, LogStream> = new Map()
  private logBuffers: Map<number, LogEntry[]> = new Map()

  /**
   * Start streaming logs from a container
   *
   * @param projectId - Database ID of the project
   * @param containerName - Docker container name to attach to
   * @param storyId - Optional story ID being worked on
   */
  startStreaming(projectId: number, containerName: string, storyId?: string): void {
    // Don't start duplicate streams
    if (this.activeStreams.has(projectId)) {
      console.log(`[LogStreaming] Stream already active for project ${projectId}`)
      return
    }

    // Initialize buffer for this project
    if (!this.logBuffers.has(projectId)) {
      this.logBuffers.set(projectId, [])
    }

    // Spawn docker logs process with follow mode
    const logProcess = spawn('docker', ['logs', '-f', '--timestamps', containerName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stream: LogStream = {
      projectId,
      containerName,
      storyId,
      process: logProcess,
      startedAt: new Date(),
    }

    this.activeStreams.set(projectId, stream)

    console.log(`[LogStreaming] Started streaming logs for project ${projectId} from container ${containerName}`)

    // Handle stdout
    logProcess.stdout?.on('data', (data: Buffer) => {
      this.handleLogData(projectId, storyId, data.toString(), 'stdout')
    })

    // Handle stderr
    logProcess.stderr?.on('data', (data: Buffer) => {
      this.handleLogData(projectId, storyId, data.toString(), 'stderr')
    })

    // Handle process exit
    logProcess.on('close', (code) => {
      console.log(`[LogStreaming] Log stream closed for project ${projectId} with code ${code}`)
      this.activeStreams.delete(projectId)
    })

    // Handle errors
    logProcess.on('error', (error) => {
      console.error(`[LogStreaming] Error streaming logs for project ${projectId}:`, error)
      this.activeStreams.delete(projectId)
    })
  }

  /**
   * Stop streaming logs for a project
   *
   * @param projectId - Database ID of the project
   */
  stopStreaming(projectId: number): void {
    const stream = this.activeStreams.get(projectId)
    if (!stream) {
      return
    }

    // Kill the docker logs process
    stream.process.kill('SIGTERM')
    this.activeStreams.delete(projectId)

    console.log(`[LogStreaming] Stopped streaming logs for project ${projectId}`)
  }

  /**
   * Check if streaming is active for a project
   *
   * @param projectId - Database ID of the project
   */
  isStreaming(projectId: number): boolean {
    return this.activeStreams.has(projectId)
  }

  /**
   * Get buffered logs for a project
   *
   * @param projectId - Database ID of the project
   * @returns Array of buffered log entries
   */
  getBufferedLogs(projectId: number): LogEntry[] {
    return this.logBuffers.get(projectId) || []
  }

  /**
   * Clear the log buffer for a project
   *
   * @param projectId - Database ID of the project
   */
  clearBuffer(projectId: number): void {
    this.logBuffers.delete(projectId)
  }

  /**
   * Handle incoming log data from container
   */
  private handleLogData(
    projectId: number,
    storyId: string | undefined,
    data: string,
    logType: 'stdout' | 'stderr'
  ): void {
    // Split into lines and process each
    const lines = data.split('\n').filter((line) => line.trim() !== '')

    for (const line of lines) {
      const entry = this.parseLogLine(projectId, storyId, line, logType)

      // Add to buffer
      this.addToBuffer(projectId, entry)

      // Broadcast to WebSocket subscribers
      this.broadcastLog(entry)

      // Persist to database (async, don't await)
      this.persistLog(entry).catch((error) => {
        console.error(`[LogStreaming] Failed to persist log:`, error)
      })
    }
  }

  /**
   * Parse a log line from docker logs output
   * Docker logs with --timestamps outputs: "2024-01-15T12:34:56.789012345Z actual log content"
   */
  private parseLogLine(
    projectId: number,
    storyId: string | undefined,
    line: string,
    logType: 'stdout' | 'stderr'
  ): LogEntry {
    let timestamp = new Date()
    let content = line

    // Try to parse Docker timestamp format
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)/)
    if (timestampMatch) {
      try {
        timestamp = new Date(timestampMatch[1])
        content = timestampMatch[2]
      } catch {
        // Use current time if parsing fails
      }
    }

    return {
      projectId,
      storyId,
      content,
      logType,
      timestamp,
    }
  }

  /**
   * Add a log entry to the buffer
   */
  private addToBuffer(projectId: number, entry: LogEntry): void {
    let buffer = this.logBuffers.get(projectId)
    if (!buffer) {
      buffer = []
      this.logBuffers.set(projectId, buffer)
    }

    buffer.push(entry)

    // Trim buffer if too large
    if (buffer.length > LOG_BUFFER_SIZE) {
      buffer.shift()
    }
  }

  /**
   * Broadcast a log entry to WebSocket subscribers
   */
  private broadcastLog(entry: LogEntry): void {
    const wsServer = getWebSocketServer()
    if (!wsServer) {
      return
    }

    // Use the existing broadcastLog method from WebSocket server
    wsServer.broadcastLog(
      String(entry.projectId),
      entry.storyId,
      entry.content,
      entry.logType
    )
  }

  /**
   * Persist a log entry to the database
   */
  private async persistLog(entry: LogEntry): Promise<void> {
    await db.insert(runnerLogs).values({
      projectId: entry.projectId,
      storyId: entry.storyId,
      logContent: entry.content,
      logType: entry.logType,
      timestamp: entry.timestamp,
    })
  }

  /**
   * Get all active stream info
   */
  getActiveStreams(): Array<{
    projectId: number
    containerName: string
    storyId?: string
    startedAt: Date
  }> {
    return Array.from(this.activeStreams.values()).map((stream) => ({
      projectId: stream.projectId,
      containerName: stream.containerName,
      storyId: stream.storyId,
      startedAt: stream.startedAt,
    }))
  }

  /**
   * Stop all active streams (for cleanup on shutdown)
   */
  stopAllStreams(): void {
    for (const [projectId] of this.activeStreams) {
      this.stopStreaming(projectId)
    }
  }
}

// Export singleton instance
export const logStreamingService = new LogStreamingService()

// Export class for testing (allows creating fresh instances)
export { LogStreamingService }

// Export type for external use
export type { LogEntry }

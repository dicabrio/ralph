/**
 * Claude Loop Service
 *
 * Manages Claude Code CLI processes for running stories.
 * Uses direct CLI invocation instead of Docker containers.
 *
 * Authentication via `claude login` (Claude Pro/Max subscription).
 * No API key required.
 */
import { spawn, exec, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { runnerLogs } from "@/db/schema";
import { getWebSocketServer } from "@/lib/websocket/server";
import { getEffectivePrompt } from "@/lib/services/promptTemplate";

const execAsync = promisify(exec);

/**
 * Runner status enum
 */
export type RunnerStatus = "idle" | "running" | "stopping";

/**
 * Story status from prd.json
 */
export type StoryStatus = "pending" | "in_progress" | "done" | "failed";

/**
 * Story from prd.json
 */
export interface PrdStory {
  id: string;
  title: string;
  status: StoryStatus;
  dependencies: string[];
  priority: number;
}

/**
 * Prd.json structure
 */
export interface PrdJson {
  userStories: PrdStory[];
}

/**
 * Runner state for a project
 */
export interface RunnerState {
  status: RunnerStatus;
  projectId: number;
  storyId?: string;
  pid?: number;
  startedAt?: Date;
}

/**
 * Log buffer size
 */
const LOG_BUFFER_SIZE = 100;

/**
 * Log entry structure
 */
interface LogEntry {
  projectId: number;
  storyId?: string;
  content: string;
  logType: "stdout" | "stderr";
  timestamp: Date;
}

/**
 * Active process handle
 */
interface ClaudeProcess {
  projectId: number;
  process: ChildProcess;
  storyId?: string;
  startedAt: Date;
  projectPath: string;
}

/**
 * ClaudeLoopService class
 *
 * Singleton that tracks running Claude CLI processes.
 * Spawns Claude Code CLI directly without Docker.
 */
class ClaudeLoopService {
  private processes: Map<number, ClaudeProcess> = new Map();
  private stoppingProcesses: Set<number> = new Set();
  private projectPaths: Map<number, string> = new Map();
  private autoRestartEnabled: Map<number, boolean> = new Map();
  private logBuffers: Map<number, LogEntry[]> = new Map();

  /**
   * Check if Claude CLI is available
   */
  async isClaudeAvailable(): Promise<boolean> {
    try {
      await execAsync("claude --version");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if user is logged in to Claude
   */
  async isClaudeLoggedIn(): Promise<boolean> {
    try {
      // Check if ~/.claude.json exists
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const configPath = path.join(homeDir, ".claude.json");
      return existsSync(configPath);
    } catch {
      return false;
    }
  }

  /**
   * Start a runner for a project
   *
   * @param projectId - Database ID of the project
   * @param projectPath - Filesystem path to the project
   * @param storyId - Optional story ID being worked on
   * @returns The runner state after starting
   */
  async start(
    projectId: number,
    projectPath: string,
    storyId?: string,
  ): Promise<RunnerState> {
    // Check if already running
    if (this.processes.has(projectId)) {
      const existing = this.processes.get(projectId)!;
      return {
        status: "running",
        projectId,
        storyId: existing.storyId,
        pid: existing.process.pid,
        startedAt: existing.startedAt,
      };
    }

    // Check if stopping
    if (this.stoppingProcesses.has(projectId)) {
      throw new Error(`Runner for project ${projectId} is currently stopping`);
    }

    // Check if Claude CLI is available
    if (!(await this.isClaudeAvailable())) {
      throw new Error(
        "Claude Code CLI is not installed. Install with: npm install -g @anthropic-ai/claude-code",
      );
    }

    // Check if logged in
    if (!(await this.isClaudeLoggedIn())) {
      throw new Error("Not logged in to Claude. Run: claude login");
    }

    // Store project path for auto-restart
    this.projectPaths.set(projectId, projectPath);

    // Initialize log buffer
    if (!this.logBuffers.has(projectId)) {
      this.logBuffers.set(projectId, []);
    }

    // Generate the prompt for Claude
    const prompt = await this.generatePrompt(projectPath, storyId);

    // Spawn Claude CLI process - pipe prompt via stdin like: cat prompt | claude -p
    const claudeProcess = spawn(
      "claude",
      [
        "-p", // Read prompt from stdin
        "--dangerously-skip-permissions", // Allow autonomous tool use
      ],
      {
        cwd: projectPath,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const processHandle: ClaudeProcess = {
      projectId,
      process: claudeProcess,
      storyId,
      startedAt: new Date(),
      projectPath,
    };

    this.processes.set(projectId, processHandle);

    console.log(`[ClaudeLoop] ========================================`);
    console.log(`[ClaudeLoop] Starting Claude CLI`);
    console.log(`[ClaudeLoop] Project ID: ${projectId}`);
    console.log(`[ClaudeLoop] Story: ${storyId || "auto-pick"}`);
    console.log(`[ClaudeLoop] Path: ${projectPath}`);
    console.log(`[ClaudeLoop] PID: ${claudeProcess.pid}`);
    console.log(`[ClaudeLoop] Prompt length: ${prompt.length} chars`);
    console.log(`[ClaudeLoop] ========================================`);

    // Pipe prompt to stdin (like: cat prompt.md | claude -p)
    claudeProcess.stdin?.write(prompt);
    claudeProcess.stdin?.end();

    // Handle stdout
    claudeProcess.stdout?.on("data", (data: Buffer) => {
      this.handleLogData(projectId, storyId, data.toString(), "stdout");
    });

    // Handle stderr
    claudeProcess.stderr?.on("data", (data: Buffer) => {
      this.handleLogData(projectId, storyId, data.toString(), "stderr");
    });

    // Handle process exit
    claudeProcess.on("close", async (exitCode) => {
      console.log(`[ClaudeLoop] ========================================`);
      console.log(`[ClaudeLoop] Claude CLI exited`);
      console.log(`[ClaudeLoop] Project ID: ${projectId}`);
      console.log(`[ClaudeLoop] Exit code: ${exitCode}`);
      console.log(`[ClaudeLoop] ========================================`);
      this.processes.delete(projectId);

      // Handle completion
      await this.handleProcessExit(
        projectId,
        storyId,
        exitCode ?? 0,
        projectPath,
      );
    });

    // Handle errors
    claudeProcess.on("error", (error) => {
      console.error(`[ClaudeLoop] Error for project ${projectId}:`, error);
      this.processes.delete(projectId);
      this.broadcastStatus(projectId, "idle");
    });

    // Broadcast running status
    this.broadcastStatus(projectId, "running", storyId, claudeProcess.pid);

    return {
      status: "running",
      projectId,
      storyId,
      pid: claudeProcess.pid,
      startedAt: new Date(),
    };
  }

  /**
   * Stop a running runner
   *
   * @param projectId - Database ID of the project
   * @param force - Force kill instead of graceful stop
   * @returns The runner state after stopping
   */
  async stop(projectId: number, force: boolean = false): Promise<RunnerState> {
    const processHandle = this.processes.get(projectId);
    if (!processHandle) {
      return { status: "idle", projectId };
    }

    this.stoppingProcesses.add(projectId);

    try {
      // Kill the process
      if (force) {
        processHandle.process.kill("SIGKILL");
      } else {
        processHandle.process.kill("SIGTERM");

        // Wait for graceful shutdown, then force kill
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            processHandle.process.kill("SIGKILL");
            resolve();
          }, 10000);

          processHandle.process.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      this.processes.delete(projectId);

      return { status: "idle", projectId };
    } finally {
      this.stoppingProcesses.delete(projectId);
    }
  }

  /**
   * Get the status of a runner
   *
   * @param projectId - Database ID of the project
   * @returns The current runner state
   */
  getStatus(projectId: number): RunnerState {
    if (this.stoppingProcesses.has(projectId)) {
      return { status: "stopping", projectId };
    }

    const processHandle = this.processes.get(projectId);
    if (processHandle) {
      return {
        status: "running",
        projectId,
        storyId: processHandle.storyId,
        pid: processHandle.process.pid,
        startedAt: processHandle.startedAt,
      };
    }

    return { status: "idle", projectId };
  }

  /**
   * Get status of all tracked runners
   */
  getAllStatus(): RunnerState[] {
    const states: RunnerState[] = [];

    for (const [projectId] of this.processes) {
      states.push(this.getStatus(projectId));
    }

    return states;
  }

  /**
   * Enable or disable auto-restart for a project
   */
  setAutoRestart(projectId: number, enabled: boolean): void {
    this.autoRestartEnabled.set(projectId, enabled);
    console.log(
      `[ClaudeLoop] Auto-restart ${enabled ? "enabled" : "disabled"} for project ${projectId}`,
    );
  }

  /**
   * Check if auto-restart is enabled for a project
   */
  isAutoRestartEnabled(projectId: number): boolean {
    return this.autoRestartEnabled.get(projectId) ?? false;
  }

  /**
   * Get buffered logs for a project
   */
  getBufferedLogs(projectId: number): LogEntry[] {
    return this.logBuffers.get(projectId) || [];
  }

  /**
   * Generate a prompt for Claude based on the project and story
   *
   * Reads the prompt from stories/prompt.md if it exists,
   * otherwise uses the default template from promptTemplate.ts
   */
  private async generatePrompt(
    projectPath: string,
    storyId?: string,
  ): Promise<string> {
    // Get the effective prompt (project-specific or default)
    const { content: basePrompt } = await getEffectivePrompt(projectPath);

    // If a specific story is requested, prepend that instruction
    if (storyId) {
      return `Focus on story: ${storyId}\n\n${basePrompt}`;
    }

    return basePrompt;
  }

  /**
   * Handle incoming log data
   */
  private handleLogData(
    projectId: number,
    storyId: string | undefined,
    data: string,
    logType: "stdout" | "stderr",
  ): void {
    const lines = data.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      // Log to server console for visibility
      const prefix = logType === "stderr" ? "[Claude ERR]" : "[Claude]";
      console.log(`${prefix} [P${projectId}]`, line);

      const entry: LogEntry = {
        projectId,
        storyId,
        content: line,
        logType,
        timestamp: new Date(),
      };

      // Add to buffer
      this.addToBuffer(projectId, entry);

      // Broadcast to WebSocket
      this.broadcastLog(entry);

      // Persist to database (async)
      this.persistLog(entry).catch((error) => {
        console.error(`[ClaudeLoop] Failed to persist log:`, error);
      });
    }
  }

  /**
   * Add log entry to buffer
   */
  private addToBuffer(projectId: number, entry: LogEntry): void {
    let buffer = this.logBuffers.get(projectId);
    if (!buffer) {
      buffer = [];
      this.logBuffers.set(projectId, buffer);
    }

    buffer.push(entry);

    if (buffer.length > LOG_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  /**
   * Broadcast log to WebSocket subscribers
   */
  private broadcastLog(entry: LogEntry): void {
    const wsServer = getWebSocketServer();
    if (!wsServer) return;

    wsServer.broadcastLog(
      String(entry.projectId),
      entry.storyId,
      entry.content,
      entry.logType,
    );
  }

  /**
   * Persist log to database
   */
  private async persistLog(entry: LogEntry): Promise<void> {
    await db.insert(runnerLogs).values({
      projectId: entry.projectId,
      storyId: entry.storyId,
      logContent: entry.content,
      logType: entry.logType,
      timestamp: entry.timestamp,
    });
  }

  /**
   * Handle process exit
   */
  private async handleProcessExit(
    projectId: number,
    storyId: string | undefined,
    exitCode: number,
    projectPath: string,
  ): Promise<void> {
    const success = exitCode === 0;
    let completedStoryStatus: StoryStatus | undefined;
    let nextStoryId: string | undefined;

    // Read prd.json to check story status
    try {
      const prdData = await this.readPrdJson(projectPath);

      // Find completed story status
      if (storyId) {
        const completedStory = prdData.userStories.find(
          (s) => s.id === storyId,
        );
        completedStoryStatus = completedStory?.status;
      }

      // Find next pending story for auto-restart
      if (this.isAutoRestartEnabled(projectId)) {
        nextStoryId = this.findNextPendingStory(prdData.userStories);
      }
    } catch (error) {
      console.error(`[ClaudeLoop] Failed to read prd.json:`, error);
    }

    const willAutoRestart =
      this.isAutoRestartEnabled(projectId) && !!nextStoryId;

    // Broadcast completion
    this.broadcastCompletion(
      projectId,
      storyId,
      exitCode,
      success,
      completedStoryStatus,
      nextStoryId,
      willAutoRestart,
    );

    // Trigger auto-restart if enabled
    if (willAutoRestart && nextStoryId) {
      console.log(
        `[ClaudeLoop] Auto-restarting for project ${projectId} with story ${nextStoryId}`,
      );

      setTimeout(async () => {
        try {
          await this.start(projectId, projectPath, nextStoryId);
        } catch (error) {
          console.error(`[ClaudeLoop] Failed to auto-restart:`, error);
          this.broadcastStatus(projectId, "idle");
        }
      }, 1000);
    } else {
      this.broadcastStatus(projectId, "idle");
    }
  }

  /**
   * Read and parse prd.json
   */
  private async readPrdJson(projectPath: string): Promise<PrdJson> {
    const prdPath = path.join(projectPath, "stories", "prd.json");
    const content = await readFile(prdPath, "utf-8");
    return JSON.parse(content) as PrdJson;
  }

  /**
   * Find next pending story with met dependencies
   */
  private findNextPendingStory(stories: PrdStory[]): string | undefined {
    const eligibleStories = stories
      .filter((s) => s.status === "pending" || s.status === "failed")
      .sort((a, b) => a.priority - b.priority);

    const doneStoryIds = new Set(
      stories.filter((s) => s.status === "done").map((s) => s.id),
    );

    for (const story of eligibleStories) {
      const dependenciesMet = story.dependencies.every((depId) =>
        doneStoryIds.has(depId),
      );
      if (dependenciesMet) {
        return story.id;
      }
    }

    return undefined;
  }

  /**
   * Broadcast status change via WebSocket
   */
  private broadcastStatus(
    projectId: number,
    status: "idle" | "running" | "stopping",
    storyId?: string,
    pid?: number,
  ): void {
    const wsServer = getWebSocketServer();
    if (!wsServer) return;

    wsServer.broadcastToProject(String(projectId), {
      type: "runner_status",
      payload: {
        projectId: String(projectId),
        status,
        storyId,
        pid,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast completion event via WebSocket
   */
  private broadcastCompletion(
    projectId: number,
    storyId: string | undefined,
    exitCode: number,
    success: boolean,
    completedStoryStatus: StoryStatus | undefined,
    nextStoryId: string | undefined,
    willAutoRestart: boolean,
  ): void {
    const wsServer = getWebSocketServer();
    if (!wsServer) return;

    wsServer.broadcastToProject(String(projectId), {
      type: "runner_completed",
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
    });
  }

  /**
   * Stop all active processes (for cleanup)
   */
  async stopAll(): Promise<void> {
    for (const [projectId] of this.processes) {
      await this.stop(projectId, true);
    }
    this.autoRestartEnabled.clear();
    this.logBuffers.clear();
  }
}

// Export singleton instance
export const claudeLoopService = new ClaudeLoopService();

// Export class for testing
export { ClaudeLoopService };

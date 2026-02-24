/**
 * Gemini Loop Service
 *
 * Manages Gemini CLI processes for running stories.
 * Uses direct CLI invocation instead of Docker containers.
 *
 * Authentication via GEMINI_API_KEY environment variable.
 * See docs/gemini-cli-research.md for details.
 */
import { spawn, exec, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { runnerLogs } from "@/db/schema";
import { getWebSocketServer } from "@/lib/websocket/server";
import { getEffectivePrompt } from "@/lib/services/promptTemplate";
import { DEFAULT_GEMINI_PERMISSIONS } from "@/lib/services/geminiPermissions";

const execAsync = promisify(exec);

/**
 * Runner status enum
 */
export type RunnerStatus = "idle" | "running" | "stopping";

/**
 * Story status from prd.json
 */
export type StoryStatus = "pending" | "in_progress" | "done" | "failed" | "review";

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
interface GeminiProcess {
  projectId: number;
  process: ChildProcess;
  storyId?: string;
  startedAt: Date;
  projectPath: string;
}

/**
 * Gemini stream-json event types
 */
interface GeminiStreamEvent {
  type: "init" | "message" | "tool_use" | "tool_result" | "result";
  timestamp: string;
  role?: "user" | "assistant";
  content?: string;
  delta?: boolean;
  tool_name?: string;
  tool_id?: string;
  parameters?: Record<string, unknown>;
  status?: "success" | "error";
  output?: string;
  error?: {
    type: string;
    message: string;
    code?: string;
  };
  stats?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cached?: number;
    duration_ms: number;
    tool_calls: number;
  };
}

/**
 * GeminiLoopService class
 *
 * Singleton that tracks running Gemini CLI processes.
 * Spawns Gemini CLI directly without Docker.
 */
class GeminiLoopService {
  private processes: Map<number, GeminiProcess> = new Map();
  private stoppingProcesses: Set<number> = new Set();
  private stopRequestedProcesses: Set<number> = new Set();
  private projectPaths: Map<number, string> = new Map();
  private autoRestartEnabled: Map<number, boolean> = new Map();
  private logBuffers: Map<number, LogEntry[]> = new Map();

  /**
   * Check if Gemini CLI is available
   */
  async isGeminiAvailable(): Promise<boolean> {
    try {
      await execAsync("gemini --version");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if user has API key configured
   */
  async isGeminiConfigured(): Promise<boolean> {
    // Check for API key in environment
    if (
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_AI_STUDIO_KEY?.trim()
    ) {
      return true;
    }

    // Gemini CLI also supports OAuth login, but for headless mode we need API key
    return false;
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

    // Check if Gemini CLI is available
    if (!(await this.isGeminiAvailable())) {
      throw new Error(
        "Gemini CLI is not installed. Install with: npm install -g @google/gemini-cli",
      );
    }

    // Check if configured
    if (!(await this.isGeminiConfigured())) {
      throw new Error(
        "Gemini API key not configured. Set GEMINI_API_KEY or GOOGLE_AI_STUDIO_KEY environment variable",
      );
    }

    // Store project path for auto-restart
    this.projectPaths.set(projectId, projectPath);

    // Initialize log buffer
    if (!this.logBuffers.has(projectId)) {
      this.logBuffers.set(projectId, []);
    }

    // Generate the prompt for Gemini
    const prompt = await this.generatePrompt(projectPath, storyId);

    // Build CLI arguments
    const args = this.buildCliArgs(prompt);

    // Spawn Gemini CLI process
    const geminiProcess = spawn("gemini", args, {
      cwd: projectPath,
      env: {
        ...process.env,
        // Ensure API key is available
        GEMINI_API_KEY:
          process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_KEY,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const processHandle: GeminiProcess = {
      projectId,
      process: geminiProcess,
      storyId,
      startedAt: new Date(),
      projectPath,
    };

    this.processes.set(projectId, processHandle);

    console.log(`[GeminiLoop] ========================================`);
    console.log(`[GeminiLoop] Starting Gemini CLI`);
    console.log(`[GeminiLoop] Project ID: ${projectId}`);
    console.log(`[GeminiLoop] Story: ${storyId || "auto-pick"}`);
    console.log(`[GeminiLoop] Path: ${projectPath}`);
    console.log(`[GeminiLoop] PID: ${geminiProcess.pid}`);
    console.log(`[GeminiLoop] Prompt length: ${prompt.length} chars`);
    console.log(`[GeminiLoop] ========================================`);

    // Buffer for accumulating partial JSON lines
    let stdoutBuffer = "";
    let stderrBuffer = "";

    // Handle stdout - parse stream-json output
    geminiProcess.stdout?.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");

      // Process complete lines, keep incomplete line in buffer
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          this.handleStreamJsonLine(projectId, storyId, line);
        }
      }
      stdoutBuffer = lines[lines.length - 1];
    });

    // Handle stderr
    geminiProcess.stderr?.on("data", (data: Buffer) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          this.handleLogData(projectId, storyId, line, "stderr");
        }
      }
      stderrBuffer = lines[lines.length - 1];
    });

    // Handle process exit
    geminiProcess.on("close", async (exitCode) => {
      // Process remaining buffer
      if (stdoutBuffer.trim()) {
        this.handleStreamJsonLine(projectId, storyId, stdoutBuffer.trim());
      }
      if (stderrBuffer.trim()) {
        this.handleLogData(projectId, storyId, stderrBuffer.trim(), "stderr");
      }

      console.log(`[GeminiLoop] ========================================`);
      console.log(`[GeminiLoop] Gemini CLI exited`);
      console.log(`[GeminiLoop] Project ID: ${projectId}`);
      console.log(`[GeminiLoop] Exit code: ${exitCode}`);
      console.log(`[GeminiLoop] ========================================`);
      this.processes.delete(projectId);

      // Manual stop should never trigger completion handling or auto-restart.
      if (this.stopRequestedProcesses.has(projectId)) {
        this.stopRequestedProcesses.delete(projectId);
        this.stoppingProcesses.delete(projectId);
        this.broadcastStatus(projectId, "idle");
        return;
      }

      // Handle completion
      await this.handleProcessExit(
        projectId,
        storyId,
        exitCode ?? 0,
        projectPath,
      );
    });

    // Handle errors
    geminiProcess.on("error", (error) => {
      console.error(`[GeminiLoop] Error for project ${projectId}:`, error);
      this.processes.delete(projectId);
      this.stopRequestedProcesses.delete(projectId);
      this.stoppingProcesses.delete(projectId);
      this.broadcastStatus(projectId, "idle");
    });

    // Broadcast running status
    this.broadcastStatus(projectId, "running", storyId, geminiProcess.pid);

    return {
      status: "running",
      projectId,
      storyId,
      pid: geminiProcess.pid,
      startedAt: new Date(),
    };
  }

  /**
   * Build CLI arguments for Gemini
   */
  private buildCliArgs(prompt: string): string[] {
    const args = [
      "-p",
      prompt, // Non-interactive prompt mode
      "--output-format",
      "stream-json", // JSONL output for parsing
      "--yolo", // Auto-approve all tool executions
    ];

    // Add allowed tools if configured
    const allowedTools = DEFAULT_GEMINI_PERMISSIONS.tools.allow;
    if (allowedTools.length > 0) {
      args.push("--allowed-tools", allowedTools.join(","));
    }

    return args;
  }

  /**
   * Handle a line of stream-json output from Gemini
   */
  private handleStreamJsonLine(
    projectId: number,
    storyId: string | undefined,
    line: string,
  ): void {
    try {
      const event = JSON.parse(line) as GeminiStreamEvent;

      switch (event.type) {
        case "message":
          if (event.role === "assistant" && event.content) {
            this.handleLogData(projectId, storyId, event.content, "stdout");
          }
          break;

        case "tool_use":
          if (event.tool_name) {
            const toolInfo = `[Tool: ${event.tool_name}]`;
            this.handleLogData(projectId, storyId, toolInfo, "stdout");
          }
          break;

        case "tool_result":
          if (event.status === "error" && event.error) {
            this.handleLogData(
              projectId,
              storyId,
              `[Tool Error: ${event.error.message}]`,
              "stderr",
            );
          }
          break;

        case "result":
          if (event.stats) {
            const statsInfo = `[Stats: ${event.stats.total_tokens} tokens, ${event.stats.duration_ms}ms, ${event.stats.tool_calls} tool calls]`;
            this.handleLogData(projectId, storyId, statsInfo, "stdout");
          }
          if (event.status === "error" && event.error) {
            this.handleLogData(
              projectId,
              storyId,
              `[Error: ${event.error.message}]`,
              "stderr",
            );
          }
          break;

        case "init":
          // Session started - log for debugging
          console.log(`[GeminiLoop] Session initialized for project ${projectId}`);
          break;
      }
    } catch {
      // Non-JSON output - treat as regular log
      if (line) {
        this.handleLogData(projectId, storyId, line, "stdout");
      }
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
    const processHandle = this.processes.get(projectId);
    if (!processHandle) {
      return { status: "idle", projectId };
    }

    this.stoppingProcesses.add(projectId);
    this.stopRequestedProcesses.add(projectId);
    this.broadcastStatus(
      projectId,
      "stopping",
      processHandle.storyId,
      processHandle.process.pid,
    );

    try {
      let closed = false;

      // Kill the process
      if (force) {
        processHandle.process.kill("SIGKILL");
        closed = await this.waitForProcessClose(processHandle.process, 5000);
      } else {
        processHandle.process.kill("SIGTERM");

        // Wait for graceful shutdown, then force kill
        const closedGracefully = await this.waitForProcessClose(
          processHandle.process,
          10000,
        );
        if (!closedGracefully) {
          processHandle.process.kill("SIGKILL");
          closed = await this.waitForProcessClose(processHandle.process, 5000);
        } else {
          closed = true;
        }
      }

      if (!closed) {
        throw new Error(
          `Failed to stop runner process for project ${projectId}: process did not exit`,
        );
      }

      this.processes.delete(projectId);

      return { status: "idle", projectId };
    } finally {
      this.stoppingProcesses.delete(projectId);
    }
  }

  /**
   * Wait until a process emits close, or timeout elapses.
   */
  private waitForProcessClose(
    process: ChildProcess,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);

      process.once("close", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(true);
      });
    });
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
      `[GeminiLoop] Auto-restart ${enabled ? "enabled" : "disabled"} for project ${projectId}`,
    );
  }

  /**
   * Check if auto-restart is enabled for a project
   * Default is TRUE - auto-restart is on unless explicitly disabled
   */
  isAutoRestartEnabled(projectId: number): boolean {
    return this.autoRestartEnabled.get(projectId) ?? true;
  }

  /**
   * Get buffered logs for a project
   */
  getBufferedLogs(projectId: number): LogEntry[] {
    return this.logBuffers.get(projectId) || [];
  }

  /**
   * Generate a prompt for Gemini based on the project and story
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
      const prefix = logType === "stderr" ? "[Gemini ERR]" : "[Gemini]";
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
        console.error(`[GeminiLoop] Failed to persist log:`, error);
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
      console.error(`[GeminiLoop] Failed to read prd.json:`, error);
    }

    const willAutoRestart =
      this.isAutoRestartEnabled(projectId) && !!nextStoryId;
    const isSameStoryRestart = !!storyId && nextStoryId === storyId;

    if (willAutoRestart && isSameStoryRestart) {
      console.warn(
        `[GeminiLoop] Prevented restart loop for project ${projectId} on story ${storyId}`,
      );
      nextStoryId = undefined;
    }

    const finalWillAutoRestart =
      this.isAutoRestartEnabled(projectId) && !!nextStoryId;

    // Broadcast completion
    this.broadcastCompletion(
      projectId,
      storyId,
      exitCode,
      success,
      completedStoryStatus,
      nextStoryId,
      finalWillAutoRestart,
    );

    // Trigger auto-restart if enabled
    if (finalWillAutoRestart && nextStoryId) {
      console.log(
        `[GeminiLoop] Auto-restarting for project ${projectId} with story ${nextStoryId}`,
      );

      setTimeout(async () => {
        try {
          await this.start(projectId, projectPath, nextStoryId);
        } catch (error) {
          console.error(`[GeminiLoop] Failed to auto-restart:`, error);
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

    // Both 'done' and 'review' are considered completed states for dependency checking
    const completedStoryIds = new Set(
      stories.filter((s) => s.status === "done" || s.status === "review").map((s) => s.id),
    );

    for (const story of eligibleStories) {
      const dependenciesMet = story.dependencies.every((depId) =>
        completedStoryIds.has(depId),
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

    // Broadcast story_review event when story status is 'review'
    if (storyId && completedStoryStatus === "review") {
      this.broadcastStoryReview(projectId, storyId);
    }
  }

  /**
   * Broadcast story review event via WebSocket
   * Triggered when a story transitions to review status
   */
  private broadcastStoryReview(projectId: number, storyId: string): void {
    const wsServer = getWebSocketServer();
    if (!wsServer) return;

    wsServer.broadcastToProject(String(projectId), {
      type: "story_review",
      payload: {
        projectId: String(projectId),
        storyId,
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
    this.stopRequestedProcesses.clear();
    this.logBuffers.clear();
  }
}

// Export singleton instance
export const geminiLoopService = new GeminiLoopService();

// Export class for testing
export { GeminiLoopService };

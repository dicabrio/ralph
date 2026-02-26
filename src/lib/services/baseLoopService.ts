/**
 * Base Loop Service
 *
 * Abstract base class for all loop services (Claude, Gemini, Codex, Ollama).
 * Contains shared logic for process management, log buffering, WebSocket broadcasting,
 * prd.json parsing, story selection, and auto-restart functionality.
 *
 * Subclasses only need to implement provider-specific methods:
 * - providerName: string getter
 * - isAvailable(): Promise<boolean>
 * - isConfigured(): Promise<boolean>
 * - buildSpawnConfig(prompt): SpawnConfig
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { runnerLogs } from "@/db/schema";
import { getWebSocketServer } from "@/lib/websocket/server";
import { getEffectivePrompt } from "@/lib/services/promptTemplate";
import {
  selectNextStory,
  generateStoryPrompt,
  getNoEligibleStoryReason,
  readPrdJson,
} from "@/lib/services/storySelector";
import { generateTestScenarios } from "@/lib/services/testScenarioGenerator";
import type {
  ILoopService,
  RunnerState,
  LogEntry,
  PrdStory,
  PrdJson,
  StoryStatus,
  SpawnConfig,
} from "./loopService.interface";

/**
 * Log buffer size
 */
const LOG_BUFFER_SIZE = 100;

/**
 * Active process handle
 */
export interface ProcessHandle {
  projectId: number;
  process: ChildProcess;
  storyId?: string;
  startedAt: Date;
  projectPath: string;
}

/**
 * BaseLoopService abstract class
 *
 * Provides common functionality for all loop service implementations.
 * Subclasses extend this and implement abstract methods for provider-specific behavior.
 */
export abstract class BaseLoopService implements ILoopService {
  protected processes: Map<number, ProcessHandle> = new Map();
  protected stoppingProcesses: Set<number> = new Set();
  protected stopRequestedProcesses: Set<number> = new Set();
  protected projectPaths: Map<number, string> = new Map();
  protected autoRestartEnabled: Map<number, boolean> = new Map();
  protected logBuffers: Map<number, LogEntry[]> = new Map();

  /**
   * Provider name for logging and identification
   */
  abstract get providerName(): string;

  /**
   * Check if the CLI is available on the system
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Check if the provider is configured (API key, login, etc.)
   */
  abstract isConfigured(): Promise<boolean>;

  /**
   * Build spawn configuration for the CLI process
   *
   * @param prompt - The prompt to send to the CLI
   * @returns SpawnConfig with command, args, env, and stdin configuration
   */
  abstract buildSpawnConfig(prompt: string): SpawnConfig;

  /**
   * Log prefix for console output
   */
  protected get logPrefix(): string {
    return `[${this.providerName}Loop]`;
  }

  /**
   * Start a runner for a project
   */
  async start(
    projectId: number,
    projectPath: string,
    storyId?: string,
  ): Promise<RunnerState> {
    // Check if already running
    const existing = this.processes.get(projectId);
    if (existing) {
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

    // Check if CLI is available
    if (!(await this.isAvailable())) {
      throw new Error(this.getNotAvailableError());
    }

    // Check if configured
    if (!(await this.isConfigured())) {
      throw new Error(this.getNotConfiguredError());
    }

    // Store project path for auto-restart
    this.projectPaths.set(projectId, projectPath);

    // Initialize log buffer
    if (!this.logBuffers.has(projectId)) {
      this.logBuffers.set(projectId, []);
    }

    // Pre-select the story before spawning the LLM
    let selectedStoryId = storyId;
    let prompt: string;

    if (storyId) {
      // Specific story requested - generate prompt with that story
      prompt = await this.generatePrompt(projectPath, storyId);
    } else {
      // Auto-select the next eligible story
      const selection = await selectNextStory(projectPath);

      if (!selection) {
        // No eligible stories - get detailed reason
        const prd = await readPrdJson(projectPath);
        const reason = prd
          ? getNoEligibleStoryReason(prd.userStories)
          : "No prd.json found";
        throw new Error(`No eligible stories: ${reason}`);
      }

      selectedStoryId = selection.story.id;

      // Generate prompt with inline story context
      const { content: basePrompt } = await getEffectivePrompt(projectPath);
      prompt = generateStoryPrompt(selection, basePrompt);

      // Broadcast the selected story via WebSocket
      this.broadcastStorySelected(
        projectId,
        selection.story.id,
        selection.story.title,
      );
    }

    // Build spawn configuration
    const spawnConfig = this.buildSpawnConfig(prompt);

    // Spawn CLI process
    const cliProcess = spawn(spawnConfig.command, spawnConfig.args, {
      cwd: projectPath,
      env: spawnConfig.env ?? { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const processHandle: ProcessHandle = {
      projectId,
      process: cliProcess,
      storyId: selectedStoryId,
      startedAt: new Date(),
      projectPath,
    };

    this.processes.set(projectId, processHandle);

    console.log(`${this.logPrefix} ========================================`);
    console.log(`${this.logPrefix} Starting ${this.providerName} CLI`);
    console.log(`${this.logPrefix} Project ID: ${projectId}`);
    console.log(`${this.logPrefix} Story: ${selectedStoryId || "none"}`);
    console.log(`${this.logPrefix} Path: ${projectPath}`);
    console.log(`${this.logPrefix} PID: ${cliProcess.pid}`);
    console.log(`${this.logPrefix} Prompt length: ${prompt.length} chars`);
    console.log(`${this.logPrefix} ========================================`);

    // Pipe prompt to stdin if configured
    if (spawnConfig.useStdin && spawnConfig.stdinContent) {
      cliProcess.stdin?.write(spawnConfig.stdinContent);
      cliProcess.stdin?.end();
    }

    // Set up output handling
    this.setupOutputHandlers(cliProcess, projectId, selectedStoryId);

    // Handle process exit
    cliProcess.on("close", async (exitCode) => {
      console.log(`${this.logPrefix} ========================================`);
      console.log(`${this.logPrefix} ${this.providerName} CLI exited`);
      console.log(`${this.logPrefix} Project ID: ${projectId}`);
      console.log(`${this.logPrefix} Exit code: ${exitCode}`);
      console.log(`${this.logPrefix} ========================================`);
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
        selectedStoryId,
        exitCode ?? 0,
        projectPath,
      );
    });

    // Handle errors
    cliProcess.on("error", (error) => {
      console.error(
        `${this.logPrefix} Error for project ${projectId}:`,
        error,
      );
      this.processes.delete(projectId);
      this.stopRequestedProcesses.delete(projectId);
      this.stoppingProcesses.delete(projectId);
      this.broadcastStatus(projectId, "idle");
    });

    // Broadcast running status
    this.broadcastStatus(projectId, "running", selectedStoryId, cliProcess.pid);

    return {
      status: "running",
      projectId,
      storyId: selectedStoryId,
      pid: cliProcess.pid,
      startedAt: new Date(),
    };
  }

  /**
   * Set up stdout and stderr handlers for the process
   * Can be overridden by subclasses for custom output parsing (e.g., Gemini stream-json)
   */
  protected setupOutputHandlers(
    process: ChildProcess,
    projectId: number,
    storyId: string | undefined,
  ): void {
    // Handle stdout
    process.stdout?.on("data", (data: Buffer) => {
      this.handleLogData(projectId, storyId, data.toString(), "stdout");
    });

    // Handle stderr
    process.stderr?.on("data", (data: Buffer) => {
      this.handleLogData(projectId, storyId, data.toString(), "stderr");
    });
  }

  /**
   * Stop a running runner
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
   * Get the status of a runner
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
      `${this.logPrefix} Auto-restart ${enabled ? "enabled" : "disabled"} for project ${projectId}`,
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

  /**
   * Error message when CLI is not available
   */
  protected getNotAvailableError(): string {
    return `${this.providerName} CLI is not installed`;
  }

  /**
   * Error message when CLI is not configured
   */
  protected getNotConfiguredError(): string {
    return `${this.providerName} is not configured`;
  }

  /**
   * Wait until a process emits close, or timeout elapses.
   */
  protected waitForProcessClose(
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
   * Generate a prompt based on the project and story
   */
  protected async generatePrompt(
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
  protected handleLogData(
    projectId: number,
    storyId: string | undefined,
    data: string,
    logType: "stdout" | "stderr",
  ): void {
    const lines = data.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      // Log to server console for visibility
      const prefix =
        logType === "stderr"
          ? `[${this.providerName} ERR]`
          : `[${this.providerName}]`;
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
        console.error(`${this.logPrefix} Failed to persist log:`, error);
      });
    }
  }

  /**
   * Add log entry to buffer
   */
  protected addToBuffer(projectId: number, entry: LogEntry): void {
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
  protected broadcastLog(entry: LogEntry): void {
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
  protected async persistLog(entry: LogEntry): Promise<void> {
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
  protected async handleProcessExit(
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

        // Generate test scenarios when story transitions to review
        if (completedStory && completedStoryStatus === "review") {
          // Trigger async generation without blocking
          this.triggerTestScenarioGeneration(completedStory, projectPath);
        }
      }

      // Find next pending story for auto-restart
      if (this.isAutoRestartEnabled(projectId)) {
        nextStoryId = this.findNextPendingStory(prdData.userStories);
      }
    } catch (error) {
      console.error(`${this.logPrefix} Failed to read prd.json:`, error);
    }

    const willAutoRestart =
      this.isAutoRestartEnabled(projectId) && !!nextStoryId;
    const isSameStoryRestart = !!storyId && nextStoryId === storyId;

    if (willAutoRestart && isSameStoryRestart) {
      console.warn(
        `${this.logPrefix} Prevented restart loop for project ${projectId} on story ${storyId}`,
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
        `${this.logPrefix} Auto-restarting for project ${projectId} with story ${nextStoryId}`,
      );

      setTimeout(async () => {
        try {
          const projectPathFromCache = this.projectPaths.get(projectId);
          if (projectPathFromCache) {
            await this.start(projectId, projectPathFromCache, nextStoryId);
          }
        } catch (error) {
          console.error(`${this.logPrefix} Failed to auto-restart:`, error);
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
  protected async readPrdJson(projectPath: string): Promise<PrdJson> {
    const prdPath = path.join(projectPath, "stories", "prd.json");
    const content = await readFile(prdPath, "utf-8");
    return JSON.parse(content) as PrdJson;
  }

  /**
   * Find next pending story with met dependencies
   */
  protected findNextPendingStory(stories: PrdStory[]): string | undefined {
    const eligibleStories = stories
      .filter((s) => s.status === "pending" || s.status === "failed")
      .sort((a, b) => a.priority - b.priority);

    // Both 'done' and 'review' are considered completed states for dependency checking
    const completedStoryIds = new Set(
      stories
        .filter((s) => s.status === "done" || s.status === "review")
        .map((s) => s.id),
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
  protected broadcastStatus(
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
  protected broadcastCompletion(
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

    // Filter out 'backlog' status as it's not a valid completed state
    const validCompletedStatus =
      completedStoryStatus && completedStoryStatus !== "backlog"
        ? (completedStoryStatus as
            | "done"
            | "failed"
            | "pending"
            | "in_progress"
            | "review")
        : undefined;

    wsServer.broadcastToProject(String(projectId), {
      type: "runner_completed",
      payload: {
        projectId: String(projectId),
        storyId,
        exitCode,
        success,
        completedStoryStatus: validCompletedStatus,
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
  protected broadcastStoryReview(projectId: number, storyId: string): void {
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
   * Trigger async test scenario generation for a story
   * Runs in background without blocking the main flow
   */
  protected triggerTestScenarioGeneration(
    story: PrdStory,
    projectPath: string,
  ): void {
    // Use setTimeout to avoid blocking the main flow
    setTimeout(async () => {
      try {
        console.log(
          `${this.logPrefix} Generating test scenarios for ${story.id}`,
        );
        await generateTestScenarios(story, projectPath);
        console.log(
          `${this.logPrefix} Test scenarios generated for ${story.id}`,
        );
      } catch (error) {
        // Log error but don't fail - test scenario generation is not critical
        console.error(
          `${this.logPrefix} Failed to generate test scenarios for ${story.id}:`,
          error,
        );
      }
    }, 100);
  }

  /**
   * Broadcast story selected event via WebSocket
   * Triggered when a story is pre-selected before spawning the LLM
   */
  protected broadcastStorySelected(
    projectId: number,
    storyId: string,
    storyTitle: string,
  ): void {
    const wsServer = getWebSocketServer();
    if (!wsServer) return;

    wsServer.broadcastToProject(String(projectId), {
      type: "story_selected",
      payload: {
        projectId: String(projectId),
        storyId,
        storyTitle,
      },
      timestamp: Date.now(),
    });

    console.log(`${this.logPrefix} Pre-selected story: ${storyId} - ${storyTitle}`);
  }
}

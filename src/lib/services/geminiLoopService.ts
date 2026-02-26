/**
 * Gemini Loop Service
 *
 * Manages Gemini CLI processes for running stories.
 * Uses direct CLI invocation instead of Docker containers.
 *
 * Authentication via GEMINI_API_KEY environment variable.
 * See docs/gemini-cli-research.md for details.
 *
 * Extends BaseLoopService for shared functionality.
 * Overrides parseOutput for stream-json output format.
 */
import { exec, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { BaseLoopService } from "./baseLoopService";
import type { SpawnConfig } from "./loopService.interface";
import { DEFAULT_GEMINI_PERMISSIONS } from "./geminiPermissions";

const execAsync = promisify(exec);

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
 * Extends BaseLoopService for shared process management.
 * Uses custom output parsing for stream-json format.
 */
class GeminiLoopService extends BaseLoopService {
  /**
   * Provider name for logging and identification
   */
  get providerName(): string {
    return "gemini";
  }

  /**
   * Check if Gemini CLI is available
   */
  async isAvailable(): Promise<boolean> {
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
  async isConfigured(): Promise<boolean> {
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
   * Build spawn configuration for Gemini CLI
   */
  buildSpawnConfig(prompt: string): SpawnConfig {
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

    return {
      command: "gemini",
      args,
      env: {
        ...process.env,
        // Ensure API key is available
        GEMINI_API_KEY:
          process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_KEY,
      },
      useStdin: false,
    };
  }

  /**
   * Override setupOutputHandlers for stream-json parsing
   * Gemini outputs JSONL format that needs special parsing
   */
  protected setupOutputHandlers(
    process: ChildProcess,
    projectId: number,
    storyId: string | undefined,
  ): void {
    // Buffer for accumulating partial JSON lines
    let stdoutBuffer = "";
    let stderrBuffer = "";

    // Handle stdout - parse stream-json output
    process.stdout?.on("data", (data: Buffer) => {
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
    process.stderr?.on("data", (data: Buffer) => {
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

    // Handle process close to flush remaining buffers
    process.on("close", () => {
      if (stdoutBuffer.trim()) {
        this.handleStreamJsonLine(projectId, storyId, stdoutBuffer.trim());
      }
      if (stderrBuffer.trim()) {
        this.handleLogData(projectId, storyId, stderrBuffer.trim(), "stderr");
      }
    });
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
          console.log(
            `${this.logPrefix} Session initialized for project ${projectId}`,
          );
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
   * Custom error message when CLI is not available
   */
  protected getNotAvailableError(): string {
    return "Gemini CLI is not installed. Install with: npm install -g @google/gemini-cli";
  }

  /**
   * Custom error message when not configured
   */
  protected getNotConfiguredError(): string {
    return "Gemini API key not configured. Set GEMINI_API_KEY or GOOGLE_AI_STUDIO_KEY environment variable";
  }
}

// Export singleton instance
export const geminiLoopService = new GeminiLoopService();

// Export class for testing
export { GeminiLoopService };

// Re-export types from interface for backwards compatibility
export type {
  RunnerStatus,
  StoryStatus,
  PrdStory,
  PrdJson,
  RunnerState,
  LogEntry,
} from "./loopService.interface";

/**
 * Claude Loop Service
 *
 * Manages Claude Code CLI processes for running stories.
 * Uses direct CLI invocation instead of Docker containers.
 *
 * Authentication via `claude login` (Claude Pro/Max subscription).
 * No API key required.
 *
 * Extends BaseLoopService for shared functionality.
 */
import { exec, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import { BaseLoopService } from "./baseLoopService";
import type { SpawnConfig } from "./loopService.interface";
import { DEFAULT_CLAUDE_PERMISSIONS } from "./claudePermissions";

const execAsync = promisify(exec);
const CLAUDE_PERMISSION_MODE = "dontAsk";
const CLAUDE_ALLOWED_TOOLS =
  DEFAULT_CLAUDE_PERMISSIONS.permissions.allow.join(",");
const CLAUDE_DISALLOWED_TOOLS =
  DEFAULT_CLAUDE_PERMISSIONS.permissions.deny.join(",");

/**
 * ClaudeLoopService class
 *
 * Singleton that tracks running Claude CLI processes.
 * Spawns Claude Code CLI directly without Docker.
 * Extends BaseLoopService for shared process management.
 */
class ClaudeLoopService extends BaseLoopService {
  /**
   * Provider name for logging and identification
   */
  get providerName(): string {
    return "claude";
  }

  /**
   * Check if Claude CLI is available
   */
  async isAvailable(): Promise<boolean> {
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
  async isConfigured(): Promise<boolean> {
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
   * Build spawn configuration for Claude CLI
   */
  buildSpawnConfig(prompt: string): SpawnConfig {
    return {
      command: "claude",
      args: [
        "-p", // Read prompt from stdin
        "--permission-mode",
        CLAUDE_PERMISSION_MODE,
        "--allowedTools",
        CLAUDE_ALLOWED_TOOLS,
        "--disallowedTools",
        CLAUDE_DISALLOWED_TOOLS,
      ],
      env: { ...process.env },
      useStdin: true,
      stdinContent: prompt,
    };
  }

  /**
   * Override setupOutputHandlers to add permission denied detection
   */
  protected setupOutputHandlers(
    process: ChildProcess,
    projectId: number,
    storyId: string | undefined,
  ): void {
    // Handle stdout using base class method
    process.stdout?.on("data", (data: Buffer) => {
      this.handleLogData(projectId, storyId, data.toString(), "stdout");
    });

    // Handle stderr with permission denied detection
    process.stderr?.on("data", (data: Buffer) => {
      const content = data.toString();
      this.handleLogData(projectId, storyId, content, "stderr");

      // Log permission denied warnings
      if (
        /permission/i.test(content) &&
        /(denied|reject|not allowed|blocked)/i.test(content)
      ) {
        console.warn(
          `${this.logPrefix} Permission denied for project ${projectId}: ${content}`,
        );
      }
    });
  }

  /**
   * Custom error message when CLI is not available
   */
  protected getNotAvailableError(): string {
    return "Claude Code CLI is not installed. Install with: npm install -g @anthropic-ai/claude-code";
  }

  /**
   * Custom error message when not configured
   */
  protected getNotConfiguredError(): string {
    return "Not logged in to Claude. Run: claude login";
  }
}

// Export singleton instance
export const claudeLoopService = new ClaudeLoopService();

// Export class for testing
export { ClaudeLoopService };

// Re-export types from interface for backwards compatibility
export type {
  RunnerStatus,
  StoryStatus,
  PrdStory,
  PrdJson,
  RunnerState,
  LogEntry,
} from "./loopService.interface";

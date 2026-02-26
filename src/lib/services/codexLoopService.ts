/**
 * Codex Loop Service
 *
 * Manages Codex CLI processes for running stories.
 * Uses direct CLI invocation instead of Docker containers.
 *
 * Authentication via `codex login` or OPENAI_API_KEY.
 *
 * Extends BaseLoopService for shared functionality.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import { BaseLoopService } from "./baseLoopService";
import type { SpawnConfig } from "./loopService.interface";

const execAsync = promisify(exec);

/**
 * CodexLoopService class
 *
 * Singleton that tracks running Codex CLI processes.
 * Spawns Codex Code CLI directly without Docker.
 * Extends BaseLoopService for shared process management.
 */
class CodexLoopService extends BaseLoopService {
  /**
   * Provider name for logging and identification
   */
  get providerName(): string {
    return "codex";
  }

  /**
   * Check if Codex CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("codex --version");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if user is logged in to Codex
   */
  async isConfigured(): Promise<boolean> {
    try {
      if (process.env.OPENAI_API_KEY?.trim()) {
        return true;
      }

      // Check if ~/.codex/auth.json exists
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const configPath = path.join(homeDir, ".codex", "auth.json");
      if (existsSync(configPath)) {
        return true;
      }

      const { stdout } = await execAsync("codex login status");
      return stdout.toLowerCase().includes("logged in");
    } catch {
      return false;
    }
  }

  /**
   * Build spawn configuration for Codex CLI
   */
  buildSpawnConfig(prompt: string): SpawnConfig {
    return {
      command: "codex",
      args: [
        "exec",
        "--full-auto",
        "--skip-git-repo-check",
        "-", // Read prompt from stdin
      ],
      env: { ...process.env },
      useStdin: true,
      stdinContent: prompt,
    };
  }

  /**
   * Custom error message when CLI is not available
   */
  protected getNotAvailableError(): string {
    return "Codex CLI is not installed. Install with: npm install -g @openai/codex";
  }

  /**
   * Custom error message when not configured
   */
  protected getNotConfiguredError(): string {
    return "Not logged in to Codex. Run: codex login or set OPENAI_API_KEY";
  }
}

// Export singleton instance
export const codexLoopService = new CodexLoopService();

// Export class for testing
export { CodexLoopService };

// Re-export types from interface for backwards compatibility
export type {
  RunnerStatus,
  StoryStatus,
  PrdStory,
  PrdJson,
  RunnerState,
  LogEntry,
} from "./loopService.interface";

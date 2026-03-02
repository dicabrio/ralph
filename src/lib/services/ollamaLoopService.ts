/**
 * Ollama Loop Service
 *
 * Manages Ollama-powered runs using the Claude CLI with custom environment variables.
 * Ollama provides local LLM inference compatible with the OpenAI API format.
 *
 * Uses the Claude CLI configured to talk to Ollama via:
 * - ANTHROPIC_AUTH_TOKEN='ollama' (bypass auth)
 * - ANTHROPIC_API_KEY='' (empty)
 * - ANTHROPIC_BASE_URL pointing to Ollama server
 * - --model flag specifying the Ollama model
 *
 * Extends BaseLoopService for shared functionality.
 */
import { exec, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { BaseLoopService } from "./baseLoopService";
import type { SpawnConfig } from "./loopService.interface";
import { DEFAULT_CLAUDE_PERMISSIONS } from "./claudePermissions";
import { readRalphConfigSync } from "./ralphConfig";

const execAsync = promisify(exec);
const CLAUDE_PERMISSION_MODE = "dontAsk";
const CLAUDE_ALLOWED_TOOLS =
  DEFAULT_CLAUDE_PERMISSIONS.permissions.allow.join(",");
const CLAUDE_DISALLOWED_TOOLS =
  DEFAULT_CLAUDE_PERMISSIONS.permissions.deny.join(",");

/** Default Ollama base URL */
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/**
 * OllamaLoopService class
 *
 * Singleton that tracks running Ollama-powered CLI processes.
 * Uses Claude CLI with environment variables configured for Ollama backend.
 * Extends BaseLoopService for shared process management.
 */
class OllamaLoopService extends BaseLoopService {
  /** Temporary storage for project path during start() */
  private _currentProjectPath?: string;

  /**
   * Provider name for logging and identification
   */
  get providerName(): string {
    return "ollama";
  }

  /**
   * Check if Ollama is available by running 'ollama list'
   * This verifies both the CLI is installed and the server is running
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("ollama list");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ollama doesn't require any API key or login
   * Always returns true since authentication is not needed
   */
  async isConfigured(): Promise<boolean> {
    return true;
  }

  /**
   * Validates that a model is configured for Ollama
   * Returns error message if model is not specified, null if valid
   */
  validateModelConfig(projectPath: string): string | null {
    const config = readRalphConfigSync(projectPath);
    const model = config?.runner?.model;

    if (!model) {
      return "Model name is required in ralph.config.json for Ollama provider. Please configure runner.model in stories/ralph.config.json";
    }

    return null;
  }

  /**
   * Checks if a specific model is available in Ollama
   * Parses the 'ollama list' output to find the model
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync("ollama list");
      // ollama list outputs: NAME ID SIZE MODIFIED
      // Model names are in first column, may have :tag suffix
      const lines = stdout.split("\n").slice(1); // Skip header
      for (const line of lines) {
        const name = line.split(/\s+/)[0];
        if (name) {
          // Check exact match or match without :latest tag
          if (
            name === modelName ||
            name === `${modelName}:latest` ||
            name.split(":")[0] === modelName
          ) {
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Build spawn configuration for Claude CLI with Ollama backend
   * Uses project-specific configuration when available
   */
  buildSpawnConfig(prompt: string): SpawnConfig {
    console.log(`${this.logPrefix} buildSpawnConfig called`);
    console.log(`${this.logPrefix} _currentProjectPath: ${this._currentProjectPath}`);

    // Use project-specific config if available
    if (this._currentProjectPath) {
      const config = readRalphConfigSync(this._currentProjectPath);
      const model = config?.runner?.model;
      const baseUrl = config?.runner?.baseUrl || DEFAULT_OLLAMA_BASE_URL;

      console.log(`${this.logPrefix} Config loaded - model: ${model}, baseUrl: ${baseUrl}`);

      const args = [
        "-p",
        "--permission-mode",
        CLAUDE_PERMISSION_MODE,
        "--allowedTools",
        CLAUDE_ALLOWED_TOOLS,
        "--disallowedTools",
        CLAUDE_DISALLOWED_TOOLS,
      ];

      // Add model flag if specified
      if (model) {
        args.push("--model", model);
      }

      console.log(`${this.logPrefix} Spawn args: claude ${args.join(" ")}`);
      console.log(`${this.logPrefix} Prompt length: ${prompt.length} chars`);

      return {
        command: "claude",
        args,
        env: {
          ...process.env,
          ANTHROPIC_AUTH_TOKEN: "ollama",
          ANTHROPIC_API_KEY: "",
          ANTHROPIC_BASE_URL: baseUrl,
        },
        useStdin: true,
        stdinContent: prompt,
      };
    }

    // Fallback to basic config (shouldn't happen in normal flow)
    return {
      command: "claude",
      args: [
        "-p",
        "--permission-mode",
        CLAUDE_PERMISSION_MODE,
        "--allowedTools",
        CLAUDE_ALLOWED_TOOLS,
        "--disallowedTools",
        CLAUDE_DISALLOWED_TOOLS,
      ],
      env: {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: "ollama",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_BASE_URL: DEFAULT_OLLAMA_BASE_URL,
      },
      useStdin: true,
      stdinContent: prompt,
    };
  }

  /**
   * Override start to add model validation and use project-aware spawn config
   */
  async start(
    projectId: number,
    projectPath: string,
    storyId?: string,
  ) {
    // Validate model is configured
    const modelError = this.validateModelConfig(projectPath);
    if (modelError) {
      throw new Error(modelError);
    }

    // Check if Ollama is available first (before checking model)
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(this.getNotAvailableError());
    }

    // Check if the configured model is available in Ollama
    const config = readRalphConfigSync(projectPath);
    const model = config?.runner?.model;
    if (model) {
      const modelAvailable = await this.isModelAvailable(model);
      if (!modelAvailable) {
        throw new Error(
          `Model '${model}' is not available in Ollama. Run 'ollama pull ${model}' to download it, or check 'ollama list' for available models.`
        );
      }
    }

    // Store projectPath for use in buildSpawnConfig
    this._currentProjectPath = projectPath;

    try {
      return await super.start(projectId, projectPath, storyId);
    } finally {
      this._currentProjectPath = undefined;
    }
  }

  /**
   * Override setupOutputHandlers to add Ollama-specific error detection
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

    // Handle stderr with Ollama-specific error detection
    process.stderr?.on("data", (data: Buffer) => {
      const content = data.toString();
      this.handleLogData(projectId, storyId, content, "stderr");

      // Log connection errors to Ollama
      if (/connection refused|ECONNREFUSED/i.test(content)) {
        console.warn(
          `${this.logPrefix} Ollama connection refused for project ${projectId}. Is Ollama running?`
        );
      }

      // Log model not found errors
      if (/model .* not found|model not found/i.test(content)) {
        console.warn(
          `${this.logPrefix} Model not found in Ollama for project ${projectId}. Check 'ollama list' for available models.`
        );
      }
    });
  }

  /**
   * Custom error message when Ollama is not available
   */
  protected getNotAvailableError(): string {
    return "Ollama is not running or not installed. Start Ollama with 'ollama serve' or install from https://ollama.ai";
  }

  /**
   * Custom error message when not configured (shouldn't be called since isConfigured always returns true)
   */
  protected getNotConfiguredError(): string {
    return "Ollama configuration error. This should not happen.";
  }
}

// Export singleton instance
export const ollamaLoopService = new OllamaLoopService();

// Export class for testing
export { OllamaLoopService };

// Re-export types from interface for backwards compatibility
export type {
  RunnerStatus,
  StoryStatus,
  PrdStory,
  PrdJson,
  RunnerState,
  LogEntry,
} from "./loopService.interface";

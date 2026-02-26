/**
 * Loop Service Interface
 *
 * Common interface for all loop services (Claude, Gemini, Codex, Ollama).
 * Defines the contract for process management, status tracking, and lifecycle events.
 */

/**
 * Runner status enum
 */
export type RunnerStatus = "idle" | "running" | "stopping";

/**
 * Story status from prd.json
 */
export type StoryStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed"
  | "review"
  | "backlog";

/**
 * Story from prd.json
 */
export interface PrdStory {
  id: string;
  title: string;
  status: StoryStatus;
  dependencies: string[];
  priority: number;
  description?: string;
  acceptanceCriteria?: string[];
  epic?: string;
  recommendedSkills?: string[];
}

/**
 * Prd.json structure
 */
export interface PrdJson {
  userStories: PrdStory[];
  projectName?: string;
  projectDescription?: string;
  branchName?: string;
  epics?: Array<{ name: string; description: string }>;
  implementationGuides?: Array<{
    name: string;
    path: string;
    description: string;
    topics: string[];
  }>;
  availableSkills?: string[];
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
 * Log entry structure
 */
export interface LogEntry {
  projectId: number;
  storyId?: string;
  content: string;
  logType: "stdout" | "stderr";
  timestamp: Date;
}

/**
 * Spawn configuration for CLI processes
 */
export interface SpawnConfig {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  useStdin?: boolean;
  stdinContent?: string;
}

/**
 * ILoopService interface
 *
 * Defines the contract for all loop service implementations.
 * Each provider (Claude, Gemini, Codex, Ollama) implements this interface.
 */
export interface ILoopService {
  /**
   * Start a runner for a project
   *
   * @param projectId - Database ID of the project
   * @param projectPath - Filesystem path to the project
   * @param storyId - Optional story ID being worked on (if not provided, auto-selects)
   * @returns The runner state after starting
   */
  start(
    projectId: number,
    projectPath: string,
    storyId?: string,
  ): Promise<RunnerState>;

  /**
   * Stop a running runner
   *
   * @param projectId - Database ID of the project
   * @param force - Force kill instead of graceful stop
   * @returns The runner state after stopping
   */
  stop(projectId: number, force?: boolean): Promise<RunnerState>;

  /**
   * Get the status of a runner
   *
   * @param projectId - Database ID of the project
   * @returns The current runner state
   */
  getStatus(projectId: number): RunnerState;

  /**
   * Get status of all tracked runners
   */
  getAllStatus(): RunnerState[];

  /**
   * Enable or disable auto-restart for a project
   */
  setAutoRestart(projectId: number, enabled: boolean): void;

  /**
   * Check if auto-restart is enabled for a project
   * Default is TRUE - auto-restart is on unless explicitly disabled
   */
  isAutoRestartEnabled(projectId: number): boolean;

  /**
   * Get buffered logs for a project
   */
  getBufferedLogs(projectId: number): LogEntry[];
}

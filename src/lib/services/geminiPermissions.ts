/**
 * Gemini Permissions Service
 *
 * Manages Gemini CLI permissions for projects.
 * Similar to claudePermissions.ts but uses Gemini's --allowed-tools flag.
 */

/**
 * Gemini CLI tool configuration
 * Uses --allowed-tools flag to specify which tools Gemini can use
 */
export interface GeminiSettings {
  tools: {
    allow: string[];
  };
}

/**
 * Default permissions for Gemini CLI projects managed by Ralph
 *
 * Gemini CLI built-in tools:
 * - read_file: Read file content
 * - write_file: Write to file
 * - list_directory: List directory contents
 * - shell: Execute shell commands
 * - web_fetch: Fetch web content
 * - google_search: Real-time web search
 *
 * We enable file operations and shell for coding tasks.
 * Note: Gemini's --yolo flag auto-approves all tool executions.
 */
export const DEFAULT_GEMINI_PERMISSIONS: GeminiSettings = {
  tools: {
    allow: [
      "read_file",
      "write_file",
      "list_directory",
      "shell",
    ],
  },
};

/**
 * Validates that a settings object has the expected structure
 */
export function isValidGeminiSettings(settings: unknown): settings is GeminiSettings {
  if (typeof settings !== "object" || settings === null) {
    return false;
  }

  const s = settings as Record<string, unknown>;

  if (typeof s.tools !== "object" || s.tools === null) {
    return false;
  }

  const t = s.tools as Record<string, unknown>;

  return (
    Array.isArray(t.allow) &&
    t.allow.every((item: unknown) => typeof item === "string")
  );
}

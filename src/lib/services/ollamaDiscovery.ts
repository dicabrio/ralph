/**
 * Ollama Discovery Service
 *
 * Service to detect available Ollama models.
 * Parses the output of 'ollama list' and provides caching.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Ollama model information
 */
export interface OllamaModel {
  /** Model name (e.g., "llama2:latest", "codellama:7b") */
  name: string;
  /** Model size (e.g., "3.8 GB", "7.3 GB") */
  size: string;
  /** Last modified timestamp */
  modifiedAt: string;
}

/**
 * Cache entry for models
 */
interface ModelCache {
  models: OllamaModel[];
  timestamp: number;
}

/** Cache duration in milliseconds (60 seconds) */
const CACHE_DURATION_MS = 60 * 1000;

/** Cached models data */
let modelCache: ModelCache | null = null;

/**
 * Parse a single line from 'ollama list' output
 * Format: NAME            ID              SIZE      MODIFIED
 *         llama2:latest   78e26419b446    3.8 GB    4 weeks ago
 */
function parseOllamaListLine(line: string): OllamaModel | null {
  // Skip empty lines
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  // Split on whitespace, but be careful about the "X weeks ago" or "X days ago" format
  // The columns are: NAME, ID, SIZE (with unit), MODIFIED (with time unit)
  // Example: "llama2:latest   78e26419b446    3.8 GB    4 weeks ago"

  // Use a more sophisticated split that handles the multi-word columns
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5) {
    return null;
  }

  const name = parts[0];
  // Skip the ID (parts[1])
  // Size is parts[2] + parts[3] (e.g., "3.8" + "GB")
  const size = `${parts[2]} ${parts[3]}`;
  // Modified is the rest (e.g., "4 weeks ago")
  const modifiedAt = parts.slice(4).join(" ");

  return {
    name,
    size,
    modifiedAt,
  };
}

/**
 * Parse the full 'ollama list' output
 */
export function parseOllamaListOutput(output: string): OllamaModel[] {
  const lines = output.split("\n");

  // Skip header line (NAME, ID, SIZE, MODIFIED)
  const dataLines = lines.slice(1);

  const models: OllamaModel[] = [];
  for (const line of dataLines) {
    const model = parseOllamaListLine(line);
    if (model) {
      models.push(model);
    }
  }

  return models;
}

/**
 * Check if the model cache is still valid
 */
function isCacheValid(): boolean {
  if (!modelCache) {
    return false;
  }
  return Date.now() - modelCache.timestamp < CACHE_DURATION_MS;
}

/**
 * Clear the model cache
 * Useful for testing or forcing a refresh
 */
export function clearModelCache(): void {
  modelCache = null;
}

/**
 * Check if Ollama is running and available
 * Executes 'ollama list' to verify both CLI and server are working
 *
 * @returns Promise<boolean> - true if Ollama is running, false otherwise
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    await execAsync("ollama list", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available Ollama models
 * Parses the output of 'ollama list' and caches the result for 60 seconds
 *
 * @returns Promise<OllamaModel[]> - Array of available models, empty if Ollama is not running
 */
export async function getAvailableModels(): Promise<OllamaModel[]> {
  // Return cached models if cache is valid
  if (isCacheValid() && modelCache) {
    return modelCache.models;
  }

  try {
    const { stdout } = await execAsync("ollama list", { timeout: 5000 });
    const models = parseOllamaListOutput(stdout);

    // Update cache
    modelCache = {
      models,
      timestamp: Date.now(),
    };

    return models;
  } catch {
    // Return empty array if Ollama is not available
    // Don't update cache on failure to allow retry
    return [];
  }
}

/**
 * Get the cache duration in milliseconds
 * Exported for testing purposes
 */
export function getCacheDurationMs(): number {
  return CACHE_DURATION_MS;
}

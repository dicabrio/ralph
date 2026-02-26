/**
 * @vitest-environment node
 *
 * Ollama Discovery Service Tests
 *
 * Unit tests for Ollama model discovery and caching.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to ensure mock is available when vi.mock is processed
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

// Mock child_process
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

// Mock util.promisify to return our controllable mock
vi.mock("node:util", () => ({
  promisify: () => mockExecAsync,
}));

// Import the functions to test after mocking
import {
  parseOllamaListOutput,
  clearModelCache,
  getCacheDurationMs,
  isOllamaRunning,
  getAvailableModels,
} from "./ollamaDiscovery";

describe("ollamaDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearModelCache();
    mockExecAsync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseOllamaListOutput", () => {
    it("parses standard ollama list output", () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
llama2:latest       	78e26419b446	3.8 GB	4 weeks ago
codellama:7b        	8fdf8f752f6e	3.8 GB	2 weeks ago
mistral:latest      	61e88e884507	4.1 GB	3 days ago
`;

      const models = parseOllamaListOutput(output);

      expect(models).toHaveLength(3);
      expect(models[0]).toEqual({
        name: "llama2:latest",
        size: "3.8 GB",
        modifiedAt: "4 weeks ago",
      });
      expect(models[1]).toEqual({
        name: "codellama:7b",
        size: "3.8 GB",
        modifiedAt: "2 weeks ago",
      });
      expect(models[2]).toEqual({
        name: "mistral:latest",
        size: "4.1 GB",
        modifiedAt: "3 days ago",
      });
    });

    it("handles empty output after header", () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
`;

      const models = parseOllamaListOutput(output);
      expect(models).toHaveLength(0);
    });

    it("handles output with only header line", () => {
      const output = "NAME                	ID          	SIZE  	MODIFIED";

      const models = parseOllamaListOutput(output);
      expect(models).toHaveLength(0);
    });

    it("parses models with different time formats", () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
llama2:latest       	78e26419b446	3.8 GB	1 minute ago
codellama:7b        	8fdf8f752f6e	3.8 GB	2 hours ago
mistral:latest      	61e88e884507	4.1 GB	1 month ago
`;

      const models = parseOllamaListOutput(output);

      expect(models).toHaveLength(3);
      expect(models[0].modifiedAt).toBe("1 minute ago");
      expect(models[1].modifiedAt).toBe("2 hours ago");
      expect(models[2].modifiedAt).toBe("1 month ago");
    });

    it("handles models with various sizes", () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
tiny:latest         	abc123      	500 MB	1 day ago
large:latest        	def456      	13.5 GB	2 days ago
`;

      const models = parseOllamaListOutput(output);

      expect(models).toHaveLength(2);
      expect(models[0].size).toBe("500 MB");
      expect(models[1].size).toBe("13.5 GB");
    });

    it("skips empty lines in output", () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED

llama2:latest       	78e26419b446	3.8 GB	4 weeks ago

codellama:7b        	8fdf8f752f6e	3.8 GB	2 weeks ago

`;

      const models = parseOllamaListOutput(output);
      expect(models).toHaveLength(2);
    });
  });

  describe("isOllamaRunning", () => {
    it("returns true when ollama list succeeds", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "NAME\nllama2:latest\t...\t3.8 GB\t1 day ago",
      });

      const result = await isOllamaRunning();
      expect(result).toBe(true);
    });

    it("returns false when ollama list fails", async () => {
      mockExecAsync.mockRejectedValue(new Error("Command failed"));

      const result = await isOllamaRunning();
      expect(result).toBe(false);
    });

    it("returns false when ollama is not installed", async () => {
      mockExecAsync.mockRejectedValue(new Error("command not found: ollama"));

      const result = await isOllamaRunning();
      expect(result).toBe(false);
    });
  });

  describe("getAvailableModels", () => {
    it("returns parsed models from ollama list", async () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
llama2:latest       	78e26419b446	3.8 GB	4 weeks ago
codellama:7b        	8fdf8f752f6e	3.8 GB	2 weeks ago
`;
      mockExecAsync.mockResolvedValue({ stdout: output });

      const models = await getAvailableModels();

      expect(models).toHaveLength(2);
      expect(models[0].name).toBe("llama2:latest");
      expect(models[1].name).toBe("codellama:7b");
    });

    it("returns empty array when ollama is not available", async () => {
      mockExecAsync.mockRejectedValue(new Error("Command failed"));

      const models = await getAvailableModels();
      expect(models).toEqual([]);
    });

    it("returns empty array when no models are installed", async () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
`;
      mockExecAsync.mockResolvedValue({ stdout: output });

      const models = await getAvailableModels();
      expect(models).toEqual([]);
    });
  });

  describe("caching", () => {
    it("caches models for subsequent calls", async () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
llama2:latest       	78e26419b446	3.8 GB	4 weeks ago
`;
      mockExecAsync.mockResolvedValue({ stdout: output });

      // First call - should execute ollama list
      const models1 = await getAvailableModels();
      expect(models1).toHaveLength(1);
      expect(mockExecAsync).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const models2 = await getAvailableModels();
      expect(models2).toHaveLength(1);
      expect(mockExecAsync).toHaveBeenCalledTimes(1);
    });

    it("refreshes cache after duration expires", async () => {
      vi.useFakeTimers();
      const output = `NAME                	ID          	SIZE  	MODIFIED
llama2:latest       	78e26419b446	3.8 GB	4 weeks ago
`;
      mockExecAsync.mockResolvedValue({ stdout: output });
      clearModelCache();

      // First call
      await getAvailableModels();
      expect(mockExecAsync).toHaveBeenCalledTimes(1);

      // Advance time past cache duration
      vi.advanceTimersByTime(getCacheDurationMs() + 1000);

      // Call again - should refresh
      await getAvailableModels();
      expect(mockExecAsync).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("clearModelCache forces refresh on next call", async () => {
      const output = `NAME                	ID          	SIZE  	MODIFIED
llama2:latest       	78e26419b446	3.8 GB	4 weeks ago
`;
      mockExecAsync.mockResolvedValue({ stdout: output });

      // First call
      await getAvailableModels();
      expect(mockExecAsync).toHaveBeenCalledTimes(1);

      // Clear cache
      clearModelCache();

      // Next call should refresh
      await getAvailableModels();
      expect(mockExecAsync).toHaveBeenCalledTimes(2);
    });

    it("does not cache errors", async () => {
      // First call fails
      mockExecAsync.mockRejectedValue(new Error("Connection refused"));

      const models1 = await getAvailableModels();
      expect(models1).toEqual([]);
      expect(mockExecAsync).toHaveBeenCalledTimes(1);

      // Second call should try again (not use cached empty result)
      // Update the mock for success
      const output = `NAME                	ID          	SIZE  	MODIFIED
llama2:latest       	78e26419b446	3.8 GB	4 weeks ago
`;
      mockExecAsync.mockResolvedValue({ stdout: output });

      const models2 = await getAvailableModels();
      expect(models2).toHaveLength(1);
      expect(mockExecAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe("getCacheDurationMs", () => {
    it("returns 60 seconds in milliseconds", () => {
      expect(getCacheDurationMs()).toBe(60 * 1000);
    });
  });
});

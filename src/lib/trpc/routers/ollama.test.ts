/**
 * Ollama Router Tests
 *
 * Unit tests for the Ollama tRPC endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCallerFactory } from "../trpc";
import { ollamaRouter } from "./ollama";
import * as ollamaDiscovery from "../../services/ollamaDiscovery";

// Mock the ollamaDiscovery service
vi.mock("../../services/ollamaDiscovery", () => ({
  isOllamaRunning: vi.fn(),
  getAvailableModels: vi.fn(),
}));

const createCaller = createCallerFactory(ollamaRouter);

describe("ollamaRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isAvailable", () => {
    it("returns true when Ollama is running", async () => {
      vi.mocked(ollamaDiscovery.isOllamaRunning).mockResolvedValue(true);

      const caller = createCaller({});
      const result = await caller.isAvailable();

      expect(result).toBe(true);
      expect(ollamaDiscovery.isOllamaRunning).toHaveBeenCalledTimes(1);
    });

    it("returns false when Ollama is not running", async () => {
      vi.mocked(ollamaDiscovery.isOllamaRunning).mockResolvedValue(false);

      const caller = createCaller({});
      const result = await caller.isAvailable();

      expect(result).toBe(false);
      expect(ollamaDiscovery.isOllamaRunning).toHaveBeenCalledTimes(1);
    });
  });

  describe("getModels", () => {
    it("returns available models", async () => {
      const mockModels = [
        { name: "llama2:latest", size: "3.8 GB", modifiedAt: "4 weeks ago" },
        { name: "codellama:7b", size: "3.8 GB", modifiedAt: "2 weeks ago" },
      ];
      vi.mocked(ollamaDiscovery.getAvailableModels).mockResolvedValue(
        mockModels,
      );

      const caller = createCaller({});
      const result = await caller.getModels();

      expect(result).toEqual(mockModels);
      expect(result).toHaveLength(2);
      expect(ollamaDiscovery.getAvailableModels).toHaveBeenCalledTimes(1);
    });

    it("returns empty array when no models available", async () => {
      vi.mocked(ollamaDiscovery.getAvailableModels).mockResolvedValue([]);

      const caller = createCaller({});
      const result = await caller.getModels();

      expect(result).toEqual([]);
      expect(ollamaDiscovery.getAvailableModels).toHaveBeenCalledTimes(1);
    });

    it("returns empty array when Ollama is not running", async () => {
      vi.mocked(ollamaDiscovery.getAvailableModels).mockResolvedValue([]);

      const caller = createCaller({});
      const result = await caller.getModels();

      expect(result).toEqual([]);
    });
  });
});

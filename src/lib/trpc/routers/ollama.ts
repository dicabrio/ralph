/**
 * Ollama Router
 *
 * Provides endpoints for Ollama discovery and model listing.
 */
import { router, publicProcedure } from "../trpc";
import {
  isOllamaRunning,
  getAvailableModels,
} from "../../services/ollamaDiscovery";

export const ollamaRouter = router({
  /**
   * Check if Ollama is available
   * Returns true if Ollama CLI is installed and server is running
   */
  isAvailable: publicProcedure.query(async () => {
    return isOllamaRunning();
  }),

  /**
   * Get available Ollama models
   * Returns an array of models with name, size, and modifiedAt
   * Returns empty array if Ollama is not available
   */
  getModels: publicProcedure.query(async () => {
    return getAvailableModels();
  }),
});

export type OllamaRouter = typeof ollamaRouter;

/**
 * Runner Router
 *
 * API endpoints for managing Claude/Codex/Gemini runners.
 * Handles starting, stopping, and querying runner status.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { claudeLoopService } from "@/lib/services/claudeLoopService";
import { codexLoopService } from "@/lib/services/codexLoopService";
import { geminiLoopService } from "@/lib/services/geminiLoopService";
import { expandPath } from "@/lib/utils.server";

const runnerProviderSchema = z.enum(["claude", "codex", "gemini"]);
type RunnerProvider = z.infer<typeof runnerProviderSchema>;

// Input schemas
const startRunnerSchema = z.object({
  projectId: z.number().int().positive(),
  storyId: z.string().optional(),
  provider: runnerProviderSchema.optional().default("claude"),
  singleStoryMode: z.boolean().optional().default(false),
});

const stopRunnerSchema = z.object({
  projectId: z.number().int().positive(),
  force: z.boolean().optional().default(false),
});

const getStatusSchema = z.object({
  projectId: z.number().int().positive(),
  provider: runnerProviderSchema.optional().default("claude"),
});

const setAutoRestartSchema = z.object({
  projectId: z.number().int().positive(),
  enabled: z.boolean(),
});

function getService(provider: RunnerProvider) {
  switch (provider) {
    case "codex":
      return codexLoopService;
    case "gemini":
      return geminiLoopService;
    default:
      return claudeLoopService;
  }
}

function getOtherProviders(provider: RunnerProvider): RunnerProvider[] {
  const allProviders: RunnerProvider[] = ["claude", "codex", "gemini"];
  return allProviders.filter((p) => p !== provider);
}

function getProviderAwareStatus(
  projectId: number,
  preferredProvider: RunnerProvider,
) {
  const preferredService = getService(preferredProvider);
  const preferredState = preferredService.getStatus(projectId);
  if (preferredState.status !== "idle") {
    return { ...preferredState, provider: preferredProvider };
  }

  // Check other providers
  const otherProviders = getOtherProviders(preferredProvider);
  for (const fallbackProvider of otherProviders) {
    const fallbackService = getService(fallbackProvider);
    const fallbackState = fallbackService.getStatus(projectId);
    if (fallbackState.status !== "idle") {
      return { ...fallbackState, provider: fallbackProvider };
    }
  }

  return { ...preferredState, provider: preferredProvider };
}

export const runnerRouter = router({
  /**
   * Start a runner for a project
   */
  start: publicProcedure
    .input(startRunnerSchema)
    .mutation(async ({ input }) => {
      const { projectId, storyId, provider, singleStoryMode } = input;

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with id ${projectId} not found`,
        });
      }

      try {
        const selectedService = getService(provider);
        const otherProviders = getOtherProviders(provider);

        // Check if any other provider is running
        for (const otherProvider of otherProviders) {
          const otherService = getService(otherProvider);
          const otherStatus = otherService.getStatus(projectId);
          if (otherStatus.status !== "idle") {
            throw new Error(
              `Cannot start ${provider} runner while ${otherProvider} runner is ${otherStatus.status}. Stop it first.`,
            );
          }
        }

        // In single story mode, disable auto-restart so runner stops after completing the story
        // Otherwise, re-enable auto-restart for normal multi-story runs
        if (singleStoryMode) {
          claudeLoopService.setAutoRestart(projectId, false);
          codexLoopService.setAutoRestart(projectId, false);
          geminiLoopService.setAutoRestart(projectId, false);
        } else {
          claudeLoopService.setAutoRestart(projectId, true);
          codexLoopService.setAutoRestart(projectId, true);
          geminiLoopService.setAutoRestart(projectId, true);
        }

        // Ensure absolute path - CLI runs directly on filesystem
        const absolutePath = expandPath(project.path);
        const state = await selectedService.start(
          projectId,
          absolutePath,
          storyId,
        );
        return { ...state, provider };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to start runner",
        });
      }
    }),

  /**
   * Stop a running runner
   */
  stop: publicProcedure.input(stopRunnerSchema).mutation(async ({ input }) => {
    const { projectId, force } = input;

    // Verify project exists
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Project with id ${projectId} not found`,
      });
    }

    try {
      const claudeStatus = claudeLoopService.getStatus(projectId);
      const codexStatus = codexLoopService.getStatus(projectId);
      const geminiStatus = geminiLoopService.getStatus(projectId);

      if (claudeStatus.status !== "idle") {
        await claudeLoopService.stop(projectId, force);
      }

      if (codexStatus.status !== "idle") {
        await codexLoopService.stop(projectId, force);
      }

      if (geminiStatus.status !== "idle") {
        await geminiLoopService.stop(projectId, force);
      }

      return { status: "idle" as const, projectId };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to stop runner",
      });
    }
  }),

  /**
   * Get the status of a runner
   */
  getStatus: publicProcedure.input(getStatusSchema).query(async ({ input }) => {
    const { projectId, provider } = input;

    // Verify project exists
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Project with id ${projectId} not found`,
      });
    }

    try {
      return getProviderAwareStatus(projectId, provider);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to get runner status",
      });
    }
  }),

  /**
   * Get status of all runners
   */
  getAllStatus: publicProcedure.query(async () => {
    try {
      const claudeStates = claudeLoopService.getAllStatus().map((state) => ({
        ...state,
        provider: "claude" as const,
      }));
      const codexStates = codexLoopService.getAllStatus().map((state) => ({
        ...state,
        provider: "codex" as const,
      }));
      const geminiStates = geminiLoopService.getAllStatus().map((state) => ({
        ...state,
        provider: "gemini" as const,
      }));
      return [...claudeStates, ...codexStates, ...geminiStates];
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to get runner statuses",
      });
    }
  }),

  /**
   * Enable or disable auto-restart for a project
   */
  setAutoRestart: publicProcedure
    .input(setAutoRestartSchema)
    .mutation(async ({ input }) => {
      const { projectId, enabled } = input;

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with id ${projectId} not found`,
        });
      }

      claudeLoopService.setAutoRestart(projectId, enabled);
      codexLoopService.setAutoRestart(projectId, enabled);
      geminiLoopService.setAutoRestart(projectId, enabled);

      return {
        projectId,
        autoRestartEnabled: enabled,
      };
    }),

  /**
   * Get auto-restart status for a project
   */
  getAutoRestartStatus: publicProcedure
    .input(getStatusSchema)
    .query(async ({ input }) => {
      const { projectId } = input;

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with id ${projectId} not found`,
        });
      }

      return {
        projectId,
        autoRestartEnabled:
          claudeLoopService.isAutoRestartEnabled(projectId) &&
          codexLoopService.isAutoRestartEnabled(projectId) &&
          geminiLoopService.isAutoRestartEnabled(projectId),
      };
    }),
});

export type RunnerRouter = typeof runnerRouter;

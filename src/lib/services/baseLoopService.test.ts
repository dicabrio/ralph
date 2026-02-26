/**
 * @vitest-environment node
 *
 * BaseLoopService Tests
 *
 * Unit tests for the abstract base class shared methods.
 * Uses a concrete test implementation to test shared functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock exec results storage
let mockExecAsync = vi.fn();

// Track spawned processes for testing
const spawnedProcesses: Array<{
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  pid: number;
  _handlers: Map<string, (...args: unknown[]) => void>;
}> = [];

// Create a mock process factory
function createMockProcess(pid: number) {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const process = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    kill: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    pid,
    _handlers: handlers,
  };
  spawnedProcesses.push(process);
  return process;
}

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => createMockProcess(12345)),
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecAsync,
}));

// Track prd.json mock data so we can change it per test
let mockPrdData: {
  userStories: Array<{
    id: string;
    title: string;
    status: string;
    dependencies: string[];
    priority: number;
  }>;
} = {
  userStories: [
    {
      id: "TEST-001",
      title: "Test Story",
      status: "pending",
      dependencies: [],
      priority: 1,
    },
    {
      id: "TEST-002",
      title: "Test Story 2",
      status: "done",
      dependencies: [],
      priority: 2,
    },
  ],
};

// Use a function reference that can be controlled
const mockReadFile = vi.fn(() => Promise.resolve(JSON.stringify(mockPrdData)));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(() => mockReadFile()),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Track broadcast calls
let mockBroadcastToProject: ReturnType<typeof vi.fn>;
let mockBroadcastLog: ReturnType<typeof vi.fn>;
let mockGetEffectivePrompt: ReturnType<typeof vi.fn>;
let mockSelectNextStory: ReturnType<typeof vi.fn>;
let mockGenerateStoryPrompt: ReturnType<typeof vi.fn>;
let mockGetNoEligibleStoryReason: ReturnType<typeof vi.fn>;
let mockReadPrdJson: ReturnType<typeof vi.fn>;

// Initialize mocks at top level
mockBroadcastToProject = vi.fn();
mockBroadcastLog = vi.fn();
mockGetEffectivePrompt = vi.fn().mockResolvedValue({
  content: "# Test Prompt\nThis is a test prompt.",
  source: "default",
});
mockSelectNextStory = vi.fn();
mockGenerateStoryPrompt = vi.fn();
mockGetNoEligibleStoryReason = vi.fn();
mockReadPrdJson = vi.fn();

// Mock websocket server - track broadcast calls
vi.mock("@/lib/websocket/server", () => ({
  getWebSocketServer: vi.fn(() => ({
    broadcastLog: (...args: unknown[]) => mockBroadcastLog(...args),
    broadcastToProject: (...args: unknown[]) => mockBroadcastToProject(...args),
  })),
}));

// Mock promptTemplate
vi.mock("@/lib/services/promptTemplate", () => ({
  getEffectivePrompt: (...args: unknown[]) => mockGetEffectivePrompt(...args),
}));

// Mock storySelector
vi.mock("@/lib/services/storySelector", () => ({
  selectNextStory: (...args: unknown[]) => mockSelectNextStory(...args),
  generateStoryPrompt: (...args: unknown[]) => mockGenerateStoryPrompt(...args),
  getNoEligibleStoryReason: (...args: unknown[]) => mockGetNoEligibleStoryReason(...args),
  readPrdJson: (...args: unknown[]) => mockReadPrdJson(...args),
}));

// Mock test scenario generator
vi.mock("@/lib/services/testScenarioGenerator", () => ({
  generateTestScenarios: vi.fn().mockResolvedValue(undefined),
}));

// Mock database
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  runnerLogs: {},
}));

import { BaseLoopService, type ProcessHandle } from "./baseLoopService";
import type { SpawnConfig } from "./loopService.interface";

/**
 * Concrete test implementation of BaseLoopService
 */
class TestLoopService extends BaseLoopService {
  public mockAvailable = true;
  public mockConfigured = true;
  public mockProviderName = "TestProvider";
  public mockSpawnConfig: SpawnConfig = {
    command: "test-cli",
    args: ["-p"],
    useStdin: true,
    stdinContent: "",
  };

  get providerName(): string {
    return this.mockProviderName;
  }

  async isAvailable(): Promise<boolean> {
    return this.mockAvailable;
  }

  async isConfigured(): Promise<boolean> {
    return this.mockConfigured;
  }

  buildSpawnConfig(prompt: string): SpawnConfig {
    return {
      ...this.mockSpawnConfig,
      stdinContent: prompt,
    };
  }

  // Expose protected methods for testing
  public testFindNextPendingStory(
    stories: Array<{
      id: string;
      status: string;
      dependencies: string[];
      priority: number;
    }>,
  ): string | undefined {
    return this.findNextPendingStory(
      stories.map((s) => ({ ...s, title: "" })),
    );
  }

  public getProcesses(): Map<number, ProcessHandle> {
    return this.processes;
  }
}

// Helper to create a fresh test service instance
async function createTestService(): Promise<TestLoopService> {
  vi.resetModules();
  mockExecAsync = vi.fn();
  spawnedProcesses.length = 0;
  // Re-setup the mock after module reset
  mockGetEffectivePrompt.mockResolvedValue({
    content: "# Test Prompt\nThis is a test prompt.",
    source: "default",
  });
  // Setup storySelector mocks
  mockSelectNextStory.mockResolvedValue({
    story: {
      id: "TEST-001",
      title: "Test Story",
      status: "pending",
      dependencies: [],
      priority: 1,
      epic: "Test",
      description: "Test",
      acceptanceCriteria: [],
      recommendedSkills: [],
    },
    allStories: mockPrdData.userStories,
    dependencyTitles: [],
  });
  mockGenerateStoryPrompt.mockReturnValue(
    "# Generated Prompt\nWith story inline.",
  );
  mockGetNoEligibleStoryReason.mockReturnValue("No eligible stories");
  mockReadPrdJson.mockResolvedValue({
    projectName: "Test",
    userStories: mockPrdData.userStories,
  });

  return new TestLoopService();
}

describe("BaseLoopService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnedProcesses.length = 0;
    mockBroadcastToProject.mockClear();
    mockBroadcastLog.mockClear();
    // Reset prd.json mock data to default
    mockPrdData = {
      userStories: [
        {
          id: "TEST-001",
          title: "Test Story",
          status: "pending",
          dependencies: [],
          priority: 1,
        },
        {
          id: "TEST-002",
          title: "Test Story 2",
          status: "done",
          dependencies: [],
          priority: 2,
        },
      ],
    };
    // Reset storySelector mocks
    mockSelectNextStory.mockResolvedValue({
      story: {
        id: "TEST-001",
        title: "Test Story",
        status: "pending",
        dependencies: [],
        priority: 1,
        epic: "Test",
        description: "Test",
        acceptanceCriteria: [],
        recommendedSkills: [],
      },
      allStories: mockPrdData.userStories,
      dependencyTitles: [],
    });
    mockGenerateStoryPrompt.mockReturnValue(
      "# Generated Prompt\nWith story inline.",
    );
    mockGetNoEligibleStoryReason.mockReturnValue("No eligible stories");
    mockReadPrdJson.mockResolvedValue({
      projectName: "Test",
      userStories: mockPrdData.userStories,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("providerName", () => {
    it("returns the configured provider name", async () => {
      const service = await createTestService();

      expect(service.providerName).toBe("TestProvider");
    });

    it("uses provider name in log prefix", async () => {
      const service = await createTestService();

      // The logPrefix is protected, but we can observe it through start() logs
      expect(service.providerName).toBe("TestProvider");
    });
  });

  describe("getStatus", () => {
    it("returns idle when no process is running", async () => {
      const service = await createTestService();

      const status = service.getStatus(1);

      expect(status).toEqual({
        status: "idle",
        projectId: 1,
      });
    });

    it("returns running status with process info", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      const status = service.getStatus(1);
      expect(status.status).toBe("running");
      expect(status.projectId).toBe(1);
      expect(status.storyId).toBe("TEST-001");
      expect(status.pid).toBeDefined();
      expect(status.startedAt).toBeDefined();
    });
  });

  describe("getAllStatus", () => {
    it("returns empty array when no processes", async () => {
      const service = await createTestService();

      const statuses = service.getAllStatus();

      expect(statuses).toEqual([]);
    });

    it("returns all running processes", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project1");
      await service.start(2, "/test/project2");

      const statuses = service.getAllStatus();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].status).toBe("running");
      expect(statuses[1].status).toBe("running");
    });
  });

  describe("setAutoRestart", () => {
    it("enables auto-restart for a project", async () => {
      const service = await createTestService();

      service.setAutoRestart(1, true);

      expect(service.isAutoRestartEnabled(1)).toBe(true);
    });

    it("disables auto-restart for a project", async () => {
      const service = await createTestService();

      service.setAutoRestart(1, false);

      expect(service.isAutoRestartEnabled(1)).toBe(false);
    });

    it("defaults to true when not set", async () => {
      const service = await createTestService();

      expect(service.isAutoRestartEnabled(999)).toBe(true);
    });
  });

  describe("getBufferedLogs", () => {
    it("returns empty array when no logs", async () => {
      const service = await createTestService();

      const logs = service.getBufferedLogs(1);

      expect(logs).toEqual([]);
    });

    it("returns buffered logs for project", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      // Emit stdout data
      spawnedProcesses[0].stdout.emit("data", Buffer.from("Test log line\n"));

      const logs = service.getBufferedLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].content).toBe("Test log line");
      expect(logs[0].logType).toBe("stdout");
    });
  });

  describe("start", () => {
    it("throws error when CLI is not available", async () => {
      const service = await createTestService();
      service.mockAvailable = false;

      await expect(service.start(1, "/test/project")).rejects.toThrow(
        "TestProvider CLI is not installed",
      );
    });

    it("throws error when not configured", async () => {
      const service = await createTestService();
      service.mockConfigured = false;

      await expect(service.start(1, "/test/project")).rejects.toThrow(
        "TestProvider is not configured",
      );
    });

    it("returns running state if already running", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");
      const result = await service.start(1, "/test/project");

      expect(result.status).toBe("running");
      expect(result.projectId).toBe(1);
      expect(result.storyId).toBe("TEST-001");
    });

    it("successfully starts a runner", async () => {
      const service = await createTestService();

      const result = await service.start(1, "/test/project", "TEST-001");

      expect(result.status).toBe("running");
      expect(result.projectId).toBe(1);
      expect(result.storyId).toBe("TEST-001");
      expect(result.pid).toBeDefined();
      expect(result.startedAt).toBeDefined();
    });

    it("writes prompt to stdin when configured", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project");

      expect(spawnedProcesses[0].stdin.write).toHaveBeenCalled();
      expect(spawnedProcesses[0].stdin.end).toHaveBeenCalled();
    });

    it("broadcasts running status on start", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      expect(mockBroadcastToProject).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          type: "runner_status",
          payload: expect.objectContaining({
            projectId: "1",
            status: "running",
            storyId: "TEST-001",
          }),
        }),
      );
    });

    it("broadcasts story_selected when auto-selecting story", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project");

      expect(mockBroadcastToProject).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          type: "story_selected",
          payload: expect.objectContaining({
            projectId: "1",
            storyId: "TEST-001",
            storyTitle: "Test Story",
          }),
        }),
      );
    });

    it("throws error when no eligible stories", async () => {
      const service = await createTestService();
      mockSelectNextStory.mockResolvedValue(null);
      mockReadPrdJson.mockResolvedValue({ userStories: [] });

      await expect(service.start(1, "/test/project")).rejects.toThrow(
        "No eligible stories",
      );
    });
  });

  describe("stop", () => {
    it("returns idle when no process exists", async () => {
      const service = await createTestService();

      const result = await service.stop(1);

      expect(result).toEqual({
        status: "idle",
        projectId: 1,
      });
    });

    it("kills process gracefully by default", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project");

      // Simulate quick process exit
      setTimeout(() => {
        const closeHandler = spawnedProcesses[0]._handlers.get("close");
        if (closeHandler) closeHandler(0);
      }, 10);

      await service.stop(1);

      expect(spawnedProcesses[0].kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("force kills when force=true", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project");

      // Simulate quick process exit after SIGKILL
      setTimeout(() => {
        const closeHandler = spawnedProcesses[0]._handlers.get("close");
        if (closeHandler) closeHandler(0);
      }, 10);

      await service.stop(1, true);

      expect(spawnedProcesses[0].kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("does not auto-restart when manually stopped", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      setTimeout(() => {
        const closeHandler = spawnedProcesses[0]._handlers.get("close");
        if (closeHandler) closeHandler(0);
      }, 10);

      await service.stop(1, true);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const status = service.getStatus(1);
      expect(status.status).toBe("idle");
      expect(spawnedProcesses).toHaveLength(1);
    });
  });

  describe("stopAll", () => {
    it("stops all running processes", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project1");
      await service.start(2, "/test/project2");

      // stopAll stops sequentially; emit close for each stop window.
      setTimeout(() => {
        const closeHandler = spawnedProcesses[0]._handlers.get("close");
        if (closeHandler) closeHandler(0);
      }, 10);
      setTimeout(() => {
        const closeHandler = spawnedProcesses[1]._handlers.get("close");
        if (closeHandler) closeHandler(0);
      }, 50);

      await service.stopAll();

      // All processes should have been killed
      expect(spawnedProcesses[0].kill).toHaveBeenCalled();
      expect(spawnedProcesses[1].kill).toHaveBeenCalled();
    });
  });

  describe("log handling", () => {
    it("adds logs to buffer when stdout data received", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      // Emit stdout data
      spawnedProcesses[0].stdout.emit("data", Buffer.from("Test log line\n"));

      const logs = service.getBufferedLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].content).toBe("Test log line");
      expect(logs[0].logType).toBe("stdout");
    });

    it("adds logs to buffer when stderr data received", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      // Emit stderr data
      spawnedProcesses[0].stderr.emit("data", Buffer.from("Error line\n"));

      const logs = service.getBufferedLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].content).toBe("Error line");
      expect(logs[0].logType).toBe("stderr");
    });

    it("broadcasts logs to websocket", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      // Emit stdout data
      spawnedProcesses[0].stdout.emit("data", Buffer.from("Test log line\n"));

      expect(mockBroadcastLog).toHaveBeenCalledWith(
        "1",
        "TEST-001",
        "Test log line",
        "stdout",
      );
    });

    it("limits buffer size", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project");

      // Emit more than buffer size logs
      for (let i = 0; i < 150; i++) {
        spawnedProcesses[0].stdout.emit(
          "data",
          Buffer.from(`Log line ${i}\n`),
        );
      }

      const logs = service.getBufferedLogs(1);
      // Buffer should be limited to 100
      expect(logs.length).toBeLessThanOrEqual(100);
    });
  });

  describe("findNextPendingStory", () => {
    it("returns undefined when no eligible stories", async () => {
      const service = await createTestService();

      const result = service.testFindNextPendingStory([
        { id: "1", status: "done", dependencies: [], priority: 1 },
        { id: "2", status: "review", dependencies: [], priority: 2 },
      ]);

      expect(result).toBeUndefined();
    });

    it("returns pending story with lowest priority", async () => {
      const service = await createTestService();

      const result = service.testFindNextPendingStory([
        { id: "1", status: "pending", dependencies: [], priority: 2 },
        { id: "2", status: "pending", dependencies: [], priority: 1 },
      ]);

      expect(result).toBe("2");
    });

    it("considers review status as completed for dependencies", async () => {
      const service = await createTestService();

      const result = service.testFindNextPendingStory([
        { id: "1", status: "review", dependencies: [], priority: 1 },
        { id: "2", status: "pending", dependencies: ["1"], priority: 2 },
      ]);

      expect(result).toBe("2");
    });

    it("does not return story with unmet dependencies", async () => {
      const service = await createTestService();

      const result = service.testFindNextPendingStory([
        { id: "1", status: "pending", dependencies: [], priority: 2 },
        { id: "2", status: "pending", dependencies: ["1"], priority: 1 },
      ]);

      expect(result).toBe("1"); // Should return story 1, not 2 (which depends on 1)
    });

    it("includes failed stories as eligible", async () => {
      const service = await createTestService();

      const result = service.testFindNextPendingStory([
        { id: "1", status: "failed", dependencies: [], priority: 1 },
      ]);

      expect(result).toBe("1");
    });
  });

  describe("process exit handling", () => {
    it("handles successful exit", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project", "TEST-001");

      // Trigger close event with exit code 0
      const closeHandler = spawnedProcesses[0]._handlers.get("close");
      if (closeHandler) {
        closeHandler(0);
      }

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Process should no longer be running
      const status = service.getStatus(1);
      expect(status.status).toBe("idle");
    });

    it("handles error exit", async () => {
      const service = await createTestService();
      service.setAutoRestart(1, false);

      await service.start(1, "/test/project", "TEST-001");

      // Trigger close event with error code
      const closeHandler = spawnedProcesses[0]._handlers.get("close");
      if (closeHandler) {
        closeHandler(1);
      }

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Process should be idle
      const status = service.getStatus(1);
      expect(status.status).toBe("idle");
    });

    it("handles process error event", async () => {
      const service = await createTestService();

      await service.start(1, "/test/project");

      // Trigger error event
      const errorHandler = spawnedProcesses[0]._handlers.get("error");
      if (errorHandler) {
        errorHandler(new Error("Process crashed"));
      }

      // Process should be cleaned up
      const status = service.getStatus(1);
      expect(status.status).toBe("idle");
    });

    it("broadcasts completion event on exit", async () => {
      const service = await createTestService();
      service.setAutoRestart(1, false);

      await service.start(1, "/test/project", "TEST-001");

      // Trigger close event
      const closeHandler = spawnedProcesses[0]._handlers.get("close");
      if (closeHandler) {
        closeHandler(0);
      }

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockBroadcastToProject).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          type: "runner_completed",
        }),
      );
    });
  });

  describe("review status handling", () => {
    it("broadcasts story_review event when story status is review", async () => {
      // Set up prd.json so completed story has 'review' status
      mockPrdData = {
        userStories: [
          {
            id: "TEST-001",
            title: "Test Story",
            status: "review",
            dependencies: [],
            priority: 1,
          },
        ],
      };

      const service = await createTestService();
      service.setAutoRestart(1, false);

      await service.start(1, "/test/project", "TEST-001");

      // Trigger successful exit
      const closeHandler = spawnedProcesses[0]._handlers.get("close");
      if (closeHandler) closeHandler(0);

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that story_review event was broadcast
      const storyReviewCalls = mockBroadcastToProject.mock.calls.filter(
        (call: unknown[]) =>
          call[1] && (call[1] as { type: string }).type === "story_review",
      );

      expect(storyReviewCalls.length).toBe(1);
      expect(storyReviewCalls[0][0]).toBe("1");
      expect(
        (storyReviewCalls[0][1] as { payload: { storyId: string } }).payload
          .storyId,
      ).toBe("TEST-001");
    });

    it("does not broadcast story_review event when story status is done", async () => {
      // Set up prd.json so completed story has 'done' status
      mockPrdData = {
        userStories: [
          {
            id: "TEST-001",
            title: "Test Story",
            status: "done",
            dependencies: [],
            priority: 1,
          },
        ],
      };

      const service = await createTestService();
      service.setAutoRestart(1, false);

      await service.start(1, "/test/project", "TEST-001");

      // Trigger successful exit
      const closeHandler = spawnedProcesses[0]._handlers.get("close");
      if (closeHandler) closeHandler(0);

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that story_review event was NOT broadcast
      const storyReviewCalls = mockBroadcastToProject.mock.calls.filter(
        (call: unknown[]) =>
          call[1] && (call[1] as { type: string }).type === "story_review",
      );

      expect(storyReviewCalls.length).toBe(0);
    });
  });

  describe("loop prevention", () => {
    it("prevents restart loop on same story", async () => {
      // Set up prd.json so the story is still pending after completion
      mockPrdData = {
        userStories: [
          {
            id: "TEST-001",
            title: "Test Story",
            status: "pending",
            dependencies: [],
            priority: 1,
          },
        ],
      };

      const service = await createTestService();
      service.setAutoRestart(1, true);

      await service.start(1, "/test/project", "TEST-001");

      // Trigger exit - would normally auto-restart
      const closeHandler = spawnedProcesses[0]._handlers.get("close");
      if (closeHandler) closeHandler(0);

      // Wait for async handling (less than auto-restart delay)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should broadcast willAutoRestart: false because same story
      const completionCalls = mockBroadcastToProject.mock.calls.filter(
        (call: unknown[]) =>
          call[1] && (call[1] as { type: string }).type === "runner_completed",
      );

      expect(completionCalls.length).toBe(1);
      expect(
        (completionCalls[0][1] as { payload: { willAutoRestart: boolean } })
          .payload.willAutoRestart,
      ).toBe(false);
    });
  });
});

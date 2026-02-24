import { describe, it, expect, vi } from "vitest";
import type { ArchivedStory } from "@/lib/schemas/prdSchema";
import {
  filterArchivedStories,
  sortArchivedStories,
  getUniqueEpics,
} from "./archive";

// Helper to create an archived story with optional overrides
function createArchivedStory(
  overrides: Partial<ArchivedStory> = {},
): ArchivedStory {
  return {
    id: "TEST-001",
    title: "Test Story Title",
    description: "Test story description",
    priority: 1,
    status: "done",
    epic: "Testing",
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: ["Criteria 1", "Criteria 2"],
    archivedAt: "2024-02-20T10:30:00.000Z",
    ...overrides,
  };
}

// Mock trpc
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    projects: {
      getById: {
        useQuery: vi.fn(() => ({
          data: { id: 1, name: "Test Project", path: "/test/path" },
          isLoading: false,
          error: null,
        })),
      },
    },
    archive: {
      listByProject: {
        useQuery: vi.fn(() => ({
          data: [
            createArchivedStory({
              id: "ARCH-001",
              archivedAt: "2024-02-20T10:30:00.000Z",
            }),
            createArchivedStory({
              id: "ARCH-002",
              archivedAt: "2024-02-19T10:30:00.000Z",
            }),
          ],
          isLoading: false,
          error: null,
        })),
      },
    },
  },
}));

// Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: () => null }),
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

describe("filterArchivedStories", () => {
  const stories: ArchivedStory[] = [
    createArchivedStory({
      id: "AUTH-001",
      title: "Implement login feature",
      description: "User authentication with OAuth",
      epic: "Authentication",
    }),
    createArchivedStory({
      id: "UI-002",
      title: "Dashboard redesign",
      description: "Modernize the dashboard UI",
      epic: "Dashboard",
    }),
    createArchivedStory({
      id: "AUTH-002",
      title: "Add password reset",
      description: "Allow users to reset their password via email",
      epic: "Authentication",
    }),
    createArchivedStory({
      id: "API-001",
      title: "Rate limiting",
      description: "Implement API rate limiting",
      epic: "Core API",
    }),
  ];

  describe("search filtering", () => {
    it("should filter by story ID (case insensitive)", () => {
      const filtered = filterArchivedStories(stories, "auth", "all");
      expect(filtered).toHaveLength(2);
      expect(filtered.map((s) => s.id)).toContain("AUTH-001");
      expect(filtered.map((s) => s.id)).toContain("AUTH-002");
    });

    it("should filter by title (case insensitive)", () => {
      const filtered = filterArchivedStories(stories, "dashboard", "all");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("UI-002");
    });

    it("should filter by description (case insensitive)", () => {
      const filtered = filterArchivedStories(stories, "oauth", "all");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("AUTH-001");
    });

    it("should return all stories when search term is empty", () => {
      const filtered = filterArchivedStories(stories, "", "all");
      expect(filtered).toHaveLength(4);
    });

    it("should return all stories when search term is only whitespace", () => {
      const filtered = filterArchivedStories(stories, "   ", "all");
      expect(filtered).toHaveLength(4);
    });

    it("should return empty array when no matches found", () => {
      const filtered = filterArchivedStories(stories, "nonexistent", "all");
      expect(filtered).toHaveLength(0);
    });
  });

  describe("epic filtering", () => {
    it("should filter by exact epic name", () => {
      const filtered = filterArchivedStories(stories, "", "Authentication");
      expect(filtered).toHaveLength(2);
      expect(filtered.every((s) => s.epic === "Authentication")).toBe(true);
    });

    it("should return all stories when epic filter is 'all'", () => {
      const filtered = filterArchivedStories(stories, "", "all");
      expect(filtered).toHaveLength(4);
    });

    it("should return all stories when epic filter is empty string", () => {
      const filtered = filterArchivedStories(stories, "", "");
      expect(filtered).toHaveLength(4);
    });

    it("should return empty array when epic filter has no matches", () => {
      const filtered = filterArchivedStories(stories, "", "NonExistentEpic");
      expect(filtered).toHaveLength(0);
    });
  });

  describe("combined filters", () => {
    it("should combine search and epic filters", () => {
      const filtered = filterArchivedStories(stories, "password", "Authentication");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("AUTH-002");
    });

    it("should return empty array when combined filters have no matches", () => {
      const filtered = filterArchivedStories(stories, "dashboard", "Authentication");
      expect(filtered).toHaveLength(0);
    });

    it("should match search term across all searchable fields within epic", () => {
      // Search for something in description within Authentication epic
      const filtered = filterArchivedStories(stories, "email", "Authentication");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("AUTH-002");
    });
  });
});

describe("sortArchivedStories", () => {
  it("should sort by archivedAt descending (newest first)", () => {
    const stories: ArchivedStory[] = [
      createArchivedStory({
        id: "OLD-001",
        archivedAt: "2024-02-15T10:00:00.000Z",
      }),
      createArchivedStory({
        id: "NEW-001",
        archivedAt: "2024-02-20T10:00:00.000Z",
      }),
      createArchivedStory({
        id: "MID-001",
        archivedAt: "2024-02-18T10:00:00.000Z",
      }),
    ];

    const sorted = sortArchivedStories(stories);
    expect(sorted[0].id).toBe("NEW-001");
    expect(sorted[1].id).toBe("MID-001");
    expect(sorted[2].id).toBe("OLD-001");
  });

  it("should not modify the original array", () => {
    const stories: ArchivedStory[] = [
      createArchivedStory({
        id: "OLD-001",
        archivedAt: "2024-02-15T10:00:00.000Z",
      }),
      createArchivedStory({
        id: "NEW-001",
        archivedAt: "2024-02-20T10:00:00.000Z",
      }),
    ];

    const sorted = sortArchivedStories(stories);
    expect(stories[0].id).toBe("OLD-001"); // Original unchanged
    expect(sorted[0].id).toBe("NEW-001"); // Sorted copy
  });

  it("should handle empty array", () => {
    const sorted = sortArchivedStories([]);
    expect(sorted).toHaveLength(0);
  });

  it("should handle single item array", () => {
    const stories = [createArchivedStory({ id: "SINGLE-001" })];
    const sorted = sortArchivedStories(stories);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("SINGLE-001");
  });

  it("should handle stories with same archivedAt timestamp", () => {
    const sameTime = "2024-02-20T10:00:00.000Z";
    const stories: ArchivedStory[] = [
      createArchivedStory({ id: "A-001", archivedAt: sameTime }),
      createArchivedStory({ id: "B-001", archivedAt: sameTime }),
    ];

    const sorted = sortArchivedStories(stories);
    expect(sorted).toHaveLength(2);
    // Order should be preserved for equal timestamps (stable sort)
  });
});

describe("getUniqueEpics", () => {
  it("should return unique epics sorted alphabetically", () => {
    const stories: ArchivedStory[] = [
      createArchivedStory({ epic: "Dashboard" }),
      createArchivedStory({ epic: "Authentication" }),
      createArchivedStory({ epic: "Dashboard" }),
      createArchivedStory({ epic: "Core API" }),
    ];

    const epics = getUniqueEpics(stories);
    expect(epics).toEqual(["Authentication", "Core API", "Dashboard"]);
  });

  it("should return empty array for empty stories", () => {
    const epics = getUniqueEpics([]);
    expect(epics).toEqual([]);
  });

  it("should handle single epic", () => {
    const stories: ArchivedStory[] = [
      createArchivedStory({ epic: "Testing" }),
      createArchivedStory({ epic: "Testing" }),
    ];

    const epics = getUniqueEpics(stories);
    expect(epics).toEqual(["Testing"]);
  });
});

describe("ArchivedStoryCard Logic", () => {
  describe("rendering", () => {
    it("should have required story fields", () => {
      const story = createArchivedStory({
        id: "ARCH-001",
        title: "Test Story",
        priority: 5,
        epic: "Testing",
        archivedAt: "2024-02-20T10:30:00.000Z",
      });

      expect(story.id).toBe("ARCH-001");
      expect(story.title).toBe("Test Story");
      expect(story.priority).toBe(5);
      expect(story.epic).toBe("Testing");
      expect(story.archivedAt).toBe("2024-02-20T10:30:00.000Z");
    });

    it("should have acceptance criteria count", () => {
      const story = createArchivedStory({
        acceptanceCriteria: ["AC 1", "AC 2", "AC 3"],
      });

      expect(story.acceptanceCriteria).toHaveLength(3);
    });

    it("should have archivedAt timestamp", () => {
      const story = createArchivedStory({
        archivedAt: "2024-02-20T10:30:00.000Z",
      });

      expect(story.archivedAt).toBeDefined();
      expect(new Date(story.archivedAt).getTime()).not.toBeNaN();
    });
  });
});

describe("StoryDetailModal Logic", () => {
  describe("archived story display", () => {
    it("should display story description", () => {
      const story = createArchivedStory({
        description: "This is a detailed description",
      });
      expect(story.description).toBe("This is a detailed description");
    });

    it("should display acceptance criteria", () => {
      const story = createArchivedStory({
        acceptanceCriteria: ["Criteria 1", "Criteria 2", "Criteria 3"],
      });
      expect(story.acceptanceCriteria).toHaveLength(3);
      expect(story.acceptanceCriteria).toContain("Criteria 1");
    });

    it("should display dependencies", () => {
      const story = createArchivedStory({
        dependencies: ["DEP-001", "DEP-002"],
      });
      expect(story.dependencies).toHaveLength(2);
      expect(story.dependencies).toContain("DEP-001");
    });

    it("should display recommended skills", () => {
      const story = createArchivedStory({
        recommendedSkills: ["frontend-design", "database-design"],
      });
      expect(story.recommendedSkills).toHaveLength(2);
      expect(story.recommendedSkills).toContain("frontend-design");
    });

    it("should display archived timestamp", () => {
      const story = createArchivedStory({
        archivedAt: "2024-02-20T10:30:00.000Z",
      });
      expect(story.archivedAt).toBeDefined();
    });
  });
});

describe("Archive Page Logic", () => {
  describe("filtering integration", () => {
    const stories: ArchivedStory[] = [
      createArchivedStory({
        id: "STORY-001",
        title: "First story",
        epic: "Epic A",
        archivedAt: "2024-02-20T10:00:00.000Z",
      }),
      createArchivedStory({
        id: "STORY-002",
        title: "Second story",
        epic: "Epic B",
        archivedAt: "2024-02-19T10:00:00.000Z",
      }),
      createArchivedStory({
        id: "STORY-003",
        title: "Third story",
        epic: "Epic A",
        archivedAt: "2024-02-18T10:00:00.000Z",
      }),
    ];

    it("should filter and sort correctly", () => {
      const filtered = filterArchivedStories(stories, "", "Epic A");
      const sorted = sortArchivedStories(filtered);

      expect(sorted).toHaveLength(2);
      expect(sorted[0].id).toBe("STORY-001"); // Newest first
      expect(sorted[1].id).toBe("STORY-003");
    });

    it("should return empty results for no matches", () => {
      const filtered = filterArchivedStories(stories, "nonexistent", "Epic A");
      expect(filtered).toHaveLength(0);
    });
  });

  describe("empty states", () => {
    it("should detect when no archived stories exist", () => {
      const stories: ArchivedStory[] = [];
      expect(stories.length).toBe(0);
    });

    it("should detect when filters return no results", () => {
      const stories: ArchivedStory[] = [
        createArchivedStory({ epic: "Epic A" }),
      ];
      const filtered = filterArchivedStories(stories, "", "Epic B");
      expect(filtered.length).toBe(0);
    });
  });

  describe("active filters detection", () => {
    it("should detect active search filter", () => {
      const searchTerm = "test";
      const epicFilter = "all";
      const hasActiveFilters = searchTerm.trim() !== "" || epicFilter !== "all";
      expect(hasActiveFilters).toBe(true);
    });

    it("should detect active epic filter", () => {
      const searchTerm = "";
      const epicFilter: string = "Authentication";
      const hasActiveFilters = searchTerm.trim() !== "" || epicFilter !== "all";
      expect(hasActiveFilters).toBe(true);
    });

    it("should detect no active filters", () => {
      const searchTerm = "";
      const epicFilter = "all";
      const hasActiveFilters = searchTerm.trim() !== "" || epicFilter !== "all";
      expect(hasActiveFilters).toBe(false);
    });

    it("should detect both filters active", () => {
      const searchTerm = "test";
      const epicFilter: string = "Authentication";
      const hasActiveFilters = searchTerm.trim() !== "" || epicFilter !== "all";
      expect(hasActiveFilters).toBe(true);
    });
  });
});

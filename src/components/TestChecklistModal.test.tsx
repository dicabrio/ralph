import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestChecklistModal } from "./TestChecklistModal";
import type { Story, StoryStatus } from "@/components/StoryCard";
import type { TestScenario, TestScenarioSection } from "@/lib/schemas/testScenarioSchema";

// Helper to create a story with optional overrides
function createStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "TEST-001",
    title: "Test Story Title",
    description: "Test story description",
    priority: 1,
    status: "review" as StoryStatus,
    epic: "Testing",
    dependencies: [],
    recommendedSkills: [],
    acceptanceCriteria: ["Criteria 1", "Criteria 2"],
    ...overrides,
  };
}

// Helper to create a test scenario
function createTestScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    storyId: "TEST-001",
    title: "Test Story",
    description: "Test description",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        id: "functional-tests",
        title: "Functional Tests",
        items: [
          { id: "ft-1", text: "Test item 1", checked: false },
          { id: "ft-2", text: "Test item 2", checked: true },
        ],
      },
      {
        id: "quality-gates",
        title: "Quality Gates",
        items: [
          { id: "qg-test", text: "pnpm test passes", checked: false },
          { id: "qg-lint", text: "pnpm lint passes", checked: false },
          { id: "qg-build", text: "pnpm build succeeds", checked: false },
        ],
      },
    ],
    ...overrides,
  };
}

// Mock handlers
const mockOnClose = vi.fn();
const mockOnAccept = vi.fn();
const mockOnReject = vi.fn();
const mockMutate = vi.fn();
const mockInvalidate = vi.fn();

// Mock trpc
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    testScenarios: {
      getByStoryId: {
        useQuery: vi.fn(() => ({
          data: createTestScenario(),
          isLoading: false,
        })),
      },
      exists: {
        useQuery: vi.fn(() => ({
          data: true,
        })),
      },
      updateItem: {
        useMutation: vi.fn(() => ({
          mutate: mockMutate,
        })),
      },
    },
    useUtils: () => ({
      testScenarios: {
        getByStoryId: {
          cancel: vi.fn(),
          getData: vi.fn(() => createTestScenario()),
          setData: vi.fn(),
          invalidate: mockInvalidate,
        },
      },
    }),
  },
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("TestChecklistModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render modal when open with story", () => {
      const story = createStory({ id: "REVIEW-123", title: "My Test Story" });

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByTestId("test-checklist-modal")).toBeInTheDocument();
      expect(screen.getByTestId("modal-story-id")).toHaveTextContent("REVIEW-123");
      expect(screen.getByTestId("modal-story-title")).toHaveTextContent("My Test Story");
    });

    it("should not render when story is null", () => {
      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={null}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.queryByTestId("test-checklist-modal")).not.toBeInTheDocument();
    });

    it("should not render when modal is closed", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={false}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.queryByTestId("test-checklist-modal")).not.toBeInTheDocument();
    });

    it("should display story priority badge", () => {
      const story = createStory({ priority: 5 });

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText("P5")).toBeInTheDocument();
    });

    it("should display progress bar", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByTestId("modal-total-progress")).toBeInTheDocument();
    });
  });

  describe("footer buttons", () => {
    it("should render Close button", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByTestId("modal-close-btn")).toBeInTheDocument();
      expect(screen.getByTestId("modal-close-btn")).toHaveTextContent("Close");
    });

    it("should render Accept button", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByTestId("modal-accept-btn")).toBeInTheDocument();
      expect(screen.getByTestId("modal-accept-btn")).toHaveTextContent("Accept");
    });

    it("should render Reject button", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByTestId("modal-reject-btn")).toBeInTheDocument();
      expect(screen.getByTestId("modal-reject-btn")).toHaveTextContent("Reject");
    });

    it("should call onClose when Close button is clicked", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      fireEvent.click(screen.getByTestId("modal-close-btn"));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should call onAccept when Accept button is clicked", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      fireEvent.click(screen.getByTestId("modal-accept-btn"));
      expect(mockOnAccept).toHaveBeenCalledWith(story);
    });

    it("should call onReject when Reject button is clicked", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
        />
      );

      fireEvent.click(screen.getByTestId("modal-reject-btn"));
      expect(mockOnReject).toHaveBeenCalledWith(story);
    });

    it("should disable buttons when accepting", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
          isAccepting={true}
        />
      );

      expect(screen.getByTestId("modal-close-btn")).toBeDisabled();
      expect(screen.getByTestId("modal-accept-btn")).toBeDisabled();
      expect(screen.getByTestId("modal-reject-btn")).toBeDisabled();
    });

    it("should disable buttons when rejecting", () => {
      const story = createStory();

      render(
        <TestChecklistModal
          isOpen={true}
          onClose={mockOnClose}
          story={story}
          projectId={1}
          onAccept={mockOnAccept}
          onReject={mockOnReject}
          isRejecting={true}
        />
      );

      expect(screen.getByTestId("modal-close-btn")).toBeDisabled();
      expect(screen.getByTestId("modal-accept-btn")).toBeDisabled();
      expect(screen.getByTestId("modal-reject-btn")).toBeDisabled();
    });
  });
});

describe("TestChecklistModal Logic", () => {
  describe("progress calculation", () => {
    // Progress calculation helper (same logic as in the component)
    function calculateSectionProgress(section: TestScenarioSection) {
      const total = section.items.length;
      const checked = section.items.filter((item) => item.checked).length;
      return { checked, total, percentage: total > 0 ? (checked / total) * 100 : 0 };
    }

    function calculateTotalProgress(scenario: TestScenario | null | undefined) {
      if (!scenario) return { checked: 0, total: 0, percentage: 0 };
      const total = scenario.sections.reduce((acc, section) => acc + section.items.length, 0);
      const checked = scenario.sections.reduce(
        (acc, section) => acc + section.items.filter((item) => item.checked).length,
        0
      );
      return { checked, total, percentage: total > 0 ? (checked / total) * 100 : 0 };
    }

    function isAllChecked(scenario: TestScenario | null | undefined) {
      if (!scenario) return false;
      return scenario.sections.every((section) =>
        section.items.every((item) => item.checked)
      );
    }

    it("should calculate percentage correctly", () => {
      const scenario = createTestScenario({
        sections: [
          {
            id: "test",
            title: "Test",
            items: [
              { id: "1", text: "Item 1", checked: true },
              { id: "2", text: "Item 2", checked: true },
              { id: "3", text: "Item 3", checked: false },
              { id: "4", text: "Item 4", checked: true },
            ],
          },
        ],
      });

      const progress = calculateTotalProgress(scenario);
      expect(progress.percentage).toBe(75);
    });

    it("should return true when all items are checked", () => {
      const scenario = createTestScenario({
        sections: [
          {
            id: "test",
            title: "Test",
            items: [
              { id: "1", text: "Item 1", checked: true },
              { id: "2", text: "Item 2", checked: true },
            ],
          },
        ],
      });

      expect(isAllChecked(scenario)).toBe(true);
    });

    it("should return false when some items are unchecked", () => {
      const scenario = createTestScenario({
        sections: [
          {
            id: "test",
            title: "Test",
            items: [
              { id: "1", text: "Item 1", checked: true },
              { id: "2", text: "Item 2", checked: false },
            ],
          },
        ],
      });

      expect(isAllChecked(scenario)).toBe(false);
    });

    it("should calculate section progress correctly", () => {
      const section: TestScenarioSection = {
        id: "test",
        title: "Test",
        items: [
          { id: "1", text: "Item 1", checked: true },
          { id: "2", text: "Item 2", checked: false },
          { id: "3", text: "Item 3", checked: true },
        ],
      };

      const progress = calculateSectionProgress(section);
      expect(progress.checked).toBe(2);
      expect(progress.total).toBe(3);
      expect(progress.percentage).toBeCloseTo(66.67, 1);
    });
  });

  describe("modal behavior", () => {
    it("should format percentage for display", () => {
      const percentage = 37.5;
      const displayPercentage = Math.round(percentage);
      expect(displayPercentage).toBe(38);
    });

    it("should handle empty scenario sections", () => {
      const scenario = createTestScenario({ sections: [] });
      const total = scenario.sections.reduce((acc, section) => acc + section.items.length, 0);
      expect(total).toBe(0);
    });
  });
});

describe("TestChecklistModal Accessibility", () => {
  it("should have accessible title", () => {
    const story = createStory({ title: "Accessible Test Story" });

    render(
      <TestChecklistModal
        isOpen={true}
        onClose={mockOnClose}
        story={story}
        projectId={1}
        onAccept={mockOnAccept}
        onReject={mockOnReject}
      />
    );

    // Dialog title should be present for screen readers
    expect(screen.getByTestId("modal-story-title")).toHaveTextContent("Accessible Test Story");
  });

  it("should have screen reader only description", () => {
    const story = createStory({ id: "ACC-001" });

    render(
      <TestChecklistModal
        isOpen={true}
        onClose={mockOnClose}
        story={story}
        projectId={1}
        onAccept={mockOnAccept}
        onReject={mockOnReject}
      />
    );

    // The sr-only description should exist in the document
    expect(screen.getByText(/Test checklist for ACC-001/)).toBeInTheDocument();
  });
});

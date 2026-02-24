import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectNavTabs } from "./ProjectNavTabs";
import { trpc } from "@/lib/trpc/client";

// Create a mockable useRouter
const mockUseRouter = vi.fn(() => ({
  state: {
    location: {
      pathname: "/project/123",
    },
  },
}));

// Mock the router
vi.mock("@tanstack/react-router", async () => {
  return {
    useRouter: () => mockUseRouter(),
    Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock tRPC
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    stories: {
      listByProject: {
        useQuery: vi.fn(),
      },
    },
  },
}));

describe("ProjectNavTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders all four navigation tabs", () => {
    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    expect(screen.getByTestId("nav-tab-overview")).toBeInTheDocument();
    expect(screen.getByTestId("nav-tab-kanban")).toBeInTheDocument();
    expect(screen.getByTestId("nav-tab-testing")).toBeInTheDocument();
    expect(screen.getByTestId("nav-tab-archive")).toBeInTheDocument();
  });

  it("displays correct tab labels on desktop (md+)", () => {
    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    // Labels are hidden on mobile but exist in the DOM
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Kanban")).toBeInTheDocument();
    expect(screen.getByText("Testing")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
  });

  it("shows review count badge when stories are in review", () => {
    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        { id: "STORY-1", status: "review" },
        { id: "STORY-2", status: "review" },
        { id: "STORY-3", status: "done" },
      ],
    });

    render(<ProjectNavTabs projectId="123" />);

    const badge = screen.getByTestId("review-count-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("2");
  });

  it("does not show badge when no stories are in review", () => {
    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        { id: "STORY-1", status: "done" },
        { id: "STORY-2", status: "pending" },
      ],
    });

    render(<ProjectNavTabs projectId="123" />);

    expect(screen.queryByTestId("review-count-badge")).not.toBeInTheDocument();
  });

  it("highlights active tab based on current route - overview", () => {
    mockUseRouter.mockReturnValue({
      state: {
        location: {
          pathname: "/project/123",
        },
      },
    });

    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    const overviewTab = screen.getByTestId("nav-tab-overview");
    expect(overviewTab).toHaveAttribute("aria-current", "page");
  });

  it("highlights active tab based on current route - kanban", () => {
    mockUseRouter.mockReturnValue({
      state: {
        location: {
          pathname: "/project/123/kanban",
        },
      },
    });

    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    const kanbanTab = screen.getByTestId("nav-tab-kanban");
    expect(kanbanTab).toHaveAttribute("aria-current", "page");
  });

  it("highlights active tab based on current route - testing", () => {
    mockUseRouter.mockReturnValue({
      state: {
        location: {
          pathname: "/project/123/testing",
        },
      },
    });

    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    const testingTab = screen.getByTestId("nav-tab-testing");
    expect(testingTab).toHaveAttribute("aria-current", "page");
  });

  it("highlights active tab based on current route - archive", () => {
    mockUseRouter.mockReturnValue({
      state: {
        location: {
          pathname: "/project/123/archive",
        },
      },
    });

    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    const archiveTab = screen.getByTestId("nav-tab-archive");
    expect(archiveTab).toHaveAttribute("aria-current", "page");
  });

  it("generates correct links for each tab", () => {
    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    expect(screen.getByTestId("nav-tab-overview")).toHaveAttribute("href", "/project/123");
    expect(screen.getByTestId("nav-tab-kanban")).toHaveAttribute("href", "/project/123/kanban");
    expect(screen.getByTestId("nav-tab-testing")).toHaveAttribute("href", "/project/123/testing");
    expect(screen.getByTestId("nav-tab-archive")).toHaveAttribute("href", "/project/123/archive");
  });

  it("passes correct parameters to stories query", () => {
    (trpc.stories.listByProject.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
    });

    render(<ProjectNavTabs projectId="123" />);

    expect(trpc.stories.listByProject.useQuery).toHaveBeenCalledWith(
      { projectId: 123 },
      expect.objectContaining({
        enabled: true,
        staleTime: 30000,
      })
    );
  });
});

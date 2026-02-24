import { useRouter, Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  LayoutGrid,
  ClipboardCheck,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";

interface ProjectNavTabsProps {
  projectId: string;
}

interface NavTab {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

export function ProjectNavTabs({ projectId }: ProjectNavTabsProps) {
  const router = useRouter();
  const currentPath = router.state.location.pathname;

  // Fetch stories to count review status
  const { data: stories = [] } = trpc.stories.listByProject.useQuery(
    { projectId: parseInt(projectId, 10) },
    {
      enabled: !Number.isNaN(parseInt(projectId, 10)),
      staleTime: 30000,
    }
  );

  // Count stories in review status
  const reviewCount = stories.filter((s) => s.status === "review").length;

  const tabs: NavTab[] = [
    {
      id: "overview",
      label: "Overview",
      href: `/project/${projectId}`,
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: "kanban",
      label: "Kanban",
      href: `/project/${projectId}/kanban`,
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      id: "testing",
      label: "Testing",
      href: `/project/${projectId}/testing`,
      icon: <ClipboardCheck className="w-4 h-4" />,
      badge: reviewCount,
    },
    {
      id: "archive",
      label: "Archive",
      href: `/project/${projectId}/archive`,
      icon: <Archive className="w-4 h-4" />,
    },
  ];

  // Determine active tab based on current path
  const getActiveTab = () => {
    if (currentPath.endsWith("/kanban")) return "kanban";
    if (currentPath.endsWith("/testing")) return "testing";
    if (currentPath.endsWith("/archive")) return "archive";
    // Default to overview for /project/$id and /project/$id/
    return "overview";
  };

  const activeTab = getActiveTab();

  return (
    <nav
      className="flex items-center gap-1 border-b border-border bg-card/50 backdrop-blur-sm px-4"
      aria-label="Project navigation"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            to={tab.href}
            aria-current={isActive ? "page" : undefined}
            data-testid={`nav-tab-${tab.id}`}
            className={cn(
              "relative flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "hover:text-foreground",
              isActive
                ? "text-foreground"
                : "text-muted-foreground",
              // Active indicator
              "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:transition-opacity",
              isActive
                ? "after:bg-primary after:opacity-100"
                : "after:bg-transparent after:opacity-0 hover:after:bg-muted-foreground/30 hover:after:opacity-100"
            )}
          >
            {tab.icon}
            {/* Label: hidden on mobile, visible on md+ */}
            <span className="hidden md:inline">{tab.label}</span>
            {/* Badge for review count */}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-semibold rounded-full",
                  "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
                )}
                data-testid="review-count-badge"
                title={`${tab.badge} stories in review`}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

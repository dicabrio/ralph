import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
  CircleDashed,
  Clock,
  GripVertical,
  Lock,
  AlertTriangle,
  Info,
  Archive,
  Eye,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  type Story,
  type StoryStatus,
} from "@/components/StoryCard";
import { StoryDetailModal } from "@/components/StoryDetailModal";
import { RunnerLogModal } from "@/components/RunnerLogModal";
import { useWebSocket } from "@/lib/websocket/client";
import type { RalphConfig } from "@/lib/schemas/ralphConfigSchema";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Parse runner errors into user-friendly messages
function getRunnerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Check for common error patterns
  if (
    message.includes("ANTHROPIC_API_KEY") ||
    message.includes("HOST_CLAUDE_CONFIG") ||
    message.includes("authentication")
  ) {
    return "No authentication configured. Set ANTHROPIC_API_KEY or HOST_CLAUDE_CONFIG environment variable.";
  }
  if (
    message.includes("Failed to start container") ||
    message.includes("docker")
  ) {
    return "Docker is not available or not running. Make sure Docker is installed and running.";
  }
  if (message.includes("currently stopping")) {
    return "Runner is currently stopping. Please wait and try again.";
  }
  if (message.includes("not found") || message.includes("NOT_FOUND")) {
    return "Project not found. It may have been deleted.";
  }
  if (
    message.includes("path") &&
    (message.includes("exist") || message.includes("found"))
  ) {
    return "Project path does not exist. Check if the folder exists on the filesystem.";
  }
  if (message.includes("timeout")) {
    return "Container start timeout. Docker may be overloaded or the image is still downloading.";
  }

  // Return a generic message if no pattern matches
  return message || "An unexpected error occurred";
}

export const Route = createFileRoute("/project/$id/kanban")({
  component: KanbanBoard,
});

// Runner status type
type RunnerStatus = "idle" | "running" | "stopping";
type RunnerProvider = "claude" | "codex" | "gemini" | "ollama";

// Kanban column definition
interface KanbanColumn {
  id: string;
  title: string;
  status: StoryStatus | "backlog";
  icon: React.ReactNode;
  headerColor: string;
  bgColor: string;
  isDraggable: boolean; // Whether stories in this column can be dragged
  isDroppable: boolean; // Whether stories can be dropped here
  isLocked: boolean; // Whether this column is locked (only runner can modify)
}

// Define the columns for the Kanban board
const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "backlog",
    title: "Backlog",
    status: "backlog",
    icon: <Clock className="w-4 h-4" />,
    headerColor: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-900/50",
    isDraggable: true,
    isDroppable: true,
    isLocked: false,
  },
  {
    id: "todo",
    title: "Te doen",
    status: "pending",
    icon: <CircleDashed className="w-4 h-4" />,
    headerColor: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
    isDraggable: true,
    isDroppable: true,
    isLocked: false,
  },
  {
    id: "failed",
    title: "Gefaald",
    status: "failed",
    icon: <AlertCircle className="w-4 h-4" />,
    headerColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-900/20",
    isDraggable: true,
    isDroppable: true,
    isLocked: false,
  },
  {
    id: "in_progress",
    title: "In Progress",
    status: "in_progress",
    icon: <PlayCircle className="w-4 h-4" />,
    headerColor: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    isDraggable: false,
    isDroppable: false, // Only runner can move stories here
    isLocked: true,
  },
  {
    id: "review",
    title: "Review",
    status: "review",
    icon: <Eye className="w-4 h-4" />,
    headerColor: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    isDraggable: false,
    isDroppable: false, // Only runner can move stories here
    isLocked: true,
  },
  {
    id: "done",
    title: "Voltooid",
    status: "done",
    icon: <CheckCircle2 className="w-4 h-4" />,
    headerColor: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    isDraggable: true,
    isDroppable: true,
    isLocked: false,
  },
];

// Get which column a story belongs to
function getColumnForStory(story: Story, _allStories: Story[]): string {
  // Simple status to column mapping
  if (story.status === "pending") return "todo";
  if (story.status === "backlog") return "backlog";
  if (story.status === "review") return "review";
  return story.status;
}

// Get the target status for a column
function getTargetStatusForColumn(columnId: string): StoryStatus | null {
  switch (columnId) {
    case "backlog":
      return "backlog";
    case "todo":
      return "pending";
    case "in_progress":
      return "in_progress";
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "review":
      return "review";
    default:
      return null;
  }
}

// Valid status transitions (from stories router)
const validTransitions: Record<StoryStatus, StoryStatus[]> = {
  pending: ["in_progress", "done", "backlog"],
  in_progress: ["done", "failed", "pending", "review"],
  done: ["pending", "backlog"],
  failed: ["in_progress", "pending", "backlog"],
  backlog: ["pending", "done"],
  review: ["done", "failed", "in_progress"],
};

// Check if a status transition is valid
function isValidStatusTransition(from: StoryStatus, to: StoryStatus): boolean {
  if (from === to) return true; // Same status is always valid (no-op)
  return validTransitions[from].includes(to);
}

// Check if a story can be dropped in a target column (basic check - ignores dependencies)
function canDropInColumn(
  story: Story,
  targetColumnId: string,
  _allStories: Story[],
): boolean {
  const targetColumn = KANBAN_COLUMNS.find((c) => c.id === targetColumnId);
  if (!targetColumn || !targetColumn.isDroppable) return false;

  const sourceColumnId = getColumnForStory(story, _allStories);
  if (sourceColumnId === targetColumnId) return false; // Same column

  const targetStatus = getTargetStatusForColumn(targetColumnId);
  if (!targetStatus) return false;

  // in_progress can only be set by runner
  if (targetColumnId === "in_progress") return false;

  // Check if status transition is valid
  return isValidStatusTransition(story.status, targetStatus);
}

// Get unmet dependencies for a story
function getUnmetDependencies(story: Story, allStories: Story[]): Story[] {
  return story.dependencies
    .map((depId) => allStories.find((s) => s.id === depId))
    .filter((dep): dep is Story => dep !== undefined && dep.status !== "done");
}

// Compute project stats from stories
function computeProjectStats(stories: Story[]) {
  const total = stories.length;
  const done = stories.filter((s) => s.status === "done").length;
  const failed = stories.filter((s) => s.status === "failed").length;
  const inProgress = stories.filter((s) => s.status === "in_progress").length;
  const pending = stories.filter((s) => s.status === "pending").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return { total, done, failed, inProgress, pending, progress };
}

// EPIC data structure for matrix layout
interface EpicData {
  name: string;
  stories: Story[];
  highestPriority: number;
  storiesByStatus: Record<string, Story[]>;
}

// Group stories by EPIC and compute stats
function groupStoriesByEpic(stories: Story[]): EpicData[] {
  const epicMap = new Map<string, Story[]>();

  for (const story of stories) {
    const epic = story.epic || "Uncategorized";
    if (!epicMap.has(epic)) {
      epicMap.set(epic, []);
    }
    epicMap.get(epic)!.push(story);
  }

  const epics: EpicData[] = [];
  for (const [name, epicStories] of epicMap) {
    const storiesByStatus: Record<string, Story[]> = {};

    for (const column of KANBAN_COLUMNS) {
      storiesByStatus[column.id] = epicStories.filter(
        (s) => getColumnForStory(s, epicStories) === column.id
      );
    }

    // Find highest priority (lowest number = highest priority)
    const highestPriority = Math.min(...epicStories.map((s) => s.priority));

    epics.push({
      name,
      stories: epicStories,
      highestPriority,
      storiesByStatus,
    });
  }

  // Sort EPICs by highest priority story (ascending, so lowest priority number first)
  epics.sort((a, b) => a.highestPriority - b.highestPriority);

  return epics;
}

// Stories that can show the play button
const PLAYABLE_STATUSES: StoryStatus[] = ["pending", "failed", "backlog"];

// Compact Story Card for matrix layout
interface CompactStoryCardProps {
  story: Story;
  allStories: Story[];
  isDraggable: boolean;
  onClick?: () => void;
  runnerStatus: RunnerStatus;
  onPlayClick?: (story: Story) => void;
  onArchiveClick?: (story: Story) => void;
}

function CompactStoryCard({
  story,
  allStories,
  isDraggable,
  onClick,
  runnerStatus,
  onPlayClick,
  onArchiveClick,
}: CompactStoryCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: story.id,
      disabled: !isDraggable,
      data: {
        story,
        sourceColumn: getColumnForStory(story, allStories),
      },
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  // Show play button only for playable statuses and when runner is idle
  const canShowPlayButton =
    PLAYABLE_STATUSES.includes(story.status) && runnerStatus === "idle";

  // Show archive button only for done stories
  const canShowArchiveButton = story.status === "done";

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlayClick?.(story);
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchiveClick?.(story);
  };

  const isFailed = story.status === "failed";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col gap-1 px-2.5 py-2 rounded-md border bg-card text-card-foreground shadow-sm",
        "hover:shadow-md hover:border-primary/30 transition-all cursor-pointer",
        isDragging && "opacity-50 z-50 shadow-lg",
        isFailed && "border-destructive/30 bg-destructive/5",
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      data-testid={`compact-story-${story.id}`}
    >
      {/* Story ID */}
      <span className="text-[10px] font-mono text-muted-foreground">
        {story.id}
      </span>

      {/* Title row with drag handle and actions */}
      <div className="flex items-center gap-1.5">
        {/* Drag handle */}
        {isDraggable && (
          <div
            {...listeners}
            {...attributes}
            className={cn(
              "flex-shrink-0 cursor-grab active:cursor-grabbing",
              "text-muted-foreground hover:text-foreground transition-colors",
            )}
            data-testid="drag-handle"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3 h-3" />
          </div>
        )}

        {/* Story title */}
        <span className="text-xs font-medium truncate flex-1 min-w-0">
          {story.title}
        </span>

        {/* Action buttons (visible on hover) */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canShowPlayButton && (
            <button
              type="button"
              onClick={handlePlayClick}
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center",
                "bg-emerald-500 text-white hover:bg-emerald-600",
                "shadow-sm",
              )}
              data-testid={`play-story-${story.id}`}
              aria-label={`Run story ${story.id}`}
            >
              <Play className="w-2.5 h-2.5 ml-0.5" />
            </button>
          )}
          {canShowArchiveButton && (
            <button
              type="button"
              onClick={handleArchiveClick}
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center",
                "bg-slate-500 text-white hover:bg-slate-600",
                "shadow-sm",
              )}
              data-testid={`archive-story-${story.id}`}
              aria-label={`Archive story ${story.id}`}
            >
              <Archive className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Droppable Cell for EPIC/Status intersection in matrix
interface DroppableCellProps {
  epicName: string;
  column: KanbanColumn;
  stories: Story[];
  allStories: Story[];
  isOver: boolean;
  canDrop: boolean;
  onStoryClick?: (story: Story) => void;
  runnerStatus: RunnerStatus;
  onPlayClick?: (story: Story) => void;
  onArchiveClick?: (story: Story) => void;
}

function DroppableCell({
  epicName,
  column,
  stories,
  allStories,
  isOver,
  canDrop,
  onStoryClick,
  runnerStatus,
  onPlayClick,
  onArchiveClick,
}: DroppableCellProps) {
  const cellId = `${epicName}:${column.id}`;
  const { setNodeRef } = useDroppable({
    id: cellId,
    disabled: !column.isDroppable,
    data: { column, epicName },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[60px] p-2 rounded-md border transition-all",
        "bg-muted/20 border-border/40",
        isOver && canDrop && "bg-primary/10 border-primary/30",
        isOver && !canDrop && "bg-destructive/10 border-destructive/30",
        !isOver && "hover:bg-muted/40",
      )}
      data-testid={`cell-${epicName}-${column.id}`}
    >
      {stories.length === 0 ? (
        <div
          className={cn(
            "h-full min-h-[44px] flex items-center justify-center",
            "text-[10px] text-muted-foreground/50",
          )}
        >
          {isOver && canDrop ? (
            <span className="text-primary">Drop here</span>
          ) : (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">-</span>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {stories
            .sort((a, b) => a.priority - b.priority)
            .map((story) => (
              <CompactStoryCard
                key={story.id}
                story={story}
                allStories={allStories}
                isDraggable={column.isDraggable}
                onClick={onStoryClick ? () => onStoryClick(story) : undefined}
                runnerStatus={runnerStatus}
                onPlayClick={onPlayClick}
                onArchiveClick={onArchiveClick}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// EPIC Row Header component
interface EpicRowHeaderProps {
  epic: EpicData;
  columns: KanbanColumn[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function EpicRowHeader({
  epic,
  columns,
  isCollapsed,
  onToggleCollapse,
}: EpicRowHeaderProps) {
  // Calculate story counts per status for this EPIC
  const statusCounts = columns.map((col) => ({
    column: col,
    count: epic.storiesByStatus[col.id]?.length || 0,
  }));

  // Handle keyboard interaction
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggleCollapse();
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 bg-muted/50 border-b sticky left-0 z-10 cursor-pointer select-none",
        "hover:bg-muted/70 transition-colors",
        isCollapsed ? "rounded-lg" : "rounded-t-lg",
      )}
      onClick={onToggleCollapse}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={!isCollapsed}
      data-testid={`epic-header-${epic.name}`}
    >
      {/* Collapse toggle chevron */}
      <div className="flex-shrink-0 text-muted-foreground">
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </div>

      <span className="font-semibold text-sm text-foreground">{epic.name}</span>

      {/* Collapsed summary text */}
      {isCollapsed && (
        <span className="text-xs text-muted-foreground ml-2 truncate flex-1">
          {getEpicStatusSummary(epic, columns)}
        </span>
      )}

      <div className="flex items-center gap-1.5 ml-auto">
        {statusCounts.map(
          ({ column, count }) =>
            count > 0 && (
              <span
                key={column.id}
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  column.bgColor,
                  column.headerColor,
                )}
                title={`${column.title}: ${count}`}
              >
                {count}
              </span>
            ),
        )}
        <span className="text-xs text-muted-foreground ml-1">
          ({epic.stories.length})
        </span>
      </div>
    </div>
  );
}

// EPIC Row component for matrix layout
interface EpicRowProps {
  epic: EpicData;
  columns: KanbanColumn[];
  allStories: Story[];
  overCellId: string | null;
  canDropActiveStory: (cellId: string) => boolean;
  onStoryClick?: (story: Story) => void;
  runnerStatus: RunnerStatus;
  onPlayClick?: (story: Story) => void;
  onArchiveClick?: (story: Story) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function EpicRow({
  epic,
  columns,
  allStories,
  overCellId,
  canDropActiveStory,
  onStoryClick,
  runnerStatus,
  onPlayClick,
  onArchiveClick,
  isCollapsed,
  onToggleCollapse,
}: EpicRowProps) {
  // Content ref for measuring height for animation
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(
    undefined,
  );

  // Measure content height when stories change
  useEffect(() => {
    if (contentRef.current && !isCollapsed) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [epic.storiesByStatus, columns, isCollapsed]);

  return (
    <div
      className="group bg-card rounded-lg border shadow-sm overflow-hidden"
      data-testid={`epic-row-${epic.name}`}
    >
      <EpicRowHeader
        epic={epic}
        columns={columns}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />

      {/* Collapsible content with animation */}
      <div
        ref={contentRef}
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
        )}
        style={{
          maxHeight: isCollapsed ? 0 : contentHeight ?? "none",
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <div
          className="grid gap-1 p-2 max-h-[400px] overflow-y-auto"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
          }}
        >
          {columns.map((column) => {
            const cellId = `${epic.name}:${column.id}`;
            const isOver = overCellId === cellId;
            const canDrop = canDropActiveStory(cellId);
            const stories = epic.storiesByStatus[column.id] || [];

            return (
              <DroppableCell
                key={column.id}
                epicName={epic.name}
                column={column}
                stories={stories}
                allStories={allStories}
                isOver={isOver}
                canDrop={canDrop}
                onStoryClick={onStoryClick}
                runnerStatus={runnerStatus}
                onPlayClick={onPlayClick}
                onArchiveClick={onArchiveClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Mobile EPIC Accordion component
interface MobileEpicAccordionProps {
  epics: EpicData[];
  columns: KanbanColumn[];
  allStories: Story[];
  overCellId: string | null;
  canDropActiveStory: (cellId: string) => boolean;
  onStoryClick?: (story: Story) => void;
  runnerStatus: RunnerStatus;
  onPlayClick?: (story: Story) => void;
  onArchiveClick?: (story: Story) => void;
}

function MobileEpicAccordion({
  epics,
  columns,
  allStories,
  overCellId,
  canDropActiveStory,
  onStoryClick,
  runnerStatus,
  onPlayClick,
  onArchiveClick,
}: MobileEpicAccordionProps) {
  // Default open the first EPIC
  const [openItems, setOpenItems] = useState<string[]>(
    epics.length > 0 ? [epics[0].name] : []
  );

  return (
    <Accordion
      type="multiple"
      value={openItems}
      onValueChange={setOpenItems}
      className="space-y-2"
    >
      {epics.map((epic) => (
        <AccordionItem
          key={epic.name}
          value={epic.name}
          className="border rounded-lg bg-card overflow-hidden"
        >
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{epic.name}</span>
              <Badge variant="secondary" className="text-xs">
                {epic.stories.length} stories
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-2">
            <div className="space-y-3">
              {columns.map((column) => {
                const stories = epic.storiesByStatus[column.id] || [];
                if (stories.length === 0) return null;

                const cellId = `${epic.name}:${column.id}`;
                const isOver = overCellId === cellId;
                const canDrop = canDropActiveStory(cellId);

                return (
                  <div key={column.id}>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 text-xs font-medium",
                        column.headerColor,
                      )}
                    >
                      {column.icon}
                      {column.title}
                      <span className="ml-auto">{stories.length}</span>
                    </div>
                    <DroppableCell
                      epicName={epic.name}
                      column={column}
                      stories={stories}
                      allStories={allStories}
                      isOver={isOver}
                      canDrop={canDrop}
                      onStoryClick={onStoryClick}
                      runnerStatus={runnerStatus}
                      onPlayClick={onPlayClick}
                      onArchiveClick={onArchiveClick}
                    />
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

// Column Header for matrix view
interface MatrixColumnHeaderProps {
  columns: KanbanColumn[];
  hasFailedStories: boolean;
}

function MatrixColumnHeader({ columns, hasFailedStories }: MatrixColumnHeaderProps) {
  const visibleColumns = columns.filter(
    (col) => col.id !== "failed" || hasFailedStories
  );

  return (
    <div
      className="grid gap-1 px-2 py-2 bg-muted/30 border-b sticky top-0 z-20"
      style={{
        gridTemplateColumns: `repeat(${visibleColumns.length}, 1fr)`,
      }}
    >
      {visibleColumns.map((column) => (
        <div
          key={column.id}
          className={cn(
            "flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold",
            column.bgColor,
            column.headerColor,
          )}
        >
          {column.icon}
          <span>{column.title}</span>
          {column.isLocked && (
            <Lock className="w-3 h-3 ml-0.5" aria-label="Locked" />
          )}
        </div>
      ))}
    </div>
  );
}

// Runner status badge component
interface RunnerStatusBadgeProps {
  status: RunnerStatus;
  storyId?: string | null;
}

function RunnerStatusBadge({ status, storyId }: RunnerStatusBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        status === "running" &&
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        status === "stopping" &&
          "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        status === "idle" && "bg-muted text-muted-foreground",
      )}
    >
      {status === "running" && (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          {storyId ? `Running: ${storyId}` : "Running"}
        </>
      )}
      {status === "stopping" && (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Stopping
        </>
      )}
      {status === "idle" && (
        <>
          <CircleDashed className="w-3 h-3" />
          Idle
        </>
      )}
    </div>
  );
}

// Compact runner controls for kanban header
interface KanbanRunnerControlsProps {
  projectId: number;
  runnerStatus: RunnerStatus;
  selectedProvider: RunnerProvider;
  activeProvider?: RunnerProvider;
  currentStoryId?: string | null;
  configuredProvider?: RunnerProvider;
  configuredModel?: string;
  onProviderChange: (provider: RunnerProvider) => void;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
}

function KanbanRunnerControls({
  runnerStatus,
  selectedProvider,
  activeProvider,
  currentStoryId,
  configuredProvider,
  configuredModel,
  onProviderChange,
  onStart,
  onStop,
  isStarting,
  isStopping,
}: KanbanRunnerControlsProps) {
  const isRunning = runnerStatus === "running";
  const isBusy = isStarting || isStopping || runnerStatus === "stopping";

  return (
    <div className="flex items-center gap-3">
      {/* Configured provider/model badge */}
      {configuredProvider && runnerStatus === "idle" && (
        <Badge
          variant="secondary"
          className="text-xs"
          data-testid="configured-provider-badge"
        >
          {configuredProvider}
          {configuredModel && `: ${configuredModel}`}
        </Badge>
      )}
      <div className="flex items-center gap-1.5 rounded-md border bg-background p-1">
        <button
          type="button"
          onClick={() => onProviderChange("claude")}
          disabled={isBusy || isRunning}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            selectedProvider === "claude"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Claude
        </button>
        <button
          type="button"
          onClick={() => onProviderChange("ollama")}
          disabled={isBusy || isRunning}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            selectedProvider === "ollama"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Ollama
        </button>
        <button
          type="button"
          onClick={() => onProviderChange("codex")}
          disabled={isBusy || isRunning}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            selectedProvider === "codex"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Codex
        </button>
        <button
          type="button"
          onClick={() => onProviderChange("gemini")}
          disabled={isBusy || isRunning}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            selectedProvider === "gemini"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Gemini
        </button>
      </div>
      <RunnerStatusBadge status={runnerStatus} storyId={currentStoryId} />
      {activeProvider && runnerStatus === "running" && (
        <Badge variant="outline" className="text-xs uppercase tracking-wide">
          {activeProvider}
        </Badge>
      )}
      {!isRunning ? (
        <Button
          size="sm"
          onClick={onStart}
          disabled={isBusy}
          className="bg-emerald-500 text-white hover:bg-emerald-600"
        >
          {isStarting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Start
        </Button>
      ) : (
        <Button
          size="sm"
          variant="destructive"
          onClick={onStop}
          disabled={isBusy}
        >
          {isStopping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
          Stop
        </Button>
      )}
    </div>
  );
}

// Stats bar component
interface StatsBarProps {
  stats: {
    total: number;
    done: number;
    failed: number;
    inProgress: number;
    pending: number;
    progress: number;
  };
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onAutoCollapseCompleted?: () => void;
  areAllExpanded?: boolean;
  areAllCollapsed?: boolean;
  showCollapseControls?: boolean;
  hasCompletedEpics?: boolean;
}

function StatsBar({
  stats,
  onExpandAll,
  onCollapseAll,
  onAutoCollapseCompleted,
  areAllExpanded,
  areAllCollapsed,
  showCollapseControls,
  hasCompletedEpics,
}: StatsBarProps) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        <span className="text-foreground font-medium">{stats.done}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <PlayCircle className="w-4 h-4 text-blue-500" />
        <span className="text-foreground font-medium">{stats.inProgress}</span>
      </div>
      {stats.failed > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-foreground font-medium">{stats.failed}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <CircleDashed className="w-4 h-4 text-muted-foreground" />
        <span className="text-foreground font-medium">{stats.pending}</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <span className="text-muted-foreground">
        {stats.progress}% complete ({stats.done}/{stats.total})
      </span>

      {/* Bulk expand/collapse buttons */}
      {showCollapseControls && (
        <>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={areAllCollapsed ? onExpandAll : onCollapseAll}
            title={areAllCollapsed ? "Expand all EPICs" : "Collapse all EPICs"}
            data-testid="toggle-all-epics"
          >
            <ChevronsUpDown className="w-3.5 h-3.5 mr-1" />
            {areAllCollapsed ? "Expand All" : "Collapse All"}
          </Button>
          {hasCompletedEpics && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onAutoCollapseCompleted}
              title="Collapse EPICs where all stories are done"
              data-testid="auto-collapse-done"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Hide Done
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// Drag overlay content (shows the card being dragged)
interface DragOverlayContentProps {
  story: Story;
}

function DragOverlayContent({ story }: DragOverlayContentProps) {
  return (
    <div className="opacity-90 rotate-2 shadow-2xl">
      <div className="px-3 py-2 rounded-md border bg-card text-card-foreground">
        <span className="text-[10px] font-mono text-muted-foreground">
          {story.id}
        </span>
        <span className="text-xs font-medium ml-2">{story.title}</span>
      </div>
    </div>
  );
}

// Dependency confirmation dialog
interface DependencyConfirmDialogProps {
  isOpen: boolean;
  story: Story | null;
  unmetDependencies: Story[];
  targetColumnTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function DependencyConfirmDialog({
  isOpen,
  story,
  unmetDependencies,
  targetColumnTitle,
  onConfirm,
  onCancel,
  isLoading,
}: DependencyConfirmDialogProps) {
  if (!isOpen || !story) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      data-testid="dependency-confirm-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="dialog-backdrop"
      />

      {/* Dialog content */}
      <div className="relative bg-card border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Unmet Dependencies
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Moving <strong>{story.title}</strong> to {targetColumnTitle} while
              some dependencies are not complete.
            </p>
          </div>
        </div>

        {/* Unmet dependencies list */}
        <div className="bg-muted/50 rounded-lg p-3 mb-6">
          <p className="text-sm font-medium text-foreground mb-2">
            Dependencies not complete:
          </p>
          <ul className="space-y-1.5">
            {unmetDependencies.map((dep) => (
              <li key={dep.id} className="flex items-center gap-2 text-sm">
                <Badge
                  variant={dep.status as "pending" | "in_progress" | "failed"}
                >
                  {dep.status}
                </Badge>
                <span className="text-foreground font-medium">{dep.id}</span>
                <span className="text-muted-foreground truncate">
                  {dep.title}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="dialog-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-amber-600 hover:bg-amber-700"
            data-testid="dialog-confirm"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Move Anyway
          </Button>
        </div>
      </div>
    </div>
  );
}

// Run single story confirmation dialog
interface RunSingleStoryDialogProps {
  isOpen: boolean;
  story: Story | null;
  allStories: Story[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function RunSingleStoryDialog({
  isOpen,
  story,
  allStories,
  onConfirm,
  onCancel,
  isLoading,
}: RunSingleStoryDialogProps) {
  if (!isOpen || !story) return null;

  const unmetDeps = getUnmetDependencies(story, allStories);
  const hasUnmetDeps = unmetDeps.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-story-dialog-title"
      data-testid="run-single-story-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="run-story-dialog-backdrop"
      />

      {/* Dialog content */}
      <div className="relative bg-card border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Play className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2
              id="run-story-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Run Single Story
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Start the runner for this specific story. Auto-restart will be
              disabled.
            </p>
          </div>
        </div>

        {/* Story info */}
        <div className="bg-muted/50 rounded-lg p-3 mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-mono text-muted-foreground">
              {story.id}
            </span>
            <Badge variant="default">P{story.priority}</Badge>
          </div>
          <p className="text-sm font-medium text-foreground">{story.title}</p>
          {story.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {story.description}
            </p>
          )}
        </div>

        {/* Dependency status */}
        {(story.dependencies?.length ?? 0) > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              {hasUnmetDeps ? (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              )}
              Dependencies
            </p>
            <ul className="space-y-1.5">
              {story.dependencies.map((depId) => {
                const dep = allStories.find((s) => s.id === depId);
                const isDone = dep?.status === "done";
                return (
                  <li
                    key={depId}
                    className="flex items-center gap-2 text-sm"
                    data-testid={`dep-status-${depId}`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className="text-foreground font-medium">{depId}</span>
                    {dep && (
                      <Badge
                        variant={
                          dep.status as "pending" | "in_progress" | "failed"
                        }
                        className="text-xs"
                      >
                        {dep.status}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Warning for unmet dependencies */}
        {hasUnmetDeps && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Some dependencies are not complete. The runner will still attempt
              to run this story.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="run-story-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="run-story-confirm"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Start
          </Button>
        </div>
      </div>
    </div>
  );
}

// Archive confirmation dialog
interface ArchiveConfirmDialogProps {
  isOpen: boolean;
  story: Story | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function ArchiveConfirmDialog({
  isOpen,
  story,
  onConfirm,
  onCancel,
  isLoading,
}: ArchiveConfirmDialogProps) {
  if (!isOpen || !story) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-dialog-title"
      data-testid="archive-confirm-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="archive-dialog-backdrop"
      />

      {/* Dialog content */}
      <div className="relative bg-card border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center">
            <Archive className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h2
              id="archive-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Story archiveren
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Weet je zeker dat je deze story wilt archiveren?
            </p>
          </div>
        </div>

        {/* Story info */}
        <div className="bg-muted/50 rounded-lg p-3 mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-mono text-muted-foreground">
              {story.id}
            </span>
            <Badge variant="default">P{story.priority}</Badge>
          </div>
          <p className="text-sm font-medium text-foreground">{story.title}</p>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Gearchiveerde stories worden verplaatst naar het archief en zijn
          beschikbaar op de Archive pagina.
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="archive-cancel"
          >
            Annuleren
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-slate-600 hover:bg-slate-700"
            data-testid="archive-confirm"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Archiveren
          </Button>
        </div>
      </div>
    </div>
  );
}

// Bulk archive confirmation dialog
interface BulkArchiveConfirmDialogProps {
  isOpen: boolean;
  storyCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function BulkArchiveConfirmDialog({
  isOpen,
  storyCount,
  onConfirm,
  onCancel,
  isLoading,
}: BulkArchiveConfirmDialogProps) {
  if (!isOpen || storyCount === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-archive-dialog-title"
      data-testid="bulk-archive-confirm-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="bulk-archive-dialog-backdrop"
      />

      {/* Dialog content */}
      <div className="relative bg-card border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center">
            <Archive className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h2
              id="bulk-archive-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              Alle stories archiveren
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Weet je zeker dat je alle {storyCount} voltooide{" "}
              {storyCount === 1 ? "story" : "stories"} wilt archiveren?
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Gearchiveerde stories worden verplaatst naar het archief en zijn
          beschikbaar op de Archive pagina.
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="bulk-archive-cancel"
          >
            Annuleren
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-slate-600 hover:bg-slate-700"
            data-testid="bulk-archive-confirm"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Archiveer alle
          </Button>
        </div>
      </div>
    </div>
  );
}

// Pending drop info for confirmation dialog
interface PendingDrop {
  story: Story;
  targetColumnId: string;
  unmetDependencies: Story[];
}

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

// Hook to manage collapsed EPIC state with localStorage persistence
function useCollapsedEpics(projectId: number, epics: EpicData[]) {
  const storageKey = `ralph.kanban-collapsed-epics.${projectId}`;
  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined" || Number.isNaN(projectId)) return;

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCollapsedEpics(new Set(parsed));
        }
      }
    } catch (e) {
      console.warn("Failed to load collapsed state from localStorage", e);
    }
    setIsInitialized(true);
  }, [projectId, storageKey]);

  // Save to localStorage when state changes
  useEffect(() => {
    if (typeof window === "undefined" || !isInitialized) return;

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(collapsedEpics)),
      );
    } catch (e) {
      console.warn("Failed to save collapsed state to localStorage", e);
    }
  }, [collapsedEpics, storageKey, isInitialized]);

  const toggleEpic = useCallback((epicName: string) => {
    setCollapsedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicName)) {
        next.delete(epicName);
      } else {
        next.add(epicName);
      }
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (epicName: string) => collapsedEpics.has(epicName),
    [collapsedEpics],
  );

  const expandAll = useCallback(() => {
    setCollapsedEpics(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedEpics(new Set(epics.map((e) => e.name)));
  }, [epics]);

  // Auto-collapse EPICs where all stories are done
  const autoCollapseCompleted = useCallback(() => {
    setCollapsedEpics((prev) => {
      const next = new Set(prev);
      for (const epic of epics) {
        const allDone = epic.stories.every((s) => s.status === "done");
        if (allDone && epic.stories.length > 0) {
          next.add(epic.name);
        }
      }
      return next;
    });
  }, [epics]);

  const areAllCollapsed = useMemo(
    () => epics.length > 0 && epics.every((e) => collapsedEpics.has(e.name)),
    [epics, collapsedEpics],
  );

  const areAllExpanded = useMemo(
    () => epics.length > 0 && !epics.some((e) => collapsedEpics.has(e.name)),
    [epics, collapsedEpics],
  );

  return {
    collapsedEpics,
    toggleEpic,
    isCollapsed,
    expandAll,
    collapseAll,
    autoCollapseCompleted,
    areAllCollapsed,
    areAllExpanded,
  };
}

// Generate status summary text for collapsed EPIC
function getEpicStatusSummary(epic: EpicData, columns: KanbanColumn[]): string {
  const parts: string[] = [];

  for (const column of columns) {
    const count = epic.storiesByStatus[column.id]?.length || 0;
    if (count > 0) {
      // Use short status names
      const shortName = column.id === "in_progress" ? "in progress" : column.id;
      parts.push(`${count} ${shortName}`);
    }
  }

  return parts.join(", ");
}

function KanbanBoard() {
  const { id } = Route.useParams();
  const projectId = parseInt(id, 10);
  const utils = trpc.useUtils();
  const [runnerProvider, setRunnerProvider] =
    useState<RunnerProvider>("claude");
  const [hasAppliedConfig, setHasAppliedConfig] = useState(false);
  const isMobile = useIsMobile();

  // Fetch ralph.config.json for configured provider/model
  const { data: ralphConfig } = trpc.projects.getRalphConfig.useQuery(
    { projectId },
    { enabled: !isNaN(projectId) },
  );

  // Extract configured provider/model for display
  const configuredProvider = ralphConfig?.runner?.provider as RunnerProvider | undefined;
  const configuredModel = ralphConfig?.runner?.model;

  // Apply configured provider as default (once, when config loads)
  useEffect(() => {
    if (ralphConfig && !hasAppliedConfig) {
      const provider = ralphConfig.runner?.provider;
      if (provider === "claude" || provider === "codex" || provider === "gemini" || provider === "ollama") {
        setRunnerProvider(provider);
        setHasAppliedConfig(true);
      }
    }
  }, [ralphConfig, hasAppliedConfig]);

  // Restore provider preference for this project (from localStorage as fallback)
  useEffect(() => {
    if (typeof window === "undefined" || Number.isNaN(projectId)) return;
    // Only use localStorage if no config-based provider was applied
    if (hasAppliedConfig) return;
    const stored = window.localStorage.getItem(
      `ralph.runner-provider.${projectId}`,
    );
    if (stored === "claude" || stored === "codex" || stored === "gemini" || stored === "ollama") {
      setRunnerProvider(stored);
    }
  }, [projectId, hasAppliedConfig]);

  // Drag state
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [overCellId, setOverCellId] = useState<string | null>(null);

  // Confirmation dialog state
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  // Modal state
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logModalStory, setLogModalStory] = useState<Story | null>(null);

  // Run single story dialog state
  const [runSingleStoryTarget, setRunSingleStoryTarget] = useState<Story | null>(
    null,
  );
  const [isRunSingleStoryDialogOpen, setIsRunSingleStoryDialogOpen] =
    useState(false);

  // Archive dialog state
  const [archiveTarget, setArchiveTarget] = useState<Story | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);

  // Configure sensors with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
  );

  // Fetch project data
  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !isNaN(projectId) },
  );

  // Fetch stories
  const {
    data: stories = [],
    isLoading: isLoadingStories,
    error: storiesError,
  } = trpc.stories.listByProject.useQuery(
    { projectId },
    { enabled: !isNaN(projectId), staleTime: 10000 },
  );

  // Fetch runner status
  const { data: runnerState } = trpc.runner.getStatus.useQuery(
    { projectId, provider: runnerProvider },
    { enabled: !isNaN(projectId), refetchInterval: 3000 },
  );

  // Track if this component triggered the last update (to avoid refetching our own changes)
  const lastOwnUpdateRef = useRef<number>(0);

  // WebSocket for real-time prd.json updates
  const { subscribe, unsubscribe, isConnected } = useWebSocket({
    onStoriesUpdated: useCallback(
      (data: { projectId: string }) => {
        // Only invalidate if this is for our project
        if (data.projectId === String(projectId)) {
          // Skip if we just made an update ourselves (within 500ms)
          const timeSinceOwnUpdate = Date.now() - lastOwnUpdateRef.current;
          if (timeSinceOwnUpdate < 500) {
            console.log("[Kanban] Skipping refetch - own update");
            return;
          }
          console.log(
            "[Kanban] Stories updated via file watcher, invalidating cache",
          );
          utils.stories.listByProject.invalidate({ projectId });
        }
      },
      [projectId, utils],
    ),
    onRunnerCompleted: useCallback(
      (data: { projectId: string }) => {
        // Only invalidate if this is for our project
        if (data.projectId === String(projectId)) {
          console.log("[Kanban] Runner completed, invalidating stories cache");
          utils.stories.listByProject.invalidate({ projectId });
          utils.runner.getStatus.invalidate();
        }
      },
      [projectId, utils],
    ),
  });

  // Subscribe to project updates when component mounts
  useEffect(() => {
    if (isConnected && !isNaN(projectId)) {
      const projectIdStr = String(projectId);
      subscribe(projectIdStr);
      console.log(`[Kanban] Subscribed to project ${projectIdStr} updates`);
      return () => {
        unsubscribe(projectIdStr);
        console.log(
          `[Kanban] Unsubscribed from project ${projectIdStr} updates`,
        );
      };
    }
  }, [isConnected, projectId, subscribe, unsubscribe]);

  // Mutations
  const startRunner = trpc.runner.start.useMutation({
    onSuccess: (data) => {
      utils.runner.getStatus.invalidate();
      toast.success(`Runner (${data.provider}) started successfully`);
    },
    onError: (error) => {
      toast.error("Failed to start runner", {
        description: getRunnerErrorMessage(error),
      });
    },
  });

  const stopRunner = trpc.runner.stop.useMutation({
    onSuccess: () => {
      utils.runner.getStatus.invalidate();
      toast.success("Runner stopped successfully");
    },
    onError: (error) => {
      toast.error("Failed to stop runner", {
        description: getRunnerErrorMessage(error),
      });
    },
  });

  // Mutation for persisting provider selection to ralph.config.json
  const updateRalphConfig = trpc.projects.updateRalphConfig.useMutation({
    onError: (error) => {
      toast.error("Kon provider niet opslaan", {
        description: error instanceof Error ? error.message : "Onbekende fout",
      });
    },
    onSuccess: () => {
      utils.projects.getRalphConfig.invalidate({ projectId });
    },
  });

  // Mutation for starting a single story
  const startSingleStory = trpc.runner.start.useMutation({
    onSuccess: (data) => {
      utils.runner.getStatus.invalidate();
      const storyId = runSingleStoryTarget?.id;
      toast.success(`Runner gestart voor ${storyId}`, {
        description: `Provider: ${data.provider}, auto-restart: OFF`,
      });
      setIsRunSingleStoryDialogOpen(false);
      setRunSingleStoryTarget(null);
    },
    onError: (error) => {
      toast.error("Failed to start runner", {
        description: getRunnerErrorMessage(error),
      });
    },
  });

  // Status update mutation with optimistic updates
  const updateStatus = trpc.stories.updateStatus.useMutation({
    onMutate: async ({ storyId, status }) => {
      // Mark the timestamp of our own update to avoid duplicate refetch from file watcher
      lastOwnUpdateRef.current = Date.now();

      // Cancel any outgoing refetches
      await utils.stories.listByProject.cancel({ projectId });

      // Snapshot the previous value
      const previousStories = utils.stories.listByProject.getData({
        projectId,
      });

      // Optimistically update the cache
      utils.stories.listByProject.setData({ projectId }, (old) => {
        if (!old) return old;
        return old.map((story) =>
          story.id === storyId ? { ...story, status } : story,
        );
      });

      // Return the context with the previous value
      return { previousStories };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousStories) {
        utils.stories.listByProject.setData(
          { projectId },
          context.previousStories,
        );
      }
      toast.error("Failed to update status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (updatedStory) => {
      const targetColumn = KANBAN_COLUMNS.find(
        (c) => getTargetStatusForColumn(c.id) === updatedStory.status,
      );
      toast.success("Story status updated", {
        description: `${updatedStory.id} moved to ${targetColumn?.title ?? updatedStory.status}`,
      });
    },
    onSettled: () => {
      // Invalidate to refetch and ensure consistency
      utils.stories.listByProject.invalidate({ projectId });
    },
  });

  // Archive single story mutation with optimistic updates
  const archiveStory = trpc.archive.archiveStory.useMutation({
    onMutate: async ({ storyId }) => {
      // Mark the timestamp of our own update to avoid duplicate refetch from file watcher
      lastOwnUpdateRef.current = Date.now();

      // Cancel any outgoing refetches
      await utils.stories.listByProject.cancel({ projectId });

      // Snapshot the previous value
      const previousStories = utils.stories.listByProject.getData({
        projectId,
      });

      // Optimistically remove the story from the list
      utils.stories.listByProject.setData({ projectId }, (old) => {
        if (!old) return old;
        return old.filter((story) => story.id !== storyId);
      });

      // Return the context with the previous value
      return { previousStories };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousStories) {
        utils.stories.listByProject.setData(
          { projectId },
          context.previousStories,
        );
      }
      toast.error("Failed to archive story", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (result) => {
      const depCleanupText = result.cleanedDependencies > 0
        ? `, ${result.cleanedDependencies} ${result.cleanedDependencies === 1 ? 'dependency' : 'dependencies'} opgeschoond`
        : '';
      const isUpdate = result.action === 'updated';
      const title = isUpdate ? "Story bijgewerkt" : "Story gearchiveerd";
      const description = isUpdate
        ? `${result.id} archief timestamp bijgewerkt${depCleanupText}`
        : `${result.id} is verplaatst naar het archief${depCleanupText}`;
      toast.success(title, { description });
      setIsArchiveDialogOpen(false);
      setArchiveTarget(null);
    },
    onSettled: () => {
      // Invalidate to refetch and ensure consistency
      utils.stories.listByProject.invalidate({ projectId });
    },
  });

  // Bulk archive mutation with optimistic updates
  const bulkArchive = trpc.archive.archiveMultiple.useMutation({
    onMutate: async ({ storyIds }) => {
      // Mark the timestamp of our own update to avoid duplicate refetch from file watcher
      lastOwnUpdateRef.current = Date.now();

      // Cancel any outgoing refetches
      await utils.stories.listByProject.cancel({ projectId });

      // Snapshot the previous value
      const previousStories = utils.stories.listByProject.getData({
        projectId,
      });

      // Optimistically remove the stories from the list
      utils.stories.listByProject.setData({ projectId }, (old) => {
        if (!old) return old;
        return old.filter((story) => !storyIds.includes(story.id));
      });

      // Return the context with the previous value
      return { previousStories };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousStories) {
        utils.stories.listByProject.setData(
          { projectId },
          context.previousStories,
        );
      }
      toast.error("Failed to archive stories", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (result) => {
      const archivedCount = result.archived.length;
      const updatedCount = result.updated?.length ?? 0;
      const depCleanupText = result.cleanedDependencies > 0
        ? `, ${result.cleanedDependencies} ${result.cleanedDependencies === 1 ? 'dependency' : 'dependencies'} opgeschoond`
        : '';

      // Build description based on what happened
      const parts: string[] = [];
      if (archivedCount > 0) {
        parts.push(`${archivedCount} ${archivedCount === 1 ? "story" : "stories"} gearchiveerd`);
      }
      if (updatedCount > 0) {
        parts.push(`${updatedCount} ${updatedCount === 1 ? "story" : "stories"} bijgewerkt`);
      }

      toast.success("Stories verwerkt", {
        description: `${parts.join(", ")}${depCleanupText}`,
      });
      if (result.errors && result.errors.length > 0) {
        toast.warning("Some stories could not be archived", {
          description: result.errors.join("; "),
        });
      }
      setIsBulkArchiveDialogOpen(false);
    },
    onSettled: () => {
      // Invalidate to refetch and ensure consistency
      utils.stories.listByProject.invalidate({ projectId });
    },
  });

  // Compute stats and grouped EPICs
  const stats = computeProjectStats(stories);
  const runnerStatus: RunnerStatus = runnerState?.status ?? "idle";
  const hasFailedStories = stories.some((s) => s.status === "failed");

  // Group stories by EPIC
  const epics = useMemo(() => groupStoriesByEpic(stories), [stories]);

  // Manage collapsed EPIC state
  const {
    toggleEpic,
    isCollapsed,
    expandAll,
    collapseAll,
    autoCollapseCompleted,
    areAllCollapsed,
    areAllExpanded,
  } = useCollapsedEpics(projectId, epics);

  // Filter columns: only show 'failed' column if there are failed stories
  const visibleColumns = useMemo(
    () =>
      KANBAN_COLUMNS.filter((col) => col.id !== "failed" || hasFailedStories),
    [hasFailedStories],
  );

  // Check if any EPIC has all stories done (for auto-collapse button visibility)
  const hasCompletedEpics = useMemo(
    () =>
      epics.some(
        (epic) =>
          epic.stories.length > 0 &&
          epic.stories.every((s) => s.status === "done"),
      ),
    [epics],
  );

  // Handle runner start/stop
  const handleStartRunner = () => {
    startRunner.mutate({ projectId, provider: runnerProvider });
  };

  const handleStopRunner = () => {
    stopRunner.mutate({ projectId });
  };

  const handleRunnerProviderChange = (provider: RunnerProvider) => {
    setRunnerProvider(provider);

    // Persist naar ralph.config.json (behoud bestaande model/baseUrl)
    const newConfig: RalphConfig = {
      runner: {
        provider,
        ...(ralphConfig?.runner?.model && { model: ralphConfig.runner.model }),
        ...(ralphConfig?.runner?.baseUrl && { baseUrl: ralphConfig.runner.baseUrl }),
      },
    };
    updateRalphConfig.mutate({ projectId, config: newConfig });

    // localStorage als fallback
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `ralph.runner-provider.${projectId}`,
        provider,
      );
    }
  };

  // Handle story click - opens log modal for in-progress, detail modal for others
  const handleStoryClick = useCallback((story: Story) => {
    if (story.status === "in_progress") {
      // Open runner log modal for in-progress stories
      setLogModalStory(story);
      setIsLogModalOpen(true);
    } else {
      // Open detail modal for other stories
      setSelectedStory(story);
      setIsDetailModalOpen(true);
    }
  }, []);

  // Handle modal close
  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    // Keep selectedStory for exit animation, clear after modal is hidden
    setTimeout(() => setSelectedStory(null), 200);
  }, []);

  // Handle log modal close
  const handleCloseLogModal = useCallback(() => {
    setIsLogModalOpen(false);
    // Keep logModalStory for exit animation, clear after modal is hidden
    setTimeout(() => setLogModalStory(null), 200);
  }, []);

  // Handle play button click on story card
  const handlePlayStoryClick = useCallback((story: Story) => {
    setRunSingleStoryTarget(story);
    setIsRunSingleStoryDialogOpen(true);
  }, []);

  // Handle confirm run single story
  const handleConfirmRunSingleStory = useCallback(() => {
    if (!runSingleStoryTarget) return;
    startSingleStory.mutate({
      projectId,
      storyId: runSingleStoryTarget.id,
      provider: runnerProvider,
      singleStoryMode: true,
    });
  }, [runSingleStoryTarget, projectId, runnerProvider, startSingleStory]);

  // Handle cancel run single story
  const handleCancelRunSingleStory = useCallback(() => {
    setIsRunSingleStoryDialogOpen(false);
    setRunSingleStoryTarget(null);
  }, []);

  // Handle archive button click on story card
  const handleArchiveStoryClick = useCallback((story: Story) => {
    setArchiveTarget(story);
    setIsArchiveDialogOpen(true);
  }, []);

  // Handle confirm archive single story
  const handleConfirmArchive = useCallback(() => {
    if (!archiveTarget) return;
    archiveStory.mutate({
      projectId,
      storyId: archiveTarget.id,
    });
  }, [archiveTarget, projectId, archiveStory]);

  // Handle cancel archive
  const handleCancelArchive = useCallback(() => {
    setIsArchiveDialogOpen(false);
    setArchiveTarget(null);
  }, []);

  // Get done stories for bulk archive
  const doneStories = useMemo(
    () => stories.filter((s) => s.status === "done"),
    [stories],
  );

  // Handle confirm bulk archive
  const handleConfirmBulkArchive = useCallback(() => {
    if (doneStories.length === 0) return;
    bulkArchive.mutate({
      projectId,
      storyIds: doneStories.map((s) => s.id),
    });
  }, [doneStories, projectId, bulkArchive]);

  // Handle cancel bulk archive
  const handleCancelBulkArchive = useCallback(() => {
    setIsBulkArchiveDialogOpen(false);
  }, []);

  // Drag handlers - adapted for matrix layout
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const story = stories.find((s) => s.id === event.active.id);
      if (story) {
        setActiveStory(story);
      }
    },
    [stories],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      // For matrix layout, over.id is "epicName:columnId"
      setOverCellId(over.id as string);
    } else {
      setOverCellId(null);
    }
  }, []);

  // Execute a status change
  const executeStatusChange = useCallback(
    (story: Story, targetColumnId: string) => {
      const targetStatus = getTargetStatusForColumn(targetColumnId);
      if (!targetStatus) return;

      // If status is the same (e.g., backlog to todo), no API call needed
      if (story.status === targetStatus) {
        toast.info("Story moved", {
          description: `${story.id} is already in ${targetStatus} status`,
        });
        return;
      }

      // Make the API call
      updateStatus.mutate({
        projectId,
        storyId: story.id,
        status: targetStatus,
      });
    },
    [projectId, updateStatus],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveStory(null);
      setOverCellId(null);

      if (!over || !active) return;

      const story = stories.find((s) => s.id === active.id);
      if (!story) return;

      // Parse cellId to extract columnId (format: "epicName:columnId")
      const cellId = over.id as string;
      const parts = cellId.split(":");
      const targetColumnId = parts[parts.length - 1];
      const sourceColumnId = getColumnForStory(story, stories);

      // If dropped on the same column, do nothing
      if (sourceColumnId === targetColumnId) return;

      // Check if the drop is valid
      if (!canDropInColumn(story, targetColumnId, stories)) {
        // Invalid drop - the visual feedback already showed this was not allowed
        return;
      }

      // Check for unmet dependencies when moving to todo
      const unmetDeps = getUnmetDependencies(story, stories);
      if (targetColumnId === "todo" && unmetDeps.length > 0) {
        // Show confirmation dialog
        setPendingDrop({
          story,
          targetColumnId,
          unmetDependencies: unmetDeps,
        });
        setIsConfirmDialogOpen(true);
        return;
      }

      // Execute the status change
      executeStatusChange(story, targetColumnId);
    },
    [stories, executeStatusChange],
  );

  // Handle confirmation dialog confirm
  const handleConfirmDrop = useCallback(() => {
    if (!pendingDrop) return;

    executeStatusChange(pendingDrop.story, pendingDrop.targetColumnId);
    setIsConfirmDialogOpen(false);
    setPendingDrop(null);
  }, [pendingDrop, executeStatusChange]);

  // Handle confirmation dialog cancel
  const handleCancelDrop = useCallback(() => {
    setIsConfirmDialogOpen(false);
    setPendingDrop(null);
  }, []);

  // Calculate if current drag can drop in a cell
  const canDropActiveStory = useCallback(
    (cellId: string): boolean => {
      if (!activeStory) return false;
      // Parse cellId to get columnId (format: "epicName:columnId")
      const parts = cellId.split(":");
      const columnId = parts[parts.length - 1];
      return canDropInColumn(activeStory, columnId, stories);
    },
    [activeStory, stories],
  );

  // Loading state
  if (isLoadingProject || isLoadingStories) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state - project not found (handled by layout)
  if (projectError || !project) {
    return null;
  }

  // Helper to parse prd.json error messages
  const getPrdErrorMessage = (
    error: unknown,
  ): { title: string; description: string } => {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not found") || message.includes("NOT_FOUND")) {
      return {
        title: "prd.json niet gevonden",
        description: `Zorg ervoor dat er een prd.json bestand bestaat in ${project.path}/stories/`,
      };
    }
    if (
      message.includes("Invalid prd.json format") ||
      message.includes("BAD_REQUEST")
    ) {
      // Extract the specific validation error if present
      const match = message.match(/Invalid prd.json format: (.+)/);
      return {
        title: "Ongeldig prd.json formaat",
        description:
          match?.[1] ||
          "Het prd.json bestand bevat ongeldige data. Controleer de structuur en waarden.",
      };
    }
    return {
      title: "Kan stories niet laden",
      description:
        message ||
        "Er is een onbekende fout opgetreden bij het laden van de stories.",
    };
  };

  // Error state - stories/prd.json error
  if (storiesError) {
    const { title, description } = getPrdErrorMessage(storiesError);
    return (
      <div className="p-6">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>
            <p>{description}</p>
            <p className="mt-2 text-xs font-mono opacity-75">
              {project.path}/stories/prd.json
            </p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        {/* Toolbar with runner controls and stats */}
        <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-6 py-3">
            {/* Runner controls and stats in same row */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <StatsBar
                stats={stats}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                onAutoCollapseCompleted={autoCollapseCompleted}
                areAllExpanded={areAllExpanded}
                areAllCollapsed={areAllCollapsed}
                showCollapseControls={!isMobile && epics.length > 0}
                hasCompletedEpics={hasCompletedEpics}
              />
              <KanbanRunnerControls
                projectId={projectId}
                runnerStatus={runnerStatus}
                selectedProvider={runnerProvider}
                activeProvider={
                  runnerState?.provider as RunnerProvider | undefined
                }
                currentStoryId={runnerState?.storyId}
                configuredProvider={configuredProvider}
                configuredModel={configuredModel}
                onProviderChange={handleRunnerProviderChange}
                onStart={handleStartRunner}
                onStop={handleStopRunner}
                isStarting={startRunner.isPending}
                isStopping={stopRunner.isPending}
              />
            </div>
          </div>
        </div>

        {/* Kanban Matrix or Mobile Accordion */}
        <div className="flex-1" data-testid="kanban-board">
          {isMobile ? (
            /* Mobile: EPIC accordion view */
            <div className="p-4">
              <MobileEpicAccordion
                epics={epics}
                columns={visibleColumns}
                allStories={stories}
                overCellId={overCellId}
                canDropActiveStory={canDropActiveStory}
                onStoryClick={handleStoryClick}
                runnerStatus={runnerStatus}
                onPlayClick={handlePlayStoryClick}
                onArchiveClick={handleArchiveStoryClick}
              />
            </div>
          ) : (
            /* Desktop: Matrix layout */
            <div>
              {/* Column headers */}
              <MatrixColumnHeader
                columns={visibleColumns}
                hasFailedStories={hasFailedStories}
              />

              {/* EPIC rows */}
              <div className="p-4 space-y-3">
                {epics.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Geen stories gevonden</p>
                    <p className="text-sm mt-1">Voeg stories toe via Brainstorm of bewerk prd.json</p>
                  </div>
                ) : (
                  epics.map((epic) => (
                    <EpicRow
                      key={epic.name}
                      epic={epic}
                      columns={visibleColumns}
                      allStories={stories}
                      overCellId={overCellId}
                      canDropActiveStory={canDropActiveStory}
                      onStoryClick={handleStoryClick}
                      runnerStatus={runnerStatus}
                      onPlayClick={handlePlayStoryClick}
                      onArchiveClick={handleArchiveStoryClick}
                      isCollapsed={isCollapsed(epic.name)}
                      onToggleCollapse={() => toggleEpic(epic.name)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeStory && <DragOverlayContent story={activeStory} />}
      </DragOverlay>

      {/* Story detail modal */}
      <StoryDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        projectId={projectId}
        story={selectedStory}
        allStories={stories}
      />

      {/* Runner log modal */}
      <RunnerLogModal
        isOpen={isLogModalOpen}
        onClose={handleCloseLogModal}
        projectId={projectId}
        story={logModalStory}
      />

      {/* Dependency confirmation dialog */}
      <DependencyConfirmDialog
        isOpen={isConfirmDialogOpen}
        story={pendingDrop?.story ?? null}
        unmetDependencies={pendingDrop?.unmetDependencies ?? []}
        targetColumnTitle={
          KANBAN_COLUMNS.find((c) => c.id === pendingDrop?.targetColumnId)
            ?.title ?? ""
        }
        onConfirm={handleConfirmDrop}
        onCancel={handleCancelDrop}
        isLoading={updateStatus.isPending}
      />

      {/* Run single story confirmation dialog */}
      <RunSingleStoryDialog
        isOpen={isRunSingleStoryDialogOpen}
        story={runSingleStoryTarget}
        allStories={stories}
        onConfirm={handleConfirmRunSingleStory}
        onCancel={handleCancelRunSingleStory}
        isLoading={startSingleStory.isPending}
      />

      {/* Archive single story confirmation dialog */}
      <ArchiveConfirmDialog
        isOpen={isArchiveDialogOpen}
        story={archiveTarget}
        onConfirm={handleConfirmArchive}
        onCancel={handleCancelArchive}
        isLoading={archiveStory.isPending}
      />

      {/* Bulk archive confirmation dialog */}
      <BulkArchiveConfirmDialog
        isOpen={isBulkArchiveDialogOpen}
        storyCount={doneStories.length}
        onConfirm={handleConfirmBulkArchive}
        onCancel={handleCancelBulkArchive}
        isLoading={bulkArchive.isPending}
      />
    </DndContext>
  );
}

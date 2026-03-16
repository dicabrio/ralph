import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useMemo, useId } from "react";
import {
  Loader2,
  Archive,
  AlertCircle,
  Search,
  Filter,
  CheckCircle2,
  ClipboardCheck,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ArchivedStory } from "@/lib/schemas/prdSchema";

// Custom hook for debounced value
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  // biome-ignore lint/correctness/useExhaustiveDependencies: delay is intentionally excluded
  useMemo(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value]);

  return debouncedValue;
}

export const Route = createFileRoute("/project/$id/archive")({
  component: ArchivePage,
});

/**
 * Format a relative timestamp from an ISO date string
 * Returns strings like '2 dagen geleden', '1 week geleden'
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return "zojuist";
  if (diffMinutes < 60)
    return `${diffMinutes} ${diffMinutes === 1 ? "minuut" : "minuten"} geleden`;
  if (diffHours < 24)
    return `${diffHours} ${diffHours === 1 ? "uur" : "uur"} geleden`;
  if (diffDays < 7)
    return `${diffDays} ${diffDays === 1 ? "dag" : "dagen"} geleden`;
  if (diffWeeks < 4)
    return `${diffWeeks} ${diffWeeks === 1 ? "week" : "weken"} geleden`;
  return `${diffMonths} ${diffMonths === 1 ? "maand" : "maanden"} geleden`;
}

// ArchivedStoryCard component
interface ArchivedStoryCardProps {
  story: ArchivedStory;
  onClick: (story: ArchivedStory) => void;
}

function ArchivedStoryCard({ story, onClick }: ArchivedStoryCardProps) {
  return (
    <Card
      onClick={() => onClick(story)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(story);
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "py-3 gap-2 shadow-sm transition-all cursor-pointer",
        "hover:shadow-md hover:border-primary/30",
      )}
      data-testid={`archived-story-card-${story.id}`}
    >
      <CardHeader className="py-0">
        {/* Header row: story ID and priority badge */}
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-xs font-mono text-muted-foreground"
            data-testid="story-id"
          >
            {story.id}
          </span>
          <div className="flex items-center gap-1.5">
            {/* Priority badge */}
            <Badge variant="default" data-testid="priority-badge">
              P{story.priority}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-0">
        {/* Title */}
        <h4
          className="text-sm font-medium text-foreground line-clamp-2"
          data-testid="story-title"
        >
          {story.title}
        </h4>

        {/* Epic label */}
        <p
          className="text-xs text-muted-foreground mt-1 line-clamp-1"
          data-testid="story-epic"
        >
          {story.epic}
        </p>

        {/* Footer: archived timestamp */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Archive className="w-3.5 h-3.5" />
            <span data-testid="archived-at">
              {formatRelativeTime(story.archivedAt)}
            </span>
          </div>
          {(story.acceptanceCriteria?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>{story.acceptanceCriteria?.length ?? 0} criteria</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Story detail modal (read-only version)
interface StoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: ArchivedStory | null;
}

function StoryDetailModal({ isOpen, onClose, story }: StoryDetailModalProps) {
  if (!story) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="story-detail-modal"
      >
        <DialogHeader className="flex-shrink-0 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted-foreground">
              {story.id}
            </span>
            <Badge variant="default">P{story.priority}</Badge>
            <Badge variant="secondary">
              <Archive className="w-3 h-3" />
              Archived
            </Badge>
          </div>
          <DialogTitle className="line-clamp-2">{story.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Archived {formatRelativeTime(story.archivedAt)}
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 py-5">
          <div className="space-y-6 pr-4">
            {/* Description */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Description
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {story.description}
              </p>
            </section>

            {/* Epic */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Epic
              </h3>
              <span className="inline-flex text-sm px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                {story.epic}
              </span>
            </section>

            {/* Acceptance Criteria */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Acceptance Criteria
              </h3>
              {(story.acceptanceCriteria?.length ?? 0) > 0 ? (
                <ul className="space-y-2">
                  {story.acceptanceCriteria.map((criterion) => (
                    <li
                      key={criterion}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No acceptance criteria defined
                </p>
              )}
            </section>

            {/* Dependencies */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Dependencies
              </h3>
              {(story.dependencies?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {story.dependencies.map((depId) => (
                    <span
                      key={depId}
                      className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-muted text-muted-foreground"
                    >
                      {depId}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No dependencies
                </p>
              )}
            </section>

            {/* Recommended Skills */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Recommended Skills
              </h3>
              {(story.recommendedSkills?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {story.recommendedSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center text-sm px-2.5 py-1 rounded-full bg-primary/10 text-primary"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No skills assigned
                </p>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Empty state component for no archived stories
interface EmptyStateProps {
  projectId: string;
  hasFilters: boolean;
}

function EmptyState({ projectId, hasFilters }: EmptyStateProps) {
  if (hasFilters) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16"
        data-testid="empty-state-filtered"
      >
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          No matching stories
        </h2>
        <p className="text-muted-foreground text-center max-w-md">
          No archived stories match your search criteria. Try adjusting your
          filters.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center py-16"
      data-testid="empty-state"
    >
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
        <Archive className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        No archived stories
      </h2>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Stories that have been completed and archived will appear here. Archive
        completed stories from the Kanban board.
      </p>
      <Link
        to="/project/$id/kanban"
        params={{ id: projectId }}
        className="text-sm text-primary hover:underline"
      >
        Go to Kanban board
      </Link>
    </div>
  );
}

/**
 * Filter archived stories based on search term and epic filter
 */
export function filterArchivedStories(
  stories: ArchivedStory[],
  searchTerm: string,
  epicFilter: string,
): ArchivedStory[] {
  const lowerSearch = searchTerm.toLowerCase().trim();

  return stories.filter((story) => {
    // Epic filter
    if (epicFilter && epicFilter !== "all" && story.epic !== epicFilter) {
      return false;
    }

    // Search filter (in id, title, description)
    if (lowerSearch) {
      const matchesId = story.id.toLowerCase().includes(lowerSearch);
      const matchesTitle = story.title.toLowerCase().includes(lowerSearch);
      const matchesDescription = story.description
        .toLowerCase()
        .includes(lowerSearch);

      if (!matchesId && !matchesTitle && !matchesDescription) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort archived stories by archivedAt (newest first)
 */
export function sortArchivedStories(
  stories: ArchivedStory[],
): ArchivedStory[] {
  return [...stories].sort(
    (a, b) =>
      new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime(),
  );
}

/**
 * Get unique epics from archived stories
 */
export function getUniqueEpics(stories: ArchivedStory[]): string[] {
  const epics = new Set(stories.map((s) => s.epic));
  return Array.from(epics).sort();
}

function ArchivePage() {
  const { id } = Route.useParams();
  const projectId = Number.parseInt(id, 10);
  const searchInputId = useId();

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [epicFilter, setEpicFilter] = useState<string>("all");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Modal state
  const [selectedStory, setSelectedStory] = useState<ArchivedStory | null>(
    null,
  );
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Fetch project data
  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !Number.isNaN(projectId) },
  );

  // Fetch archived stories
  const {
    data: archivedStories = [],
    isLoading: isLoadingArchive,
    error: archiveError,
  } = trpc.archive.listByProject.useQuery(
    { projectId },
    { enabled: !Number.isNaN(projectId), staleTime: 30000 },
  );

  // Get unique epics for filter dropdown
  const uniqueEpics = useMemo(
    () => getUniqueEpics(archivedStories),
    [archivedStories],
  );

  // Filter and sort stories
  const filteredStories = useMemo(() => {
    const filtered = filterArchivedStories(
      archivedStories,
      debouncedSearchTerm,
      epicFilter,
    );
    return sortArchivedStories(filtered);
  }, [archivedStories, debouncedSearchTerm, epicFilter]);

  // Check if filters are active
  const hasActiveFilters = debouncedSearchTerm.trim() !== "" || epicFilter !== "all";

  // Handle story click
  const handleStoryClick = useCallback((story: ArchivedStory) => {
    setSelectedStory(story);
    setIsDetailModalOpen(true);
  }, []);

  // Handle close detail modal
  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setTimeout(() => setSelectedStory(null), 200);
  }, []);

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
  }, []);

  // Handle clear filters
  const handleClearFilters = useCallback(() => {
    setSearchTerm("");
    setEpicFilter("all");
  }, []);

  // Loading state
  if (isLoadingProject || isLoadingArchive) {
    return (
      <div
        className="flex items-center justify-center py-16"
        data-testid="loading-state"
      >
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state - project not found (handled by layout)
  if (projectError || !project) {
    return null;
  }

  // Error state - archive error
  if (archiveError) {
    return (
      <div className="p-6" data-testid="archive-error-state">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Failed to load archive
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            {archiveError instanceof Error
              ? archiveError.message
              : "An unexpected error occurred"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Search and filter toolbar */}
      {archivedStories.length > 0 && (
        <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search input */}
            <div className="relative flex-1 max-w-sm min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id={searchInputId}
                type="text"
                placeholder="Search in ID, title, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-8"
                data-testid="search-input"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>

            {/* Epic filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select
                value={epicFilter}
                onValueChange={setEpicFilter}
              >
                <SelectTrigger
                  className="w-[180px]"
                  data-testid="epic-filter"
                >
                  <SelectValue placeholder="All epics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All epics</SelectItem>
                  {uniqueEpics.map((epic) => (
                    <SelectItem key={epic} value={epic}>
                      {epic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-muted-foreground"
                data-testid="clear-filters"
              >
                <X className="w-4 h-4" />
                Clear filters
              </Button>
            )}

            {/* Results count */}
            <span className="text-sm text-muted-foreground ml-auto">
              {hasActiveFilters
                ? `${filteredStories.length} of ${archivedStories.length} stories`
                : `${archivedStories.length} archived`}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6" data-testid="archive-board">
        {archivedStories.length === 0 ? (
          <EmptyState projectId={id} hasFilters={false} />
        ) : filteredStories.length === 0 ? (
          <EmptyState projectId={id} hasFilters={true} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-6xl">
            {filteredStories.map((story) => (
              <ArchivedStoryCard
                key={story.id}
                story={story}
                onClick={handleStoryClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Story detail modal (read-only) */}
      <StoryDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        story={selectedStory}
      />
    </>
  );
}

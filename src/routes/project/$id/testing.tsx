import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useMemo, useId } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Story, StoryStatus } from "@/components/StoryCard";

export const Route = createFileRoute("/project/$id/testing")({
  component: TestingBoard,
});

// TestStoryCard component for stories in review
interface TestStoryCardProps {
  story: Story;
  onAccept: (story: Story) => void;
  onReject: (story: Story) => void;
  onClick: (story: Story) => void;
  isAccepting: boolean;
  isRejecting: boolean;
}

function TestStoryCard({
  story,
  onAccept,
  onReject,
  onClick,
  isAccepting,
  isRejecting,
}: TestStoryCardProps) {
  const isProcessing = isAccepting || isRejecting;

  return (
    <Card
      className={cn(
        "py-3 gap-2 shadow-sm transition-all",
        "hover:shadow-md hover:border-primary/30",
        isProcessing && "opacity-60",
      )}
      data-testid={`test-story-card-${story.id}`}
    >
      <CardHeader className="py-0">
        {/* Header row: story ID, priority badge, and action buttons */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono text-muted-foreground"
              data-testid="story-id"
            >
              {story.id}
            </span>
            <Badge variant="default" data-testid="priority-badge">
              P{story.priority}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {/* View button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onClick(story);
              }}
              disabled={isProcessing}
              className="h-7 w-7"
              aria-label="View details"
              data-testid={`view-story-${story.id}`}
            >
              <Eye className="w-4 h-4" />
            </Button>
            {/* Reject button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onReject(story);
              }}
              disabled={isProcessing}
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              aria-label="Reject story"
              data-testid={`reject-story-${story.id}`}
            >
              {isRejecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
            </Button>
            {/* Accept button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onAccept(story);
              }}
              disabled={isProcessing}
              className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              aria-label="Accept story"
              data-testid={`accept-story-${story.id}`}
            >
              {isAccepting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </Button>
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

        {/* Acceptance criteria count */}
        {story.acceptanceCriteria.length > 0 && (
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>{story.acceptanceCriteria.length} criteria</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// RejectDialog component
interface RejectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story | null;
  onConfirm: (status: "failed" | "in_progress") => void;
  isLoading: boolean;
}

function RejectDialog({
  isOpen,
  onClose,
  story,
  onConfirm,
  isLoading,
}: RejectDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<
    "failed" | "in_progress"
  >("failed");
  const [reason, setReason] = useState("");
  const reasonId = useId();

  // Reset state when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    } else {
      setSelectedStatus("failed");
      setReason("");
    }
  };

  if (!story) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="reject-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <XCircle className="w-5 h-5" />
            Reject Story
          </DialogTitle>
          <DialogDescription>
            Choose how to handle <strong>{story.id}</strong> - {story.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status selection */}
          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-sm font-medium text-foreground mb-2">
              Move to:
            </legend>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={selectedStatus === "failed" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("failed")}
                className={cn(
                  selectedStatus === "failed" &&
                    "bg-red-600 hover:bg-red-700 text-white",
                )}
                data-testid="select-failed"
              >
                <AlertCircle className="w-4 h-4" />
                Failed
              </Button>
              <Button
                type="button"
                variant={
                  selectedStatus === "in_progress" ? "default" : "outline"
                }
                size="sm"
                onClick={() => setSelectedStatus("in_progress")}
                className={cn(
                  selectedStatus === "in_progress" &&
                    "bg-blue-600 hover:bg-blue-700 text-white",
                )}
                data-testid="select-in-progress"
              >
                <ArrowRight className="w-4 h-4" />
                In Progress
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedStatus === "failed"
                ? "Mark as failed - needs to be completely redone"
                : "Move back to in progress - needs more work"}
            </p>
          </fieldset>

          {/* Optional reason */}
          <div className="space-y-2">
            <label
              htmlFor={reasonId}
              className="text-sm font-medium text-foreground"
            >
              Reason (optional)
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being rejected?"
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="reject-reason"
            />
            <p className="text-xs text-muted-foreground">
              This is for your reference only and won't be saved.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            data-testid="reject-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(selectedStatus)}
            disabled={isLoading}
            data-testid="reject-confirm"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// StoryDetailModal (read-only version for testing page)
interface StoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story | null;
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
            <Badge variant="review">
              <CheckCircle2 className="w-3 h-3" />
              Review
            </Badge>
          </div>
          <DialogTitle className="line-clamp-2">{story.title}</DialogTitle>
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
              {story.acceptanceCriteria.length > 0 ? (
                <ul className="space-y-2">
                  {story.acceptanceCriteria.map((criterion) => (
                    <li
                      key={criterion}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-muted-foreground/50 shrink-0" />
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
              {story.dependencies.length > 0 ? (
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
              {story.recommendedSkills.length > 0 ? (
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

// Empty state component
interface EmptyStateProps {
  projectId: string;
}

function EmptyState({ projectId }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16"
      data-testid="empty-state"
    >
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        No stories to review
      </h2>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        All stories have been reviewed. When the runner completes a story, it
        will appear here for testing.
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

function TestingBoard() {
  const { id } = Route.useParams();
  const projectId = parseInt(id, 10);
  const utils = trpc.useUtils();

  // Modal state
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [storyToReject, setStoryToReject] = useState<Story | null>(null);

  // Track which story is being processed
  const [processingStoryId, setProcessingStoryId] = useState<string | null>(
    null,
  );
  const [processingAction, setProcessingAction] = useState<
    "accept" | "reject" | null
  >(null);

  // Fetch project data
  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !Number.isNaN(projectId) },
  );

  // Fetch stories
  const {
    data: allStories = [],
    isLoading: isLoadingStories,
    error: storiesError,
  } = trpc.stories.listByProject.useQuery(
    { projectId },
    { enabled: !Number.isNaN(projectId), staleTime: 10000 },
  );

  // Filter stories in review status
  const reviewStories = useMemo(
    () =>
      allStories
        .filter((s) => s.status === "review")
        .sort((a, b) => a.priority - b.priority),
    [allStories],
  );

  // Status update mutation with optimistic updates
  const updateStatus = trpc.stories.updateStatus.useMutation({
    onMutate: async ({ storyId, status }) => {
      // Cancel any outgoing refetches
      await utils.stories.listByProject.cancel({ projectId });

      // Snapshot the previous value
      const previousStories = utils.stories.listByProject.getData({
        projectId,
      });

      // Optimistically update the cache - remove the story from the list
      utils.stories.listByProject.setData({ projectId }, (old) => {
        if (!old) return old;
        return old.map((story) =>
          story.id === storyId ? { ...story, status } : story,
        );
      });

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
      toast.error("Failed to update story status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (updatedStory) => {
      const action =
        updatedStory.status === "done" ? "accepted" : "rejected";
      toast.success(`Story ${action}`, {
        description: `${updatedStory.id} moved to ${updatedStory.status}`,
      });
    },
    onSettled: () => {
      // Reset processing state
      setProcessingStoryId(null);
      setProcessingAction(null);
      // Invalidate to refetch and ensure consistency
      utils.stories.listByProject.invalidate({ projectId });
    },
  });

  // Handle accept
  const handleAccept = useCallback(
    (story: Story) => {
      setProcessingStoryId(story.id);
      setProcessingAction("accept");
      updateStatus.mutate({
        projectId,
        storyId: story.id,
        status: "done" as StoryStatus,
      });
    },
    [projectId, updateStatus],
  );

  // Handle reject click (opens dialog)
  const handleRejectClick = useCallback((story: Story) => {
    setStoryToReject(story);
    setIsRejectDialogOpen(true);
  }, []);

  // Handle reject confirm
  const handleRejectConfirm = useCallback(
    (status: "failed" | "in_progress") => {
      if (!storyToReject) return;

      setProcessingStoryId(storyToReject.id);
      setProcessingAction("reject");
      setIsRejectDialogOpen(false);

      updateStatus.mutate({
        projectId,
        storyId: storyToReject.id,
        status: status as StoryStatus,
      });

      setStoryToReject(null);
    },
    [storyToReject, projectId, updateStatus],
  );

  // Handle story click (opens detail modal)
  const handleStoryClick = useCallback((story: Story) => {
    setSelectedStory(story);
    setIsDetailModalOpen(true);
  }, []);

  // Handle close detail modal
  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setTimeout(() => setSelectedStory(null), 200);
  }, []);

  // Handle close reject dialog
  const handleCloseRejectDialog = useCallback(() => {
    setIsRejectDialogOpen(false);
    setTimeout(() => setStoryToReject(null), 200);
  }, []);

  // Loading state
  if (isLoadingProject || isLoadingStories) {
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

  // Error state - stories error
  if (storiesError) {
    return (
      <div className="p-6" data-testid="stories-error-state">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Failed to load stories
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            {storiesError instanceof Error
              ? storiesError.message
              : "An unexpected error occurred"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6" data-testid="testing-board">
        {reviewStories.length === 0 ? (
          <EmptyState projectId={id} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-6xl">
            {reviewStories.map((story) => (
              <TestStoryCard
                key={story.id}
                story={story}
                onAccept={handleAccept}
                onReject={handleRejectClick}
                onClick={handleStoryClick}
                isAccepting={
                  processingStoryId === story.id &&
                  processingAction === "accept"
                }
                isRejecting={
                  processingStoryId === story.id &&
                  processingAction === "reject"
                }
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

      {/* Reject dialog */}
      <RejectDialog
        isOpen={isRejectDialogOpen}
        onClose={handleCloseRejectDialog}
        story={storyToReject}
        onConfirm={handleRejectConfirm}
        isLoading={updateStatus.isPending}
      />
    </>
  );
}

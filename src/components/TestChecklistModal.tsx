import { useState, useCallback, useRef, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  FileText,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { FlowCard } from "@/components/FlowCard";
import type { Story } from "@/components/StoryCard";
import type { TestScenario } from "@/lib/schemas/testScenarioSchema";

// Progress calculation helpers for flows
function calculateTotalProgress(scenario: TestScenario | null | undefined) {
  if (!scenario) return { checked: 0, total: 0, percentage: 0 };
  const total = scenario.flows?.length;
  const checked = scenario.flows?.filter((flow) => flow.checked).length;
  return { checked, total, percentage: total > 0 ? (checked / total) * 100 : 0 };
}

function isAllChecked(scenario: TestScenario | null | undefined) {
  if (!scenario) return false;
  return scenario.flows?.every((flow) => flow.checked);
}

export interface TestChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story | null;
  projectId: number;
  onAccept: (story: Story) => void;
  onReject: (story: Story) => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
}

export function TestChecklistModal({
  isOpen,
  onClose,
  story,
  projectId,
  onAccept,
  onReject,
  isAccepting = false,
  isRejecting = false,
}: TestChecklistModalProps) {
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const isProcessing = isAccepting || isRejecting;
  const utils = trpc.useUtils();

  // Fetch test scenario for this story
  const { data: scenario, isLoading: isLoadingScenario } =
    trpc.testScenarios.getByStoryId.useQuery(
      { projectId, storyId: story?.id ?? "" },
      { enabled: isOpen && !!story, staleTime: 30000 }
    );

  // Check if scenario exists (for loading vs empty state)
  const { data: scenarioExists } = trpc.testScenarios.exists.useQuery(
    { projectId, storyId: story?.id ?? "" },
    { enabled: isOpen && !!story, staleTime: 60000 }
  );

  // Save scroll position before update
  const saveScrollPosition = useCallback(() => {
    const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollArea) {
      scrollPositionRef.current = scrollArea.scrollTop;
    }
  }, []);

  // Restore scroll position after update
  const restoreScrollPosition = useCallback(() => {
    const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollArea) {
      scrollArea.scrollTop = scrollPositionRef.current;
    }
  }, []);

  // Update flow mutation with optimistic updates
  const updateFlow = trpc.testScenarios.updateItem.useMutation({
    onMutate: async ({ itemId: flowId, checked }) => {
      if (!story) return;

      saveScrollPosition();
      setUpdatingItemId(flowId);

      // Cancel any outgoing refetches
      await utils.testScenarios.getByStoryId.cancel({ projectId, storyId: story.id });

      // Snapshot the previous value
      const previousScenario = utils.testScenarios.getByStoryId.getData({
        projectId,
        storyId: story.id,
      });

      // Optimistically update the cache
      if (previousScenario) {
        utils.testScenarios.getByStoryId.setData({ projectId, storyId: story.id }, {
          ...previousScenario,
          flows: previousScenario.flows.map((flow) =>
            flow.id === flowId ? { ...flow, checked } : flow
          ),
        });
      }

      return { previousScenario };
    },
    onError: (_error, _variables, context) => {
      if (!story) return;

      // Rollback on error
      if (context?.previousScenario) {
        utils.testScenarios.getByStoryId.setData(
          { projectId, storyId: story.id },
          context.previousScenario
        );
      }
      toast.error("Failed to update flow");
    },
    onSettled: () => {
      if (!story) return;

      setUpdatingItemId(null);
      // Restore scroll position after state update
      requestAnimationFrame(() => {
        restoreScrollPosition();
      });
      // Invalidate to refetch and ensure consistency
      utils.testScenarios.getByStoryId.invalidate({ projectId, storyId: story.id });
    },
  });

  const handleFlowToggle = useCallback(
    (flowId: string, checked: boolean) => {
      if (!story) return;
      updateFlow.mutate({ projectId, storyId: story.id, itemId: flowId, checked });
    },
    [projectId, story, updateFlow]
  );

  const handleAccept = useCallback(() => {
    if (story) {
      onAccept(story);
    }
  }, [story, onAccept]);

  const handleReject = useCallback(() => {
    if (story) {
      onReject(story);
    }
  }, [story, onReject]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isProcessing) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!story) return null;

  const progress = calculateTotalProgress(scenario);
  const allChecked = isAllChecked(scenario);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isProcessing && onClose()}>
      <DialogContent
        className="sm:max-w-2xl md:max-w-3xl max-h-[90vh] !flex !flex-col overflow-hidden"
        data-testid="test-checklist-modal"
      >
        <DialogHeader className="flex-shrink-0 pb-4 border-b border-border">
          {/* Story ID and title */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-muted-foreground" data-testid="modal-story-id">
              {story.id}
            </span>
            <Badge variant="default">P{story.priority}</Badge>
            <Badge variant="review">
              <ClipboardCheck className="w-3 h-3" />
              Testing
            </Badge>
          </div>
          <DialogTitle className="line-clamp-2 pr-8" data-testid="modal-story-title">
            {story.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Test checklist for {story.id}
          </DialogDescription>

          {/* Progress bar with percentage */}
          {scenario && (
            <div className="flex items-center gap-3 mt-4" data-testid="modal-total-progress">
              <Progress
                value={progress.percentage}
                className="flex-1 h-3"
              />
              <span className={cn(
                "text-sm font-semibold min-w-[3rem] text-right",
                allChecked && "text-emerald-600 dark:text-emerald-400"
              )}>
                {Math.round(progress.percentage)}%
              </span>
            </div>
          )}
        </DialogHeader>

        {/* Scrollable content area */}
        <ScrollArea className="flex-1 min-h-0 py-4" ref={scrollAreaRef}>
          <div className="space-y-4 pr-4">
            {isLoadingScenario && !scenario ? (
              <div className="flex flex-col items-center justify-center py-12" data-testid="modal-loading">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Loading test checklist...</p>
              </div>
            ) : scenario ? (
              <>
                {scenario.flows?.map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    onToggle={handleFlowToggle}
                    isUpdating={updatingItemId === flow.id}
                  />
                ))}

                {/* Link to markdown documentation */}
                <div className="flex items-center gap-2 pt-4 text-sm text-muted-foreground hover:text-foreground transition-colors border-t">
                  <FileText className="w-4 h-4" />
                  <a
                    href={`/project/${projectId}/test-scenarios/${story.id}.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    View full documentation
                    <ExternalLink className="w-3.5 h-3.5 inline ml-1" />
                  </a>
                </div>
              </>
            ) : scenarioExists === false ? (
              <div className="flex flex-col items-center justify-center py-12" data-testid="modal-no-scenario">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No test scenario generated
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  A test scenario was not generated for this story. You can still accept or reject it based on manual testing.
                </p>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 pt-4 border-t border-border gap-2 sm:gap-2">
          {/* Close button */}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
            data-testid="modal-close-btn"
          >
            Close
          </Button>

          {/* Reject button */}
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isProcessing}
            data-testid="modal-reject-btn"
          >
            {isRejecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            Reject
          </Button>

          {/* Accept button - highlighted when all checked */}
          <Button
            variant={allChecked ? "default" : "outline"}
            onClick={handleAccept}
            disabled={isProcessing}
            className={cn(
              allChecked &&
                "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700"
            )}
            data-testid="modal-accept-btn"
          >
            {isAccepting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

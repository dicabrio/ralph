import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  Settings2,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
  CircleDashed,
  Pencil,
  Check,
  X,
  ExternalLink,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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

export const Route = createFileRoute("/project/$id/")({
  component: ProjectDetail,
});

// Story status type
type StoryStatus = "pending" | "in_progress" | "done" | "failed" | "backlog";

// Story type from the API
interface Story {
  id: string;
  title: string;
  description: string;
  priority: number;
  status: StoryStatus;
  epic: string;
  dependencies: string[];
  recommendedSkills: string[];
  acceptanceCriteria: string[];
}

// Runner status type
type RunnerStatus = "idle" | "running" | "stopping";
type RunnerProvider = "claude" | "codex";

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

// Stats card component
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-card rounded-lg border">
      <div className={cn("p-2 rounded-lg", color)}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// Progress bar component
interface ProgressBarProps {
  progress: number;
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="p-4 bg-card rounded-lg border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">
          Overall Progress
        </span>
        <span className="text-2xl font-bold text-foreground">{progress}%</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Settings row component
interface SettingsRowProps {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  editable?: boolean;
  onEdit?: (value: string) => void;
  isLoading?: boolean;
}

function SettingsRow({
  label,
  value,
  icon,
  editable = false,
  onEdit,
  isLoading = false,
}: SettingsRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");

  const handleSave = () => {
    if (onEdit) {
      onEdit(editValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value || "");
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className={cn(
                "px-2 py-1 text-sm rounded border bg-background text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
              )}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading}
              className="p-1 rounded hover:bg-accent text-emerald-500"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-foreground font-mono">
              {value || "-"}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Runner controls component
interface RunnerControlsProps {
  projectId: number;
  runnerStatus: RunnerStatus;
  selectedProvider: RunnerProvider;
  activeProvider?: RunnerProvider;
  currentStoryId?: string | null;
  onProviderChange: (provider: RunnerProvider) => void;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
}

function RunnerControls({
  runnerStatus,
  selectedProvider,
  activeProvider,
  currentStoryId,
  onProviderChange,
  onStart,
  onStop,
  isStarting,
  isStopping,
}: RunnerControlsProps) {
  const isRunning = runnerStatus === "running";
  const isBusy = isStarting || isStopping || runnerStatus === "stopping";

  return (
    <div className="p-4 bg-card rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Runner</h3>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            runnerStatus === "running" &&
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            runnerStatus === "stopping" &&
              "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            runnerStatus === "idle" && "bg-muted text-muted-foreground",
          )}
        >
          {runnerStatus === "running" && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Running
            </>
          )}
          {runnerStatus === "stopping" && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Stopping
            </>
          )}
          {runnerStatus === "idle" && (
            <>
              <CircleDashed className="w-3 h-3" />
              Idle
            </>
          )}
        </div>
      </div>

      {currentStoryId && isRunning && (
        <p className="text-xs text-muted-foreground mb-4">
          Working on:{" "}
          <span className="font-mono text-foreground">{currentStoryId}</span>
          {activeProvider && (
            <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              ({activeProvider})
            </span>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Button
          type="button"
          size="sm"
          variant={selectedProvider === "claude" ? "default" : "outline"}
          onClick={() => onProviderChange("claude")}
          disabled={isBusy || isRunning}
        >
          Claude
        </Button>
        <Button
          type="button"
          size="sm"
          variant={selectedProvider === "codex" ? "default" : "outline"}
          onClick={() => onProviderChange("codex")}
          disabled={isBusy || isRunning}
        >
          Codex
        </Button>
      </div>

      <div className="flex gap-2">
        {!isRunning ? (
          <Button type="button" onClick={onStart} disabled={isBusy}>
            {isStarting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Runner
          </Button>
        ) : (
          // <button
          //   className={cn(
          //     'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
          //     'bg-emerald-500 text-white font-medium',
          //     'hover:bg-emerald-600 transition-colors',
          //     'disabled:opacity-50 disabled:cursor-not-allowed',
          //   )}
          // >
          //   {isStarting ? (
          //     <Loader2 className="w-4 h-4 animate-spin" />
          //   ) : (
          //     <Play className="w-4 h-4" />
          //   )}
          //   Start Runner
          // </button>
          <Button
            variant="destructive"
            type="button"
            onClick={onStop}
            disabled={isBusy}
            className="w-full"
            // className={cn(
            //   "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg",
            //   "bg-destructive text-destructive-foreground font-medium",
            //   "hover:bg-destructive/90 transition-colors",
            //   "disabled:opacity-50 disabled:cursor-not-allowed",
            // )}
          >
            {isStopping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            Stop Runner
          </Button>
        )}
      </div>
    </div>
  );
}

// Quick links component
interface QuickLinksProps {
  projectId: string;
}

function QuickLinks({ projectId }: QuickLinksProps) {
  return (
    <div className="p-4 bg-card rounded-lg border">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Quick Links
      </h3>
      <div className="space-y-2">
        <Link
          to="/project/$id/kanban"
          params={{ id: projectId }}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg",
            "bg-background hover:bg-accent transition-colors",
            "text-foreground",
          )}
        >
          <LayoutGrid className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Kanban Board</p>
            <p className="text-xs text-muted-foreground">
              Manage stories and track progress
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link
          to="/project/$id/prompts"
          params={{ id: projectId }}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg",
            "bg-background hover:bg-accent transition-colors",
            "text-foreground",
          )}
        >
          <Settings2 className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Project Prompts</p>
            <p className="text-xs text-muted-foreground">
              Configure skills and overrides
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

// Delete confirmation dialog component using shadcn AlertDialog
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  projectName: string;
  projectPath: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({
  isOpen,
  projectName,
  projectPath,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open && !isDeleting) {
      onCancel();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent data-testid="delete-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove Project from Ralph?</AlertDialogTitle>
          <AlertDialogDescription>
            Project{" "}
            <span className="font-medium text-foreground">{projectName}</span>{" "}
            will be removed from Ralph.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Info box using Alert component */}
        <Alert className="bg-amber-500/10 border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium mb-1">Files will be preserved</p>
            <p>
              The project files at{" "}
              <code className="font-mono bg-amber-500/10 px-1 rounded">
                {projectPath}
              </code>{" "}
              will remain on your filesystem. Only the reference in Ralph will
              be deleted.
            </p>
          </AlertDescription>
        </Alert>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="confirm-delete-button"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Remove Project
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProjectDetail() {
  const { id } = Route.useParams();
  const projectId = parseInt(id, 10);
  const utils = trpc.useUtils();
  const navigate = useNavigate();

  // State for delete confirmation dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [runnerProvider, setRunnerProvider] = useState<RunnerProvider>("claude");

  // Restore provider preference for this project
  useEffect(() => {
    if (typeof window === "undefined" || Number.isNaN(projectId)) return;
    const stored = window.localStorage.getItem(`ralph.runner-provider.${projectId}`);
    if (stored === "claude" || stored === "codex") {
      setRunnerProvider(stored);
    }
  }, [projectId]);

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
  const { data: stories = [] } = trpc.stories.listByProject.useQuery(
    { projectId },
    { enabled: !isNaN(projectId), staleTime: 30000 },
  );

  // Fetch runner status
  const { data: runnerState } = trpc.runner.getStatus.useQuery(
    { projectId, provider: runnerProvider },
    { enabled: !isNaN(projectId), refetchInterval: 3000 },
  );

  // Mutations
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.getById.invalidate({ id: projectId });
    },
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: (data) => {
      // Invalidate projects list
      utils.projects.list.invalidate();
      // Close the dialog
      setIsDeleteDialogOpen(false);
      // Show success toast
      toast.success("Project removed from Ralph", {
        description: `"${data.projectName}" has been removed. Files on disk are preserved.`,
      });
      // Navigate to dashboard
      navigate({ to: "/" });
    },
    onError: (error) => {
      toast.error("Failed to remove project", {
        description: error.message || "An unexpected error occurred",
      });
    },
  });

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

  // Compute stats
  const stats = computeProjectStats(stories);
  const runnerStatus: RunnerStatus = runnerState?.status ?? "idle";

  // Handle branch name update
  const handleBranchNameUpdate = (newBranchName: string) => {
    updateProject.mutate({
      id: projectId,
      branchName: newBranchName || null,
    });
  };

  // Handle runner start/stop
  const handleStartRunner = () => {
    startRunner.mutate({ projectId, provider: runnerProvider });
  };

  const handleStopRunner = () => {
    stopRunner.mutate({ projectId });
  };

  const handleRunnerProviderChange = (provider: RunnerProvider) => {
    setRunnerProvider(provider);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`ralph.runner-provider.${projectId}`, provider);
    }
  };

  // Handle project delete
  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    deleteProject.mutate({ id: projectId });
  };

  const handleDeleteCancel = () => {
    setIsDeleteDialogOpen(false);
  };

  // Loading state
  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (projectError || !project) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Project not found
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            The project you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      {/* Project header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {project.name}
        </h1>
        {project.description && (
          <p className="text-lg text-muted-foreground">{project.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - stats and settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats section */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Story Statistics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard
                label="Completed"
                value={stats.done}
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                color="bg-emerald-500/10"
              />
              <StatCard
                label="In Progress"
                value={stats.inProgress}
                icon={<PlayCircle className="w-5 h-5 text-blue-500" />}
                color="bg-blue-500/10"
              />
              <StatCard
                label="Failed"
                value={stats.failed}
                icon={<AlertCircle className="w-5 h-5 text-destructive" />}
                color="bg-destructive/10"
              />
              <StatCard
                label="Pending"
                value={stats.pending}
                icon={
                  <CircleDashed className="w-5 h-5 text-muted-foreground" />
                }
                color="bg-muted"
              />
            </div>
            <ProgressBar progress={stats.progress} />
          </div>

          {/* Settings section */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Settings
            </h2>
            <div className="bg-card rounded-lg border p-4">
              <SettingsRow
                label="Project Path"
                value={project.path}
                icon={<FolderOpen className="w-4 h-4" />}
                editable={false}
              />
              <SettingsRow
                label="Branch Name"
                value={project.branchName}
                icon={<GitBranch className="w-4 h-4" />}
                editable={true}
                onEdit={handleBranchNameUpdate}
                isLoading={updateProject.isPending}
              />
            </div>
          </div>

          {/* Danger Zone */}
          <div>
            <h2 className="text-lg font-semibold text-destructive mb-4">
              Danger Zone
            </h2>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Remove project from Ralph
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This will remove the project from Ralph. Files on disk will
                    be preserved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  data-testid="delete-project-button"
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm",
                    "border border-destructive text-destructive",
                    "hover:bg-destructive hover:text-destructive-foreground",
                    "transition-colors",
                  )}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove Project
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - runner controls and quick links */}
        <div className="space-y-6">
          <RunnerControls
            projectId={projectId}
            runnerStatus={runnerStatus}
            selectedProvider={runnerProvider}
            activeProvider={runnerState?.provider as RunnerProvider | undefined}
            currentStoryId={runnerState?.storyId}
            onProviderChange={handleRunnerProviderChange}
            onStart={handleStartRunner}
            onStop={handleStopRunner}
            isStarting={startRunner.isPending}
            isStopping={stopRunner.isPending}
          />

          <QuickLinks projectId={id} />
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        projectName={project.name}
        projectPath={project.path}
        isDeleting={deleteProject.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}

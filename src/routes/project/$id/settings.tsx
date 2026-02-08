import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Loader2,
  FolderOpen,
  GitBranch,
  Calendar,
  Hash,
  Trash2,
  AlertTriangle,
  FileText,
  Clock,
  Pencil,
  Check,
  X,
  Copy,
  CheckCheck,
  RotateCcw,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const Route = createFileRoute('/project/$id/settings')({
  component: ProjectSettingsPage,
})

// Format date helper
function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Settings row component
interface SettingsRowProps {
  label: string
  value: string | number | null
  icon: React.ReactNode
  editable?: boolean
  onEdit?: (value: string) => void
  isLoading?: boolean
  mono?: boolean
  copyable?: boolean
}

function SettingsRow({
  label,
  value,
  icon,
  editable = false,
  onEdit,
  isLoading = false,
  mono = false,
  copyable = false,
}: SettingsRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value || ''))
  const [copied, setCopied] = useState(false)

  const handleSave = () => {
    if (onEdit) {
      onEdit(editValue)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(String(value || ''))
    setIsEditing(false)
  }

  const handleCopy = async () => {
    if (value) {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-sm font-medium text-muted-foreground shrink-0">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0 ml-4">
        {isEditing ? (
          <>
            <Input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-48 h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') handleCancel()
              }}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleSave}
              disabled={isLoading}
              className="text-emerald-500"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCancel}
              disabled={isLoading}
            >
              <X className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <TooltipProvider delayDuration={200}>
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'text-sm text-foreground truncate max-w-[300px]',
                      mono && 'font-mono text-xs bg-muted px-2 py-0.5 rounded',
                    )}
                  >
                    {value ?? '-'}
                  </span>
                </TooltipTrigger>
                {value && String(value).length > 30 && (
                  <TooltipContent side="top" sideOffset={4}>
                    {String(value)}
                  </TooltipContent>
                )}
              </Tooltip>
              {copyable && value && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    Kopieer naar klembord
                  </TooltipContent>
                </Tooltip>
              )}
              {editable && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

// Toggle switch component
interface ToggleRowProps {
  label: string
  description: string
  icon: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  isLoading?: boolean
}

function ToggleRow({
  label,
  description,
  icon,
  checked,
  onChange,
  isLoading = false,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
        <div>
          <span className="text-sm font-medium text-foreground block">
            {label}
          </span>
          <span className="text-xs text-muted-foreground">
            {description}
          </span>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={isLoading}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
            'transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}

// Delete confirmation dialog using shadcn AlertDialog
interface DeleteConfirmDialogProps {
  projectName: string
  isOpen: boolean
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmDialog({
  projectName,
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('')

  const isConfirmed = confirmText === projectName

  // Reset confirm text when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setConfirmText('')
      onCancel()
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>Project verwijderen</AlertDialogTitle>
          <AlertDialogDescription>
            Weet je zeker dat je <strong className="text-foreground">{projectName}</strong> wilt verwijderen?
            Dit verwijdert alle stories en instellingen. Deze actie kan niet ongedaan worden gemaakt.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{projectName}</span> om te bevestigen:
          </Label>
          <Input
            id="delete-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Typ projectnaam..."
            disabled={isDeleting}
            className={cn(
              !isConfirmed && confirmText && 'border-destructive focus-visible:ring-destructive/50'
            )}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            Annuleren
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onConfirm}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verwijderen...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Verwijderen
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ProjectSettingsPage() {
  const { id } = Route.useParams()
  const projectId = Number.parseInt(id, 10)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Fetch project data
  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !Number.isNaN(projectId) },
  )

  // Fetch stories count
  const { data: stories = [] } = trpc.stories.listByProject.useQuery(
    { projectId },
    { enabled: !Number.isNaN(projectId) },
  )

  // Fetch auto-restart status
  const { data: autoRestartStatus } = trpc.runner.getAutoRestartStatus.useQuery(
    { projectId },
    { enabled: !Number.isNaN(projectId) },
  )

  // Mutations
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.getById.invalidate({ id: projectId })
      utils.projects.list.invalidate()
    },
  })

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate()
      navigate({ to: '/' })
    },
  })

  const setAutoRestart = trpc.runner.setAutoRestart.useMutation({
    onSuccess: () => {
      utils.runner.getAutoRestartStatus.invalidate({ projectId })
    },
  })

  // Handle updates
  const handleNameUpdate = (newName: string) => {
    if (newName.trim()) {
      updateProject.mutate({ id: projectId, name: newName.trim() })
    }
  }

  const handleDescriptionUpdate = (newDescription: string) => {
    updateProject.mutate({
      id: projectId,
      description: newDescription.trim() || null,
    })
  }

  const handleBranchNameUpdate = (newBranchName: string) => {
    updateProject.mutate({
      id: projectId,
      branchName: newBranchName.trim() || null,
    })
  }

  // Handle auto-restart toggle
  const handleAutoRestartToggle = (enabled: boolean) => {
    setAutoRestart.mutate({ projectId, enabled })
  }

  // Handle delete
  const handleDeleteConfirm = () => {
    deleteProject.mutate({ id: projectId })
  }

  // Loading state
  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (projectError || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] px-4">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Project niet gevonden
        </h2>
        <p className="text-muted-foreground">
          Het gevraagde project bestaat niet of is verwijderd.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Instellingen
        </h1>
        <p className="text-muted-foreground">
          Beheer de instellingen voor {project.name}
        </p>
      </div>

      <div className="space-y-8">
        {/* General Settings */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Algemeen
          </h2>
          <div className="bg-card rounded-lg border p-4">
            <SettingsRow
              label="Naam"
              value={project.name}
              icon={<FileText className="w-4 h-4" />}
              editable={true}
              onEdit={handleNameUpdate}
              isLoading={updateProject.isPending}
            />
            <SettingsRow
              label="Beschrijving"
              value={project.description}
              icon={<FileText className="w-4 h-4" />}
              editable={true}
              onEdit={handleDescriptionUpdate}
              isLoading={updateProject.isPending}
            />
            <SettingsRow
              label="Branch"
              value={project.branchName}
              icon={<GitBranch className="w-4 h-4" />}
              editable={true}
              onEdit={handleBranchNameUpdate}
              isLoading={updateProject.isPending}
            />
          </div>
        </section>

        {/* Project Info */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Project Informatie
          </h2>
          <div className="bg-card rounded-lg border p-4">
            <SettingsRow
              label="Project ID"
              value={project.id}
              icon={<Hash className="w-4 h-4" />}
              mono={true}
              copyable={true}
            />
            <SettingsRow
              label="Pad"
              value={project.path}
              icon={<FolderOpen className="w-4 h-4" />}
              mono={true}
              copyable={true}
            />
            <SettingsRow
              label="Aantal stories"
              value={stories.length}
              icon={<FileText className="w-4 h-4" />}
            />
            <SettingsRow
              label="Aangemaakt op"
              value={formatDate(project.createdAt)}
              icon={<Calendar className="w-4 h-4" />}
            />
            <SettingsRow
              label="Laatst bijgewerkt"
              value={formatDate(project.updatedAt)}
              icon={<Clock className="w-4 h-4" />}
            />
          </div>
        </section>

        {/* Runner Settings */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Runner
          </h2>
          <div className="bg-card rounded-lg border p-4">
            <ToggleRow
              label="Auto-restart"
              description="Start automatisch de volgende story wanneer de huidige klaar is"
              icon={<RotateCcw className="w-4 h-4" />}
              checked={autoRestartStatus?.autoRestartEnabled ?? true}
              onChange={handleAutoRestartToggle}
              isLoading={setAutoRestart.isPending}
            />
          </div>
        </section>

        {/* Danger Zone */}
        <section>
          <h2 className="text-lg font-semibold text-destructive mb-4">
            Gevarenzone
          </h2>
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-foreground mb-1">
                  Project verwijderen
                </h3>
                <p className="text-sm text-muted-foreground">
                  Verwijder dit project permanent inclusief alle {stories.length} stories.
                  Dit kan niet ongedaan worden gemaakt.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="w-4 h-4" />
                Verwijderen
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        projectName={project.name}
        isOpen={showDeleteModal}
        isDeleting={deleteProject.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  )
}

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
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'

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
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className={cn(
                'px-2 py-1 text-sm rounded border bg-background text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                'w-48',
              )}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') handleCancel()
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
            <span
              className={cn(
                'text-sm text-foreground truncate max-w-[300px]',
                mono && 'font-mono text-xs bg-muted px-2 py-0.5 rounded',
              )}
              title={String(value || '')}
            >
              {value ?? '-'}
            </span>
            {copyable && value && (
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded hover:bg-accent text-muted-foreground shrink-0"
                title="Kopieer naar klembord"
              >
                {copied ? (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-1 rounded hover:bg-accent text-muted-foreground shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Delete confirmation modal
interface DeleteConfirmModalProps {
  projectName: string
  isOpen: boolean
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmModal({
  projectName,
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState('')

  if (!isOpen) return null

  const isConfirmed = confirmText === projectName

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-destructive/10">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Project verwijderen
          </h2>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Weet je zeker dat je <strong className="text-foreground">{projectName}</strong> wilt verwijderen?
          Dit verwijdert alle stories en instellingen. Deze actie kan niet ongedaan worden gemaakt.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{projectName}</span> om te bevestigen:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-destructive/50',
            )}
            placeholder="Typ projectnaam..."
            disabled={isDeleting}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-lg border',
              'text-foreground hover:bg-accent transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isConfirmed || isDeleting}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
              'bg-destructive text-destructive-foreground font-medium',
              'hover:bg-destructive/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
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
          </button>
        </div>
      </div>
    </div>
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
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg shrink-0',
                  'bg-destructive text-destructive-foreground',
                  'hover:bg-destructive/90 transition-colors',
                )}
              >
                <Trash2 className="w-4 h-4" />
                Verwijderen
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Delete confirmation modal */}
      <DeleteConfirmModal
        projectName={project.name}
        isOpen={showDeleteModal}
        isDeleting={deleteProject.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  )
}

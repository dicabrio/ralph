import { useEffect } from 'react'
import { X, FileCode2, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

// Skill type
interface Skill {
  id: string
  name: string
  description: string
  content: string
  isOverride?: boolean
  hasOverride?: boolean
}

interface SkillDetailModalProps {
  skill: Skill
  onClose: () => void
}

// Extract category from skill ID
function extractCategory(skillId: string): string {
  const colonIndex = skillId.indexOf(':')
  if (colonIndex > 0) {
    return skillId.slice(0, colonIndex)
  }
  return 'general'
}

// Format category for display
function formatCategory(category: string): string {
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Category badge colors
const categoryColors: Record<string, string> = {
  'backend-development': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'frontend-design': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'database-design': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'api-design': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  testing: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  devops: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  general: 'bg-muted text-muted-foreground',
}

function getCategoryColor(category: string): string {
  return categoryColors[category] || 'bg-muted text-muted-foreground'
}

export function SkillDetailModal({ skill, onClose }: SkillDetailModalProps) {
  const [copied, setCopied] = useState(false)
  const category = extractCategory(skill.id)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Handle copy content
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(skill.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available or failed
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-detail-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 max-h-[90vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-4 flex-1 min-w-0 pr-4">
            <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileCode2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', getCategoryColor(category))}>
                  {formatCategory(category)}
                </span>
              </div>
              <h2 id="skill-detail-modal-title" className="text-lg font-semibold text-foreground">
                {skill.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 mt-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Skill ID bar */}
        <div className="flex items-center justify-between px-6 py-2 bg-muted/50 border-b border-border text-sm">
          <span className="font-mono text-muted-foreground">ID: {skill.id}</span>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
              copied ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'hover:bg-accent text-muted-foreground'
            )}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy content
              </>
            )}
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <pre className="p-6 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {skill.content}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default SkillDetailModal

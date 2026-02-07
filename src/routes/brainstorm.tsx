import { useState, useRef, useEffect, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Send,
  Loader2,
  ChevronDown,
  Bot,
  User,
  FolderOpen,
  ArrowDown,
  Sparkles,
  CheckCheck,
  X,
  AlertCircle,
  WifiOff,
  RefreshCw,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { StoryPreviewCard, type GeneratedStory } from '@/components/StoryPreviewCard'
import { StoryEditModal } from '@/components/StoryEditModal'
import { useBrainstormChat, type BrainstormMessage } from '@/lib/hooks/useBrainstormChat'

export const Route = createFileRoute('/brainstorm')({ component: BrainstormPage })

// Project type
interface Project {
  id: number
  name: string
  path: string
  description: string | null
  branchName: string | null
  createdAt: Date
  updatedAt: Date
}

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Project selector component
interface ProjectSelectorProps {
  projects: Project[]
  selectedProjectId: number | null
  onSelect: (projectId: number | null) => void
  isLoading: boolean
}

function ProjectSelector({
  projects,
  selectedProjectId,
  onSelect,
  isLoading,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg border w-full sm:w-auto min-w-[200px]',
          'bg-card text-foreground',
          'hover:border-primary/50 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
        data-testid="project-selector"
      >
        <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-left truncate">
          {isLoading ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : selectedProject ? (
            selectedProject.name
          ) : (
            <span className="text-muted-foreground">Select a project</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground shrink-0 transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && !isLoading && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[280px] bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-[300px] overflow-y-auto">
          {projects.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No projects available
            </div>
          ) : (
            <>
              {/* Deselect option */}
              <button
                type="button"
                onClick={() => {
                  onSelect(null)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full px-4 py-2.5 text-left text-sm',
                  'hover:bg-accent transition-colors',
                  !selectedProjectId &&
                    'bg-accent/50 text-primary font-medium',
                )}
              >
                <span className="text-muted-foreground italic">
                  No project selected
                </span>
              </button>

              {/* Project options */}
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onSelect(project.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full px-4 py-2.5 text-left',
                    'hover:bg-accent transition-colors',
                    selectedProjectId === project.id &&
                      'bg-accent/50 text-primary font-medium',
                  )}
                  data-testid={`project-option-${project.id}`}
                >
                  <div className="text-sm font-medium truncate">
                    {project.name}
                  </div>
                  {project.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {project.description}
                    </div>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Message bubble component
interface MessageBubbleProps {
  message: BrainstormMessage
  projectId: number | null
  onEditStory: (story: GeneratedStory, messageId: string, storyIndex: number) => void
  onApproveStory: (story: GeneratedStory, messageId: string, storyIndex: number) => void
  onDiscardStory: (storyId: string, messageId: string) => void
  onBulkApprove: (stories: GeneratedStory[], messageId: string) => void
  onBulkDiscard: (storyIds: string[], messageId: string) => void
  approvingStoryIds: Set<string>
  approvedStoryIds: Set<string>
  discardedStoryIds: Set<string>
}

function MessageBubble({
  message,
  projectId,
  onEditStory,
  onApproveStory,
  onDiscardStory,
  onBulkApprove,
  onBulkDiscard,
  approvingStoryIds,
  approvedStoryIds,
  discardedStoryIds,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const hasStories = message.generatedStories && message.generatedStories.length > 0

  // Filter out discarded stories
  const visibleStories = message.generatedStories?.filter(
    (s) => !discardedStoryIds.has(`${message.id}:${s.id}`)
  ) || []

  const unapprovedStories = visibleStories.filter(
    (s) => !approvedStoryIds.has(`${message.id}:${s.id}`)
  )

  return (
    <div
      className={cn('flex gap-3 max-w-3xl', isUser ? 'ml-auto flex-row-reverse' : '')}
      data-testid={`message-${message.id}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Message content */}
      <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted text-foreground rounded-bl-md',
          )}
        >
          {message.content || (message.isStreaming ? '' : '')}
          {message.isStreaming && !message.content && (
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>

        {/* Generated stories preview */}
        {hasStories && projectId && visibleStories.length > 0 && (
          <div className="w-full mt-3 space-y-3" data-testid="generated-stories">
            {/* Story header with bulk actions */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>{visibleStories.length} stories generated</span>
              </div>
              <div className="flex items-center gap-2">
                {unapprovedStories.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => onBulkDiscard(unapprovedStories.map(s => s.id), message.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg',
                        'border border-border text-muted-foreground',
                        'hover:text-destructive hover:border-destructive/50 transition-colors',
                      )}
                      data-testid="bulk-discard-button"
                    >
                      <X className="w-3.5 h-3.5" />
                      Discard All
                    </button>
                    <button
                      type="button"
                      onClick={() => onBulkApprove(unapprovedStories, message.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg',
                        'bg-primary text-primary-foreground',
                        'hover:bg-primary/90 transition-colors',
                      )}
                      data-testid="bulk-approve-button"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Approve All ({unapprovedStories.length})
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Story cards */}
            {visibleStories.map((story, index) => (
              <StoryPreviewCard
                key={`${message.id}:${story.id}`}
                story={story}
                onEdit={() => onEditStory(story, message.id, index)}
                onApprove={() => onApproveStory(story, message.id, index)}
                onDiscard={() => onDiscardStory(story.id, message.id)}
                isApproving={approvingStoryIds.has(`${message.id}:${story.id}`)}
                isApproved={approvedStoryIds.has(`${message.id}:${story.id}`)}
                isDiscarded={discardedStoryIds.has(`${message.id}:${story.id}`)}
              />
            ))}
          </div>
        )}

        <span className="text-xs text-muted-foreground px-1">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}

// Typing indicator component
function TypingIndicator() {
  return (
    <div className="flex gap-3 max-w-3xl" data-testid="typing-indicator">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
        <Bot className="w-4 h-4" />
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 bg-muted rounded-2xl rounded-bl-md">
        <span className="text-xs text-muted-foreground mr-2">Starting Claude...</span>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
      </div>
    </div>
  )
}

// Empty state for chat
function ChatEmptyState({ hasProject }: { hasProject: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <Bot className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        Brainstorm with AI
      </h2>
      <p className="text-muted-foreground text-center max-w-md">
        {hasProject
          ? 'Start a conversation to brainstorm and generate user stories for your project.'
          : 'Select a project to start brainstorming user stories with AI assistance.'}
      </p>
    </div>
  )
}

// Connection status indicator
function ConnectionStatus({
  isConnected,
  isReconnecting,
}: {
  isConnected: boolean
  isReconnecting: boolean
}) {
  if (isConnected) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
        isReconnecting ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive',
      )}
    >
      {isReconnecting ? (
        <>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Reconnecting...
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          Disconnected
        </>
      )}
    </div>
  )
}

function BrainstormPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [editingStory, setEditingStory] = useState<{
    story: GeneratedStory
    messageId: string
    storyIndex: number
  } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch projects
  const { data: projects = [], isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery(undefined, { staleTime: 30000 })

  // Use a safe projectId for the hook (0 when no project selected, hook won't make API calls)
  const safeProjectId = selectedProjectId || 0

  // Brainstorm chat hook
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    isConnected,
    isReconnecting,
    sendMessage,
    cancelSession,
    retry,
    clearError,
    clearMessages,
    approvingStoryIds,
    approvedStoryIds,
    discardedStoryIds,
    approveStory,
    bulkApprove,
    discardStory,
    bulkDiscard,
    updateStoryInMessage,
  } = useBrainstormChat({ projectId: safeProjectId })

  // Scroll to bottom function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  // Check if user is at bottom of messages
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const threshold = 100
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    setIsAtBottom(isNearBottom)
  }, [])

  // Auto-scroll when new messages arrive (if at bottom)
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom()
    }
  }, [messages, isLoading, isAtBottom, scrollToBottom])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Clear messages when project changes
  const handleProjectSelect = useCallback((projectId: number | null) => {
    if (projectId !== selectedProjectId) {
      clearMessages()
    }
    setSelectedProjectId(projectId)
  }, [selectedProjectId, clearMessages])

  // Handle story edit
  const handleEditStory = useCallback(
    (story: GeneratedStory, messageId: string, storyIndex: number) => {
      setEditingStory({ story, messageId, storyIndex })
    },
    [],
  )

  // Handle story save after edit
  const handleSaveEditedStory = useCallback(
    (updatedStory: GeneratedStory) => {
      if (!editingStory) return
      updateStoryInMessage(editingStory.messageId, editingStory.storyIndex, updatedStory)
    },
    [editingStory, updateStoryInMessage],
  )

  // Handle approve single story
  const handleApproveStory = useCallback(
    async (story: GeneratedStory, messageId: string, _storyIndex: number) => {
      if (!selectedProjectId) return
      await approveStory(story, messageId)
    },
    [selectedProjectId, approveStory],
  )

  // Handle discard single story
  const handleDiscardStory = useCallback(
    (storyId: string, messageId: string) => {
      discardStory(storyId, messageId)
    },
    [discardStory],
  )

  // Handle bulk approve
  const handleBulkApprove = useCallback(
    async (stories: GeneratedStory[], messageId: string) => {
      if (!selectedProjectId) return
      await bulkApprove(stories, messageId)
    },
    [selectedProjectId, bulkApprove],
  )

  // Handle bulk discard
  const handleBulkDiscard = useCallback(
    (storyIds: string[], messageId: string) => {
      bulkDiscard(storyIds, messageId)
    },
    [bulkDiscard],
  )

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || !selectedProjectId) return

    setInputValue('')
    await sendMessage(trimmedInput)
  }, [inputValue, selectedProjectId, sendMessage])

  // Handle input key down (Enter to send, Shift+Enter for new line)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage()
      }
    },
    [handleSendMessage],
  )

  // Auto-resize textarea
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value)

      // Auto-resize
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    },
    [],
  )

  const hasMessages = messages.length > 0
  const isBusy = isLoading || isStreaming

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header with project selector */}
      <div className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-foreground">Brainstorm</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Generate and refine user stories with AI assistance
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ConnectionStatus isConnected={isConnected} isReconnecting={isReconnecting} />
              <ProjectSelector
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelect={handleProjectSelect}
                isLoading={isLoadingProjects}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 bg-destructive/10 border-b border-destructive/20">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={retry}
                  className="text-xs text-destructive hover:underline"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={clearError}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {!hasMessages ? (
            <ChatEmptyState hasProject={selectedProjectId !== null} />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  projectId={selectedProjectId}
                  onEditStory={handleEditStory}
                  onApproveStory={handleApproveStory}
                  onDiscardStory={handleDiscardStory}
                  onBulkApprove={handleBulkApprove}
                  onBulkDiscard={handleBulkDiscard}
                  approvingStoryIds={approvingStoryIds}
                  approvedStoryIds={approvedStoryIds}
                  discardedStoryIds={discardedStoryIds}
                />
              ))}
              {isLoading && !isStreaming && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && hasMessages && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-full',
              'bg-card border border-border shadow-lg',
              'text-sm text-muted-foreground hover:text-foreground',
              'transition-all hover:shadow-xl',
            )}
            data-testid="scroll-to-bottom"
          >
            <ArrowDown className="w-4 h-4" />
            Jump to latest
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedProjectId
                    ? 'Describe the features or stories you want to create...'
                    : 'Select a project to start brainstorming...'
                }
                disabled={isBusy || !selectedProjectId}
                rows={1}
                className={cn(
                  'w-full px-4 py-3 pr-12 rounded-xl border bg-background resize-none',
                  'text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'min-h-[48px] max-h-[150px]',
                )}
                data-testid="message-input"
              />
            </div>
            {isBusy ? (
              <button
                type="button"
                onClick={cancelSession}
                className={cn(
                  'p-3 rounded-xl shrink-0',
                  'bg-destructive text-destructive-foreground',
                  'hover:bg-destructive/90 transition-colors',
                )}
                aria-label="Cancel"
                data-testid="cancel-button"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || !selectedProjectId}
                className={cn(
                  'p-3 rounded-xl shrink-0',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                aria-label="Send message"
                data-testid="send-button"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Story edit modal */}
      {editingStory && (
        <StoryEditModal
          story={editingStory.story}
          isOpen={true}
          onClose={() => setEditingStory(null)}
          onSave={handleSaveEditedStory}
        />
      )}
    </div>
  )
}

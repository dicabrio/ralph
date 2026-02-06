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
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { StoryPreviewCard, type GeneratedStory } from '@/components/StoryPreviewCard'
import { StoryEditModal } from '@/components/StoryEditModal'

export const Route = createFileRoute('/brainstorm')({ component: BrainstormPage })

// Message type
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  generatedStories?: GeneratedStory[]
}

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

// Generate unique ID for messages
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Mock story generator - will be replaced by API-008
function generateMockStories(userMessage: string, projectName: string): GeneratedStory[] {
  // Simple heuristic to generate mock stories based on keywords
  const lowerMessage = userMessage.toLowerCase()

  const stories: GeneratedStory[] = []
  const timestamp = Date.now()

  if (lowerMessage.includes('auth') || lowerMessage.includes('login') || lowerMessage.includes('user')) {
    stories.push({
      id: `AUTH-${timestamp.toString(36).slice(-4).toUpperCase()}`,
      title: 'User Authentication Flow',
      description: 'Implement secure user authentication with login, logout, and session management.',
      priority: stories.length + 1,
      epic: 'Authentication',
      dependencies: [],
      recommendedSkills: ['backend-development:api-design-principles'],
      acceptanceCriteria: [
        'Users can log in with email and password',
        'Sessions are stored securely with JWT tokens',
        'Login attempts are rate-limited',
        'Password requirements are validated',
      ],
    })
  }

  if (lowerMessage.includes('dashboard') || lowerMessage.includes('overview') || lowerMessage.includes('home')) {
    stories.push({
      id: `DASH-${timestamp.toString(36).slice(-4).toUpperCase()}`,
      title: 'Dashboard Overview Page',
      description: 'Create a main dashboard page showing key metrics and recent activity.',
      priority: stories.length + 1,
      epic: 'Dashboard',
      dependencies: [],
      recommendedSkills: ['frontend-design'],
      acceptanceCriteria: [
        'Dashboard displays summary cards for key metrics',
        'Recent activity is shown in a timeline',
        'Data refreshes automatically every 30 seconds',
        'Responsive layout for mobile and desktop',
      ],
    })
  }

  if (lowerMessage.includes('api') || lowerMessage.includes('endpoint') || lowerMessage.includes('backend')) {
    stories.push({
      id: `API-${timestamp.toString(36).slice(-4).toUpperCase()}`,
      title: 'RESTful API Endpoints',
      description: 'Design and implement RESTful API endpoints for core resources.',
      priority: stories.length + 1,
      epic: 'Core API',
      dependencies: [],
      recommendedSkills: ['backend-development:api-design-principles', 'database-design:postgresql'],
      acceptanceCriteria: [
        'Endpoints follow RESTful conventions',
        'Input validation using Zod schemas',
        'Error responses are consistent and informative',
        'API documentation generated with OpenAPI spec',
      ],
    })
  }

  if (lowerMessage.includes('test') || lowerMessage.includes('testing') || lowerMessage.includes('coverage')) {
    stories.push({
      id: `TEST-${timestamp.toString(36).slice(-4).toUpperCase()}`,
      title: 'Test Coverage Setup',
      description: 'Configure testing infrastructure with unit, integration, and E2E tests.',
      priority: stories.length + 1,
      epic: 'Testing',
      dependencies: [],
      recommendedSkills: [],
      acceptanceCriteria: [
        'Unit tests configured with Vitest',
        'Integration tests for API endpoints',
        'E2E tests with Playwright',
        'Coverage reports generated automatically',
      ],
    })
  }

  // If no specific keywords matched, generate a generic story
  if (stories.length === 0) {
    stories.push({
      id: `FEAT-${timestamp.toString(36).slice(-4).toUpperCase()}`,
      title: 'Feature Implementation',
      description: `Implement the requested feature for ${projectName}: ${userMessage.slice(0, 100)}`,
      priority: 1,
      epic: 'Features',
      dependencies: [],
      recommendedSkills: ['frontend-design'],
      acceptanceCriteria: [
        'Feature meets the described requirements',
        'Unit tests cover core functionality',
        'Documentation updated with usage instructions',
      ],
    })
  }

  return stories
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
  message: Message
  projectId: number | null
  onEditStory: (story: GeneratedStory, messageId: string, storyIndex: number) => void
  onApproveStory: (story: GeneratedStory, messageId: string, storyIndex: number) => void
  onBulkApprove: (stories: GeneratedStory[], messageId: string) => void
  approvingStoryIds: Set<string>
  approvedStoryIds: Set<string>
}

function MessageBubble({
  message,
  projectId,
  onEditStory,
  onApproveStory,
  onBulkApprove,
  approvingStoryIds,
  approvedStoryIds,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const hasStories = message.generatedStories && message.generatedStories.length > 0
  const unapprovedStories = message.generatedStories?.filter(
    (s) => !approvedStoryIds.has(`${message.id}:${s.id}`)
  ) || []

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
          {message.content}
        </div>

        {/* Generated stories preview */}
        {hasStories && projectId && (
          <div className="w-full mt-3 space-y-3" data-testid="generated-stories">
            {/* Story header with bulk approve */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>{message.generatedStories!.length} stories generated</span>
              </div>
              {unapprovedStories.length > 1 && (
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
              )}
            </div>

            {/* Story cards */}
            {message.generatedStories!.map((story, index) => (
              <StoryPreviewCard
                key={`${message.id}:${story.id}`}
                story={story}
                onEdit={() => onEditStory(story, message.id, index)}
                onApprove={() => onApproveStory(story, message.id, index)}
                isApproving={approvingStoryIds.has(`${message.id}:${story.id}`)}
                isApproved={approvedStoryIds.has(`${message.id}:${story.id}`)}
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
        <span
          className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
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

function BrainstormPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [approvingStoryIds, setApprovingStoryIds] = useState<Set<string>>(new Set())
  const [approvedStoryIds, setApprovedStoryIds] = useState<Set<string>>(new Set())
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

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Add stories mutation
  const addStoriesMutation = trpc.stories.addStories.useMutation()
  const utils = trpc.useUtils()

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
  }, [messages, isTyping, isAtBottom, scrollToBottom])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === editingStory.messageId && msg.generatedStories) {
            const newStories = [...msg.generatedStories]
            newStories[editingStory.storyIndex] = updatedStory
            return { ...msg, generatedStories: newStories }
          }
          return msg
        }),
      )
    },
    [editingStory],
  )

  // Handle approve single story
  const handleApproveStory = useCallback(
    async (story: GeneratedStory, messageId: string, _storyIndex: number) => {
      if (!selectedProjectId) return

      const storyKey = `${messageId}:${story.id}`
      setApprovingStoryIds((prev) => new Set([...prev, storyKey]))

      try {
        await addStoriesMutation.mutateAsync({
          projectId: selectedProjectId,
          stories: [story],
        })

        setApprovedStoryIds((prev) => new Set([...prev, storyKey]))
        utils.stories.listByProject.invalidate({ projectId: selectedProjectId })
      } catch (error) {
        console.error('Failed to approve story:', error)
      } finally {
        setApprovingStoryIds((prev) => {
          const next = new Set(prev)
          next.delete(storyKey)
          return next
        })
      }
    },
    [selectedProjectId, addStoriesMutation, utils],
  )

  // Handle bulk approve
  const handleBulkApprove = useCallback(
    async (stories: GeneratedStory[], messageId: string) => {
      if (!selectedProjectId) return

      // Mark all as approving
      const storyKeys = stories.map((s) => `${messageId}:${s.id}`)
      setApprovingStoryIds((prev) => new Set([...prev, ...storyKeys]))

      try {
        await addStoriesMutation.mutateAsync({
          projectId: selectedProjectId,
          stories,
        })

        setApprovedStoryIds((prev) => new Set([...prev, ...storyKeys]))
        utils.stories.listByProject.invalidate({ projectId: selectedProjectId })
      } catch (error) {
        console.error('Failed to bulk approve stories:', error)
      } finally {
        setApprovingStoryIds((prev) => {
          const next = new Set(prev)
          storyKeys.forEach((key) => next.delete(key))
          return next
        })
      }
    },
    [selectedProjectId, addStoriesMutation, utils],
  )

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput) return

    // Add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    // Simulate AI response (placeholder until API-008 is implemented)
    // TODO: Replace with actual API call when API-008 is done
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000))

    // Generate mock stories based on user message
    const generatedStories = selectedProject
      ? generateMockStories(trimmedInput, selectedProject.name)
      : []

    const hasStories = generatedStories.length > 0
    const contentText = selectedProjectId
      ? hasStories
        ? `Based on your request, I've generated ${generatedStories.length} user ${generatedStories.length === 1 ? 'story' : 'stories'} for ${selectedProject?.name}. You can review, edit, and approve them below.`
        : `I understand you want to work on the project. Here's what I can help you with:\n\n1. Generate user stories based on your requirements\n2. Refine acceptance criteria\n3. Suggest dependencies between stories\n4. Recommend skills for implementation\n\nWhat would you like to explore?`
      : `Please select a project first to start brainstorming user stories. The project selector is at the top of the page.`

    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: contentText,
      timestamp: new Date(),
      generatedStories: hasStories ? generatedStories : undefined,
    }

    setMessages((prev) => [...prev, assistantMessage])
    setIsTyping(false)
  }, [inputValue, selectedProjectId, selectedProject])

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
            <ProjectSelector
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
              isLoading={isLoadingProjects}
            />
          </div>
        </div>
      </div>

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
                  onBulkApprove={handleBulkApprove}
                  approvingStoryIds={approvingStoryIds}
                  approvedStoryIds={approvedStoryIds}
                />
              ))}
              {isTyping && <TypingIndicator />}
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
                disabled={isTyping}
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
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isTyping}
              className={cn(
                'p-3 rounded-xl shrink-0',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              aria-label="Send message"
              data-testid="send-button"
            >
              {isTyping ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
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

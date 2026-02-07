/**
 * Brainstorm Chat Hook
 *
 * Shared hook for managing brainstorm chat sessions with Claude.
 * Handles WebSocket streaming, message state, and story management.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { trpc } from '@/lib/trpc/client'
import { useWebSocket } from '@/lib/websocket/client'
import type { GeneratedStory } from '@/lib/websocket/types'

// Message type for chat history
export interface BrainstormMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  generatedStories?: GeneratedStory[]
  isStreaming?: boolean
}

// Chat state
export interface BrainstormChatState {
  messages: BrainstormMessage[]
  isLoading: boolean
  isStreaming: boolean
  error: string | null
  currentSessionId: string | null
}

// Hook options
export interface UseBrainstormChatOptions {
  projectId: number
  onStoriesGenerated?: (stories: GeneratedStory[]) => void
}

// Hook return type
export interface UseBrainstormChatReturn {
  // State
  messages: BrainstormMessage[]
  isLoading: boolean
  isStreaming: boolean
  error: string | null
  isConnected: boolean
  isReconnecting: boolean
  currentSessionId: string | null

  // Actions
  sendMessage: (content: string) => Promise<void>
  cancelSession: () => Promise<void>
  retry: () => void
  clearError: () => void
  clearMessages: () => void

  // Story management
  approvingStoryIds: Set<string>
  approvedStoryIds: Set<string>
  discardedStoryIds: Set<string>
  approveStory: (story: GeneratedStory, messageId: string) => Promise<void>
  bulkApprove: (stories: GeneratedStory[], messageId: string) => Promise<void>
  discardStory: (storyId: string, messageId: string) => void
  bulkDiscard: (storyIds: string[], messageId: string) => void
  updateStoryInMessage: (messageId: string, storyIndex: number, updatedStory: GeneratedStory) => void
}

// Generate unique ID for messages
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function useBrainstormChat({
  projectId,
  onStoriesGenerated,
}: UseBrainstormChatOptions): UseBrainstormChatReturn {
  // State
  const [messages, setMessages] = useState<BrainstormMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  // Story management state
  const [approvingStoryIds, setApprovingStoryIds] = useState<Set<string>>(new Set())
  const [approvedStoryIds, setApprovedStoryIds] = useState<Set<string>>(new Set())
  const [discardedStoryIds, setDiscardedStoryIds] = useState<Set<string>>(new Set())

  // Refs for tracking state in callbacks
  const currentMessageIdRef = useRef<string | null>(null)
  const streamedContentRef = useRef<string>('')
  const lastMessageRef = useRef<string>('')

  // tRPC mutations and utils
  const utils = trpc.useUtils()
  const chatMutation = trpc.brainstorm.chat.useMutation()
  const cancelMutation = trpc.brainstorm.cancelSession.useMutation()
  const addStoriesMutation = trpc.stories.addStories.useMutation()

  // WebSocket for streaming
  const {
    isConnected,
    isReconnecting,
    subscribe,
    unsubscribe,
  } = useWebSocket({
    onBrainstormStart: useCallback((data: { sessionId: string; projectId: string }) => {
      if (data.projectId !== String(projectId)) return
      setCurrentSessionId(data.sessionId)
      setIsLoading(false)
      setIsStreaming(true)
      streamedContentRef.current = ''

      // Create placeholder assistant message
      const messageId = generateId()
      currentMessageIdRef.current = messageId

      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        },
      ])
    }, [projectId]),

    onBrainstormChunk: useCallback((data: { sessionId: string; content: string }) => {
      if (!currentMessageIdRef.current) return

      streamedContentRef.current += data.content

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentMessageIdRef.current
            ? { ...msg, content: streamedContentRef.current }
            : msg
        )
      )
    }, []),

    onBrainstormStories: useCallback((data: { sessionId: string; stories: GeneratedStory[] }) => {
      if (!currentMessageIdRef.current) return

      onStoriesGenerated?.(data.stories)

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentMessageIdRef.current
            ? { ...msg, generatedStories: data.stories }
            : msg
        )
      )
    }, [onStoriesGenerated]),

    onBrainstormComplete: useCallback((data: { sessionId: string; content: string; stories: GeneratedStory[] }) => {
      if (!currentMessageIdRef.current) return

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentMessageIdRef.current
            ? {
                ...msg,
                content: data.content || streamedContentRef.current,
                generatedStories: data.stories.length > 0 ? data.stories : msg.generatedStories,
                isStreaming: false,
              }
            : msg
        )
      )

      setIsStreaming(false)
      setCurrentSessionId(null)
      currentMessageIdRef.current = null
      streamedContentRef.current = ''
    }, []),

    onBrainstormError: useCallback((data: { sessionId: string; error: string }) => {
      setError(data.error)
      setIsLoading(false)
      setIsStreaming(false)
      setCurrentSessionId(null)

      // Update the streaming message to show error
      if (currentMessageIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentMessageIdRef.current
              ? {
                  ...msg,
                  content: `Error: ${data.error}`,
                  isStreaming: false,
                }
              : msg
          )
        )
      }

      currentMessageIdRef.current = null
      streamedContentRef.current = ''
    }, []),

    onError: useCallback(() => {
      // WebSocket errors are handled by the client's reconnection logic
      // No need to log here as it creates noise during normal reconnection
    }, []),
  })

  // Subscribe to project on mount
  useEffect(() => {
    if (projectId && isConnected) {
      subscribe(String(projectId))
    }

    return () => {
      if (projectId) {
        unsubscribe(String(projectId))
      }
    }
  }, [projectId, isConnected, subscribe, unsubscribe])

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading || isStreaming) return

    lastMessageRef.current = content

    // Add user message
    const userMessage: BrainstormMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)
    setError(null)

    try {
      // Call tRPC mutation to start brainstorm session
      await chatMutation.mutateAsync({
        projectId,
        message: content.trim(),
      })
      // Response will come via WebSocket
    } catch (err) {
      setIsLoading(false)
      const errorMessage = err instanceof Error ? err.message : 'Failed to start brainstorm session'
      setError(errorMessage)

      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${errorMessage}`,
          timestamp: new Date(),
        },
      ])
    }
  }, [projectId, isLoading, isStreaming, chatMutation])

  // Cancel current session
  const cancelSession = useCallback(async () => {
    if (!currentSessionId) return

    try {
      await cancelMutation.mutateAsync({ sessionId: currentSessionId })
      setIsStreaming(false)
      setIsLoading(false)

      // Mark the streaming message as cancelled
      if (currentMessageIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentMessageIdRef.current
              ? {
                  ...msg,
                  content: msg.content + '\n\n[Cancelled]',
                  isStreaming: false,
                }
              : msg
          )
        )
      }

      setCurrentSessionId(null)
      currentMessageIdRef.current = null
    } catch (err) {
      console.error('Failed to cancel session:', err)
    }
  }, [currentSessionId, cancelMutation])

  // Retry last message
  const retry = useCallback(() => {
    if (lastMessageRef.current && !isLoading && !isStreaming) {
      // Remove the last error message if exists
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1]
        if (lastMsg?.role === 'assistant' && lastMsg.content.startsWith('Error:')) {
          return prev.slice(0, -1)
        }
        return prev
      })

      setError(null)
      sendMessage(lastMessageRef.current)
    }
  }, [isLoading, isStreaming, sendMessage])

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([])
    setApprovingStoryIds(new Set())
    setApprovedStoryIds(new Set())
    setDiscardedStoryIds(new Set())
  }, [])

  // Approve a single story
  const approveStory = useCallback(async (story: GeneratedStory, messageId: string) => {
    const storyKey = `${messageId}:${story.id}`
    setApprovingStoryIds((prev) => new Set([...prev, storyKey]))

    try {
      await addStoriesMutation.mutateAsync({
        projectId,
        stories: [story],
      })

      setApprovedStoryIds((prev) => new Set([...prev, storyKey]))
      utils.stories.listByProject.invalidate({ projectId })
    } catch (err) {
      console.error('Failed to approve story:', err)
    } finally {
      setApprovingStoryIds((prev) => {
        const next = new Set(prev)
        next.delete(storyKey)
        return next
      })
    }
  }, [projectId, addStoriesMutation, utils])

  // Bulk approve stories
  const bulkApprove = useCallback(async (stories: GeneratedStory[], messageId: string) => {
    const storyKeys = stories.map((s) => `${messageId}:${s.id}`)
    setApprovingStoryIds((prev) => new Set([...prev, ...storyKeys]))

    try {
      await addStoriesMutation.mutateAsync({
        projectId,
        stories,
      })

      setApprovedStoryIds((prev) => new Set([...prev, ...storyKeys]))
      utils.stories.listByProject.invalidate({ projectId })
    } catch (err) {
      console.error('Failed to bulk approve stories:', err)
    } finally {
      setApprovingStoryIds((prev) => {
        const next = new Set(prev)
        storyKeys.forEach((key) => next.delete(key))
        return next
      })
    }
  }, [projectId, addStoriesMutation, utils])

  // Discard a single story
  const discardStory = useCallback((storyId: string, messageId: string) => {
    const storyKey = `${messageId}:${storyId}`
    setDiscardedStoryIds((prev) => new Set([...prev, storyKey]))
  }, [])

  // Bulk discard stories
  const bulkDiscard = useCallback((storyIds: string[], messageId: string) => {
    const storyKeys = storyIds.map((id) => `${messageId}:${id}`)
    setDiscardedStoryIds((prev) => new Set([...prev, ...storyKeys]))
  }, [])

  // Update a story in a message
  const updateStoryInMessage = useCallback((messageId: string, storyIndex: number, updatedStory: GeneratedStory) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId && msg.generatedStories) {
          const newStories = [...msg.generatedStories]
          newStories[storyIndex] = updatedStory
          return { ...msg, generatedStories: newStories }
        }
        return msg
      })
    )
  }, [])

  return {
    // State
    messages,
    isLoading,
    isStreaming,
    error,
    isConnected,
    isReconnecting,
    currentSessionId,

    // Actions
    sendMessage,
    cancelSession,
    retry,
    clearError,
    clearMessages,

    // Story management
    approvingStoryIds,
    approvedStoryIds,
    discardedStoryIds,
    approveStory,
    bulkApprove,
    discardStory,
    bulkDiscard,
    updateStoryInMessage,
  }
}

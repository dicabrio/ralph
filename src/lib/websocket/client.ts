/**
 * WebSocket Client Hook
 *
 * React hook for managing WebSocket connections with:
 * - Automatic reconnection with exponential backoff
 * - Project log subscription
 * - Connection state management
 * - Message queueing during disconnection
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, ServerMessage, GeneratedStory } from './types'

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoff(attempt: number, baseInterval: number): number {
  const exponentialDelay = Math.min(baseInterval * 2 ** attempt, 30000)
  const jitter = Math.random() * 1000
  return exponentialDelay + jitter
}

export interface UseWebSocketOptions {
  /** WebSocket URL (defaults to ws://localhost:9001/ws) */
  url?: string
  /** Called when connection is established */
  onConnect?: (clientId: string) => void
  /** Called when connection is closed */
  onDisconnect?: (code: number, reason: string) => void
  /** Called when a log message is received */
  onLog?: (log: {
    projectId: string
    storyId?: string
    content: string
    logType: 'stdout' | 'stderr'
    timestamp: number
  }) => void
  /** Called on any error */
  onError?: (error: Event | string) => void
  /** Enable automatic reconnection (default: true) */
  reconnect?: boolean
  /** Maximum reconnection attempts (default: 10) */
  reconnectAttempts?: number
  /** Base reconnection interval in ms (default: 1000) */
  reconnectInterval?: number
  /** Called when a brainstorm session starts */
  onBrainstormStart?: (data: { sessionId: string; projectId: string }) => void
  /** Called when a brainstorm chunk is received (streaming text) */
  onBrainstormChunk?: (data: { sessionId: string; content: string }) => void
  /** Called when brainstorm stories are parsed */
  onBrainstormStories?: (data: { sessionId: string; stories: GeneratedStory[] }) => void
  /** Called when a brainstorm session completes */
  onBrainstormComplete?: (data: { sessionId: string; content: string; stories: GeneratedStory[] }) => void
  /** Called when a brainstorm session errors */
  onBrainstormError?: (data: { sessionId: string; error: string }) => void
  /** Called when stories are updated (prd.json changed) */
  onStoriesUpdated?: (data: { projectId: string }) => void
  /** Called when runner completes a story */
  onRunnerCompleted?: (data: {
    projectId: string
    storyId?: string
    exitCode: number
    success: boolean
    completedStoryStatus?: string
    nextStoryId?: string
    willAutoRestart: boolean
  }) => void
}

export interface UseWebSocketReturn {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean
  /** Whether the WebSocket is attempting to reconnect */
  isReconnecting: boolean
  /** Current client ID (set after connection) */
  clientId: string | null
  /** Subscribe to project logs */
  subscribe: (projectId: string) => void
  /** Unsubscribe from project logs */
  unsubscribe: (projectId: string) => void
  /** Manually disconnect */
  disconnect: () => void
  /** Manually reconnect */
  reconnect: () => void
  /** Set of currently subscribed project IDs */
  subscriptions: Set<string>
}

/**
 * React hook for WebSocket connection and project log subscription
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:9001/ws`
      : 'ws://localhost:9001/ws',
    onConnect,
    onDisconnect,
    onLog,
    onError,
    reconnect = true,
    reconnectAttempts = 10,
    reconnectInterval = 1000,
    onBrainstormStart,
    onBrainstormChunk,
    onBrainstormStories,
    onBrainstormComplete,
    onBrainstormError,
    onStoriesUpdated,
    onRunnerCompleted,
  } = options

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const messageQueueRef = useRef<ClientMessage[]>([])
  const subscriptionsRef = useRef<Set<string>>(new Set())
  const isReconnectingRef = useRef(false)

  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [, forceUpdate] = useState(0) // For re-rendering when subscriptions change

  /**
   * Send a message to the server
   */
  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      // Queue message for later
      messageQueueRef.current.push(message)
    }
  }, [])

  /**
   * Connect to the WebSocket server
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    const ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('[WS Client] Connected')
      setIsConnected(true)
      setIsReconnecting(false)
      isReconnectingRef.current = false
      reconnectAttemptsRef.current = 0

      // Send queued messages
      while (messageQueueRef.current.length > 0) {
        const message = messageQueueRef.current.shift()
        if (message) {
          ws.send(JSON.stringify(message))
        }
      }

      // Resubscribe to all previous subscriptions
      subscriptionsRef.current.forEach((projectId) => {
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            payload: { projectId },
            timestamp: Date.now(),
          })
        )
      })
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage
        handleMessage(message)
      } catch (error) {
        console.error('[WS Client] Failed to parse message:', error)
      }
    }

    ws.onclose = (event) => {
      console.log(`[WS Client] Disconnected: ${event.code} ${event.reason}`)
      setIsConnected(false)
      setClientId(null)
      wsRef.current = null

      onDisconnect?.(event.code, event.reason)

      // Attempt reconnection
      if (reconnect && reconnectAttemptsRef.current < reconnectAttempts) {
        setIsReconnecting(true)
        isReconnectingRef.current = true
        const delay = calculateBackoff(reconnectAttemptsRef.current, reconnectInterval)

        console.log(`[WS Client] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`)

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++
          connect()
        }, delay)
      }
    }

    ws.onerror = () => {
      // Connection errors are expected during reconnection attempts
      // Only log if this is the first connection attempt
      if (!isReconnectingRef.current && reconnectAttemptsRef.current === 0) {
        console.debug('[WS Client] Initial connection failed - will retry')
      }
      // Note: onerror is always followed by onclose, so reconnection happens there
    }

    wsRef.current = ws

    function handleMessage(message: ServerMessage) {
      switch (message.type) {
        case 'connected':
          setClientId(message.payload.clientId)
          onConnect?.(message.payload.clientId)
          break

        case 'subscribed':
          console.log(`[WS Client] Subscribed to project: ${message.payload.projectId}`)
          break

        case 'unsubscribed':
          console.log(`[WS Client] Unsubscribed from project: ${message.payload.projectId}`)
          break

        case 'log':
          onLog?.({
            projectId: message.payload.projectId,
            storyId: message.payload.storyId,
            content: message.payload.content,
            logType: message.payload.logType,
            timestamp: message.timestamp,
          })
          break

        case 'pong':
          // Heartbeat response, no action needed
          break

        case 'error':
          console.error(`[WS Client] Server error: ${message.payload.message}`)
          onError?.(message.payload.message)
          break

        case 'brainstorm_start':
          onBrainstormStart?.(message.payload)
          break

        case 'brainstorm_chunk':
          onBrainstormChunk?.(message.payload)
          break

        case 'brainstorm_stories':
          onBrainstormStories?.(message.payload)
          break

        case 'brainstorm_complete':
          onBrainstormComplete?.(message.payload)
          break

        case 'brainstorm_error':
          onBrainstormError?.(message.payload)
          break

        case 'stories_updated':
          onStoriesUpdated?.(message.payload)
          break

        case 'runner_completed':
          onRunnerCompleted?.(message.payload)
          break
      }
    }
  }, [url, reconnect, reconnectAttempts, reconnectInterval, onConnect, onDisconnect, onLog, onError, onBrainstormStart, onBrainstormChunk, onBrainstormStories, onBrainstormComplete, onBrainstormError, onStoriesUpdated, onRunnerCompleted])

  /**
   * Subscribe to project logs
   */
  const subscribe = useCallback(
    (projectId: string) => {
      subscriptionsRef.current.add(projectId)
      forceUpdate((n) => n + 1)
      sendMessage({
        type: 'subscribe',
        payload: { projectId },
        timestamp: Date.now(),
      })
    },
    [sendMessage]
  )

  /**
   * Unsubscribe from project logs
   */
  const unsubscribe = useCallback(
    (projectId: string) => {
      subscriptionsRef.current.delete(projectId)
      forceUpdate((n) => n + 1)
      sendMessage({
        type: 'unsubscribe',
        payload: { projectId },
        timestamp: Date.now(),
      })
    },
    [sendMessage]
  )

  /**
   * Disconnect from the WebSocket server
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    reconnectAttemptsRef.current = reconnectAttempts // Prevent reconnect
    setIsReconnecting(false)
    isReconnectingRef.current = false
    wsRef.current?.close(1000, 'Client disconnect')
  }, [reconnectAttempts])

  /**
   * Manually trigger reconnection
   */
  const reconnectManual = useCallback(() => {
    reconnectAttemptsRef.current = 0
    disconnect()
    setTimeout(connect, 100)
  }, [connect, disconnect])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close(1000, 'Component unmount')
    }
  }, [connect])

  return {
    isConnected,
    isReconnecting,
    clientId,
    subscribe,
    unsubscribe,
    disconnect,
    reconnect: reconnectManual,
    subscriptions: subscriptionsRef.current,
  }
}

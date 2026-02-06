/**
 * WebSocket Types
 *
 * Shared types for WebSocket communication between server and client.
 */

/**
 * Base message structure for all WebSocket messages
 */
export interface WSMessage {
  type: string
  payload?: unknown
  timestamp: number
}

/**
 * Client -> Server message types
 */
export type ClientMessage =
  | { type: 'subscribe'; payload: { projectId: string }; timestamp: number }
  | { type: 'unsubscribe'; payload: { projectId: string }; timestamp: number }
  | { type: 'ping'; timestamp: number }

/**
 * Server -> Client message types
 */
export type ServerMessage =
  | { type: 'connected'; payload: { clientId: string }; timestamp: number }
  | { type: 'subscribed'; payload: { projectId: string }; timestamp: number }
  | { type: 'unsubscribed'; payload: { projectId: string }; timestamp: number }
  | {
      type: 'log'
      payload: {
        projectId: string
        storyId?: string
        content: string
        logType: 'stdout' | 'stderr'
      }
      timestamp: number
    }
  | { type: 'pong'; timestamp: number }
  | { type: 'error'; payload: { message: string }; timestamp: number }

/**
 * Extended WebSocket connection with tracking info
 */
export interface ExtendedWebSocket {
  id: string
  isAlive: boolean
  lastPing: number
  subscriptions: Set<string> // Project IDs this client is subscribed to
}

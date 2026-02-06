/**
 * WebSocket Module
 *
 * Exports for both server and client WebSocket functionality.
 */

// Types
export type {
  WSMessage,
  ClientMessage,
  ServerMessage,
  ExtendedWebSocket,
} from './types'

// Server (only import on server-side)
export {
  createWebSocketServer,
  getWebSocketServer,
  setWebSocketServer,
  type WebSocketServerInstance,
} from './server'

// Client hook (for React components)
export { useWebSocket, type UseWebSocketOptions, type UseWebSocketReturn } from './client'

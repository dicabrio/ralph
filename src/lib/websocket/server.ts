/**
 * WebSocket Server
 *
 * Server-side WebSocket implementation for streaming runner logs.
 * - Handles client connections and project subscriptions
 * - Broadcasts log updates to subscribed clients
 * - Implements heartbeat for connection health monitoring
 */
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import type { ClientMessage, ServerMessage, ExtendedWebSocket } from './types'

const HEARTBEAT_INTERVAL = 30000 // 30 seconds
const LOG_BUFFER_SIZE = 100 // Number of log lines to buffer per project

interface LogEntry {
  projectId: string
  storyId?: string
  content: string
  logType: 'stdout' | 'stderr'
  timestamp: number
}

export interface WebSocketServerInstance {
  wss: WebSocketServer
  clients: Map<string, WebSocket & ExtendedWebSocket>
  broadcast: (projectId: string, message: ServerMessage) => void
  broadcastLog: (
    projectId: string,
    storyId: string | undefined,
    content: string,
    logType: 'stdout' | 'stderr'
  ) => void
  broadcastToProject: (projectId: string, message: ServerMessage) => void
  getSubscriberCount: (projectId: string) => number
  close: () => void
}

/**
 * Create a WebSocket server instance
 *
 * @param options - Server options
 * @param options.server - HTTP server to attach to (mutually exclusive with port)
 * @param options.port - Port to listen on (mutually exclusive with server)
 * @param options.path - WebSocket endpoint path (default: '/ws')
 */
export function createWebSocketServer(options: {
  server?: Server
  port?: number
  path?: string
}): WebSocketServerInstance {
  const { server, port, path = '/ws' } = options

  // Create WebSocket server
  // Note: When using standalone mode (just port), path matching is handled below.
  // When using noServer mode (with HTTP server), path matching is done on upgrade.
  const wss = new WebSocketServer({
    ...(server ? { noServer: true } : { port }),
    maxPayload: 1024 * 1024, // 1MB max message size
  })

  // If using noServer mode, handle HTTP upgrade manually
  if (server) {
    server.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url || '', `http://${request.headers.host}`)
      if (pathname === path) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request)
        })
      }
    })
  }

  // Track connected clients
  const clients = new Map<string, WebSocket & ExtendedWebSocket>()

  // Buffer recent logs per project for late joiners
  const logBuffer = new Map<string, LogEntry[]>()

  // Connection handler
  wss.on('connection', (ws: WebSocket) => {
    const clientId = crypto.randomUUID()
    const extendedWs = ws as WebSocket & ExtendedWebSocket

    // Initialize client tracking
    extendedWs.id = clientId
    extendedWs.isAlive = true
    extendedWs.lastPing = Date.now()
    extendedWs.subscriptions = new Set()

    clients.set(clientId, extendedWs)

    console.log(`[WS] Client connected: ${clientId}`)

    // Send welcome message
    sendMessage(extendedWs, {
      type: 'connected',
      payload: { clientId },
      timestamp: Date.now(),
    })

    // Message handler
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage
        handleMessage(extendedWs, message)
      } catch {
        sendMessage(extendedWs, {
          type: 'error',
          payload: { message: 'Invalid message format' },
          timestamp: Date.now(),
        })
      }
    })

    // Pong handler (heartbeat response)
    ws.on('pong', () => {
      extendedWs.isAlive = true
      extendedWs.lastPing = Date.now()
    })

    // Close handler
    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`)
      clients.delete(clientId)
    })

    // Error handler
    ws.on('error', (error) => {
      console.error(`[WS] Error for client ${clientId}:`, error)
      clients.delete(clientId)
    })
  })

  // Heartbeat interval to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WebSocket & ExtendedWebSocket

      if (!client.isAlive) {
        console.log(`[WS] Terminating inactive client: ${client.id}`)
        client.terminate()
        clients.delete(client.id)
        return
      }

      client.isAlive = false
      client.ping()
    })
  }, HEARTBEAT_INTERVAL)

  // Cleanup on server close
  wss.on('close', () => {
    clearInterval(heartbeatInterval)
  })

  /**
   * Send a message to a single client
   */
  function sendMessage(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * Handle incoming client messages
   */
  function handleMessage(ws: WebSocket & ExtendedWebSocket, message: ClientMessage) {
    switch (message.type) {
      case 'subscribe': {
        const { projectId } = message.payload
        ws.subscriptions.add(projectId)
        console.log(`[WS] Client ${ws.id} subscribed to project: ${projectId}`)

        sendMessage(ws, {
          type: 'subscribed',
          payload: { projectId },
          timestamp: Date.now(),
        })

        // Send buffered logs for this project
        const bufferedLogs = logBuffer.get(projectId) || []
        for (const log of bufferedLogs) {
          sendMessage(ws, {
            type: 'log',
            payload: {
              projectId: log.projectId,
              storyId: log.storyId,
              content: log.content,
              logType: log.logType,
            },
            timestamp: log.timestamp,
          })
        }
        break
      }

      case 'unsubscribe': {
        const { projectId } = message.payload
        ws.subscriptions.delete(projectId)
        console.log(`[WS] Client ${ws.id} unsubscribed from project: ${projectId}`)

        sendMessage(ws, {
          type: 'unsubscribed',
          payload: { projectId },
          timestamp: Date.now(),
        })
        break
      }

      case 'ping':
        sendMessage(ws, {
          type: 'pong',
          timestamp: Date.now(),
        })
        break

      default:
        console.log(`[WS] Unknown message type from client ${ws.id}`)
    }
  }

  /**
   * Broadcast a message to all clients subscribed to a project
   */
  function broadcast(projectId: string, message: ServerMessage) {
    clients.forEach((client) => {
      if (client.subscriptions.has(projectId)) {
        sendMessage(client, message)
      }
    })
  }

  /**
   * Broadcast a log entry to all subscribed clients
   * Also buffers the log for late joiners
   */
  function broadcastLog(
    projectId: string,
    storyId: string | undefined,
    content: string,
    logType: 'stdout' | 'stderr'
  ) {
    const timestamp = Date.now()

    // Buffer the log
    if (!logBuffer.has(projectId)) {
      logBuffer.set(projectId, [])
    }
    const buffer = logBuffer.get(projectId)!
    buffer.push({ projectId, storyId, content, logType, timestamp })

    // Trim buffer if too large
    if (buffer.length > LOG_BUFFER_SIZE) {
      buffer.shift()
    }

    // Broadcast to subscribers
    broadcast(projectId, {
      type: 'log',
      payload: { projectId, storyId, content, logType },
      timestamp,
    })
  }

  /**
   * Get the number of clients subscribed to a project
   */
  function getSubscriberCount(projectId: string): number {
    let count = 0
    clients.forEach((client) => {
      if (client.subscriptions.has(projectId)) {
        count++
      }
    })
    return count
  }

  /**
   * Close the WebSocket server
   */
  function close() {
    clearInterval(heartbeatInterval)
    wss.close()
  }

  /**
   * Broadcast any message to all clients subscribed to a project
   * (Alias for broadcast with better naming for general messages)
   */
  function broadcastToProject(projectId: string, message: ServerMessage) {
    broadcast(projectId, message)
  }

  return {
    wss,
    clients,
    broadcast,
    broadcastLog,
    broadcastToProject,
    getSubscriberCount,
    close,
  }
}

// Global server instance key
const WS_SERVER_KEY = '__RALPH_WS_SERVER__' as const

// Extend globalThis type
declare global {
  var [WS_SERVER_KEY]: WebSocketServerInstance | undefined
}

/**
 * Get or create the global WebSocket server instance
 */
export function getWebSocketServer(): WebSocketServerInstance | null {
  return globalThis[WS_SERVER_KEY] ?? null
}

/**
 * Set the global WebSocket server instance
 */
export function setWebSocketServer(server: WebSocketServerInstance) {
  globalThis[WS_SERVER_KEY] = server
}

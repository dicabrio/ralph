/**
 * Vite Plugin for WebSocket Server
 *
 * Starts a WebSocket server during development alongside Vite's dev server.
 * The WebSocket server runs on port 9001 (next to the HTTP server on 9000).
 */
import type { Plugin } from 'vite'
import { createWebSocketServer, setWebSocketServer } from './server'

export interface WebSocketPluginOptions {
  /** Port to run WebSocket server on (default: 9001) */
  port?: number
  /** Enable verbose logging (default: false) */
  verbose?: boolean
}

export function webSocketPlugin(options: WebSocketPluginOptions = {}): Plugin {
  const { port = 9001, verbose = false } = options

  return {
    name: 'ralph-websocket',
    apply: 'serve', // Only run during development

    configureServer() {
      const wsServer = createWebSocketServer({ port })
      setWebSocketServer(wsServer)

      console.log(`[Ralph] WebSocket server started on ws://localhost:${port}/ws`)

      if (verbose) {
        console.log('[Ralph] WebSocket server ready for connections')
      }

      // Clean up on server close
      return () => {
        wsServer.close()
        console.log('[Ralph] WebSocket server closed')
      }
    },
  }
}

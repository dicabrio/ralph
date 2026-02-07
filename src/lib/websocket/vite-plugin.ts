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

    configureServer(server) {
      const startWsServer = () => {
        try {
          const wsServer = createWebSocketServer({ port })
          setWebSocketServer(wsServer)

          wsServer.wss.on('listening', () => {
            console.log(`[Ralph] WebSocket server listening on ws://localhost:${port}/ws`)
          })

          wsServer.wss.on('error', (err) => {
            console.error(`[Ralph] WebSocket server error:`, err)
          })

          if (verbose) {
            console.log('[Ralph] WebSocket server initializing...')
          }

          // Clean up on Vite server close
          server.httpServer?.on('close', () => {
            wsServer.close()
            console.log('[Ralph] WebSocket server closed')
          })
        } catch (err) {
          console.error('[Ralph] Failed to start WebSocket server:', err)
        }
      }

      // Start WebSocket server - either when HTTP server is ready or immediately
      if (server.httpServer) {
        if (server.httpServer.listening) {
          // HTTP server already listening
          startWsServer()
        } else {
          // Wait for HTTP server to start
          server.httpServer.once('listening', startWsServer)
        }
      } else {
        // No HTTP server (e.g., middleware mode) - start immediately
        console.log('[Ralph] No HTTP server detected, starting WebSocket server directly')
        startWsServer()
      }

      console.log(`[Ralph] WebSocket plugin configured (will start on port ${port})`)
    },
  }
}

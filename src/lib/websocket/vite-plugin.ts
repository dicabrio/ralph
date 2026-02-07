/**
 * Vite Plugin for WebSocket Server
 *
 * NOTE: The actual WebSocket server is now started in the tRPC API handler
 * (src/routes/api/trpc/$.ts) to ensure it runs in the same context as the
 * API routes that need to broadcast messages.
 *
 * This plugin is kept for backwards compatibility and only logs a message.
 */
import type { Plugin } from 'vite'

export interface WebSocketPluginOptions {
  /** Port to run WebSocket server on (default: 9001) */
  port?: number
  /** Enable verbose logging (default: false) */
  verbose?: boolean
}

export function webSocketPlugin(options: WebSocketPluginOptions = {}): Plugin {
  const { port = 9001 } = options

  return {
    name: 'ralph-websocket',
    apply: 'serve', // Only run during development

    configureServer(_server) {
      // WebSocket server is now initialized in src/routes/api/trpc/$.ts
      // This ensures it runs in the same context as the API handlers
      console.log(`[Ralph] WebSocket plugin configured. Server will start on port ${port} when API is first accessed.`)
    },
  }
}

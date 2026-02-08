/**
 * tRPC API Handler
 *
 * Handles all tRPC requests at /api/trpc/*
 * Uses the fetch adapter for compatibility with TanStack Start.
 */
import { createFileRoute } from '@tanstack/react-router'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/lib/trpc/routers'
import { createContext } from '@/lib/trpc/context'
import { createWebSocketServer, setWebSocketServer, getWebSocketServer } from '@/lib/websocket/server'
import { initPrdFileWatcher } from '@/lib/services/prdFileWatcher'

// Initialize WebSocket server in the API context (only once)
// This ensures WebSocket broadcasts work from tRPC handlers
function initWebSocketServer() {
  if (getWebSocketServer()) {
    return // Already initialized
  }
  try {
    const wsServer = createWebSocketServer({ port: 9001 })
    setWebSocketServer(wsServer)
  } catch (error: unknown) {
    // Handle port already in use gracefully
    const isAddressInUse = error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'EADDRINUSE'
    if (!isAddressInUse) {
      console.error('[tRPC] Failed to initialize WebSocket server:', error)
    }
  }
}

// Initialize PRD file watcher after WebSocket server is ready
async function initFileWatcher() {
  try {
    await initPrdFileWatcher()
    console.log('[tRPC] PRD file watcher initialized')
  } catch (error) {
    console.error('[tRPC] Failed to initialize PRD file watcher:', error)
  }
}

// Run initialization
initWebSocketServer()
// Initialize file watcher in background (don't block)
initFileWatcher()

/**
 * Handle tRPC requests
 */
async function handleTRPC(request: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext,
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: ({ request }) => handleTRPC(request),
      POST: ({ request }) => handleTRPC(request),
    },
  },
})

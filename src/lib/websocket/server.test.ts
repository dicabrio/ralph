/**
 * WebSocket Server Tests
 *
 * Unit tests for the WebSocket server implementation.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { createWebSocketServer, type WebSocketServerInstance } from './server'
import type { ServerMessage, ClientMessage } from './types'

// Test port to avoid conflicts - use random port per test suite
const TEST_PORT = 9099 + Math.floor(Math.random() * 100)

interface TestClient {
  ws: WebSocket
  messages: ServerMessage[]
  waitForMessage: (type: string, timeoutMs?: number) => Promise<ServerMessage>
}

/**
 * Helper to create a WebSocket client with proper error handling and message collection
 */
function createClient(port: number): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    const messages: ServerMessage[] = []
    const pendingWaiters: Array<{
      type: string
      resolve: (msg: ServerMessage) => void
      reject: (err: Error) => void
    }> = []

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as ServerMessage
      messages.push(msg)

      // Check if any waiter is waiting for this message type
      const waiterIndex = pendingWaiters.findIndex((w) => w.type === msg.type)
      if (waiterIndex !== -1) {
        const waiter = pendingWaiters.splice(waiterIndex, 1)[0]
        waiter.resolve(msg)
      }
    })

    ws.on('open', () => {
      resolve({
        ws,
        messages,
        waitForMessage: (type: string, timeoutMs = 3000): Promise<ServerMessage> => {
          // Check if we already have a message of this type
          const existing = messages.find((m) => m.type === type)
          if (existing) {
            return Promise.resolve(existing)
          }

          // Otherwise, wait for it
          return new Promise((resolveWait, rejectWait) => {
            const timeout = setTimeout(() => {
              const idx = pendingWaiters.findIndex((w) => w.type === type)
              if (idx !== -1) pendingWaiters.splice(idx, 1)
              rejectWait(new Error(`Timeout waiting for message type: ${type}`))
            }, timeoutMs)

            pendingWaiters.push({
              type,
              resolve: (msg) => {
                clearTimeout(timeout)
                resolveWait(msg)
              },
              reject: rejectWait,
            })
          })
        },
      })
    })

    ws.on('error', (err) => reject(err))
  })
}

describe('WebSocket Server', () => {
  let wsServer: WebSocketServerInstance
  let testPort: number

  beforeEach(async () => {
    // Use unique port per test to avoid conflicts
    testPort = TEST_PORT + Math.floor(Math.random() * 1000)
    wsServer = createWebSocketServer({ port: testPort })

    // Wait for server to be ready
    await new Promise<void>((resolve) => {
      wsServer.wss.on('listening', resolve)
    })
  })

  afterEach(async () => {
    // Close all clients first
    for (const client of wsServer.clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        client.close()
      }
    }
    wsServer.close()
    // Give time for cleanup
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  describe('Connection', () => {
    it('should accept client connections', async () => {
      const client = await createClient(testPort)
      expect(client.ws.readyState).toBe(WebSocket.OPEN)
      client.ws.close()
    })

    it('should send connected message with clientId on connection', async () => {
      const client = await createClient(testPort)

      const message = await client.waitForMessage('connected')

      expect(message.type).toBe('connected')
      if (message.type === 'connected') {
        expect(message.payload).toHaveProperty('clientId')
        expect(typeof message.payload.clientId).toBe('string')
      }
      client.ws.close()
    })

    it('should track connected clients', async () => {
      const client1 = await createClient(testPort)
      const client2 = await createClient(testPort)

      // Wait for both to be registered
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(wsServer.clients.size).toBe(2)

      client1.ws.close()
      client2.ws.close()

      // Wait for close to be processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(wsServer.clients.size).toBe(0)
    })
  })

  describe('Subscription', () => {
    it('should handle subscribe message', async () => {
      const client = await createClient(testPort)
      const projectId = 'test-project-1'

      // Wait for connected message
      await client.waitForMessage('connected')

      const subscribeMsg: ClientMessage = {
        type: 'subscribe',
        payload: { projectId },
        timestamp: Date.now(),
      }
      client.ws.send(JSON.stringify(subscribeMsg))

      // Wait for subscription to be processed
      await client.waitForMessage('subscribed')

      // Verify subscription
      const [clientEntry] = wsServer.clients.values()
      expect(clientEntry.subscriptions.has(projectId)).toBe(true)

      client.ws.close()
    })

    it('should send subscribed confirmation', async () => {
      const client = await createClient(testPort)
      const projectId = 'test-project-2'

      // Wait for connected message
      await client.waitForMessage('connected')

      const subscribeMsg: ClientMessage = {
        type: 'subscribe',
        payload: { projectId },
        timestamp: Date.now(),
      }
      client.ws.send(JSON.stringify(subscribeMsg))

      const subscribedMsg = await client.waitForMessage('subscribed')

      expect(subscribedMsg).toBeDefined()
      if (subscribedMsg.type === 'subscribed') {
        expect(subscribedMsg.payload.projectId).toBe(projectId)
      }

      client.ws.close()
    })

    it('should handle unsubscribe message', async () => {
      const client = await createClient(testPort)
      const projectId = 'test-project-3'

      // Wait for connected message
      await client.waitForMessage('connected')

      // Subscribe first
      client.ws.send(
        JSON.stringify({
          type: 'subscribe',
          payload: { projectId },
          timestamp: Date.now(),
        })
      )

      await client.waitForMessage('subscribed')

      // Clear messages to wait for unsubscribed
      client.messages.length = 0

      // Now unsubscribe
      client.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          payload: { projectId },
          timestamp: Date.now(),
        })
      )

      await client.waitForMessage('unsubscribed')

      const [clientEntry] = wsServer.clients.values()
      expect(clientEntry.subscriptions.has(projectId)).toBe(false)

      client.ws.close()
    })
  })

  describe('Broadcasting', () => {
    it('should broadcast logs to subscribed clients only', async () => {
      const projectId = 'test-project-4'

      const client1 = await createClient(testPort)
      const client2 = await createClient(testPort)

      // Wait for both connected messages
      await Promise.all([client1.waitForMessage('connected'), client2.waitForMessage('connected')])

      // Only client1 subscribes
      client1.ws.send(
        JSON.stringify({
          type: 'subscribe',
          payload: { projectId },
          timestamp: Date.now(),
        })
      )

      await client1.waitForMessage('subscribed')

      // Clear messages
      client1.messages.length = 0
      client2.messages.length = 0

      // Broadcast a log
      wsServer.broadcastLog(projectId, 'story-1', 'Test log message', 'stdout')

      await new Promise((resolve) => setTimeout(resolve, 50))

      // Client1 should have the log, client2 should not
      const client1Log = client1.messages.find((m) => m.type === 'log')
      const client2Log = client2.messages.find((m) => m.type === 'log')

      expect(client1Log).toBeDefined()
      expect(client2Log).toBeUndefined()

      client1.ws.close()
      client2.ws.close()
    })

    it('should buffer logs for late joiners', async () => {
      const projectId = 'test-project-5'

      // Broadcast log before any clients connect
      wsServer.broadcastLog(projectId, 'story-1', 'Buffered log 1', 'stdout')
      wsServer.broadcastLog(projectId, 'story-1', 'Buffered log 2', 'stdout')

      // Now connect a client and subscribe
      const client = await createClient(testPort)

      // Wait for connected message
      await client.waitForMessage('connected')

      // Clear messages
      client.messages.length = 0

      client.ws.send(
        JSON.stringify({
          type: 'subscribe',
          payload: { projectId },
          timestamp: Date.now(),
        })
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should receive buffered logs
      const logMessages = client.messages.filter(
        (m): m is Extract<ServerMessage, { type: 'log' }> => m.type === 'log'
      )
      expect(logMessages.length).toBe(2)
      expect(logMessages[0].payload.content).toBe('Buffered log 1')
      expect(logMessages[1].payload.content).toBe('Buffered log 2')

      client.ws.close()
    })
  })

  describe('Ping/Pong', () => {
    it('should respond to ping with pong', async () => {
      const client = await createClient(testPort)

      // Wait for connected message
      await client.waitForMessage('connected')

      // Clear messages
      client.messages.length = 0

      client.ws.send(
        JSON.stringify({
          type: 'ping',
          timestamp: Date.now(),
        })
      )

      const pongMsg = await client.waitForMessage('pong')
      expect(pongMsg).toBeDefined()
      expect(pongMsg.type).toBe('pong')

      client.ws.close()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON messages gracefully', async () => {
      const client = await createClient(testPort)

      // Wait for connected message
      await client.waitForMessage('connected')

      // Clear messages
      client.messages.length = 0

      // Send invalid JSON
      client.ws.send('not valid json')

      const errorMsg = await client.waitForMessage('error')
      expect(errorMsg).toBeDefined()
      if (errorMsg.type === 'error') {
        expect(errorMsg.payload.message).toBe('Invalid message format')
      }

      client.ws.close()
    })
  })

  describe('Subscriber Count', () => {
    it('should correctly count subscribers per project', async () => {
      const projectId = 'test-project-6'

      const client1 = await createClient(testPort)
      const client2 = await createClient(testPort)

      // Wait for connected messages
      await Promise.all([client1.waitForMessage('connected'), client2.waitForMessage('connected')])

      expect(wsServer.getSubscriberCount(projectId)).toBe(0)

      client1.ws.send(
        JSON.stringify({
          type: 'subscribe',
          payload: { projectId },
          timestamp: Date.now(),
        })
      )

      await client1.waitForMessage('subscribed')
      expect(wsServer.getSubscriberCount(projectId)).toBe(1)

      client2.ws.send(
        JSON.stringify({
          type: 'subscribe',
          payload: { projectId },
          timestamp: Date.now(),
        })
      )

      await client2.waitForMessage('subscribed')
      expect(wsServer.getSubscriberCount(projectId)).toBe(2)

      client1.ws.close()
      client2.ws.close()
    })
  })
})

# WebSocket Best Practices

Dit document beschrijft de aanbevolen best practices voor WebSocket client/server implementatie, inclusief connection management, reconnection, security, en scalability.

## Inhoudsopgave

- [Server Implementatie](#server-implementatie)
- [Client Implementatie](#client-implementatie)
- [Connection Management](#connection-management)
- [Reconnection Strategies](#reconnection-strategies)
- [Security](#security)
- [Scalability](#scalability)
- [Monitoring](#monitoring)

---

## Server Implementatie

### Node.js Server met ws

```typescript
// src/websocket/server.ts
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import { verifyToken } from './auth';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  userId: string;
  isAlive: boolean;
  lastPing: number;
}

interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export function createWebSocketServer(server: any) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 1024 * 1024, // 1MB max message size
  });

  const clients = new Map<string, ExtendedWebSocket>();

  // Connection handler
  wss.on('connection', async (ws: ExtendedWebSocket, req: IncomingMessage) => {
    try {
      // Authenticatie
      const { query } = parse(req.url || '', true);
      const token = query.token as string;

      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      const user = await verifyToken(token);
      if (!user) {
        ws.close(4002, 'Invalid token');
        return;
      }

      // Setup client
      ws.id = crypto.randomUUID();
      ws.userId = user.id;
      ws.isAlive = true;
      ws.lastPing = Date.now();

      clients.set(ws.id, ws);

      console.log(`Client connected: ${ws.id} (user: ${ws.userId})`);

      // Welcome message
      sendMessage(ws, {
        type: 'connected',
        payload: { clientId: ws.id },
        timestamp: Date.now(),
      });

      // Message handler
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          handleMessage(ws, message);
        } catch (error) {
          sendMessage(ws, {
            type: 'error',
            payload: { message: 'Invalid message format' },
            timestamp: Date.now(),
          });
        }
      });

      // Pong handler (heartbeat response)
      ws.on('pong', () => {
        ws.isAlive = true;
        ws.lastPing = Date.now();
      });

      // Close handler
      ws.on('close', (code, reason) => {
        console.log(`Client disconnected: ${ws.id} (code: ${code})`);
        clients.delete(ws.id);
      });

      // Error handler
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.id}:`, error);
        clients.delete(ws.id);
      });

    } catch (error) {
      console.error('Connection error:', error);
      ws.close(4000, 'Connection error');
    }
  });

  // Heartbeat interval (elke 30 seconden)
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as ExtendedWebSocket;

      if (!client.isAlive) {
        console.log(`Terminating inactive client: ${client.id}`);
        client.terminate();
        clients.delete(client.id);
        return;
      }

      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Helper functions
  function sendMessage(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function broadcast(message: WebSocketMessage, excludeId?: string) {
    clients.forEach((client) => {
      if (client.id !== excludeId) {
        sendMessage(client, message);
      }
    });
  }

  function sendToUser(userId: string, message: WebSocketMessage) {
    clients.forEach((client) => {
      if (client.userId === userId) {
        sendMessage(client, message);
      }
    });
  }

  function handleMessage(ws: ExtendedWebSocket, message: WebSocketMessage) {
    switch (message.type) {
      case 'ping':
        sendMessage(ws, {
          type: 'pong',
          payload: null,
          timestamp: Date.now(),
        });
        break;

      case 'subscribe':
        // Handle channel subscription
        handleSubscribe(ws, message.payload as { channel: string });
        break;

      case 'message':
        // Handle chat message
        handleChatMessage(ws, message.payload as { text: string; roomId: string });
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  return {
    wss,
    clients,
    broadcast,
    sendToUser,
  };
}
```

### Message Queue Integration (Redis Pub/Sub)

```typescript
// src/websocket/pubsub.ts
import Redis from 'ioredis';

const publisher = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

interface PubSubMessage {
  type: string;
  payload: unknown;
  targetUserIds?: string[];
  excludeClientId?: string;
}

export function setupPubSub(wsServer: ReturnType<typeof createWebSocketServer>) {
  // Subscribe to channels
  subscriber.subscribe('websocket:broadcast', 'websocket:direct');

  subscriber.on('message', (channel, message) => {
    const data = JSON.parse(message) as PubSubMessage;

    switch (channel) {
      case 'websocket:broadcast':
        wsServer.broadcast(
          { type: data.type, payload: data.payload, timestamp: Date.now() },
          data.excludeClientId
        );
        break;

      case 'websocket:direct':
        if (data.targetUserIds) {
          data.targetUserIds.forEach((userId) => {
            wsServer.sendToUser(userId, {
              type: data.type,
              payload: data.payload,
              timestamp: Date.now(),
            });
          });
        }
        break;
    }
  });

  // Publish helpers
  return {
    broadcast: (type: string, payload: unknown, excludeClientId?: string) => {
      publisher.publish(
        'websocket:broadcast',
        JSON.stringify({ type, payload, excludeClientId })
      );
    },

    sendToUsers: (userIds: string[], type: string, payload: unknown) => {
      publisher.publish(
        'websocket:direct',
        JSON.stringify({ type, payload, targetUserIds: userIds })
      );
    },
  };
}
```

---

## Client Implementatie

### React WebSocket Hook

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from 'react';

interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

interface UseWebSocketOptions {
  url: string;
  token: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: (code: number, reason: string) => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  send: (type: string, payload: unknown) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    token,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnect = true,
    reconnectAttempts = 5,
    reconnectInterval = 1000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const messageQueueRef = useRef<string[]>([]);

  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Connect functie
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;

      // Verzend queued messages
      while (messageQueueRef.current.length > 0) {
        const message = messageQueueRef.current.shift();
        if (message) ws.send(message);
      }

      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log(`WebSocket disconnected: ${event.code} ${event.reason}`);
      setIsConnected(false);
      wsRef.current = null;

      onDisconnect?.(event.code, event.reason);

      // Reconnect logic
      if (
        reconnect &&
        event.code !== 4001 && // Auth required
        event.code !== 4002 && // Invalid token
        reconnectAttemptsRef.current < reconnectAttempts
      ) {
        setIsReconnecting(true);
        const delay = calculateBackoff(reconnectAttemptsRef.current, reconnectInterval);

        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    };

    wsRef.current = ws;
  }, [url, token, reconnect, reconnectAttempts, reconnectInterval, onMessage, onConnect, onDisconnect, onError]);

  // Send functie
  const send = useCallback((type: string, payload: unknown) => {
    const message = JSON.stringify({
      type,
      payload,
      timestamp: Date.now(),
    });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      // Queue message voor later
      messageQueueRef.current.push(message);
    }
  }, []);

  // Disconnect functie
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectAttemptsRef.current = reconnectAttempts; // Prevent reconnect
    wsRef.current?.close(1000, 'Client disconnect');
  }, [reconnectAttempts]);

  // Manual reconnect
  const reconnectManual = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  // Effect voor initial connect en cleanup
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close(1000, 'Component unmount');
    };
  }, [connect]);

  return {
    isConnected,
    isReconnecting,
    send,
    disconnect,
    reconnect: reconnectManual,
  };
}

// Exponential backoff met jitter
function calculateBackoff(attempt: number, baseInterval: number): number {
  const exponentialDelay = Math.min(baseInterval * Math.pow(2, attempt), 30000);
  const jitter = Math.random() * 1000;
  return exponentialDelay + jitter;
}
```

### WebSocket Context Provider

```typescript
// src/contexts/WebSocketContext.tsx
import { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';

interface WebSocketContextValue {
  isConnected: boolean;
  isReconnecting: boolean;
  send: (type: string, payload: unknown) => void;
  subscribe: (type: string, handler: (payload: unknown) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const handlers = useMemo(() => new Map<string, Set<(payload: unknown) => void>>(), []);

  const handleMessage = useCallback((message: { type: string; payload: unknown }) => {
    const typeHandlers = handlers.get(message.type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => handler(message.payload));
    }
  }, [handlers]);

  const { isConnected, isReconnecting, send } = useWebSocket({
    url: process.env.NEXT_PUBLIC_WS_URL!,
    token: token || '',
    onMessage: handleMessage,
    onConnect: () => console.log('WebSocket connected'),
    onDisconnect: (code) => console.log('WebSocket disconnected:', code),
  });

  const subscribe = useCallback((type: string, handler: (payload: unknown) => void) => {
    if (!handlers.has(type)) {
      handlers.set(type, new Set());
    }
    handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.get(type)?.delete(handler);
    };
  }, [handlers]);

  const value = useMemo(
    () => ({ isConnected, isReconnecting, send, subscribe }),
    [isConnected, isReconnecting, send, subscribe]
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
}
```

---

## Connection Management

### Heartbeat Implementatie

```typescript
// Server-side heartbeat
const HEARTBEAT_INTERVAL = 30000; // 30 seconden
const CLIENT_TIMEOUT = 60000; // 60 seconden

setInterval(() => {
  wss.clients.forEach((ws) => {
    const client = ws as ExtendedWebSocket;
    const timeSinceLastPing = Date.now() - client.lastPing;

    if (timeSinceLastPing > CLIENT_TIMEOUT) {
      console.log(`Client ${client.id} timed out`);
      client.terminate();
      return;
    }

    if (!client.isAlive) {
      console.log(`Client ${client.id} did not respond to ping`);
      client.terminate();
      return;
    }

    client.isAlive = false;
    client.ping();
  });
}, HEARTBEAT_INTERVAL);

// Client-side heartbeat
function setupClientHeartbeat(ws: WebSocket) {
  const PING_INTERVAL = 25000; // Iets korter dan server interval

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    }
  }, PING_INTERVAL);

  ws.onclose = () => clearInterval(pingInterval);
}
```

### Connection Limits

```typescript
// Rate limiting per IP
const connectionCounts = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 10;

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const currentCount = connectionCounts.get(ip) || 0;

  if (currentCount >= MAX_CONNECTIONS_PER_IP) {
    ws.close(4003, 'Too many connections');
    return;
  }

  connectionCounts.set(ip, currentCount + 1);

  ws.on('close', () => {
    const count = connectionCounts.get(ip) || 1;
    if (count <= 1) {
      connectionCounts.delete(ip);
    } else {
      connectionCounts.set(ip, count - 1);
    }
  });
});
```

---

## Reconnection Strategies

### Exponential Backoff met Jitter

```typescript
interface ReconnectConfig {
  baseDelay: number;      // Start delay (ms)
  maxDelay: number;       // Maximum delay (ms)
  maxAttempts: number;    // Maximum attempts
  jitterFactor: number;   // Jitter range (0-1)
}

function createReconnector(config: ReconnectConfig) {
  let attempts = 0;

  return {
    getNextDelay(): number | null {
      if (attempts >= config.maxAttempts) {
        return null; // Stop reconnecting
      }

      const exponentialDelay = Math.min(
        config.baseDelay * Math.pow(2, attempts),
        config.maxDelay
      );

      // Add jitter
      const jitter = exponentialDelay * config.jitterFactor * Math.random();
      const delay = exponentialDelay + jitter;

      attempts++;
      return delay;
    },

    reset() {
      attempts = 0;
    },

    getAttempts() {
      return attempts;
    },
  };
}

// Gebruik
const reconnector = createReconnector({
  baseDelay: 1000,
  maxDelay: 30000,
  maxAttempts: 10,
  jitterFactor: 0.3,
});
```

### State Resynchronisatie

```typescript
// Na reconnect, synchroniseer state
ws.onopen = async () => {
  // Request missed messages
  send('sync', {
    lastMessageId: getLastReceivedMessageId(),
    lastTimestamp: getLastReceivedTimestamp(),
  });
};

// Server-side sync handler
function handleSync(ws: WebSocket, payload: { lastMessageId?: string; lastTimestamp?: number }) {
  const missedMessages = getMissedMessages(
    payload.lastMessageId,
    payload.lastTimestamp
  );

  missedMessages.forEach((message) => {
    ws.send(JSON.stringify(message));
  });

  ws.send(JSON.stringify({
    type: 'sync_complete',
    payload: { count: missedMessages.length },
  }));
}
```

---

## Security

### Authentication

```typescript
// Token-based authentication bij handshake
wss.on('connection', async (ws, req) => {
  const { query } = parse(req.url || '', true);
  const token = query.token as string;

  // Verify JWT token
  try {
    const payload = await verifyJWT(token);
    ws.userId = payload.userId;
  } catch (error) {
    ws.close(4002, 'Invalid token');
    return;
  }
});

// Periodieke token refresh
setInterval(() => {
  clients.forEach((client) => {
    client.send(JSON.stringify({
      type: 'token_refresh_required',
      timestamp: Date.now(),
    }));
  });
}, 15 * 60 * 1000); // Elke 15 minuten
```

### Input Validatie

```typescript
import { z } from 'zod';

const messageSchemas = {
  chat: z.object({
    type: z.literal('chat'),
    payload: z.object({
      roomId: z.string().uuid(),
      text: z.string().max(5000),
    }),
  }),

  subscribe: z.object({
    type: z.literal('subscribe'),
    payload: z.object({
      channel: z.string().regex(/^[a-z0-9-]+$/),
    }),
  }),
};

function validateMessage(data: unknown) {
  const baseSchema = z.object({ type: z.string() });
  const { type } = baseSchema.parse(data);

  const schema = messageSchemas[type as keyof typeof messageSchemas];
  if (!schema) {
    throw new Error(`Unknown message type: ${type}`);
  }

  return schema.parse(data);
}

ws.on('message', (data) => {
  try {
    const message = validateMessage(JSON.parse(data.toString()));
    handleMessage(ws, message);
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'Invalid message format' },
    }));
  }
});
```

### Rate Limiting

```typescript
interface RateLimiter {
  check(clientId: string): boolean;
}

function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const requests = new Map<string, number[]>();

  return {
    check(clientId: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get or create request timestamps array
      let timestamps = requests.get(clientId) || [];

      // Remove old timestamps
      timestamps = timestamps.filter((t) => t > windowStart);

      if (timestamps.length >= limit) {
        return false; // Rate limited
      }

      timestamps.push(now);
      requests.set(clientId, timestamps);

      return true;
    },
  };
}

// Gebruik
const rateLimiter = createRateLimiter(100, 60000); // 100 messages per minute

ws.on('message', (data) => {
  if (!rateLimiter.check(ws.id)) {
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'Rate limit exceeded' },
    }));
    return;
  }

  // Process message...
});
```

---

## Scalability

### Horizontal Scaling met Redis

```typescript
// Elk server instance subscribed naar Redis
import Redis from 'ioredis';

const pub = new Redis(process.env.REDIS_URL);
const sub = new Redis(process.env.REDIS_URL);

// Subscribe to broadcast channel
sub.subscribe('ws:broadcast');

sub.on('message', (channel, message) => {
  if (channel === 'ws:broadcast') {
    const data = JSON.parse(message);

    // Broadcast naar alle lokale clients
    localClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
});

// Broadcast naar alle servers
function broadcastGlobal(message: object) {
  pub.publish('ws:broadcast', JSON.stringify(message));
}
```

### Load Balancer Configuratie (NGINX)

```nginx
# nginx.conf
upstream websocket_servers {
    ip_hash;  # Sticky sessions voor WebSocket
    server ws1.example.com:3000;
    server ws2.example.com:3000;
    server ws3.example.com:3000;
}

server {
    listen 443 ssl;
    server_name ws.example.com;

    location /ws {
        proxy_pass http://websocket_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 3600s;  # 1 uur voor long-lived connections
    }
}
```

---

## Monitoring

### Metrics Collection

```typescript
import { Counter, Gauge, Histogram } from 'prom-client';

// Metrics
const wsConnectionsTotal = new Counter({
  name: 'websocket_connections_total',
  help: 'Total WebSocket connections',
});

const wsConnectionsActive = new Gauge({
  name: 'websocket_connections_active',
  help: 'Currently active WebSocket connections',
});

const wsMessagesReceived = new Counter({
  name: 'websocket_messages_received_total',
  help: 'Total messages received',
  labelNames: ['type'],
});

const wsMessageLatency = new Histogram({
  name: 'websocket_message_latency_seconds',
  help: 'Message processing latency',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

// Track in handlers
wss.on('connection', (ws) => {
  wsConnectionsTotal.inc();
  wsConnectionsActive.inc();

  ws.on('close', () => {
    wsConnectionsActive.dec();
  });

  ws.on('message', (data) => {
    const start = Date.now();
    const message = JSON.parse(data.toString());

    wsMessagesReceived.inc({ type: message.type });

    // Process message...

    wsMessageLatency.observe((Date.now() - start) / 1000);
  });
});
```

### Health Check Endpoint

```typescript
app.get('/health/ws', (req, res) => {
  const health = {
    status: 'healthy',
    connections: {
      active: wsServer.clients.size,
      limit: MAX_CONNECTIONS,
    },
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  };

  res.json(health);
});
```

---

## Bronnen

- [WebSocket Architecture Best Practices](https://ably.com/topic/websocket-architecture-best-practices)
- [How to Scale WebSockets for High-Concurrency Systems](https://ably.com/topic/the-challenge-of-scaling-websockets)
- [WebSocket Security: Comprehensive Guide (2025)](https://www.videosdk.live/developer-hub/websocket/websocket-security)
- [WebSocket Best Practices for Production](https://lattestream.com/blog/websocket-best-practices)
- [WebSockets on Production with Node.js](https://medium.com/voodoo-engineering/websockets-on-production-with-node-js-bdc82d07bb9f)

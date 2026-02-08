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
 * Generated story from brainstorm
 */
export interface GeneratedStory {
  id: string
  title: string
  description: string
  priority: number
  epic: string
  dependencies: string[]
  recommendedSkills: string[]
  acceptanceCriteria: string[]
}

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
  // Brainstorm streaming messages
  | {
      type: 'brainstorm_start'
      payload: { sessionId: string; projectId: string }
      timestamp: number
    }
  | {
      type: 'brainstorm_chunk'
      payload: { sessionId: string; content: string }
      timestamp: number
    }
  | {
      type: 'brainstorm_stories'
      payload: { sessionId: string; stories: GeneratedStory[] }
      timestamp: number
    }
  | {
      type: 'brainstorm_complete'
      payload: { sessionId: string; content: string; stories: GeneratedStory[] }
      timestamp: number
    }
  | {
      type: 'brainstorm_error'
      payload: { sessionId: string; error: string }
      timestamp: number
    }
  | {
      type: 'brainstorm_phase_change'
      payload: {
        sessionId: string
        phase: 'conversation' | 'story_generation'
        aspects: { what: boolean; why: boolean; how: boolean; where: boolean }
      }
      timestamp: number
    }
  // Runner status change messages
  | {
      type: 'runner_status'
      payload: {
        projectId: string
        status: 'idle' | 'running' | 'stopping'
        storyId?: string
        containerId?: string  // Docker container ID (legacy)
        pid?: number          // Process ID (CLI mode)
        exitCode?: number
      }
      timestamp: number
    }
  | {
      type: 'runner_completed'
      payload: {
        projectId: string
        storyId?: string
        exitCode: number
        success: boolean
        completedStoryStatus?: 'done' | 'failed' | 'pending' | 'in_progress'
        nextStoryId?: string
        willAutoRestart: boolean
      }
      timestamp: number
    }
  // Stories updated message (file watcher)
  | {
      type: 'stories_updated'
      payload: {
        projectId: string
      }
      timestamp: number
    }

/**
 * Extended WebSocket connection with tracking info
 */
export interface ExtendedWebSocket {
  id: string
  isAlive: boolean
  lastPing: number
  subscriptions: Set<string> // Project IDs this client is subscribed to
}

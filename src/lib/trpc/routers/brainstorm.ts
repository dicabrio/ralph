/**
 * Brainstorm Router
 *
 * API for brainstorming and generating stories via Claude Docker container.
 * Uses WebSocket for streaming responses to the client.
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import { projects } from '@/db/schema'
import {
  brainstormManager,
  generateSystemPrompt,
  parseStoriesFromResponse,
} from '@/lib/services/brainstormManager'
import { getWebSocketServer } from '@/lib/websocket/server'
import type { GeneratedStory } from '@/lib/websocket/types'

/**
 * Get project by ID with validation
 */
async function getProjectById(projectId: number) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))

  if (!project) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Project with id ${projectId} not found`,
    })
  }

  return project
}


export const brainstormRouter = router({
  /**
   * Start a new brainstorm chat session
   *
   * Spawns a Claude container with the project mounted and sends the user message.
   * Response is streamed via WebSocket to subscribed clients.
   *
   * Returns the session ID immediately; clients should subscribe to WebSocket
   * for streaming updates.
   */
  chat: publicProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      message: z.string().min(1).max(10000),
    }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const wsServer = getWebSocketServer()

      // Start brainstorm session with callbacks
      const sessionId = await brainstormManager.startSession(
        input.projectId,
        project.path,
        project.name,
        input.message,
        {
          onStart: (sessionId) => {
            wsServer?.broadcast(String(input.projectId), {
              type: 'brainstorm_start',
              payload: { sessionId, projectId: String(input.projectId) },
              timestamp: Date.now(),
            })
          },
          onChunk: (sessionId, content) => {
            wsServer?.broadcast(String(input.projectId), {
              type: 'brainstorm_chunk',
              payload: { sessionId, content },
              timestamp: Date.now(),
            })
          },
          onStories: (sessionId, stories) => {
            wsServer?.broadcast(String(input.projectId), {
              type: 'brainstorm_stories',
              payload: { sessionId, stories },
              timestamp: Date.now(),
            })
          },
          onComplete: (sessionId, content, stories) => {
            wsServer?.broadcast(String(input.projectId), {
              type: 'brainstorm_complete',
              payload: { sessionId, content, stories },
              timestamp: Date.now(),
            })
          },
          onError: (sessionId, error) => {
            wsServer?.broadcast(String(input.projectId), {
              type: 'brainstorm_error',
              payload: { sessionId, error },
              timestamp: Date.now(),
            })
          },
        },
      )

      return { sessionId }
    }),

  /**
   * Get the status of a brainstorm session
   */
  getSession: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ input }) => {
      const session = brainstormManager.getSession(input.sessionId)

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session ${input.sessionId} not found`,
        })
      }

      return {
        sessionId: session.sessionId,
        projectId: session.projectId,
        status: session.status,
        startedAt: session.startedAt,
        content: session.content,
        stories: session.stories,
      }
    }),

  /**
   * Cancel a running brainstorm session
   */
  cancelSession: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const success = await brainstormManager.cancelSession(input.sessionId)

      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session ${input.sessionId} not found or already completed`,
        })
      }

      return { success: true }
    }),

  /**
   * Parse stories from a text response
   *
   * Utility endpoint for testing story parsing without a full session.
   */
  parseStories: publicProcedure
    .input(z.object({ content: z.string() }))
    .query(({ input }): GeneratedStory[] => {
      return parseStoriesFromResponse(input.content)
    }),

  /**
   * Get system prompt for a project
   *
   * Utility endpoint for debugging the generated system prompt.
   */
  getSystemPrompt: publicProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const project = await getProjectById(input.projectId)
      const prompt = await generateSystemPrompt(project.path, project.name)
      return { prompt }
    }),

  /**
   * Get active sessions for a project
   */
  getActiveSessions: publicProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      await getProjectById(input.projectId) // Validate project exists
      const sessions = brainstormManager.getSessionsByProject(input.projectId)

      return sessions.map(s => ({
        sessionId: s.sessionId,
        status: s.status,
        startedAt: s.startedAt,
      }))
    }),
})

export type BrainstormRouter = typeof brainstormRouter

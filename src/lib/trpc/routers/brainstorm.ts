/**
 * Brainstorm Router
 *
 * API for brainstorming and generating stories via Claude Docker container.
 * Uses WebSocket for streaming responses to the client.
 * Supports session persistence per project with chat history.
 */
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { db } from '@/db'
import {
  projects,
  brainstormSessions,
  brainstormMessages,
} from '@/db/schema'
import type { BrainstormSessionStatus } from '@/db/schema'
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

      try {
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
      } catch (error) {
        // Early Docker failures are thrown as errors
        // Convert to TRPCError so the frontend can display them
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start brainstorm session',
        })
      }
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

  // ========================================================================
  // Session Persistence Endpoints
  // ========================================================================

  /**
   * List all saved brainstorm sessions for a project
   *
   * Returns sessions ordered by creation date (newest first).
   */
  listSessionsByProject: publicProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        limit: z.number().int().positive().max(100).default(20),
        offset: z.number().int().nonnegative().default(0),
      })
    )
    .query(async ({ input }) => {
      await getProjectById(input.projectId) // Validate project exists

      const sessions = await db
        .select({
          id: brainstormSessions.id,
          title: brainstormSessions.title,
          status: brainstormSessions.status,
          createdAt: brainstormSessions.createdAt,
          updatedAt: brainstormSessions.updatedAt,
        })
        .from(brainstormSessions)
        .where(eq(brainstormSessions.projectId, input.projectId))
        .orderBy(desc(brainstormSessions.createdAt))
        .limit(input.limit)
        .offset(input.offset)

      // Get total count for pagination using sql count
      const countResult = await db
        .select({
          count: db.$count(brainstormSessions, eq(brainstormSessions.projectId, input.projectId)),
        })
        .from(brainstormSessions)
        .limit(1)

      const total = countResult[0]?.count ?? 0

      return {
        sessions,
        total,
        hasMore: input.offset + sessions.length < total,
      }
    }),

  /**
   * Get chat history for a specific session
   *
   * Returns all messages in chronological order with any generated stories.
   */
  getSessionHistory: publicProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      // Get session with project validation
      const [session] = await db
        .select()
        .from(brainstormSessions)
        .where(eq(brainstormSessions.id, input.sessionId))

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session with id ${input.sessionId} not found`,
        })
      }

      // Get all messages for this session in chronological order
      const messages = await db
        .select({
          id: brainstormMessages.id,
          role: brainstormMessages.role,
          content: brainstormMessages.content,
          generatedStories: brainstormMessages.generatedStories,
          createdAt: brainstormMessages.createdAt,
        })
        .from(brainstormMessages)
        .where(eq(brainstormMessages.sessionId, input.sessionId))
        .orderBy(brainstormMessages.createdAt)

      // Parse generated stories from JSON for assistant messages
      const parsedMessages = messages.map((msg) => ({
        ...msg,
        generatedStories: msg.generatedStories
          ? (JSON.parse(msg.generatedStories) as GeneratedStory[])
          : undefined,
      }))

      return {
        session: {
          id: session.id,
          projectId: session.projectId,
          title: session.title,
          status: session.status,
          generatedStories: session.generatedStories
            ? (JSON.parse(session.generatedStories) as GeneratedStory[])
            : undefined,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        messages: parsedMessages,
      }
    }),

  /**
   * Create a new brainstorm session for a project
   *
   * Creates an empty session that can be populated via sendMessage.
   */
  createSession: publicProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await getProjectById(input.projectId) // Validate project exists

      const [session] = await db
        .insert(brainstormSessions)
        .values({
          projectId: input.projectId,
          title: input.title,
          status: 'active',
        })
        .returning()

      return {
        id: session.id,
        projectId: session.projectId,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }
    }),

  /**
   * Add a message to an existing session
   *
   * Use this to save user messages and assistant responses to the database.
   * For assistant messages, also stores any generated stories.
   */
  addMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
        generatedStories: z.array(z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          priority: z.number(),
          epic: z.string(),
          dependencies: z.array(z.string()),
          recommendedSkills: z.array(z.string()),
          acceptanceCriteria: z.array(z.string()),
        })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Validate session exists
      const [session] = await db
        .select()
        .from(brainstormSessions)
        .where(eq(brainstormSessions.id, input.sessionId))

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session with id ${input.sessionId} not found`,
        })
      }

      // Auto-generate title from first user message if not set
      if (!session.title && input.role === 'user') {
        const title = input.content.slice(0, 100) + (input.content.length > 100 ? '...' : '')
        await db
          .update(brainstormSessions)
          .set({ title })
          .where(eq(brainstormSessions.id, input.sessionId))
      }

      // Store message
      const [message] = await db
        .insert(brainstormMessages)
        .values({
          sessionId: input.sessionId,
          role: input.role,
          content: input.content,
          generatedStories: input.generatedStories
            ? JSON.stringify(input.generatedStories)
            : null,
        })
        .returning()

      // Update session's generated stories if this is an assistant message with stories
      if (input.role === 'assistant' && input.generatedStories?.length) {
        await db
          .update(brainstormSessions)
          .set({
            generatedStories: JSON.stringify(input.generatedStories),
          })
          .where(eq(brainstormSessions.id, input.sessionId))
      }

      return {
        id: message.id,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        generatedStories: input.generatedStories,
        createdAt: message.createdAt,
      }
    }),

  /**
   * Update session status
   *
   * Mark a session as completed, cancelled, or error.
   */
  updateSessionStatus: publicProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        status: z.enum(['active', 'completed', 'cancelled', 'error']),
      })
    )
    .mutation(async ({ input }) => {
      const [session] = await db
        .select()
        .from(brainstormSessions)
        .where(eq(brainstormSessions.id, input.sessionId))

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session with id ${input.sessionId} not found`,
        })
      }

      const [updated] = await db
        .update(brainstormSessions)
        .set({ status: input.status as BrainstormSessionStatus })
        .where(eq(brainstormSessions.id, input.sessionId))
        .returning()

      return {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      }
    }),

  /**
   * Delete a brainstorm session
   *
   * Removes the session and all associated messages.
   */
  deleteSession: publicProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const [session] = await db
        .select()
        .from(brainstormSessions)
        .where(eq(brainstormSessions.id, input.sessionId))

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Session with id ${input.sessionId} not found`,
        })
      }

      // Delete session (messages cascade automatically)
      await db
        .delete(brainstormSessions)
        .where(eq(brainstormSessions.id, input.sessionId))

      return { success: true }
    }),
})

export type BrainstormRouter = typeof brainstormRouter

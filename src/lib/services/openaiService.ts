/**
 * OpenAI Service
 *
 * Provides streaming chat completions using the OpenAI API.
 * Used by the brainstorm feature for story generation.
 */
import { OpenAI } from 'openai'

// Default model - can be overridden via OPENAI_MODEL env var
const DEFAULT_MODEL = 'gpt-4o'

// Lazy-initialized OpenAI client
let openaiClient: OpenAI | null = null

/**
 * Get or create the OpenAI client
 */
function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

/**
 * Get the model to use for chat completions
 */
function getModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL
}

/**
 * Streaming callbacks interface
 */
export interface StreamCallbacks {
  onChunk: (content: string) => void
  onComplete: (fullContent: string) => void
  onError: (error: string) => void
}

/**
 * Stream a chat completion from OpenAI
 *
 * @param systemPrompt - The system prompt with context and instructions
 * @param userMessage - The user's message
 * @param callbacks - Callbacks for streaming events
 * @returns Promise that resolves when streaming is complete
 */
export async function streamChatCompletion(
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const client = getClient()
  const model = getModel()

  let fullContent = ''

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        fullContent += content
        callbacks.onChunk(content)
      }
    }

    callbacks.onComplete(fullContent)
  } catch (error) {
    const errorMessage = formatOpenAIError(error)
    callbacks.onError(errorMessage)
  }
}

/**
 * Stream a chat completion with full conversation history
 *
 * @param systemPrompt - The system prompt with context and instructions
 * @param messages - Array of conversation messages
 * @param callbacks - Callbacks for streaming events
 * @returns Promise that resolves when streaming is complete
 */
export async function streamChatCompletionWithHistory(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const client = getClient()
  const model = getModel()

  let fullContent = ''

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        fullContent += content
        callbacks.onChunk(content)
      }
    }

    callbacks.onComplete(fullContent)
  } catch (error) {
    const errorMessage = formatOpenAIError(error)
    callbacks.onError(errorMessage)
  }
}

/**
 * Format OpenAI errors into user-friendly messages
 */
function formatOpenAIError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    // Rate limiting
    if (error.status === 429) {
      return 'OpenAI rate limit bereikt. Wacht even en probeer opnieuw.'
    }

    // Authentication errors
    if (error.status === 401) {
      return 'Ongeldige OpenAI API key. Controleer je OPENAI_API_KEY configuratie.'
    }

    // Invalid request (e.g., context too long)
    if (error.status === 400) {
      if (error.message.includes('context_length')) {
        return 'Te veel context. Probeer een kortere vraag of kleiner project.'
      }
      return `OpenAI request fout: ${error.message}`
    }

    // Server errors
    if (error.status >= 500) {
      return 'OpenAI server fout. Probeer later opnieuw.'
    }

    return `OpenAI fout: ${error.message}`
  }

  // Network errors
  if (error instanceof Error) {
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      return 'Kan geen verbinding maken met OpenAI. Controleer je internetverbinding.'
    }
    if (error.message.includes('timeout')) {
      return 'OpenAI request timeout. Probeer opnieuw.'
    }
    return `Fout: ${error.message}`
  }

  return 'Onbekende fout bij OpenAI communicatie.'
}

/**
 * Check if OpenAI is properly configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}

/**
 * Get configuration info for debugging
 */
export function getOpenAIConfig(): { model: string; configured: boolean } {
  return {
    model: getModel(),
    configured: isOpenAIConfigured(),
  }
}

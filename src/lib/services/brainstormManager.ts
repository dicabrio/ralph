/**
 * Brainstorm Manager Service
 *
 * Manages Claude Docker containers for brainstorming sessions.
 * Handles starting brainstorm sessions, streaming responses, and parsing stories.
 *
 * Uses Docker-out-of-Docker (DooD) pattern - spawns containers on the host
 * via the mounted Docker socket.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { GeneratedStory } from '../websocket/types'

// Environment variables
const SKILLS_PATH = process.env.SKILLS_PATH || './skills'

/**
 * Session state for a brainstorm session
 */
export interface BrainstormSession {
  sessionId: string
  projectId: number
  projectPath: string
  containerId?: string
  status: 'starting' | 'running' | 'completed' | 'error'
  startedAt: Date
  content: string
  stories: GeneratedStory[]
}

/**
 * Callback for streaming updates
 */
export interface BrainstormCallbacks {
  onStart?: (sessionId: string) => void
  onChunk?: (sessionId: string, content: string) => void
  onStories?: (sessionId: string, stories: GeneratedStory[]) => void
  onComplete?: (sessionId: string, content: string, stories: GeneratedStory[]) => void
  onError?: (sessionId: string, error: string) => void
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null

  const [, frontmatterYaml] = match
  const frontmatter: Record<string, string> = {}

  for (const line of frontmatterYaml.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      frontmatter[key] = value
    }
  }

  if (!frontmatter.name || !frontmatter.description) return null
  return { name: frontmatter.name, description: frontmatter.description }
}

/**
 * Load available skills from SKILLS_PATH
 */
async function loadAvailableSkills(): Promise<{ id: string; name: string; description: string }[]> {
  if (!existsSync(SKILLS_PATH)) return []

  const skills: { id: string; name: string; description: string }[] = []

  try {
    const entries = await readdir(SKILLS_PATH, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = join(SKILLS_PATH, entry.name, 'SKILL.md')
        if (existsSync(skillMdPath)) {
          try {
            const content = await readFile(skillMdPath, 'utf-8')
            const frontmatter = parseFrontmatter(content)
            if (frontmatter) {
              skills.push({
                id: entry.name,
                name: frontmatter.name,
                description: frontmatter.description,
              })
            }
          } catch {
            // Skip invalid skills
          }
        }
      }
    }
  } catch {
    return []
  }

  return skills
}

/**
 * Read existing stories from prd.json
 */
async function loadExistingStories(projectPath: string): Promise<{ id: string; title: string; status: string; epic: string }[]> {
  const prdPath = join(projectPath, 'stories', 'prd.json')

  if (!existsSync(prdPath)) return []

  try {
    const content = await readFile(prdPath, 'utf-8')
    const data = JSON.parse(content)
    return (data.userStories || []).map((s: { id: string; title: string; status: string; epic: string }) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      epic: s.epic,
    }))
  } catch {
    return []
  }
}

/**
 * Generate system prompt for story generation
 */
export async function generateSystemPrompt(
  projectPath: string,
  projectName: string,
): Promise<string> {
  // Load available skills and existing stories
  const [availableSkills, existingStories] = await Promise.all([
    loadAvailableSkills(),
    loadExistingStories(projectPath),
  ])

  const skillsContext = availableSkills.length > 0
    ? `Available skills that can be recommended:
${availableSkills.map(s => `- ${s.id}: ${s.name} - ${s.description}`).join('\n')}`
    : 'No skills currently configured.'

  const existingStoriesContext = existingStories.length > 0
    ? `Existing stories in the project (for reference and dependencies):
${existingStories.map(s => `- ${s.id}: ${s.title} [${s.status}] (Epic: ${s.epic})`).join('\n')}`
    : 'No existing stories in the project.'

  return `You are a story generation assistant for the project "${projectName}".

Your role is to help users brainstorm and create well-structured user stories based on their requirements.

## Context

${skillsContext}

${existingStoriesContext}

## Task

When the user describes a feature or requirement:
1. Analyze the codebase (you have access to /workspace) to understand the existing architecture
2. Generate appropriate user stories with clear acceptance criteria
3. Suggest dependencies on existing stories when relevant
4. Recommend skills that would help implement the story

## Response Format

Respond conversationally first, then include a JSON block with the generated stories.

The JSON block should be wrapped in \`\`\`json and \`\`\` markers and contain an array of story objects:

\`\`\`json
[
  {
    "id": "EPIC-001",
    "title": "Short descriptive title",
    "description": "Detailed description of what needs to be built",
    "priority": 1,
    "epic": "Epic Name",
    "dependencies": ["EXISTING-001"],
    "recommendedSkills": ["frontend-design", "backend-development:api-design-principles"],
    "acceptanceCriteria": [
      "First acceptance criterion",
      "Second acceptance criterion"
    ]
  }
]
\`\`\`

## Story ID Convention

Use the pattern: EPIC-NNN where:
- EPIC is a short (2-8 char) uppercase abbreviation of the epic name
- NNN is a 3-digit number (001, 002, etc.)

Examples: AUTH-001, UI-002, API-003, DB-001

## Guidelines

1. Break down large features into smaller, manageable stories
2. Each story should be completable in 1-3 days
3. Acceptance criteria should be specific and testable
4. Consider existing stories for dependencies
5. Only recommend skills that exist in the available skills list
6. Analyze the codebase to suggest appropriate implementation approaches
7. Priority should reflect logical order of implementation (1 = highest priority)

Focus on creating actionable, well-defined stories that a developer can start working on immediately.`
}

/**
 * Parse stories from Claude's response
 */
export function parseStoriesFromResponse(content: string): GeneratedStory[] {
  // Find JSON block in the response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)

  if (!jsonMatch) {
    return []
  }

  try {
    const parsed = JSON.parse(jsonMatch[1])

    if (!Array.isArray(parsed)) {
      return []
    }

    // Validate and normalize each story
    return parsed
      .filter((s): s is Record<string, unknown> =>
        typeof s === 'object' &&
        s !== null &&
        typeof s.id === 'string' &&
        typeof s.title === 'string'
      )
      .map((s) => ({
        id: String(s.id),
        title: String(s.title),
        description: String(s.description || ''),
        priority: typeof s.priority === 'number' ? s.priority : 1,
        epic: String(s.epic || 'Features'),
        dependencies: Array.isArray(s.dependencies)
          ? s.dependencies.filter((d): d is string => typeof d === 'string')
          : [],
        recommendedSkills: Array.isArray(s.recommendedSkills)
          ? s.recommendedSkills.filter((sk): sk is string => typeof sk === 'string')
          : [],
        acceptanceCriteria: Array.isArray(s.acceptanceCriteria)
          ? s.acceptanceCriteria.filter((c): c is string => typeof c === 'string')
          : [],
      }))
  } catch {
    return []
  }
}

/**
 * BrainstormManager class
 *
 * Manages brainstorm sessions with Claude containers.
 */
class BrainstormManager {
  private sessions: Map<string, BrainstormSession> = new Map()

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `brainstorm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get container name for a session
   */
  private getContainerName(sessionId: string): string {
    return `claude-brainstorm-${sessionId.slice(0, 16)}`
  }

  /**
   * Start a new brainstorm session
   *
   * @param projectId - Database ID of the project
   * @param projectPath - Filesystem path to the project
   * @param userMessage - The user's message/request
   * @param callbacks - Callbacks for streaming updates
   * @returns The session ID
   */
  async startSession(
    projectId: number,
    projectPath: string,
    projectName: string,
    userMessage: string,
    callbacks: BrainstormCallbacks,
  ): Promise<string> {
    const sessionId = this.generateSessionId()
    const containerName = this.getContainerName(sessionId)

    // Initialize session
    const session: BrainstormSession = {
      sessionId,
      projectId,
      projectPath,
      status: 'starting',
      startedAt: new Date(),
      content: '',
      stories: [],
    }
    this.sessions.set(sessionId, session)

    // Notify start
    callbacks.onStart?.(sessionId)

    // Get environment variables for container
    const hostProjectsRoot = process.env.HOST_PROJECTS_ROOT || process.env.PROJECTS_ROOT || '/projects'
    const hostSkillsPath = process.env.HOST_SKILLS_PATH || process.env.SKILLS_PATH || '/skills'
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY

    if (!anthropicApiKey) {
      session.status = 'error'
      callbacks.onError?.(sessionId, 'ANTHROPIC_API_KEY environment variable is not set')
      return sessionId
    }

    try {
      // Generate system prompt with context
      const systemPrompt = await generateSystemPrompt(projectPath, projectName)

      // Extract relative project path from absolute path
      const projectsRoot = process.env.PROJECTS_ROOT || '/projects'
      let relativeProjectPath = projectPath
      if (projectPath.startsWith(projectsRoot)) {
        relativeProjectPath = projectPath.slice(projectsRoot.length).replace(/^\//, '')
      }
      const hostProjectPath = `${hostProjectsRoot}/${relativeProjectPath}`

      // Build the prompt with user message
      const fullPrompt = `${systemPrompt}\n\n---\n\nUser request: ${userMessage}`

      // Spawn Claude container with the prompt
      // Using docker run with -i for stdin and streaming stdout
      const dockerArgs = [
        'run',
        '--rm', // Remove container when done
        '-i', // Interactive (for stdin)
        '--name', containerName,
        '-e', `ANTHROPIC_API_KEY=${anthropicApiKey}`,
        '-v', `${hostProjectPath}:/workspace`,
        '-v', `${hostSkillsPath}:/skills:ro`,
        '-w', '/workspace',
        'anthropics/claude-code:latest',
        '--print', // Print mode for non-interactive output
        fullPrompt,
      ]

      session.status = 'running'

      const docker = spawn('docker', dockerArgs)
      session.containerId = containerName

      let outputBuffer = ''

      // Handle stdout (streaming response)
      docker.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        outputBuffer += chunk
        session.content = outputBuffer
        callbacks.onChunk?.(sessionId, chunk)

        // Try to parse stories as we receive data
        const stories = parseStoriesFromResponse(outputBuffer)
        if (stories.length > session.stories.length) {
          session.stories = stories
          callbacks.onStories?.(sessionId, stories)
        }
      })

      // Handle stderr
      docker.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString()
        // Log stderr but don't treat as error unless process fails
        console.error(`[Brainstorm ${sessionId}] stderr:`, chunk)
      })

      // Handle process completion
      docker.on('close', (code) => {
        if (code === 0) {
          session.status = 'completed'
          // Final parse of stories
          const finalStories = parseStoriesFromResponse(session.content)
          session.stories = finalStories
          callbacks.onComplete?.(sessionId, session.content, finalStories)
        } else {
          session.status = 'error'
          callbacks.onError?.(sessionId, `Claude container exited with code ${code}`)
        }
      })

      // Handle process error
      docker.on('error', (error) => {
        session.status = 'error'
        callbacks.onError?.(sessionId, error.message)
      })

    } catch (error) {
      session.status = 'error'
      callbacks.onError?.(sessionId, error instanceof Error ? error.message : 'Unknown error')
    }

    return sessionId
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): BrainstormSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all active sessions for a project
   */
  getSessionsByProject(projectId: number): BrainstormSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.projectId === projectId && s.status === 'running')
  }

  /**
   * Cancel a running session
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.containerId) {
      return false
    }

    try {
      // Kill the container
      const kill = spawn('docker', ['kill', session.containerId])
      await new Promise<void>((resolve) => {
        kill.on('close', () => resolve())
        kill.on('error', () => resolve())
      })

      session.status = 'error'
      return true
    } catch {
      return false
    }
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 3600000): void {
    const now = Date.now()
    for (const [sessionId, session] of this.sessions) {
      if (now - session.startedAt.getTime() > maxAgeMs) {
        this.sessions.delete(sessionId)
      }
    }
  }
}

// Export singleton instance
export const brainstormManager = new BrainstormManager()

// Export type for external use
export type { BrainstormManager }

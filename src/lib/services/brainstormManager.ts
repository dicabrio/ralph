/**
 * Brainstorm Manager Service
 *
 * Manages brainstorming sessions using OpenAI API.
 * Implements a two-phase brainstorm flow:
 * 1. Free brainstorming about a feature until What/Why/How/Where aspects are clear
 * 2. Automatic story generation using the story-generator skill
 *
 * Skills are loaded with fallback: project/.claude/skills/ -> host-skills/
 */
import { join, dirname } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { GeneratedStory } from "../websocket/types";
import { streamChatCompletion, streamChatCompletionWithHistory, isOpenAIConfigured } from "./openaiService";
import { loadProjectContext, formatProjectContext } from "./projectContextLoader";

// Environment variables
const SKILLS_PATH = process.env.SKILLS_PATH || "./skills";

// Get host-skills path relative to the Ralph installation
function getHostSkillsPath(): string {
  // In development: ./host-skills
  // In production: relative to the built server
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

  // Navigate up from src/lib/services to project root
  const projectRoot = join(currentDir, '..', '..', '..');
  const hostSkillsPath = join(projectRoot, 'host-skills');

  // Fallback to current working directory
  if (existsSync(hostSkillsPath)) {
    return hostSkillsPath;
  }

  // Try cwd-based path
  const cwdPath = join(process.cwd(), 'host-skills');
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  return hostSkillsPath; // Return even if doesn't exist, for error handling
}

/**
 * Brainstorm phase tracking
 */
export type BrainstormPhase = "conversation" | "story_generation";

/**
 * Aspect tracking for feature completeness
 */
export interface FeatureAspects {
  what: boolean;  // What should the feature do?
  why: boolean;   // Why is this valuable for users?
  how: boolean;   // How does the UI/UX look?
  where: boolean; // Where does this fit in the architecture?
}

/**
 * Session state for a brainstorm session
 */
export interface BrainstormSession {
  sessionId: string;
  projectId: number;
  projectPath: string;
  projectName: string;
  status: "starting" | "running" | "completed" | "error" | "cancelled";
  phase: BrainstormPhase;
  startedAt: Date;
  content: string;
  stories: GeneratedStory[];
  // Track conversation history for multi-turn
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  // Track which aspects have been discussed
  featureAspects: FeatureAspects;
  // AbortController for cancelling the OpenAI request
  abortController?: AbortController;
}

/**
 * Callback for streaming updates
 */
export interface BrainstormCallbacks {
  onStart?: (sessionId: string) => void;
  onChunk?: (sessionId: string, content: string) => void;
  onStories?: (sessionId: string, stories: GeneratedStory[]) => void;
  onComplete?: (
    sessionId: string,
    content: string,
    stories: GeneratedStory[],
  ) => void;
  onError?: (sessionId: string, error: string) => void;
  onPhaseChange?: (sessionId: string, phase: BrainstormPhase, aspects: FeatureAspects) => void;
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(
  content: string,
): { name: string; description: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const [, frontmatterYaml] = match;
  const frontmatter: Record<string, string> = {};

  for (const line of frontmatterYaml.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  if (!frontmatter.name || !frontmatter.description) return null;
  return { name: frontmatter.name, description: frontmatter.description };
}

/**
 * Load a specific skill with fallback logic
 * Priority: 1. Project override (.claude/skills/) 2. Host skills (host-skills/)
 *
 * @param skillName - Name of the skill folder (e.g., 'story-generator')
 * @param projectPath - Path to the project for checking overrides
 * @returns Skill content or null if not found
 */
export async function loadSkill(
  skillName: string,
  projectPath: string,
): Promise<{ content: string; source: "project" | "host" } | null> {
  // 1. Check project override first
  const projectSkillPath = join(projectPath, ".claude", "skills", skillName, "SKILL.md");
  if (existsSync(projectSkillPath)) {
    try {
      const content = await readFile(projectSkillPath, "utf-8");
      return { content, source: "project" };
    } catch {
      // Fall through to host-skills
    }
  }

  // 2. Fallback to host-skills
  const hostSkillsPath = getHostSkillsPath();
  const hostSkillPath = join(hostSkillsPath, skillName, "SKILL.md");
  if (existsSync(hostSkillPath)) {
    try {
      const content = await readFile(hostSkillPath, "utf-8");
      return { content, source: "host" };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Load the story-generator skill
 */
export async function loadStoryGeneratorSkill(
  projectPath: string,
): Promise<string | null> {
  const result = await loadSkill("story-generator", projectPath);
  return result?.content ?? null;
}

/**
 * Load available skills from SKILLS_PATH
 */
async function loadAvailableSkills(): Promise<
  { id: string; name: string; description: string }[]
> {
  if (!existsSync(SKILLS_PATH)) return [];

  const skills: { id: string; name: string; description: string }[] = [];

  try {
    const entries = await readdir(SKILLS_PATH, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = join(SKILLS_PATH, entry.name, "SKILL.md");
        if (existsSync(skillMdPath)) {
          try {
            const content = await readFile(skillMdPath, "utf-8");
            const frontmatter = parseFrontmatter(content);
            if (frontmatter) {
              skills.push({
                id: entry.name,
                name: frontmatter.name,
                description: frontmatter.description,
              });
            }
          } catch {
            // Skip invalid skills
          }
        }
      }
    }
  } catch {
    return [];
  }

  return skills;
}

/**
 * Read existing stories from prd.json
 */
async function loadExistingStories(
  projectPath: string,
): Promise<{ id: string; title: string; status: string; epic: string }[]> {
  const prdPath = join(projectPath, "stories", "prd.json");

  if (!existsSync(prdPath)) return [];

  try {
    const content = await readFile(prdPath, "utf-8");
    const data = JSON.parse(content);
    return (data.userStories || []).map(
      (s: { id: string; title: string; status: string; epic: string }) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        epic: s.epic,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Generate system prompt for story generation
 */
export async function generateSystemPrompt(
  projectPath: string,
  projectName: string,
): Promise<string> {
  // Load available skills, existing stories, and project context
  const [availableSkills, existingStories, projectContext] = await Promise.all([
    loadAvailableSkills(),
    loadExistingStories(projectPath),
    loadProjectContext(projectPath),
  ]);

  const skillsContext =
    availableSkills.length > 0
      ? `Available skills that can be recommended:
${availableSkills.map((s) => `- ${s.id}: ${s.name} - ${s.description}`).join("\n")}`
      : "No skills currently configured.";

  const existingStoriesContext =
    existingStories.length > 0
      ? `Existing stories in the project (for reference and dependencies):
${existingStories.map((s) => `- ${s.id}: ${s.title} [${s.status}] (Epic: ${s.epic})`).join("\n")}`
      : "No existing stories in the project.";

  const projectContextSection = formatProjectContext(projectContext);

  return `You are a story generation assistant for the project "${projectName}".

Your role is to help users brainstorm and create well-structured user stories based on their requirements.

## Project Context

${projectContextSection}

## Available Resources

${skillsContext}

${existingStoriesContext}

## Task

When the user describes a feature or requirement:
1. Analyze the project structure and existing code patterns shown above
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
6. Use the project structure to suggest appropriate implementation approaches
7. Priority should reflect logical order of implementation (1 = highest priority)

Focus on creating actionable, well-defined stories that a developer can start working on immediately.`;
}

/**
 * Phase 1 conversational system prompt
 * Helps users brainstorm and tracks when all aspects are clear
 */
export async function generatePhase1Prompt(
  projectPath: string,
  projectName: string,
): Promise<string> {
  const [existingStories, projectContext] = await Promise.all([
    loadExistingStories(projectPath),
    loadProjectContext(projectPath),
  ]);

  const existingStoriesContext =
    existingStories.length > 0
      ? `Existing stories in the project (for reference):
${existingStories.map((s) => `- ${s.id}: ${s.title} [${s.status}] (Epic: ${s.epic})`).join("\n")}`
      : "No existing stories in the project yet.";

  const projectContextSection = formatProjectContext(projectContext);

  return `Je bent een brainstorm assistent voor het project "${projectName}".

Je helpt de gebruiker om hun feature idee uit te werken door vragen te stellen en mee te denken.

## Project Context

${projectContextSection}

${existingStoriesContext}

## Jouw Rol

Je bent in **brainstorm modus**. Dit betekent:
1. Stel open vragen om het idee te verkennen
2. Help de gebruiker nadenken over alle aspecten
3. Wees conversationeel en behulpzaam
4. Genereer nog GEEN stories - dit komt later

## Aspecten om te verkennen

Houd bij welke van deze aspecten al duidelijk zijn:

- **What**: Wat moet de feature precies doen? Welke functionaliteit?
- **Why**: Waarom is dit waardevol voor gebruikers? Welk probleem lost het op?
- **How**: Hoe ziet de UI/UX eruit? Welke schermen/interacties?
- **Where**: Waar past dit in de architectuur? API, database, frontend?

## Response Format

Aan het EINDE van elke response, voeg een status block toe:

\`\`\`status
{
  "what": true/false,
  "why": true/false,
  "how": true/false,
  "where": true/false,
  "readyForStory": true/false
}
\`\`\`

Zet "readyForStory" op true wanneer alle vier aspecten duidelijk zijn.

## Wanneer alle aspecten duidelijk zijn

Als readyForStory=true, sluit je response af met:

"Ik denk dat ik genoeg weet om hier een story van te maken. Wil je dat ik dat doe?"

Wacht dan op bevestiging van de gebruiker voordat je een story genereert.

## Richtlijnen

- Wees conversationeel, niet formeel
- Stel één of twee vragen per keer, niet een hele lijst
- Bouw voort op wat de gebruiker al heeft gezegd
- Suggereer ideeën wanneer relevant
- Verwijs naar de bestaande projectstructuur wanneer nuttig`;
}

/**
 * Generate phase 2 story generation prompt using the skill
 */
export async function generatePhase2Prompt(
  projectPath: string,
  projectName: string,
  conversationSummary: string,
): Promise<string> {
  // Load the story-generator skill
  const skillContent = await loadStoryGeneratorSkill(projectPath);

  // Load project context
  const [existingStories, projectContext] = await Promise.all([
    loadExistingStories(projectPath),
    loadProjectContext(projectPath),
  ]);

  const existingStoriesContext =
    existingStories.length > 0
      ? `Existing stories (for dependencies):
${existingStories.map((s) => `- ${s.id}: ${s.title} [${s.status}] (Epic: ${s.epic})`).join("\n")}`
      : "";

  const projectContextSection = formatProjectContext(projectContext);

  // Build the prompt
  let prompt = `Je bent een story generator voor het project "${projectName}".

## Opdracht

Genereer een gestructureerde user story op basis van de volgende brainstorm context.

## Brainstorm Samenvatting

${conversationSummary}

## Project Context

${projectContextSection}

${existingStoriesContext}

`;

  // Add skill instructions if available
  if (skillContent) {
    prompt += `## Story Generation Guidelines

${skillContent}

`;
  } else {
    // Fallback instructions if skill not found
    prompt += `## Story Format

Genereer de story in dit JSON format:

\`\`\`json
[
  {
    "id": "EPIC-NNN",
    "title": "Korte beschrijvende titel",
    "description": "Gedetailleerde beschrijving",
    "priority": 1,
    "status": "pending",
    "epic": "Epic Name",
    "dependencies": [],
    "recommendedSkills": [],
    "acceptanceCriteria": [
      "Criterium 1",
      "Criterium 2",
      "Unit tests geschreven en passing",
      "E2e tests voor [flow]",
      "Lint passing (pnpm lint)",
      "Build slaagt (pnpm build)",
      "Code review completed"
    ]
  }
]
\`\`\`

`;
  }

  prompt += `## Output

Genereer de story(ies) nu. Geef eerst een korte uitleg, dan het JSON block.`;

  return prompt;
}

/**
 * Parse feature aspects from AI response
 */
export function parseAspectsFromResponse(content: string): FeatureAspects | null {
  // Look for status block in response
  const statusMatch = content.match(/```status\s*([\s\S]*?)\s*```/);

  if (!statusMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(statusMatch[1]);
    return {
      what: Boolean(parsed.what),
      why: Boolean(parsed.why),
      how: Boolean(parsed.how),
      where: Boolean(parsed.where),
    };
  } catch {
    return null;
  }
}

/**
 * Check if response indicates readiness for story generation
 */
export function isReadyForStory(content: string): boolean {
  const statusMatch = content.match(/```status\s*([\s\S]*?)\s*```/);
  if (!statusMatch) return false;

  try {
    const parsed = JSON.parse(statusMatch[1]);
    return Boolean(parsed.readyForStory);
  } catch {
    return false;
  }
}

/**
 * Summarize conversation for story generation
 */
export function summarizeConversation(
  history: { role: "user" | "assistant"; content: string }[]
): string {
  return history
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "AI";
      // Remove status blocks from the summary
      const cleanContent = msg.content.replace(/```status[\s\S]*?```/g, "").trim();
      return `${role}: ${cleanContent}`;
    })
    .join("\n\n");
}

/**
 * Parse stories from OpenAI's response
 */
export function parseStoriesFromResponse(content: string): GeneratedStory[] {
  // Find JSON block in the response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);

  if (!jsonMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // Validate and normalize each story
    return parsed
      .filter(
        (s): s is Record<string, unknown> =>
          typeof s === "object" &&
          s !== null &&
          typeof s.id === "string" &&
          typeof s.title === "string",
      )
      .map((s) => ({
        id: String(s.id),
        title: String(s.title),
        description: String(s.description || ""),
        priority: typeof s.priority === "number" ? s.priority : 1,
        epic: String(s.epic || "Features"),
        dependencies: Array.isArray(s.dependencies)
          ? s.dependencies.filter((d): d is string => typeof d === "string")
          : [],
        recommendedSkills: Array.isArray(s.recommendedSkills)
          ? s.recommendedSkills.filter(
              (sk): sk is string => typeof sk === "string",
            )
          : [],
        acceptanceCriteria: Array.isArray(s.acceptanceCriteria)
          ? s.acceptanceCriteria.filter(
              (c): c is string => typeof c === "string",
            )
          : [],
      }));
  } catch {
    return [];
  }
}

/**
 * BrainstormManager class
 *
 * Manages brainstorm sessions with OpenAI API.
 * Supports two-phase brainstorming:
 * 1. Conversation phase - explore the feature
 * 2. Story generation phase - create structured stories
 */
class BrainstormManager {
  private sessions: Map<string, BrainstormSession> = new Map();

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `brainstorm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start a new brainstorm session (Phase 1: Conversation)
   *
   * @param projectId - Database ID of the project
   * @param projectPath - Filesystem path to the project
   * @param projectName - Name of the project
   * @param userMessage - The user's message/request
   * @param callbacks - Callbacks for streaming updates
   * @returns The session ID
   * @throws Error if OpenAI is not configured or fails
   */
  async startSession(
    projectId: number,
    projectPath: string,
    projectName: string,
    userMessage: string,
    callbacks: BrainstormCallbacks,
  ): Promise<string> {
    const sessionId = this.generateSessionId();

    // Check OpenAI configuration
    if (!isOpenAIConfigured()) {
      throw new Error(
        "OPENAI_API_KEY is niet geconfigureerd. Stel deze in om de brainstorm functie te gebruiken.",
      );
    }

    // Initialize session with conversation phase
    const session: BrainstormSession = {
      sessionId,
      projectId,
      projectPath,
      projectName,
      status: "starting",
      phase: "conversation",
      startedAt: new Date(),
      content: "",
      stories: [],
      conversationHistory: [],
      featureAspects: { what: false, why: false, how: false, where: false },
    };
    this.sessions.set(sessionId, session);

    // Notify start
    callbacks.onStart?.(sessionId);

    // Generate phase 1 system prompt
    const systemPrompt = await generatePhase1Prompt(projectPath, projectName);

    // Track accumulated content
    let outputBuffer = "";

    // Update session status
    session.status = "running";

    // Add user message to history
    session.conversationHistory.push({ role: "user", content: userMessage });

    // Start streaming from OpenAI
    streamChatCompletion(systemPrompt, userMessage, {
      onChunk: (chunk) => {
        if (session.status === "cancelled") return;

        outputBuffer += chunk;
        session.content = outputBuffer;
        callbacks.onChunk?.(sessionId, chunk);
      },
      onComplete: (fullContent) => {
        if (session.status === "cancelled") return;

        session.status = "completed";
        session.content = fullContent;

        // Add assistant response to history
        session.conversationHistory.push({ role: "assistant", content: fullContent });

        // Parse aspects from response
        const aspects = parseAspectsFromResponse(fullContent);
        if (aspects) {
          session.featureAspects = aspects;
          callbacks.onPhaseChange?.(sessionId, "conversation", aspects);
        }

        // Check if ready for story (but don't auto-generate)
        // The UI will prompt the user to confirm

        callbacks.onComplete?.(sessionId, fullContent, []);
      },
      onError: (errorMessage) => {
        if (session.status === "cancelled") return;
        session.status = "error";
        callbacks.onError?.(sessionId, errorMessage);
      },
    }).catch((error) => {
      if (session.status !== "cancelled") {
        session.status = "error";
        callbacks.onError?.(sessionId, error instanceof Error ? error.message : "Onbekende fout");
      }
    });

    return sessionId;
  }

  /**
   * Continue a brainstorm session with a new message
   *
   * @param sessionId - The existing session ID
   * @param userMessage - The user's new message
   * @param callbacks - Callbacks for streaming updates
   */
  async continueSession(
    sessionId: string,
    userMessage: string,
    callbacks: BrainstormCallbacks,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if user wants to generate story
    const wantsStory = this.detectStoryRequest(userMessage);
    if (wantsStory && session.phase === "conversation") {
      // Switch to story generation phase
      await this.generateStory(sessionId, callbacks);
      return;
    }

    // Continue conversation
    session.status = "running";
    session.content = "";
    session.conversationHistory.push({ role: "user", content: userMessage });

    // Build messages array for multi-turn conversation
    const systemPrompt = await generatePhase1Prompt(session.projectPath, session.projectName);

    let outputBuffer = "";

    // Use full conversation history
    const messages = session.conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Stream response with conversation history
    streamChatCompletionWithHistory(systemPrompt, messages, {
      onChunk: (chunk) => {
        if (session.status === "cancelled") return;

        outputBuffer += chunk;
        session.content = outputBuffer;
        callbacks.onChunk?.(sessionId, chunk);
      },
      onComplete: (fullContent) => {
        if (session.status === "cancelled") return;

        session.status = "completed";
        session.content = fullContent;
        session.conversationHistory.push({ role: "assistant", content: fullContent });

        // Parse aspects
        const aspects = parseAspectsFromResponse(fullContent);
        if (aspects) {
          session.featureAspects = aspects;
          callbacks.onPhaseChange?.(sessionId, "conversation", aspects);
        }

        callbacks.onComplete?.(sessionId, fullContent, []);
      },
      onError: (errorMessage) => {
        if (session.status === "cancelled") return;
        session.status = "error";
        callbacks.onError?.(sessionId, errorMessage);
      },
    }).catch((error) => {
      if (session.status !== "cancelled") {
        session.status = "error";
        callbacks.onError?.(sessionId, error instanceof Error ? error.message : "Onbekende fout");
      }
    });
  }

  /**
   * Generate story from conversation (Phase 2)
   */
  async generateStory(
    sessionId: string,
    callbacks: BrainstormCallbacks,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Switch to story generation phase
    session.phase = "story_generation";
    session.status = "running";
    session.content = "";

    callbacks.onPhaseChange?.(sessionId, "story_generation", session.featureAspects);

    // Summarize conversation
    const conversationSummary = summarizeConversation(session.conversationHistory);

    // Generate phase 2 prompt with skill
    const systemPrompt = await generatePhase2Prompt(
      session.projectPath,
      session.projectName,
      conversationSummary,
    );

    let outputBuffer = "";

    // Request story generation
    streamChatCompletion(systemPrompt, "Genereer nu de story op basis van onze brainstorm.", {
      onChunk: (chunk) => {
        if (session.status === "cancelled") return;

        outputBuffer += chunk;
        session.content = outputBuffer;
        callbacks.onChunk?.(sessionId, chunk);

        // Try to parse stories
        const stories = parseStoriesFromResponse(outputBuffer);
        if (stories.length > session.stories.length) {
          session.stories = stories;
          callbacks.onStories?.(sessionId, stories);
        }
      },
      onComplete: (fullContent) => {
        if (session.status === "cancelled") return;

        session.status = "completed";
        session.content = fullContent;
        session.conversationHistory.push({ role: "assistant", content: fullContent });

        // Parse final stories
        const finalStories = parseStoriesFromResponse(fullContent);
        session.stories = finalStories;

        callbacks.onComplete?.(sessionId, fullContent, finalStories);
      },
      onError: (errorMessage) => {
        if (session.status === "cancelled") return;
        session.status = "error";
        callbacks.onError?.(sessionId, errorMessage);
      },
    }).catch((error) => {
      if (session.status !== "cancelled") {
        session.status = "error";
        callbacks.onError?.(sessionId, error instanceof Error ? error.message : "Onbekende fout");
      }
    });
  }

  /**
   * Detect if user wants to generate a story
   */
  private detectStoryRequest(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const storyTriggers = [
      "ja",
      "yes",
      "ok",
      "oké",
      "doe maar",
      "maak maar",
      "genereer",
      "maak de story",
      "maak een story",
      "generate",
      "/story",
      "story genereren",
    ];
    return storyTriggers.some((trigger) => lowerMessage.includes(trigger));
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): BrainstormSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions for a project
   */
  getSessionsByProject(projectId: number): BrainstormSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.projectId === projectId && s.status === "running",
    );
  }

  /**
   * Cancel a running session
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running") {
      return false;
    }

    session.status = "cancelled";
    return true;
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.startedAt.getTime() > maxAgeMs) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

// Export singleton instance
export const brainstormManager = new BrainstormManager();

// Export type for external use
export type { BrainstormManager };

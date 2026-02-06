/**
 * Prompt Generator Service
 *
 * Generates runner prompts for Claude containers based on:
 * - Base agent instructions (story lifecycle, workflow)
 * - Project-specific skills
 * - prd.json location and format
 * - progress.txt patterns
 *
 * Outputs a CLAUDE.md file that the container reads on startup.
 */
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

// Environment variables
const SKILLS_PATH = process.env.SKILLS_PATH || './skills'

/**
 * Configuration for prompt generation
 */
export interface PromptConfig {
  projectPath: string
  projectName: string
  branchName?: string
  skills: string[] // Array of skill IDs to include
}

/**
 * Skill data structure
 */
interface SkillData {
  id: string
  name: string
  description: string
  content: string
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
 * Load a skill from the filesystem
 * Checks project override first, then central skills
 */
async function loadSkill(
  skillId: string,
  projectPath: string
): Promise<SkillData | null> {
  // Check project override first
  const projectSkillPath = join(projectPath, '.ralph', 'skills', skillId, 'SKILL.md')
  if (existsSync(projectSkillPath)) {
    try {
      const content = await readFile(projectSkillPath, 'utf-8')
      const frontmatter = parseFrontmatter(content)
      if (frontmatter) {
        return {
          id: skillId,
          name: frontmatter.name,
          description: frontmatter.description,
          content,
        }
      }
    } catch {
      // Fall through to central skill
    }
  }

  // Check central skill
  const centralSkillPath = join(SKILLS_PATH, skillId, 'SKILL.md')
  if (existsSync(centralSkillPath)) {
    try {
      const content = await readFile(centralSkillPath, 'utf-8')
      const frontmatter = parseFrontmatter(content)
      if (frontmatter) {
        return {
          id: skillId,
          name: frontmatter.name,
          description: frontmatter.description,
          content,
        }
      }
    } catch {
      return null
    }
  }

  return null
}

/**
 * Get the base agent instructions for story execution
 */
function getBaseAgentInstructions(): string {
  return `# Agent Instructions

## Your Task

**CRITICAL: You must implement exactly ONE story per session. After completing one story, STOP immediately.**

1. Read \`stories/prd.json\`
2. Read \`stories/progress.txt\` (check Codebase Patterns section first)
3. Read any implementation guides listed in prd.json \`implementationGuides\` array
4. Check you're on the correct branch (\`branchName\` from prd.json)
5. **Select ONE story** where \`status: "pending"\` or \`status: "failed"\` (lowest priority number first)
   - Respect \`dependencies\` - skip if dependent stories don't have \`status: "done"\`
   - Pick the story with the lowest priority number
6. **Mark as in_progress**: Immediately set \`status: "in_progress"\` in prd.json
7. Note the \`recommendedSkills\` for that story
8. **Implement that ONE story only**
9. Run typecheck and tests
10. Update relevant documentation with learnings
11. Commit: \`feat([scope]): [ID] - [Title]\`
12. **Set final status** in prd.json:
    - Success -> \`status: "done"\`
    - Failure -> \`status: "failed"\`
13. Append learnings to progress.txt
14. **STOP - Do not continue to the next story**

## Story Status Lifecycle

Stories use a \`status\` field with these values:

| Status | Meaning | Next Action |
|--------|---------|-------------|
| \`pending\` | Not started | Can be picked up |
| \`in_progress\` | Agent is working on it | Wait or check progress.txt |
| \`done\` | Successfully completed | No action needed |
| \`failed\` | Attempted but failed | Can be retried (check progress.txt for learnings) |

### Status Transitions

\`\`\`
pending -------> in_progress -------> done
                    |
                    '-----------> failed --> (can be picked up again)
\`\`\`

### Picking Stories

Priority order for selecting next story:
1. \`status: "pending"\` with lowest priority number
2. \`status: "failed"\` with lowest priority number (retry with learnings)
3. If all are \`done\` -> reply \`<promise>COMPLETE</promise>\`

**IMPORTANT:** Always set \`status: "in_progress"\` BEFORE starting work. This prevents other sessions from picking up the same story.

## General Best Practices

1. **Read before write** - Always read existing code before modifying
2. **Test coverage** - Every feature needs unit/integration tests
3. **Type safety** - Use TypeScript types, avoid \`any\`
4. **Error handling** - Handle edge cases explicitly
5. **Small commits** - One story = one commit
6. **Acceptance criteria** - Verify ALL criteria before marking as passed

## Acceptance Criteria Checklist

Before setting \`status: "done"\`, verify:
- [ ] All acceptance criteria from the story are met
- [ ] Tests pass (\`npm run test\` or equivalent)
- [ ] TypeScript compiles without errors (\`npm run typecheck\` or equivalent)
- [ ] No regressions in existing functionality

## Progress Format

APPEND to \`stories/progress.txt\`:

\`\`\`
## [YYYY-MM-DD] - [Story ID]
**Title:** [Story title]

**Implemented:**
- What was built/changed

**Files changed:**
- path/to/file.ts

**Learnings:**
- Patterns discovered
- Gotchas encountered
- Decisions made and why
\`\`\`

## Codebase Patterns

Reusable patterns go at the TOP of \`stories/progress.txt\` under:

\`\`\`
## Codebase Patterns (Updated by Agents)
- [Pattern description]
\`\`\`

These are discovered during implementation, not predefined.
Update this section when you discover patterns others should follow.

## Commit Convention

Use Conventional Commits format:
\`\`\`
feat([Scope]): [ID] - [Title]
\`\`\`

Example:
\`\`\`
feat(Advertisement): US-MIG-006-A - Advertisement service read operations
\`\`\`

Scope should match the module being worked on.

## Stop Condition

**After working on ONE story, you MUST stop.** Do not pick up another story.

Reply with one of:

| Situation | Response |
|-----------|----------|
| Story completed successfully | \`<promise>DONE_ONE</promise>\` |
| Story failed, documented in progress.txt | \`<promise>FAILED_ONE</promise>\` |
| All stories have \`status: "done"\` | \`<promise>COMPLETE</promise>\` |

**NEVER continue to the next story in the same session.**

## Failure Protocol

**Failure is acceptable and expected.** Not every story will succeed on the first attempt.

### When to Consider a Story Failed

- Acceptance criteria cannot be met with current approach
- Unexpected technical blockers discovered
- Missing dependencies or unclear requirements
- Tests fail and you cannot fix them
- You've spent significant effort without progress

### How to Handle Failure

**CRITICAL: NEVER set \`status: "done"\` unless ALL acceptance criteria are genuinely met.**

1. **Set \`status: "failed"\`** - Mark the story as failed in prd.json
2. **Document in progress.txt** using the FAILED format (see below)
3. **Be specific** about what was tried and why it failed
4. **Include learnings** - what would help for the next attempt?
5. **Reply with \`<promise>FAILED_ONE</promise>\`**

### Failed Story Progress Format

APPEND to \`stories/progress.txt\`:

\`\`\`
## [YYYY-MM-DD] - [Story ID] FAILED
**Title:** [Story title]

**Attempted:**
- What approach was tried
- What tools/methods were used

**Why it failed:**
- Specific reason for failure
- Error messages encountered
- What was blocking

**Files touched (if any):**
- path/to/file.ts (reverted / partial)

**Learnings for next attempt:**
- What should be tried differently
- What information is missing
- Suggested approach for retry

**Needs from human:**
- Questions that need answering
- Decisions that need to be made
- Access/permissions needed (if any)
\`\`\`

### Re-attempting Failed Stories

- Failed stories have \`status: "failed"\` and can be picked up again
- Next agent session will see the failure notes in progress.txt
- Use the "Learnings for next attempt" as starting point
- A story can fail multiple times - each attempt adds to the knowledge
- When retrying, set \`status: "in_progress"\` first, then work on the fix

### Honesty Over Completion

**Do not:**
- Mark as passed when criteria are partially met
- Skip acceptance criteria you couldn't verify
- Force a solution that doesn't actually work
- Pretend tests pass when they don't

**Do:**
- Admit when you're stuck
- Document partial progress
- Ask for help via "Needs from human"
- Trust that failure provides value (learnings)`
}

/**
 * Get the prd.json format documentation
 */
function getPrdJsonFormat(): string {
  return `## prd.json Format

The \`stories/prd.json\` file contains project configuration and user stories:

\`\`\`json
{
  "projectName": "Project Name",
  "branchName": "feature/my-feature",
  "projectDescription": "Description of the project",
  "implementationGuides": [
    {
      "name": "Guide Name",
      "path": "docs/guide.md",
      "description": "What this guide covers"
    }
  ],
  "availableSkills": [
    "frontend-design",
    "backend-development:api-design-principles"
  ],
  "epics": [
    {
      "name": "Epic Name",
      "description": "What this epic covers"
    }
  ],
  "userStories": [
    {
      "id": "EPIC-001",
      "title": "Story title",
      "description": "What needs to be done",
      "priority": 1,
      "status": "pending",
      "epic": "Epic Name",
      "dependencies": [],
      "recommendedSkills": ["frontend-design"],
      "acceptanceCriteria": [
        "First criterion",
        "Second criterion"
      ]
    }
  ]
}
\`\`\`

### Status Values

| Status | Description |
|--------|-------------|
| \`pending\` | Ready to be picked up |
| \`in_progress\` | Currently being worked on |
| \`done\` | Successfully completed |
| \`failed\` | Attempted but failed (can be retried) |

### Working with prd.json

1. **Reading**: Parse JSON, filter stories by status and dependencies
2. **Updating status**: Modify the story object, write entire file back
3. **Priority**: Lower number = higher priority (1 is highest)`
}

/**
 * Format skills as sections in the prompt
 */
function formatSkillsSections(skills: SkillData[]): string {
  if (skills.length === 0) {
    return ''
  }

  const sections = skills.map((skill) => {
    // Extract just the body content (after frontmatter)
    const match = skill.content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
    const body = match ? match[1].trim() : skill.content

    return `## Skill: ${skill.name}

${body}`
  })

  return `
# Available Skills

The following skills are available for this project. Reference them when implementing stories.

${sections.join('\n\n---\n\n')}`
}

/**
 * Generate the full runner prompt
 */
export async function generateRunnerPrompt(config: PromptConfig): Promise<string> {
  const { projectPath, projectName, branchName, skills } = config

  // Load requested skills
  const loadedSkills: SkillData[] = []
  for (const skillId of skills) {
    const skill = await loadSkill(skillId, projectPath)
    if (skill) {
      loadedSkills.push(skill)
    }
  }

  // Build the full prompt
  const parts: string[] = []

  // Project header
  parts.push(`# ${projectName}`)
  parts.push('')
  if (branchName) {
    parts.push(`**Branch:** \`${branchName}\``)
    parts.push('')
  }

  // Base agent instructions
  parts.push(getBaseAgentInstructions())
  parts.push('')

  // prd.json format documentation
  parts.push(getPrdJsonFormat())
  parts.push('')

  // Project-specific skills
  if (loadedSkills.length > 0) {
    parts.push(formatSkillsSections(loadedSkills))
  }

  return parts.join('\n')
}

/**
 * Write the generated prompt to the project's .ralph folder as CLAUDE.md
 */
export async function writePromptToProject(
  config: PromptConfig
): Promise<string> {
  const promptContent = await generateRunnerPrompt(config)

  // Ensure .ralph directory exists
  const ralphDir = join(config.projectPath, '.ralph')
  if (!existsSync(ralphDir)) {
    await mkdir(ralphDir, { recursive: true })
  }

  // Write CLAUDE.md
  const promptPath = join(ralphDir, 'CLAUDE.md')
  await writeFile(promptPath, promptContent, 'utf-8')

  return promptPath
}

/**
 * Read project configuration from prd.json
 */
export async function readProjectConfig(projectPath: string): Promise<{
  projectName: string
  branchName: string | undefined
  availableSkills: string[]
} | null> {
  const prdPath = join(projectPath, 'stories', 'prd.json')

  if (!existsSync(prdPath)) {
    return null
  }

  try {
    const content = await readFile(prdPath, 'utf-8')
    const data = JSON.parse(content)

    return {
      projectName: data.projectName || 'Unnamed Project',
      branchName: data.branchName,
      availableSkills: data.availableSkills || [],
    }
  } catch {
    return null
  }
}

/**
 * Generate and write prompt for a project using its prd.json configuration
 */
export async function generatePromptForProject(projectPath: string): Promise<string | null> {
  const config = await readProjectConfig(projectPath)

  if (!config) {
    return null
  }

  return writePromptToProject({
    projectPath,
    projectName: config.projectName,
    branchName: config.branchName,
    skills: config.availableSkills,
  })
}

// Export types for testing
export type { SkillData }

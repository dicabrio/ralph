# Agents Directory

Central directory for all AI agents working on the Ibiza Marketplace platform.

## Quick Start

```bash
# See available agents
ls -la agents/

# Read agent instructions
cat agents/backend-developer/INSTRUCTIONS.md

# Check shared context
cat agents/shared/context.json
```

## Agent Directories

- `backend-developer/` - Express.js API, TypeScript, Knex.js
- `web-developer/` - Next.js 15 web frontend, Tailwind CSS v4
- `mobile-developer/` - React Native & Expo mobile apps
- `database-engineer/` - PostgreSQL, Knex migrations
- `devops-engineer/` - Docker, AWS Copilot, CI/CD
- `test-engineer/` - Test automation & coverage
- `qa-specialist/` - Manual testing & bug tracking

## Shared Resources

- `shared/context.json` - Current sprint, priorities, tech stack
- `shared/conventions.md` - Code standards
- `shared/handoffs.json` - Agent task handoffs
- `_logs/` - Agent execution logs

## How To Use Agents

### Via Claude Code

When working with Claude Code, reference the agent:

```
"Act as the Backend Developer agent and implement the user authentication endpoint"

"As Web Developer agent, implement the product listing page"

"As Mobile Developer agent, add the new screen to the React Native app"

"Review this code as the Database Engineer agent"
```

Claude Code will read the relevant INSTRUCTIONS.md and follow those guidelines.

### Agent Context

All agents have access to:
- Project docs (`CLAUDE.md`)
- Code conventions (`agents/shared/conventions.md`)
- Current context (`agents/shared/context.json`)

## Agent Collaboration

Agents work together via handoffs:

1. **Backend** implements an API endpoint
2. **Backend** updates `handoffs.json`
3. **Web Developer** implements the frontend
4. **Mobile Developer** implements the mobile screens
5. **Test Engineer** writes tests
6. **QA** does manual verification

## Best Practices

1. **Be specific**: "Implement the advertisement creation endpoint in Api/src/modules/advertisement"
2. **Check dependencies**: Ensure prerequisite tasks are complete
3. **Review output**: Agents make mistakes, always review

## Adding New Agents

To add a new specialized agent:

1. Create directory: `agents/new-agent-name/`
2. Create `INSTRUCTIONS.md` with role, responsibilities, patterns
3. Update this README
4. Update `context.json` with new agent

## Documentation

- **Main overview**: `../CLAUDE.md`
- **Agent instructions**: `{agent-name}/INSTRUCTIONS.md`
- **Shared conventions**: `shared/conventions.md`

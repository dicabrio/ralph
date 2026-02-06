# Ralph Dashboard - Implementation Guide

## Overview

Ralph Dashboard is een Docker-based applicatie voor het beheren van AI-gestuurde development met Ralph loops. Het biedt een centrale plek voor:

- Projecten beheren
- Stories visualiseren en beheren (Kanban)
- Brainstormen met Claude (met codebase toegang)
- Skills/prompts bibliotheek beheren
- Runner orkestratie

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Host Machine                                                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Ralph Docker Container                                 │  │
│  │                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ TanStack Start  │  │ Runner Service              │  │  │
│  │  │ Web UI (:9000)  │  │ - Process Manager           │  │  │
│  │  │ - Dashboard     │  │ - Log Streaming             │  │  │
│  │  │ - Kanban        │  │ - Status Monitoring         │  │  │
│  │  │ - Brainstorm    │  │                             │  │  │
│  │  │ - Skills        │  │         │                   │  │  │
│  │  └─────────────────┘  └─────────┼───────────────────┘  │  │
│  │           │                     │                      │  │
│  │           ▼                     ▼ spawns               │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ tRPC API        │  │ Claude Docker Container     │  │  │
│  │  │ + WebSocket     │  │ - ANTHROPIC_API_KEY         │  │  │
│  │  └─────────────────┘  │ - Project mount             │  │  │
│  │                       │ - Skills mount              │  │  │
│  └───────────────────────┴─────────────────────────────┴──┘  │
│            │                         │                       │
│  ┌─────────▼─────────────────────────▼─────────────────────┐ │
│  │ Volume Mounts                                           │ │
│  │  - DATA_PATH     → ~/.ralph/          (SQLite DB)       │ │
│  │  - SKILLS_PATH   → ~/.ralph/skills/   (Central skills)  │ │
│  │  - PROJECTS_ROOT → ~/Projects/        (All projects)    │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | TanStack Start, React, TailwindCSS |
| API | tRPC (type-safe) |
| Real-time | WebSocket (native via Vinxi) |
| Database | SQLite + Drizzle ORM |
| Container | Docker, Docker Compose |
| AI | Claude Code (Docker container) |

## Folder Structure

### Application Structure

```
ralph-dashboard/
├── src/
│   ├── routes/                    # TanStack Start routes
│   │   ├── index.tsx              # Dashboard
│   │   ├── brainstorm.tsx         # Brainstorm chat
│   │   ├── prompts.tsx            # Central skills
│   │   └── project/
│   │       ├── $id.tsx            # Project detail
│   │       ├── $id.kanban.tsx     # Kanban board
│   │       └── $id.prompts.tsx    # Project skills
│   ├── components/
│   │   ├── layout/
│   │   ├── kanban/
│   │   ├── modals/
│   │   └── ui/
│   ├── lib/
│   │   ├── trpc/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── routers/
│   │   │       ├── projects.ts
│   │   │       ├── stories.ts
│   │   │       ├── skills.ts
│   │   │       ├── runner.ts
│   │   │       └── brainstorm.ts
│   │   ├── services/
│   │   │   ├── projectDiscovery.ts
│   │   │   ├── runnerManager.ts
│   │   │   ├── promptGenerator.ts
│   │   │   └── skillsLoader.ts
│   │   └── websocket/
│   │       └── server.ts
│   └── db/
│       ├── index.ts
│       ├── schema/
│       │   ├── projects.ts
│       │   └── runner_logs.ts
│       └── migrations/
├── Dockerfile
├── docker-compose.yml
├── drizzle.config.ts
└── package.json
```

### Volume Mount Structure

```
~/.ralph/                          # DATA_PATH
├── ralph.db                       # SQLite database

~/.ralph/skills/                   # SKILLS_PATH (central skills)
├── database-design/
│   └── postgresql.md
├── backend-development/
│   └── api-design-principles.md
├── frontend-design/
│   └── index.md
└── ...

~/Projects/                        # PROJECTS_ROOT
└── my-project/
    ├── prd.json                   # Stories & config
    ├── progress.txt               # AI learnings
    ├── src/                       # Project source code
    └── .ralph/                    # Project-specific Ralph config
        └── skills/                # Skill overrides
            └── frontend-design.md
```

## Data Models

### prd.json (Project Configuration)

```json
{
  "branchName": "feature/my-feature",
  "projectDescription": "Description of the project",
  "implementationGuides": ["docs/design.md"],
  "availableSkills": [
    "database-design:postgresql",
    "backend-development:api-design-principles"
  ],
  "userStories": [
    {
      "id": "STORY-001",
      "title": "Story title",
      "description": "What needs to be done",
      "priority": 1,
      "status": "pending",
      "epic": "Epic Name",
      "dependencies": [],
      "recommendedSkills": ["frontend-design"],
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ]
    }
  ]
}
```

### Story Status Lifecycle

```
backlog ──────► pending ──────► in_progress ──────► done
                   │                  │
                   │                  ▼
                   │              failed
                   │                  │
                   └──────────────────┘
                      (retry)
```

| Status | Description |
|--------|-------------|
| `backlog` | Not ready for execution |
| `pending` | Ready to be picked up by runner |
| `in_progress` | Currently being worked on |
| `done` | Successfully completed |
| `failed` | Attempted but failed (can be retried) |

### Database Schema

**projects**
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Project name |
| path | TEXT | Filesystem path (unique) |
| description | TEXT | Project description |
| branch_name | TEXT | Current branch |
| created_at | DATETIME | Creation timestamp |
| updated_at | DATETIME | Last update timestamp |

**runner_logs**
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| project_id | TEXT | Foreign key to projects |
| story_id | TEXT | Story being executed |
| log_content | TEXT | Log line content |
| log_type | TEXT | stdout or stderr |
| timestamp | DATETIME | Log timestamp |

## Pages & Features

### Dashboard (/)

- Project cards with:
  - Name, description
  - Runner status indicator (idle/running)
  - Progress bar (done/total stories)
  - Failed count badge
  - Last activity
- "Add Project" button (manual)
- "Discover Projects" button (auto-scan)

### Project Page (/project/:id)

- Project header with name and description
- Settings:
  - Branch name (editable)
  - Path (read-only)
- Statistics:
  - Total stories
  - Per-status counts
  - Progress percentage
- Quick links to Kanban and Project Prompts
- Runner controls (start/stop)

### Kanban Board (/project/:id/kanban)

- 5 columns: Backlog, Te doen, Gefaald*, In Progress, Voltooid
  - *Gefaald only visible when failed stories exist
- Story cards showing:
  - Priority badge
  - Story ID
  - Title
  - Dependencies badges
  - Epic label
- Drag & drop:
  - Backlog ↔ Te doen only
  - Blocked stories cannot be moved to Te doen
- Runner controls in header
- Click story → Detail modal
- Click In Progress story → Log modal

### Brainstorm (/brainstorm)

- Project selector
- Chat interface with Claude
- Claude has access to:
  - Project codebase
  - Existing stories
  - Available skills
- Generates stories in JSON format
- Preview cards with approve/edit actions

### Central Prompts (/prompts)

- Skills grouped by category
- Search/filter
- Click for detail view
- Edit if SKILLS_PATH is writable

### Project Prompts (/project/:id/prompts)

- All skills (central + overrides)
- Badge for overridden skills
- Filter: All, Active, Overridden
- Toggle skill active/inactive
- Override button → Edit modal with diff view

## Runner Configuration

### Agent Prompt Template

The runner generates a prompt for Claude based on:

1. Base agent instructions (story lifecycle, workflow)
2. Project-specific skills
3. prd.json location and format
4. progress.txt patterns

### Runner Behavior

- Picks stories from "pending" or "failed" (lowest priority first)
- Respects dependencies
- One story at a time per project
- Autonomous execution (no human intervention)
- Writes learnings to progress.txt
- Auto-restarts for next story if runner still "on"

## Docker Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| ANTHROPIC_API_KEY | Claude API key | sk-ant-... |
| PROJECTS_ROOT | Projects mount path | /projects |
| SKILLS_PATH | Skills mount path | /skills |
| DATA_PATH | Database mount path | /data |
| PORT | Web UI port | 9000 |

### docker-compose.yml Example

```yaml
version: '3.8'

services:
  ralph:
    build: .
    ports:
      - "9000:9000"
    volumes:
      - ${HOME}/Projects:/projects
      - ${HOME}/.ralph/skills:/skills
      - ${HOME}/.ralph:/data
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - PROJECTS_ROOT=/projects
      - SKILLS_PATH=/skills
      - DATA_PATH=/data
```

### Claude Container Spawning

Ralph spawns Claude containers with:

```bash
docker run --rm \
  -v ${PROJECT_PATH}:/workspace \
  -v ${SKILLS_PATH}:/skills:ro \
  -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY} \
  anthropic/claude-code:latest \
  --prompt-file /workspace/.ralph/agent-prompt.md
```

## WebSocket Events

### Client → Server

```typescript
// Subscribe to project logs
{ type: 'subscribe', projectId: string }

// Unsubscribe
{ type: 'unsubscribe', projectId: string }
```

### Server → Client

```typescript
// Log line
{ type: 'log', projectId: string, storyId: string, content: string, logType: 'stdout' | 'stderr', timestamp: string }

// Status change
{ type: 'status', projectId: string, status: 'idle' | 'running' | 'stopping', storyId?: string }

// Story update
{ type: 'storyUpdate', projectId: string, storyId: string, status: string }
```

## Skills Format

Skills are markdown files with frontmatter:

```markdown
---
name: PostgreSQL Database Design
category: database-design
description: Design PostgreSQL schemas with best practices
---

# PostgreSQL Database Design

[Skill content here...]
```

### Central vs Override

- **Central**: `{SKILLS_PATH}/database-design/postgresql.md`
- **Override**: `{PROJECT_PATH}/.ralph/skills/database-design/postgresql.md`

Override takes precedence when present.

## Testing Strategy

### Test Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit tests, fast execution |
| **React Testing Library** | Component tests |
| **Playwright** | E2E tests |

### Test Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Test Categories

**Unit Tests** (per story inline criteria):
- tRPC routers: mocked database/filesystem
- Services: mocked Docker API, filesystem
- Utilities: pure functions

**Component Tests**:
- Layout: navigation state, responsive behavior
- Kanban cards: rendering with different states
- Drag & drop: validation, state updates
- Modals: open/close, form validation

**E2E Tests** (dedicated stories):
- E2E-001: Project management flow
- E2E-002: Kanban board interactions
- E2E-003: Runner start/stop and logs
- E2E-004: Skills management and overrides

### Mocking Strategy

| System | Mock Approach |
|--------|---------------|
| Docker API | Dockerode mock or test containers |
| Filesystem | memfs or tmp directories |
| Database | In-memory SQLite |
| WebSocket | Mock server |
| Claude container | Mock process with scripted output |

## Implementation Order

The stories are ordered by priority with dependencies respected:

1. **Setup** (1-4): TanStack Start, Docker, Claude integration, **Test setup**
2. **Database** (5-7): SQLite, projects table, runner_logs table
3. **Core API** (8-15): tRPC, WebSocket, CRUD routes (with unit tests)
4. **Dashboard UI** (16-19): Layout, project cards, modals
5. **Project UI** (20): Project detail page
6. **Kanban UI** (21-25): Board, cards, drag & drop, modals (with component tests)
7. **Brainstorm UI** (26-28): Chat interface, story preview
8. **Skills UI** (29-32): Central prompts, project overrides, diff
9. **Runner** (33-36): Process manager, log streaming, monitoring (with unit tests)
10. **E2E Tests** (37-40): Project, Kanban, Runner, Skills flows

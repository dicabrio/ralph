# Ralph Dashboard - Getting Started

Deze guide beschrijft hoe je de Ralph Dashboard applicatie kunt starten en configureren.

## Inhoudsopgave

- [Prerequisites](#prerequisites)
- [Quick Start (Lokale Ontwikkeling)](#quick-start-lokale-ontwikkeling)
- [Docker Setup (Production)](#docker-setup-production)
- [Environment Variables](#environment-variables)
- [Database Commands](#database-commands)
- [Testing](#testing)
- [Overige Commands](#overige-commands)

---

## Prerequisites

- **Node.js** 20+
- **pnpm** (package manager)
- **Docker** (voor production/container deployment)
- **Anthropic API Key** (voor Claude integratie)

---

## Quick Start (Lokale Ontwikkeling)

### 1. Installeer dependencies

```bash
pnpm install
```

### 2. Configureer environment variables

Maak een `.env.local` bestand aan (kopieer van `.env.example`):

```bash
cp .env.example .env.local
```

Vul minimaal de volgende variabelen in:

```env
# Claude authenticatie (kies EEN van de twee opties):

# Optie 1: API Key (voor API toegang)
ANTHROPIC_API_KEY=sk-ant-...

# Optie 2: Claude Config (voor Max/Pro abonnement)
# HOST_CLAUDE_CONFIG=~/.claude.json

# Pad naar je projecten folder
PROJECTS_ROOT=/Users/jouw-naam/Projects

# Pad naar skills folder (optioneel)
SKILLS_PATH=./skills

# Database locatie
DATA_PATH=./data
```

> **Tip:** Als je een Claude Max of Pro abonnement hebt, kun je `HOST_CLAUDE_CONFIG` gebruiken in plaats van een API key. Dit mount je lokale `~/.claude.json` configuratie in de Claude containers.

### 3. Initialiseer de database

```bash
# Genereer migrations (indien nodig)
pnpm db:generate

# Push schema naar database
pnpm db:push
```

### 4. Start de development server

```bash
pnpm dev
```

De applicatie is nu beschikbaar op: **http://localhost:9000**

---

## Docker Setup (Production)

### 1. Configureer environment variables

Maak een `.env` bestand aan:

```env
# Claude authenticatie (kies EEN van de twee opties):

# Optie 1: API Key (voor API toegang)
ANTHROPIC_API_KEY=sk-ant-...

# Optie 2: Claude Config (voor Max/Pro abonnement)
# Uncomment de volgende regel om je lokale Claude plan te gebruiken:
# HOST_CLAUDE_CONFIG=~/.claude.json

# Paden op je HOST machine (worden gemount in container)
PROJECTS_ROOT=/Users/jouw-naam/Projects
SKILLS_PATH=/Users/jouw-naam/.claude/skills
DATA_PATH=./data
```

### 2. (Optioneel) Uncomment claude.json mount

Als je `HOST_CLAUDE_CONFIG` gebruikt, uncomment ook de mount in `docker-compose.yml`:

```yaml
volumes:
  # ... andere mounts ...
  # Uncomment voor Claude Max/Pro:
  - ~/.claude.json:/root/.claude.json:ro
```

### 3. Start met Docker Compose

```bash
docker-compose up -d
```

Dit start de Ralph Dashboard container met:
- **Port 9000** exposed voor de web UI
- **Database** gemount op `${DATA_PATH}`
- **Projects** gemount op `${PROJECTS_ROOT}`
- **Skills** gemount op `${SKILLS_PATH}`
- **Docker socket** gemount voor het starten van Claude containers
- **Claude config** (optioneel) voor Max/Pro abonnement authenticatie

### 4. Bekijk logs

```bash
docker-compose logs -f ralph-app
```

### 5. Stop de applicatie

```bash
docker-compose down
```

---

## Environment Variables

### Claude Authenticatie (kies één)

| Variable | Beschrijving | Default | Vereist |
|----------|--------------|---------|---------|
| `ANTHROPIC_API_KEY` | API key voor Claude API toegang | - | Ja* |
| `HOST_CLAUDE_CONFIG` | Pad naar `~/.claude.json` voor Max/Pro abonnement | - | Ja* |

> \* Eén van beide is vereist. Als beide zijn ingesteld, heeft `HOST_CLAUDE_CONFIG` voorrang.

### Overige variabelen

| Variable | Beschrijving | Default | Vereist |
|----------|--------------|---------|---------|
| `PROJECTS_ROOT` | Pad naar projecten folder | `./projects` | Ja |
| `SKILLS_PATH` | Pad naar skills folder | `./skills` | Nee |
| `DATA_PATH` | Pad naar database folder | `./data` | Nee |
| `PORT` | Server port | `9000` | Nee |
| `NODE_ENV` | Environment mode | `development` | Nee |

### Docker-specifieke variabelen

| Variable | Beschrijving |
|----------|--------------|
| `HOST_PROJECTS_ROOT` | Host pad voor Claude container mounts |
| `HOST_SKILLS_PATH` | Host pad voor skills in Claude container |
| `HOST_CLAUDE_CONFIG` | Host pad naar `.claude.json` voor Max/Pro auth |

---

## Database Commands

Ralph gebruikt SQLite met Drizzle ORM voor database operaties.

```bash
# Genereer migrations van schema changes
pnpm db:generate

# Push schema direct naar database (development)
pnpm db:push

# Apply migrations
pnpm db:migrate

# Pull schema van bestaande database
pnpm db:pull

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

**Database locatie:** `{DATA_PATH}/ralph.db`

---

## Testing

### Unit Tests (Vitest)

```bash
# Run alle tests eenmalig
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests met coverage
pnpm test:coverage
```

### End-to-End Tests (Playwright)

```bash
# Run E2E tests headless
pnpm test:e2e

# Run E2E tests met UI
pnpm test:e2e:ui

# Run E2E tests met browser zichtbaar
pnpm test:e2e:headed
```

---

## Overige Commands

### Linting & Formatting (Biome)

```bash
# Check linting
pnpm lint

# Format code
pnpm format

# Check beide
pnpm check
```

### TypeScript

```bash
# Type checking
pnpm typecheck
```

### Build

```bash
# Build voor production
pnpm build

# Preview production build
pnpm preview
```

---

## Project Structuur

```
ralph/
├── src/
│   ├── routes/           # TanStack Router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities, tRPC, services
│   └── db/               # Drizzle schema en migrations
├── docs/                 # Documentatie (je bent hier)
├── drizzle/              # Migration files
├── e2e/                  # Playwright E2E tests
├── data/                 # SQLite database (gitignored)
├── projects/             # Gemounte projecten folder
├── skills/               # Centrale skills bibliotheek
└── stories/              # PRD en story configuratie
```

---

## Troubleshooting

### Database errors

Als je database errors krijgt, probeer:

```bash
# Reset database
rm -rf data/ralph.db
pnpm db:push
```

### Docker socket permission denied

Op Linux, voeg je user toe aan de docker group:

```bash
sudo usermod -aG docker $USER
# Log opnieuw in
```

### Port already in use

Stop andere services op port 9000 of wijzig de port:

```bash
PORT=3000 pnpm dev
```

---

## Volgende Stappen

1. Open http://localhost:9000
2. Voeg een project toe via de Dashboard
3. Bekijk de Kanban board voor stories
4. Start de runner om stories uit te voeren

Voor meer informatie, zie de [implementatie guides](./):
- [React Best Practices](./react-best-practices.md)
- [TanStack Start Best Practices](./tanstack-start-best-practices.md)
- [Drizzle ORM Best Practices](./drizzle-orm-best-practices.md)
- [WebSocket Best Practices](./websocket-best-practices.md)
- [Docker Best Practices](./docker-best-practices.md)

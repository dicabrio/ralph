# Twee-fase Brainstorm met Story Generator

**Datum:** 2025-02-08
**Story:** BRAIN-001
**Status:** Design Approved

## Overzicht

Implementeer een twee-fase brainstorm flow waarbij gebruikers eerst vrij kunnen brainstormen over een feature, waarna de AI automatisch detecteert wanneer alle aspecten duidelijk zijn en een gestructureerde story genereert.

## Probleemstelling

Huidige situatie:
- Gebruikers moeten zelf bepalen wanneer een feature "klaar" is voor een story
- Context uit de brainstorm moet handmatig worden overgenomen
- Geen gestandaardiseerd format voor story generatie

Gewenste situatie:
- AI detecteert automatisch wanneer een feature duidelijk genoeg is
- Context uit brainstorm vloeit naadloos door naar story generatie
- Consistente story output met quality gates

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Fase 1: Vrij Brainstormen                                      │
│                                                                 │
│  User: "Ik wil een watchlist feature..."                       │
│  AI: "Interessant! Hoe zie je de UI voor je?"                  │
│  User: "Een pagina met alle politici die ik volg"              │
│  AI: "En wat voor notificaties wil je?"                        │
│  ...                                                            │
│                                                                 │
│  [AI detecteert: What ✓ Why ✓ How ✓ Where ✓]                   │
│                                                                 │
│  AI: "Ik denk dat ik genoeg weet om hier een story van te      │
│       maken. Wil je dat ik dat doe?"                           │
│                                                                 │
│  User: "Ja, maak maar"                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Fase 2: Story Generatie                                        │
│                                                                 │
│  1. Laad skill: .claude/skills/story-generator/SKILL.md        │
│     (fallback: host-skills/story-generator/SKILL.md)           │
│                                                                 │
│  2. Bouw prompt:                                                │
│     - Skill instructies                                         │
│     - Samenvatting van brainstorm gesprek                      │
│     - Project context (bestaande stories, epics, skills)        │
│                                                                 │
│  3. OpenAI call → JSON story output                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Fase 3: Review & Approve                                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  StoryPreviewCard                                         │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ P9  FEAT-004            [Discard] [Edit] [Approve] │  │  │
│  │  │ Politician Watchlist                                │  │  │
│  │  │ Gebruikers kunnen politici toevoegen aan hun...    │  │  │
│  │  │ Epic: Core Features                                 │  │  │
│  │  │ ▼ 11 Acceptance Criteria                            │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Approve] → Story toegevoegd aan prd.json                     │
│  [Edit]    → Open edit modal                                    │
│  [Discard] → Verwijder preview                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Detectie Criteria

De AI detecteert dat een feature "duidelijk genoeg" is wanneer deze aspecten besproken zijn:

| Aspect | Beschrijving | Voorbeeld |
|--------|--------------|-----------|
| **What** | Functioneel doel | "Gebruikers kunnen politici volgen" |
| **Why** | User value | "Om trades van favoriete politici te monitoren" |
| **How** | UI richting | "Watchlist pagina met add/remove buttons" |
| **Where** | Technische scope | "Database tabel, API endpoints, nieuwe pagina" |

## Skill Opslag & Fallback

### Structuur

```
Ralph/host-skills/                      ← Default skills
├── code-review/SKILL.md
├── nextjs-app-router/SKILL.md
└── story-generator/SKILL.md            ← Default story generator

~/Projects/MijnProject/                 ← Per-project override
└── .claude/skills/
    └── story-generator/
        └── SKILL.md                    ← Project-specifieke versie
```

### Fallback Volgorde

```
1. Project skill    →  {project}/.claude/skills/story-generator/SKILL.md
         ↓ (niet gevonden)
2. Host skill       →  Ralph/host-skills/story-generator/SKILL.md
         ↓ (niet gevonden)
3. Niet beschikbaar
```

**Belangrijk:** Project override wint altijd van de default.

### Dual-use

De skill is bruikbaar door beide systemen:
- **Claude Code CLI** - wanneer werkend in het project
- **Ralph brainstorm** - via OpenAI API in de brainstorm flow

## Story Generator Skill

De skill (`host-skills/story-generator/SKILL.md`) bevat:

### Verplichte Story Onderdelen (Vertical Slice)
1. Backend - API endpoints met type-safe responses
2. Frontend - UI componenten met loading/error states
3. Database - Schema wijzigingen indien nodig
4. Unit tests - Tests voor business logic
5. E2E tests - Playwright tests voor user flows
6. Quality gates - Lint, build, review

### Acceptance Criteria Format
Elke story eindigt met:
- "Unit tests geschreven en passing"
- "E2e tests voor [specifieke flow]"
- "Lint passing (pnpm lint)"
- "Build slaagt (pnpm build)"
- "Code review completed"

### JSON Output Format
```json
{
  "id": "[EPIC]-[NNN]",
  "title": "Korte beschrijvende titel",
  "description": "Gedetailleerde beschrijving",
  "priority": 1,
  "status": "pending",
  "epic": "Epic Name",
  "dependencies": [],
  "recommendedSkills": ["frontend-design"],
  "acceptanceCriteria": [...]
}
```

## Implementatie Wijzigingen

### 1. Nieuwe Skill
- [x] `host-skills/story-generator/SKILL.md` aangemaakt

### 2. Skill Loader Uitbreiden
**Bestand:** `src/lib/services/brainstormManager.ts`

Huidige `loadAvailableSkills()` functie uitbreiden:
```typescript
async function loadSkill(skillName: string, projectPath: string): Promise<string | null> {
  // 1. Check project override
  const projectSkillPath = join(projectPath, '.claude/skills', skillName, 'SKILL.md')
  if (existsSync(projectSkillPath)) {
    return readFile(projectSkillPath, 'utf-8')
  }

  // 2. Fallback to host-skills
  const hostSkillPath = join(HOST_SKILLS_PATH, skillName, 'SKILL.md')
  if (existsSync(hostSkillPath)) {
    return readFile(hostSkillPath, 'utf-8')
  }

  return null
}
```

### 3. Brainstorm System Prompt
**Bestand:** `src/lib/services/brainstormManager.ts`

Nieuwe fase 1 prompt met detectie instructies:
```typescript
const PHASE1_SYSTEM_PROMPT = `
Je bent een brainstorm assistent. Help de gebruiker hun feature idee uit te werken.

Houd bij of deze aspecten besproken zijn:
- What: Wat moet de feature doen?
- Why: Waarom is dit waardevol voor gebruikers?
- How: Hoe ziet de UI/UX eruit?
- Where: Waar past dit in de architectuur?

Wanneer alle vier duidelijk zijn, stel voor om een story te genereren:
"Ik denk dat ik genoeg weet om hier een story van te maken. Wil je dat ik dat doe?"
`
```

### 4. Story Generatie Flow
Bij user bevestiging:
1. Laad story-generator skill
2. Bouw prompt met brainstorm samenvatting + project context
3. Stuur naar OpenAI
4. Parse JSON response
5. Toon in StoryPreviewCard

### 5. UI Components
- `StoryPreviewCard` - bestaat al, geen wijzigingen nodig
- Approve/Edit/Discard flow - bestaat al

## Bestanden te Wijzigen

| Bestand | Actie |
|---------|-------|
| `host-skills/story-generator/SKILL.md` | **Nieuw** - aangemaakt |
| `src/lib/services/brainstormManager.ts` | Skill loader + fase detectie |
| `src/lib/services/brainstormManager.ts` | `generateSystemPrompt()` aanpassen |

## Testing

### Unit Tests
- Skill loading met project override
- Skill loading met fallback naar host-skills
- Feature-completeness detectie (What/Why/How/Where)
- Story JSON parsing

### E2E Tests
- Volledige brainstorm flow van gesprek tot story preview
- Story approve voegt toe aan prd.json
- Story edit opent modal
- Story discard verwijdert preview
- Project-specifieke skill override wordt correct geladen

## Risico's en Mitigatie

| Risico | Mitigatie |
|--------|-----------|
| AI detecteert te vroeg | Vraag expliciet om bevestiging |
| AI detecteert te laat | User kan zelf "/story" typen als fallback |
| Skill niet gevonden | Duidelijke error message |
| JSON parsing faalt | Fallback naar conversatie, retry optie |

## Toekomstige Uitbreidingen

- Meerdere stories tegelijk genereren bij complexe features
- Template keuze (verschillende story formats)
- Historie van gegenereerde stories (niet alleen approved)

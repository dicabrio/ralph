# Test Board & Archive Feature Design

**Datum:** 2025-02-23
**Status:** Draft

## Overzicht

Een Test Board pagina toevoegen waar stories die klaar zijn met development getest kunnen worden, met een apart archief voor afgeronde stories.

## Status Flow

### Nieuwe status: `review`

De story status enum wordt uitgebreid:

```
pending | in_progress | review | done | failed | backlog
```

### Aangepaste flow

```
pending → in_progress → review → done
              ↓           ↓
           failed    (reject) → failed/in_progress
```

- **Runner** zet stories naar `review` (niet meer `done`)
- **Test Board** toont alle stories met status `review`
- **Accept** = status naar `done`
- **Reject** = status naar `failed` (met optionele reden)

### Valid transitions

```typescript
const validTransitions = {
  pending: ['in_progress', 'done', 'backlog'],
  in_progress: ['done', 'failed', 'pending', 'review'],  // + review
  review: ['done', 'failed', 'in_progress'],              // nieuw
  done: ['pending', 'backlog'],
  failed: ['in_progress', 'pending', 'backlog'],
  backlog: ['pending', 'done'],
}
```

## Data Model

### Nieuw bestand: `stories/archived.json`

```json
{
  "archivedAt": "2025-02-23T12:00:00Z",
  "stories": [
    {
      "id": "STORY-001",
      "title": "...",
      "description": "...",
      "priority": 1,
      "status": "done",
      "epic": "...",
      "dependencies": [],
      "recommendedSkills": [],
      "acceptanceCriteria": [],
      "archivedAt": "2025-02-23T12:00:00Z"
    }
  ]
}
```

Wanneer een `done` story wordt gearchiveerd:
1. Story wordt uit `prd.json` verwijderd
2. Story wordt toegevoegd aan `archived.json` met `archivedAt` timestamp

## UI Componenten

### Test Board Pagina (`/project/$id/testing`)

```
┌─────────────────────────────────────────────────────────┐
│ ← Back    Project Name           [Archive →]            │
├─────────────────────────────────────────────────────────┤
│ Te testen: 5 stories                                    │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ STORY-042  P1                        [✓] [✗]        │ │
│ │ Implementeer login flow                             │ │
│ │ Epic: Authentication                                │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ STORY-043  P2                        [✓] [✗]        │ │
│ │ Voeg password reset toe                             │ │
│ │ Epic: Authentication                                │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Componenten:**
- **TestStoryCard** - Vergelijkbaar met StoryCard, maar met Accept/Reject buttons
- **RejectDialog** - Modal bij Reject, vraagt om reden (optioneel)
- Sorteer op priority (P1 eerst)
- Klik op card = story details bekijken (bestaande StoryDetailModal)

**Accept actie:**
1. Status → `done`
2. Toast: "Story goedgekeurd"
3. Card verdwijnt van Test Board (optimistic update)

**Reject actie:**
1. RejectDialog opent
2. Gebruiker kiest: `failed` of `in_progress` (retry)
3. Optionele reden (wordt niet opgeslagen, alleen toast feedback)
4. Status update
5. Card verdwijnt van Test Board

### Archive Pagina (`/project/$id/archive`)

```
┌─────────────────────────────────────────────────────────┐
│ ← Back    Project Name - Archief                        │
├─────────────────────────────────────────────────────────┤
│ 🔍 [Zoek op ID, titel of epic...              ]         │
│                                                         │
│ Filter: [Alle epics ▼]                                  │
├─────────────────────────────────────────────────────────┤
│ 23 stories gevonden                                     │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ STORY-001                    Gearchiveerd: 2 dagen  │ │
│ │ Setup project structure                             │ │
│ │ Epic: Setup                                         │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Zoek & Filter functionaliteit:**
- **Zoekbalk** - Zoekt in: story ID, titel, description
- **Epic filter** - Dropdown met alle unieke epics uit archief
- Filters combineren (zoekterm + epic)
- Client-side filtering (archived.json is typisch klein genoeg)
- Debounced search (300ms) voor soepele UX
- "Geen resultaten" state wanneer filters niets opleveren

**Archiveren vanuit Kanban:**
Bij `done` stories op Kanban board, archive knop toevoegen:
```
┌─────────────────────────────────────────┐
│ STORY-042  ✓ Done           [📦]        │  ← Archive button
│ Implementeer login flow                 │
└─────────────────────────────────────────┘
```

## Backend & API Changes

### Schema update (`prdSchema.ts`)

```typescript
export const storyStatusEnum = z.enum([
  'pending', 'in_progress', 'review', 'done', 'failed', 'backlog'
])
```

### Nieuw schema voor archived.json

```typescript
export const archivedStorySchema = storySchema.extend({
  archivedAt: z.string().datetime()
})

export const archivedPrdSchema = z.object({
  archivedAt: z.string().datetime(),
  stories: z.array(archivedStorySchema)
})
```

### Stories router uitbreiden (`stories.ts`)

Update valid transitions (zie boven).

### Archive router (nieuw `archive.ts`)

```typescript
// Nieuwe endpoints
archive.listByProject    // GET archived stories
archive.archiveStory     // POST move done story to archive
```

- `listByProject` - Lees `archived.json`, return stories
- `archiveStory` - Verplaats story van `prd.json` naar `archived.json`

### Runner aanpassing

Bij story completion: status → `review` (was `done`)

## Navigatie & Routing

### Nieuwe routes

```
/project/$id/testing   → Test Board pagina
/project/$id/archive   → Archive pagina
```

### Project navigatie

```
┌─────────────────────────────────────────────────────────┐
│ ← Back    Project Name                                  │
├─────────────────────────────────────────────────────────┤
│ [Overview]  [Kanban]  [Testing (3)]  [Archive]          │
└─────────────────────────────────────────────────────────┘
```

**Testing badge:**
- Toont aantal stories met status `review`
- Badge als er stories wachten op test
- Geen badge als 0

### Kanban board update

- Nieuwe kolom `Review` tussen `In Progress` en `Voltooid`
- Kolom is locked (alleen via Test Board te verplaatsen)
- Alternatief: Review stories NIET tonen op Kanban, alleen op Test Board

### Quick links

- Vanuit Test Board: "→ Archive" link rechtsboven
- Vanuit Archive: "← Test Board" link

## Test Scenario Generatie

### Flow

```
Story in_progress → Runner klaar → Status: review
                                      ↓
                              AI genereert test scenario
                                      ↓
                    stories/test-scenarios/STORY-ID.md
                    stories/test-scenarios/STORY-ID.json
```

### Output Bestanden

**Markdown (voor documentatie):**
```markdown
# Test Scenario: REVIEW-001

**Story:** Review status en schema update
**Generated:** 2025-02-23T14:30:00Z

## Functionele Tests

### 1. Schema Validatie
- [ ] Open prdSchema.ts en verifieer dat 'review' in storyStatusEnum staat
- [ ] Maak een story met status 'review' aan via API

### 2. Status Transitions
- [ ] Test: in_progress → review (moet slagen)
- [ ] Test: review → done (moet slagen)

## Quality Gates
- [ ] `pnpm test` - alle tests passing
- [ ] `pnpm lint` - geen errors
- [ ] `pnpm build` - build slaagt
```

**JSON (voor UI checklist):**
```json
{
  "storyId": "REVIEW-001",
  "generatedAt": "2025-02-23T14:30:00Z",
  "sections": [
    {
      "title": "Functionele Tests",
      "items": [
        { "id": "1", "text": "Review status in schema", "checked": false },
        { "id": "2", "text": "Transition in_progress → review", "checked": false }
      ]
    }
  ]
}
```

### Test Board UI met Checklist

```
┌─────────────────────────────────────────────────────────┐
│ REVIEW-001  Review status             3/8 ✓    [✓] [✗] │
├─────────────────────────────────────────────────────────┤
│ ▼ Functionele Tests                           1/3      │
│   [✓] Review status zichtbaar in schema                │
│   [ ] Transition in_progress → review                  │
│   [ ] Transition review → done                         │
│                                                        │
│ ▼ UI Verificatie                              2/3      │
│   [✓] Kanban toont Review kolom                        │
│   [✓] Lock icon aanwezig                               │
│   [ ] Stories correct gefilterd                        │
│                                                        │
│ ▶ Quality Gates                               0/2      │
└─────────────────────────────────────────────────────────┘
```

### AI Prompt Template

```
Genereer een test scenario voor de volgende story.
Focus op handmatige verificatie stappen die een tester kan uitvoeren.

Story: {title}
Beschrijving: {description}
Acceptance Criteria:
{criteria}

Output: Gestructureerde test stappen per categorie (Functioneel, UI, Quality Gates).
```

## Migratie Bestaande Done Stories

Bestaande stories met status "done" (van voor de review feature):

- Blijven in "Voltooid" kolom op Kanban
- Kunnen individueel gearchiveerd worden via archive knop
- **Bulk archive**: "Archiveer alle" knop in done kolom header
- Geen automatische migratie - gebruiker heeft controle

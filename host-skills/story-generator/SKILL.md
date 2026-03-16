---
name: story-generator
description: Genereer gestructureerde user stories op basis van brainstorm context. Output in Ralph's prd.json format met vertical slices en quality gates.
---

# Story Generator Skill

Gebruik deze skill om user stories te genereren en toe te voegen aan `stories/prd.json`.

## Wanneer te gebruiken

Deze skill wordt automatisch aangeroepen door de brainstorm flow wanneer:
- De gebruiker een feature heeft beschreven
- Alle aspecten duidelijk zijn (What/Why/How/Where)
- De gebruiker bevestigt dat een story gegenereerd mag worden

## Story Requirements

Elke story moet een **verticale slice** zijn die zelfstandig waarde levert:

### Verplichte onderdelen per story:
1. **Backend** - API endpoints met type-safe responses
2. **Frontend** - UI componenten/pagina's met loading states en error handling
3. **Database** - Schema wijzigingen indien nodig (migratie via /migrate)
4. **Unit tests** - Tests voor business logic en API endpoints
5. **E2e tests** - Playwright tests voor user flows
6. **Quality gates** - Lint, build en review moeten slagen

### Acceptance Criteria format:
Elke story MOET eindigen met deze quality gates (in deze volgorde):
- "Unit tests geschreven en passing"
- "E2e tests voor [specifieke flow]"
- "Lint passing (pnpm lint)"
- "Build slaagt (pnpm build)"
- "Code review completed"

## Output Format

Geef de story in dit exacte JSON format:

```json
{
  "id": "[EPIC]-[NNN]",
  "title": "Korte beschrijvende titel",
  "description": "Gedetailleerde beschrijving van de feature en de waarde voor gebruikers.",
  "priority": [nummer],
  "status": "pending",
  "epic": "[Epic naam]",
  "dependencies": ["[ID van afhankelijke stories]"],
  "recommendedSkills": ["frontend-design", "backend-development:api-design-principles"],
  "acceptanceCriteria": [
    "Backend: [specifieke API endpoints]",
    "Frontend: [specifieke UI elementen]",
    "Database: [schema wijzigingen indien nodig]",
    "[Andere functionele criteria]",
    "Unit tests geschreven en passing",
    "E2e tests voor [specifieke flow]",
    "Lint passing (pnpm lint)",
    "Build slaagt (pnpm build)",
    "Code review completed"
  ]
}
```

## Beschikbare Epics

- Foundation - Project setup en infrastructuur
- Core Features - Hoofd functionaliteiten voor eindgebruikers
- Data Pipeline - Data import, scraping en enrichment
- Analytics - Berekeningen, metrics en visualisaties

## Beschikbare Skills

- frontend-design
- backend-development:api-design-principles
- database-design:postgresql

## ID Conventions

- FOUND-XXX: Foundation stories
- FEAT-XXX: Core feature stories
- DATA-XXX: Data pipeline stories
- ANALYTICS-XXX: Analytics stories

## Voorbeeld

**Input:**
> Ik wil een watchlist feature waar gebruikers politici kunnen volgen

**Output:**
```json
{
  "id": "FEAT-004",
  "title": "Politician Watchlist",
  "description": "Gebruikers kunnen politici toevoegen aan hun persoonlijke watchlist om hun trades te volgen. De watchlist toont recente activiteit van gevolgde politici.",
  "priority": 9,
  "status": "pending",
  "epic": "Core Features",
  "dependencies": ["FEAT-001"],
  "recommendedSkills": ["frontend-design", "backend-development:api-design-principles"],
  "acceptanceCriteria": [
    "Database: watchlist tabel met user_id en politician_id",
    "POST /api/watchlist - politicus toevoegen aan watchlist",
    "DELETE /api/watchlist/[id] - politicus verwijderen",
    "GET /api/watchlist - lijst van gevolgde politici met recente trades",
    "Watchlist pagina met gevolgde politici",
    "Add/remove button op politician detail page",
    "Badge indicator voor nieuwe trades sinds laatste bezoek",
    "Unit tests geschreven en passing",
    "E2e test voor add/remove watchlist flow",
    "Lint passing (pnpm lint)",
    "Build slaagt (pnpm build)",
    "Code review completed"
  ]
}
```

## Volledige prd.json structuur

```json
{
  "projectName": "Project Name",
  "branchName": "feature/branch-name",
  "projectDescription": "Beschrijving van het project",

  "implementationGuides": [
    {
      "name": "Guide Name",
      "path": "docs/guide.md",
      "description": "Beschrijving van de guide",
      "topics": ["Topic1", "Topic2"]
    }
  ],

  "availableSkills": [
    "frontend-design",
    "backend-development:api-design-principles",
    "database-design:postgresql"
  ],

  "epics": [
    {
      "name": "Epic Name",
      "description": "Beschrijving van de epic"
    }
  ],

  "userStories": [
    {
      "id": "EPIC-001",
      "title": "Story titel",
      "description": "Gedetailleerde beschrijving",
      "priority": 1,
      "status": "pending",
      "epic": "Epic Name",
      "dependencies": [],
      "recommendedSkills": ["frontend-design"],
      "acceptanceCriteria": [
        "Functioneel criterium 1",
        "Functioneel criterium 2",
        "Unit tests geschreven en passing",
        "E2e tests voor [flow]",
        "Lint passing (pnpm lint)",
        "Build slaagt (pnpm build)",
        "Code review completed"
      ]
    }
  ]
}
```

## Quality Gate Checklist

Elke story doorloopt deze stappen voor completion:

| # | Stap | Command |
|---|------|---------|
| 1 | Implementatie voltooid | - |
| 2 | Database migratie | `/migrate` of `pnpm db:push` |
| 3 | Unit tests passing | `/test` of `pnpm test` |
| 4 | E2e tests passing | `/e2e` of `pnpm test:e2e` |
| 5 | Linting passing | `/lint` of `pnpm lint --fix` |
| 6 | Build slaagt | `/build` of `pnpm build` |
| 7 | Code review | `/review` |
| 8 | Status → done | Update prd.json |
| 9 | Commit | `feat([Scope]): [ID] - [Title]` |
| 10 | Learnings loggen | Append to progress.txt |

## Tips voor goede stories

### Do's
- **Verticale slice**: Frontend + Backend + Database samen
- **Concrete criteria**: "GET /api/users met paginatie" ipv "API endpoint"
- **Testbaar**: Elk criterium moet verifieerbaar zijn
- **Waarde**: Elke story levert iets bruikbaars op voor de gebruiker

### Don'ts
- **Geen horizontale slices**: Niet "alle API endpoints" of "alle UI pagina's"
- **Geen vage criteria**: Niet "werkt goed" of "ziet er mooi uit"
- **Geen mega-stories**: Als het meer dan 10 criteria heeft, split het op
- **Geen orphans**: Elke story heeft dependencies of is een foundation story

## Verwijzingen naar implementatiedocs

Als er `implementationGuides` bestaan in prd.json, MOETEN acceptance criteria verwijzen naar het relevante document en sectie. Dit zorgt ervoor dat de agent bij verificatie exact weet wat er gecontroleerd moet worden.

### Voorbeeld:
```json
"acceptanceCriteria": [
  "Backend: POST /api/watchlist conform docs/api-design.md sectie 3.2",
  "Frontend: Watchlist pagina conform docs/ui-spec.md wireframe 4",
  "Database: Schema conform docs/data-model.md entity Watchlist",
  "Unit tests geschreven en passing",
  "E2e tests voor add/remove watchlist flow",
  "Lint passing (pnpm lint)",
  "Build slaagt (pnpm build)",
  "Code review completed"
]
```

### Regels:
- Verwijs naar **document path + sectie/onderdeel** (niet alleen het document)
- Elk functioneel criterium dat gedekt wordt door een doc MOET de referentie bevatten
- Quality gate criteria (tests, lint, build) hoeven geen doc-referentie
- Als er geen relevante implementatiedoc is voor een criterium, is een referentie niet nodig

# Improved Brainstorm: Acceptance Criteria Checklist

## Overview

Verbeter de brainstorm functionaliteit zodat gegenereerde stories automatisch een acceptance criteria checklist bevatten. Deze checklist wordt automatisch geverifieerd door de runner, wat zorgt voor consistente code kwaliteit.

## Probleemstelling

Huidige situatie:
- Stories hebben acceptance criteria als vrije tekst
- Geen gestandaardiseerde quality gates
- Handmatige verificatie of tests/linting/build slagen
- Stories worden "done" zonder volledige kwaliteitscontrole

Gewenste situatie:
- Gestructureerde acceptance criteria met categorieën
- Automatische verificatie door de runner
- Geen handmatige stappen nodig
- Stories zijn pas "done" als alle checks slagen

## Oplossing

### Twee-fasen Brainstorm Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    EXPLORATION PHASE                         │
├─────────────────────────────────────────────────────────────┤
│  User: "Ik wil dark mode toevoegen"                         │
│  Claude: "Waar moet de toggle komen? Settings of header?"   │
│  User: "In de settings pagina"                              │
│  Claude: "Moet het system preference respecteren?"          │
│  User: "Ja, met override mogelijkheid"                      │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
              Trigger: Button OF Claude suggereert
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  STORY GENERATION PHASE                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Story Preview                                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Titel: Implementeer dark mode toggle                 │   │
│  │ Type: Feature                                        │   │
│  │                                                      │   │
│  │ Acceptance Criteria:                                 │   │
│  │ ☑ Implementatie - Toggle in Settings, theme context │   │
│  │ ☑ Type Safety - Theme type definitie                │   │
│  │ ☑ Linting - Geen unused imports                     │   │
│  │ ☑ Build - CSS variables in production               │   │
│  │ ☑ Unit Tests - Theme context hook                   │   │
│  │ ☑ E2E Tests - Toggle flow, persistentie             │   │
│  │ ☐ Documentatie - n.v.t.                             │   │
│  │ ☑ Code Review - Theme-aware components check        │   │
│  │                                                      │   │
│  │ [Aanpassen]  [Discard]  [Toevoegen aan Backlog]    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Acceptance Criteria Categorieën

| Categorie | Automatische Verificatie | Beschrijving |
|-----------|-------------------------|--------------|
| **Implementatie** | E2E tests passen | Core functionaliteit werkt |
| **Type Safety** | `tsc --noEmit` | Geen TypeScript fouten |
| **Linting** | `eslint` | Geen lint errors, geen unused vars |
| **Build** | `npm run build` | Production build slaagt |
| **Unit Tests** | `vitest` | Unit tests passen |
| **E2E Tests** | `playwright` | E2E tests passen |
| **Documentatie** | README gewijzigd check | Docs bijgewerkt indien nodig |
| **Code Review** | Claude analyse | Patronen, security, best practices |

### Specifieke Criteria per Story

Claude genereert specifieke beschrijvingen per criterium gebaseerd op de exploratie:

**Voorbeeld Feature:**
```
Implementatie: Toggle component in Settings, theme context met localStorage
Type Safety: Theme type ('light' | 'dark' | 'system')
Linting: Geen unused imports na refactor bestaande components
Build: CSS variables werken in production build
Unit Tests: Theme context hook, localStorage mock
E2E Tests: Toggle → thema wisselt → refresh behoudt keuze
Documentatie: n.v.t.
Code Review: Alle components zijn theme-aware
```

**Voorbeeld Bug Fix:**
```
Implementatie: Timeout verhogen naar 30s, retry logic
Linting: Verwijder ongebruikte oldTimeout variabele
Build: -
Unit Tests: Test retry na timeout, test max retries
E2E Tests: Simuleer trage server, verify retry
```

### Story Type Templates

| Story Type | Standaard Actieve Criteria |
|------------|---------------------------|
| **Feature** | Alle 8 criteria |
| **Bug fix** | Implementatie, Linting, Build, Unit Tests, E2E Tests, Code Review |
| **Refactor** | Implementatie, Type Safety, Linting, Build, Unit Tests, Code Review |
| **Docs only** | Alleen Documentatie |
| **Config/DevOps** | Implementatie, Build, Code Review |

### Data Structuur

Uitbreiding van de Story interface:

```typescript
interface AcceptanceCriterion {
  category: 'implementation' | 'type_safety' | 'linting' | 'build' |
            'unit_tests' | 'e2e_tests' | 'documentation' | 'code_review'
  description: string    // Specifieke beschrijving voor deze story
  enabled: boolean       // Actief voor deze story
  completed: boolean     // Afgevinkt door runner
  result?: {
    passed: boolean
    output?: string      // Command output of review feedback
    timestamp: Date
  }
}

interface Story {
  id: string
  title: string
  description: string
  status: 'backlog' | 'pending' | 'in_progress' | 'done' | 'failed'
  storyType?: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'config'
  acceptanceCriteria: AcceptanceCriterion[]
  // ... bestaande velden
}
```

### Runner Automatische Verificatie

```
Runner start story
        ↓
   Implementatie
        ↓
┌────────────────────────────────┐
│ Automatische checks:           │
│                                │
│ 1. npm run typecheck           │
│    → Type Safety ✓/✗           │
│                                │
│ 2. npm run lint                │
│    → Linting ✓/✗               │
│                                │
│ 3. npm run build               │
│    → Build ✓/✗                 │
│                                │
│ 4. npm run test                │
│    → Unit Tests ✓/✗            │
│                                │
│ 5. npm run e2e                 │
│    → E2E Tests ✓/✗             │
│                                │
│ 6. Claude code review          │
│    → Code Review ✓/✗           │
└────────────────────────────────┘
        ↓
  Alles groen? → status: done
  Iets rood?   → runner fixt of failed
```

### Code Review door Claude

De runner voert een automatische code review uit die checkt op:

| Check | Voorbeeld Feedback |
|-------|-------------------|
| **Patronen** | "Logica herhaalt zich 3x, overweeg helper functie" |
| **Consistentie** | "Rest van codebase gebruikt cn(), hier template literals" |
| **Performance** | "useEffect mist dependency, kan infinite loop veroorzaken" |
| **Security** | "User input niet gesanitized voor database query" |
| **Best practices** | "Async error handling ontbreekt, voeg try/catch toe" |

### UI Componenten

**Kanban Card met Progress:**
```
┌─────────────────────────────┐
│ Dark mode toggle            │
│ Feature                     │
│                             │
│ ████████░░ 6/8 criteria     │
└─────────────────────────────┘
```

**Story Detail - Checklist:**
```
┌─────────────────────────────────────────────────────────────┐
│ Acceptance Criteria                                          │
├─────────────────────────────────────────────────────────────┤
│ ✓ Implementatie     Toggle in Settings, theme context       │
│ ✓ Type Safety       Theme type definitie                    │
│ ✓ Linting           Geen unused imports                     │
│ ✓ Build             CSS variables production                │
│ ✓ Unit Tests        Theme context hook                      │
│ ○ E2E Tests         Toggle flow, persistentie               │
│ - Documentatie      (overgeslagen)                          │
│ ○ Code Review       Components theme-aware check            │
└─────────────────────────────────────────────────────────────┘
```

## Geen Handmatige Stappen

- **Alle verificatie is automatisch**
- **Runner draait checks na implementatie**
- **Bij falen: runner fixt of story faalt**
- **Story is pas "done" als alle enabled criteria groen zijn**

## Scope

### In Scope
- Acceptance criteria data structuur
- Brainstorm story generatie met checklist
- UI voor checklist weergave en aanpassing
- Runner integratie voor automatische verificatie
- Code review door Claude

### Out of Scope
- Handmatige criteria afvinken
- Criteria templates beheren via UI
- Historische criteria resultaten (alleen laatste run)

## Beslissingen

1. **Trigger voor story generatie**: Zowel expliciete button ALS Claude suggereert
2. **Criteria zijn specifiek**: Niet generiek, maar toegespitst op de story
3. **Verificatie is volledig automatisch**: Geen handmatige stappen
4. **Code review door Claude**: Onderdeel van automatische checks

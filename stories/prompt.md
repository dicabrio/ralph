# Agent Instructions

## Your Task

**CRITICAL: You must implement exactly ONE story per session. After completing one story, STOP immediately.**

1. Read `stories/prd.json`
2. Read `stories/progress.txt` (check Codebase Patterns section first)
3. Read any implementation guides listed in prd.json `implementationGuides` array
4. Check you're on the correct branch (`branchName` from prd.json)
5. **Select ONE story** where `status: "pending"` or `status: "failed"` (lowest priority number first)
   - Respect `dependencies` - skip if dependent stories don't have `status: "done"`
   - Pick the story with the lowest priority number
6. **Mark as in_progress**: Immediately set `status: "in_progress"` in prd.json
7. Note the `recommendedSkills` for that story
8. **Implement that ONE story only**
9. Run typecheck and tests
10. Update relevant documentation with learnings
11. Commit: `feat([scope]): [ID] - [Title]`
12. **Set final status** in prd.json:
    - Success → `status: "done"`
    - Failure → `status: "failed"`
13. Append learnings to progress.txt
14. **STOP - Do not continue to the next story**

## Story Status Lifecycle

Stories use a `status` field with these values:

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `pending` | Not started | Can be picked up |
| `in_progress` | Agent is working on it | Wait or check progress.txt |
| `done` | Successfully completed | No action needed |
| `failed` | Attempted but failed | Can be retried (check progress.txt for learnings) |

### Status Transitions

```
pending ──────► in_progress ──────► done
                    │
                    └──────────► failed ──► (can be picked up again)
```

### Picking Stories

Priority order for selecting next story:
1. `status: "pending"` with lowest priority number
2. `status: "failed"` with lowest priority number (retry with learnings)
3. If all are `done` → reply `<promise>COMPLETE</promise>`

**IMPORTANT:** Always set `status: "in_progress"` BEFORE starting work. This prevents other sessions from picking up the same story.

## Using Skills

Before implementing, check `recommendedSkills` on the story.
Invoke relevant skills for domain expertise. Common skills:

| Domain | Skill |
|--------|-------|
| Database design | `database-design:database-architect` |
| API architecture | `backend-development:backend-architect` |
| Service patterns | `knex-service-layer` |
| Input validation | `valibot-validation` |
| React Native | `react-native-expert` |

Skills provide specialized knowledge and best practices for that domain.

## General Best Practices

1. **Read before write** - Always read existing code before modifying
2. **Test coverage** - Every feature needs unit/integration tests
3. **Type safety** - Use TypeScript types, avoid `any`
4. **Error handling** - Handle edge cases explicitly
5. **Small commits** - One story = one commit
6. **Acceptance criteria** - Verify ALL criteria before marking as passed

## Acceptance Criteria Checklist

Before setting `status: "done"`, verify:
- [ ] All acceptance criteria from the story are met
- [ ] Tests pass (`npm run test` or equivalent)
- [ ] TypeScript compiles without errors (`npm run typecheck` or equivalent)
- [ ] No regressions in existing functionality

## Progress Format

APPEND to `progress.txt`:

```
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
```

## Codebase Patterns

Reusable patterns go at the TOP of `progress.txt` under:

```
## Codebase Patterns (Updated by Agents)
- [Pattern description]
```

These are discovered during implementation, not predefined.
Update this section when you discover patterns others should follow.

## Commit Convention

Use Conventional Commits format:
```
feat([Scope]): [ID] - [Title]
```

Example:
```
feat(Advertisement): US-MIG-006-A - Advertisement service read operations
```

Scope should match the module being worked on.

## Stop Condition

**After working on ONE story, you MUST stop.** Do not pick up another story.

Reply with one of:

| Situation | Response |
|-----------|----------|
| Story completed successfully | `<promise>DONE_ONE</promise>` |
| Story failed, documented in progress.txt | `<promise>FAILED_ONE</promise>` |
| All stories have `status: "done"` | `<promise>COMPLETE</promise>` |

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

**CRITICAL: NEVER set `status: "done"` unless ALL acceptance criteria are genuinely met.**

1. **Set `status: "failed"`** - Mark the story as failed in prd.json
2. **Document in progress.txt** using the FAILED format (see below)
3. **Be specific** about what was tried and why it failed
4. **Include learnings** - what would help for the next attempt?
5. **Reply with `<promise>FAILED_ONE</promise>`**

### Failed Story Progress Format

APPEND to `progress.txt`:

```
## [YYYY-MM-DD] - [Story ID] ❌ FAILED
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
```

### Re-attempting Failed Stories

- Failed stories have `status: "failed"` and can be picked up again
- Next agent session will see the failure notes in progress.txt
- Use the "Learnings for next attempt" as starting point
- A story can fail multiple times - each attempt adds to the knowledge
- When retrying, set `status: "in_progress"` first, then work on the fix

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
- Trust that failure provides value (learnings)

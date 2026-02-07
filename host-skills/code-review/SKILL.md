---
name: code-review
description: Perform automated code review on implemented changes. Validates code against acceptanceCriteria, RxApp patterns, security, performance, and best practices. Returns APPROVED or CHANGES_REQUESTED with actionable feedback.
---

# Code Review Skill

This skill performs a structured code review on changes made during story implementation. Use this as the final quality gate before committing.

## When to Use

- After implementing a story, before committing
- As part of a workflow's `code-review` step
- When you want to validate code quality

## How to Invoke

```
/code-review
```

Or programmatically as a workflow step:
```json
{ "name": "code-review", "skill": "code-review", "onFail": "address-feedback" }
```

## Review Process

### Step 1: Gather Context

First, collect information about the changes:

```bash
# Get changed files
git diff --name-only HEAD

# Get the actual diff
git diff HEAD

# If files are staged
git diff --cached --name-only
git diff --cached
```

### Step 2: Load Story Context

Read the story being implemented from `stories/prd.json`:
- `acceptanceCriteria` - What must be verified
- `area` - Determines which patterns to check
- `technicalNotes` - Implementation requirements

### Step 3: Run Review Checklist

## Review Checklist

### 1. Acceptance Criteria Verification

For each criterion in the story's `acceptanceCriteria`:

| Status | Meaning |
|--------|---------|
| ✅ | Criterion is fully met |
| ⚠️ | Criterion is partially met |
| ❌ | Criterion is not met |

```markdown
## Acceptance Criteria Check

- ✅ "API endpoint returns correct data" - Verified in route.ts:45
- ⚠️ "Error handling for edge cases" - Missing handler for empty array
- ❌ "Unit tests written" - No test file found
```

### 2. RxApp Pattern Compliance

#### API Routes (`area: api, ownership, stripe, messaging`)

| Check | Expected Pattern |
|-------|------------------|
| Response format | Uses `apiSuccess()` and `apiError()` from `@/src/lib/api-utils` |
| Authentication | Uses `withAuth` or `withAuthAndOwnerGuard` middleware |
| Validation | Uses Valibot schemas for request body/params |
| CORS | Exports `OPTIONS = handleOptions` |
| Error handling | Uses `ApiError` class with appropriate status codes |
| Documentation | JSDoc with endpoint description, params, auth requirements |

```typescript
// ✅ Good
export const GET = withAuth<ResponseData>(async (request, user) => {
  const result = v.safeParse(Schema, params);
  if (!result.success) throw ApiError.validationError("Invalid params");
  return apiSuccess(data);
});

// ❌ Bad
export async function GET(request: NextRequest) {
  return NextResponse.json({ data }); // Missing auth, wrong response format
}
```

#### Database/Infrastructure (`area: infrastructure`)

| Check | Expected Pattern |
|-------|------------------|
| Schema location | `src/db/schema/*.ts` |
| Migration naming | `XXXX_descriptive_name.sql` |
| Indexes | Added for foreign keys and frequently queried columns |
| Constraints | CHECK constraints for enums, UNIQUE where needed |
| Rollback | DOWN migration provided |

#### UI Components (`area: ui, notifications`)

| Check | Expected Pattern |
|-------|------------------|
| Component location | `app/` for pages, `components/` for shared |
| Styling | Tailwind CSS classes, no inline styles |
| Loading states | Skeleton or spinner during data fetch |
| Error states | User-friendly error messages |
| TypeScript | Props interface defined, no `any` |
| Server/Client | Correct `'use client'` directive placement |

#### Services (`src/services/`)

| Check | Expected Pattern |
|-------|------------------|
| Single responsibility | One service = one domain |
| Error handling | Throws typed errors, doesn't swallow |
| Database queries | Uses Drizzle ORM, not raw SQL |
| Transactions | Uses `db.transaction()` for multi-step operations |

### 3. Code Quality

#### TypeScript

| Check | Issue |
|-------|-------|
| ❌ `any` type | Use specific types or `unknown` |
| ❌ Type assertions (`as`) | Prefer type guards |
| ❌ Non-null assertions (`!`) | Handle null cases explicitly |
| ❌ Missing return types | Add explicit return types to functions |

#### Clean Code

| Check | Issue |
|-------|-------|
| ❌ Magic numbers | Use named constants |
| ❌ Deep nesting (>3 levels) | Extract to functions |
| ❌ Long functions (>50 lines) | Split into smaller functions |
| ❌ Duplicate code | Extract to shared utility |
| ❌ Console.log left in | Remove debug statements |
| ❌ Commented-out code | Remove or restore |
| ❌ TODO comments | Complete or create story |

### 4. Security

| Check | Severity | Issue |
|-------|----------|-------|
| 🔴 Critical | Hardcoded secrets, API keys, passwords |
| 🔴 Critical | SQL injection (raw queries with user input) |
| 🔴 Critical | Missing authentication on sensitive endpoints |
| 🟠 High | Missing input validation |
| 🟠 High | Missing authorization checks |
| 🟡 Medium | Sensitive data in logs |
| 🟡 Medium | Missing rate limiting consideration |

```typescript
// 🔴 Critical - SQL Injection
const result = await db.execute(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ Safe - Parameterized
const result = await db.select().from(users).where(eq(users.id, userId));
```

### 5. Performance

| Check | Issue |
|-------|-------|
| ❌ N+1 queries | Use joins or batch queries |
| ❌ Missing indexes | Add index for WHERE/JOIN columns |
| ❌ Large data in memory | Use streaming or pagination |
| ❌ Unnecessary re-renders | Memo components, useCallback |
| ❌ Missing loading states | Add Suspense boundaries |

```typescript
// ❌ N+1 Problem
const users = await db.select().from(users);
for (const user of users) {
  const orders = await db.select().from(orders).where(eq(orders.userId, user.id));
}

// ✅ Single query with join
const usersWithOrders = await db
  .select()
  .from(users)
  .leftJoin(orders, eq(users.id, orders.userId));
```

### 6. Tests

| Check | Requirement |
|-------|-------------|
| Unit tests exist | `__tests__/*.test.ts` or `*.test.ts` |
| Happy path covered | Main functionality tested |
| Edge cases covered | Empty inputs, errors, boundaries |
| Mocks appropriate | External services mocked |
| Assertions meaningful | Not just "doesn't throw" |

```typescript
// ✅ Good test
it('returns 401 when token is missing', async () => {
  const response = await GET(createRequest({ headers: {} }));
  expect(response.status).toBe(401);
  const body = await response.json();
  expect(body.code).toBe('UNAUTHORIZED');
});

// ❌ Weak test
it('works', async () => {
  const response = await GET(createRequest());
  expect(response).toBeDefined();
});
```

## Review Output Format

### APPROVED

When all checks pass:

```markdown
## Code Review: APPROVED ✅

### Acceptance Criteria
All 5 criteria verified and met.

### Pattern Compliance
- ✅ API route follows RxApp patterns
- ✅ Uses correct auth middleware
- ✅ Response format correct

### Code Quality
- ✅ No TypeScript issues
- ✅ Clean code standards met

### Security
- ✅ No security issues found

### Performance
- ✅ No performance concerns

### Tests
- ✅ Unit tests present with good coverage

**Ready to commit.**
```

### CHANGES_REQUESTED

When issues are found:

```markdown
## Code Review: CHANGES_REQUESTED 🔄

### Acceptance Criteria
- ✅ Criterion 1 met
- ❌ Criterion 2: "Unit tests written" - No tests found

### Issues Found

#### 🔴 Critical (must fix)
1. **Missing authentication** in `app/api/v1/billing/route.ts:15`
   - Endpoint exposes sensitive data without auth
   - Fix: Wrap with `withAuthAndOwnerGuard`

#### 🟠 High (should fix)
2. **No input validation** in `app/api/v1/billing/route.ts:20`
   - Request body not validated
   - Fix: Add Valibot schema validation

#### 🟡 Medium (consider fixing)
3. **Missing error handling** in `src/services/billing.ts:45`
   - Database errors not caught
   - Fix: Add try/catch with appropriate error

### Required Actions
1. Add authentication middleware
2. Add input validation
3. Write unit tests for the endpoint

**Please address the critical and high issues before committing.**
```

## Integration with Workflows

In `stories/prd.json` workflows:

```json
{
  "workflows": {
    "api-feature": {
      "steps": [
        { "name": "implement" },
        { "name": "build", "command": "pnpm build" },
        { "name": "unit-test", "command": "pnpm test" },
        {
          "name": "code-review",
          "skill": "code-review",
          "onFail": "address-feedback"
        },
        { "name": "commit" }
      ]
    }
  }
}
```

When `code-review` returns `CHANGES_REQUESTED`:
1. Address the feedback
2. Re-run the review
3. Repeat until `APPROVED`

## Quick Reference

### Files to Check by Area

| Area | Key Files |
|------|-----------|
| api | `app/api/v1/**/*.ts`, `src/services/*.ts` |
| ui | `app/(protected)/**/*.tsx`, `components/**/*.tsx` |
| infrastructure | `src/db/schema/*.ts`, `drizzle/migrations/*.sql` |
| stripe | `src/lib/stripe*.ts`, `app/api/v1/webhooks/stripe/*.ts` |

### Common Issues Quick Fix

| Issue | Quick Fix |
|-------|-----------|
| Missing auth | Add `withAuth` or `withAuthAndOwnerGuard` |
| Wrong response | Use `apiSuccess(data)` instead of `NextResponse.json()` |
| No validation | Add Valibot schema with `v.safeParse()` |
| No tests | Create `__tests__/filename.test.ts` |
| `any` type | Define interface or use `unknown` |

## Self-Review Prompt

Before requesting review, ask yourself:

1. Did I meet ALL acceptance criteria?
2. Did I follow existing patterns in this codebase?
3. Would I approve this code if someone else wrote it?
4. Are there tests for the new functionality?
5. Did I remove all debug code and TODOs?

# API Hardening: Zod Validation, Cursor Pagination & Error Standardization

> **Date:** 2026-03-13
> **Scope:** API-01 (Zod validation), API-03 (cursor pagination), error response standardization
> **Backlog IDs:** API-01, API-03, API-02 (migration to existing helpers)

---

## Problem

The API layer has three gaps:

1. **No input validation** — POST routes destructure `await req.json()` without validation. Bad data can enter the database.
2. **No pagination** — List endpoints return all records with hardcoded `take` limits. No cursor, no `hasMore`.
3. **Inconsistent errors** — Routes return ad-hoc `{ error: 'string' }` despite `api-errors.ts` providing standardized helpers that nothing uses.

## Solution Overview

1. **`withHandler()` middleware** — wraps route handlers with auth, Zod validation, pagination extraction, and error formatting
2. **`src/lib/schemas/`** — Zod schemas per entity for all POST/PATCH bodies
3. **Cursor-based pagination** — on 7 list endpoints via `paginate()` helper
4. **Error standardization** — all routes use `api-errors.ts` helpers; new `zodError()` for validation failures

---

## 1. Shared Infrastructure

### 1.1 `src/lib/api-handler.ts` — Route Handler Wrapper

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { auth } from '@/lib/auth';
import { unauthorized, badRequest, internalError } from '@/lib/api-errors';

interface HandlerContext<T> {
  body: T;
  session: { user: { id: string; name?: string; role?: string } };
  pagination: { cursor?: string; limit: number };
}

export function withHandler<T = unknown>(
  schema: ZodSchema<T> | null,
  handler: (req: NextRequest, ctx: HandlerContext<T>) => Promise<NextResponse>,
) {
  return async (req: NextRequest) => {
    try {
      // Auth check
      const session = await auth();
      if (!session?.user?.id) return unauthorized();

      // Pagination extraction
      const url = req.nextUrl;
      const cursor = url.searchParams.get('cursor') ?? undefined;
      const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
      const limit = Math.min(Math.max(rawLimit || 50, 1), 100);

      // Body parsing + Zod validation (only for non-GET)
      let body: T = undefined as T;
      if (schema && req.method !== 'GET') {
        const raw = await req.json();
        body = schema.parse(raw);
      }

      return await handler(req, { body, session: session as any, pagination: { cursor, limit } });
    } catch (err) {
      if (err instanceof ZodError) {
        return zodError(err);
      }
      console.error('API error:', err);
      return internalError();
    }
  };
}
```

**Notes:**
- GET handlers remain as plain `export async function GET(req)` — they are NOT wrapped by `withHandler`. Only POST/PATCH handlers use the wrapper.
- Pagination params are extracted by GET handlers directly using a `parsePagination(req)` utility (no wrapper needed).
- `limit` clamped to 1..100, default 50
- ZodError caught and formatted automatically
- The wrapper only handles POST bodies. DELETE/PATCH/PUT would also parse bodies, which is fine since all mutation routes use POST.

### 1.2 `src/lib/api-errors.ts` — Add `zodError()` Helper

Add to existing file:

1. Add `'VALIDATION_ERROR'` to the `ApiErrorCode` type union
2. Add `zodError()` helper:

```typescript
import { ZodError } from 'zod';

export function zodError(err: ZodError) {
  return NextResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR' as const,
        message: 'Validation failed',
        details: err.flatten().fieldErrors,
      },
    },
    { status: 400 },
  );
}
```

### 1.3 `src/lib/schemas/pagination.ts` — Pagination Helper

```typescript
// Note: Prisma cursor pagination uses the `id` field as position marker.
// The cursor field must exist in the orderBy result set, which it always does
// since `id` is the primary key. Ordering is by a separate field (e.g., createdAt),
// but the cursor refers to the record's id for deterministic positioning.
export function paginate<T extends { id: string }>(
  items: T[],
  limit: number,
): { data: T[]; meta: { cursor?: string; hasMore: boolean } } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  // Only return cursor when there are more pages to fetch
  const cursor = hasMore && data.length > 0 ? data[data.length - 1].id : undefined;
  return { data, meta: { cursor, hasMore } };
}
```

**Usage in routes:**

```typescript
const items = await db.signal.findMany({
  where,
  orderBy,
  take: pagination.limit + 1,
  ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
});
const { data, meta } = paginate(items, pagination.limit);
return NextResponse.json({ data: data.map(adaptSignal), meta });
```

---

## 2. Zod Schemas

### 2.1 `src/lib/schemas/queue.ts`

```typescript
import { z } from 'zod';

export const approveQueueSchema = z.object({
  action: z.literal('approve'),
  id: z.string().min(1),
  editedPayload: z.record(z.unknown()).optional(),
});

export const rejectQueueSchema = z.object({
  action: z.literal('reject'),
  id: z.string().min(1),
  reason: z.string().min(1, 'Rejection reason is required'),
});

export const queueActionSchema = z.discriminatedUnion('action', [
  approveQueueSchema,
  rejectQueueSchema,
]);
```

### 2.2 `src/lib/schemas/signals.ts`

```typescript
import { z } from 'zod';

export const signalActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('dismiss'),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal('convert'),
    id: z.string().min(1),
    company: z.string().trim().min(1, 'Company is required'),
    type: z.string().trim().optional(),
    country: z.string().trim().optional(),
  }),
]);
```

### 2.3 `src/lib/schemas/leads.ts`

**Wire format note:** The existing client sends creates WITHOUT an `action` field (routes detect create via `!action`). We normalize this: the `withHandler` wrapper will inject `action: 'create'` when the body has no `action` field, AND the `api-client.ts` create methods will be updated to include `action: 'create'` explicitly. This applies to leads, opportunities, and tasks.

```typescript
import { z } from 'zod';

export const leadActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    company: z.string().trim().min(1, 'Company is required'),
    type: z.string().trim().optional(),
    country: z.string().trim().optional(),
    pain: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal('advance'),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal('disqualify'),
    id: z.string().min(1),
    reason: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal('convert'),
    id: z.string().min(1),
    accountName: z.string().trim().min(1),
    accountType: z.string().trim().optional(),
    // Match existing wire format field names
    oppName: z.string().trim().optional(),
    oppAmount: z.number().positive().optional(),
    oppStage: z.string().trim().optional(),
  }),
]);
```

### 2.4 `src/lib/schemas/accounts.ts`

```typescript
import { z } from 'zod';

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required'),
  type: z.string().trim().optional(),
  country: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const updateAccountSchema = z.object({
  pain: z.string().trim().optional(),
  status: z.string().trim().optional(),
  whyNow: z.string().trim().optional(),
  notes: z.string().trim().optional(),
}).superRefine((obj, ctx) => {
  // Check that at least one field has a defined value (not just all undefined)
  const hasValue = Object.values(obj).some(v => v !== undefined);
  if (!hasValue) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});
```

### 2.5 `src/lib/schemas/opportunities.ts`

**Wire format note:** Action names match existing wire format: `close_won` and `close_lost` (snake_case), not camelCase. The `api-client.ts` already sends these as snake_case.

```typescript
import { z } from 'zod';

export const opportunityActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1, 'Opportunity name is required'),
    accountId: z.string().min(1),
    stage: z.string().trim().optional(),
    amount: z.number().positive().optional(),
    closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format').optional(),
  }),
  z.object({
    action: z.literal('move'),
    id: z.string().min(1),
    stage: z.string().trim().min(1, 'Target stage is required'),
  }),
  z.object({
    action: z.literal('close_won'),
    id: z.string().min(1),
    winNotes: z.string().trim().optional(),
    competitorBeaten: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal('close_lost'),
    id: z.string().min(1),
    lossReason: z.string().trim().min(1, 'Loss reason is required'),
    lossCompetitor: z.string().trim().optional(),
    lossNotes: z.string().trim().optional(),
  }),
]);
```

### 2.6 `src/lib/schemas/tasks.ts`

```typescript
import { z } from 'zod';

export const taskActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    title: z.string().trim().min(1, 'Task title is required'),
    accountId: z.string().optional(),
    priority: z.enum(['Low', 'Medium', 'High']).optional(),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format').optional(),
    assigneeIds: z.array(z.string()).optional(),
    reviewerId: z.string().optional(),
    goalId: z.string().optional(),
  }),
  z.object({
    action: z.literal('complete'),
    id: z.string().min(1),
    outcome: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    followUpTasks: z.array(z.object({
      title: z.string().trim().min(1),
      source: z.enum(['ai_suggested', 'custom']).optional(),
    })).optional(),
  }),
  z.object({
    action: z.literal('comment'),
    id: z.string().min(1),
    text: z.string().trim().min(1, 'Comment text is required'),
    mentionedUserIds: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal('send_for_review'),
    id: z.string().min(1),
  }),
]);
```

### 2.7 `src/lib/schemas/activities.ts`

```typescript
import { z } from 'zod';

export const createActivitySchema = z.object({
  type: z.string().trim().min(1, 'Activity type is required'),
  accountId: z.string().min(1),
  summary: z.string().trim().min(1, 'Summary is required'),
  detail: z.string().trim().optional(),
  noteType: z.string().trim().optional(),
});
```

### 2.8 `src/lib/schemas/inbox.ts`

```typescript
import { z } from 'zod';

export const inboxActionSchema = z.object({
  action: z.enum(['read', 'archive', 'create_task', 'create_account']),
  id: z.string().min(1),
});
```

---

## 3. Cursor-Based Pagination

### Endpoints receiving pagination

| Endpoint | Default limit | OrderBy (matches existing) | Custom meta (merged with pagination meta) |
|----------|--------------|---------|------------------------------------------|
| `/api/signals` | 50 | `detectedAt desc` | — |
| `/api/leads` | 50 | `createdAt desc` | — |
| `/api/accounts` | 50 | `scoreFit desc` (existing sort) | — |
| `/api/opportunities` | 50 | `amount desc` | `totalPipeline`, `weightedPipeline` |
| `/api/activities` | 50 | `createdAt desc` | — |
| `/api/inbox` | 50 | `receivedAt desc` | `unreadCount`, `totalCount` |

**Tasks endpoint — special case:** The tasks GET returns `{ data: { tasks: [...], goals: [...] } }` — a structured object, not a flat array. Pagination applies only to the `tasks` array within `data`. Goals are a small fixed set and don't need pagination. Response shape becomes: `{ data: { tasks: [...], goals: [...] }, meta: { cursor, hasMore, myOpenCount, ... } }`.

### Endpoints NOT paginated

| Endpoint | Reason |
|----------|--------|
| `/api/home` | Aggregated dashboard, fixed `take: 5` per section |
| `/api/queue` | Small working list with counts |
| `/api/search` | Capped at 5 results per entity type |
| `/api/badge-counts` | Single-value aggregation |
| `/api/health` | Status check |
| `/api/sync` | Action endpoint |

### Prisma cursor pattern

```typescript
const items = await db.signal.findMany({
  where,
  orderBy: { createdAt: 'desc' },
  take: pagination.limit + 1,
  ...(pagination.cursor
    ? { cursor: { id: pagination.cursor }, skip: 1 }
    : {}),
});
const { data, meta: pagMeta } = paginate(items, pagination.limit);
return NextResponse.json({
  data: data.map(adaptSignal),
  meta: { ...pagMeta },
});
```

For endpoints with custom meta (e.g., opportunities):
```typescript
const { data, meta: pagMeta } = paginate(items, pagination.limit);
return NextResponse.json({
  data: data.map(adaptOpportunity),
  meta: { ...pagMeta, totalPipeline, weightedPipeline },
});
```

### Frontend query hook changes

React Query hooks accept optional `cursor` and `limit` params:

```typescript
export function useSignalsQuery(status?: string, cursor?: string, limit?: number) {
  return useQuery({
    queryKey: signalKeys.list(status, cursor),
    queryFn: () => api.signals.list(status, cursor, limit),
  });
}
```

For now, hooks default to no cursor (first page). Infinite scroll (`useInfiniteQuery`) can be added as a follow-up.

---

## 4. Error Standardization

### Migration plan

All routes switch from:
```typescript
return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

To:
```typescript
return notFound('Queue item not found');
```

### Error response format (all endpoints)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Queue item not found"
  }
}
```

### Validation error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "company": ["Required"],
      "amount": ["Number must be greater than 0"]
    }
  }
}
```

### Error codes used

| Code | HTTP Status | When |
|------|-------------|------|
| `BAD_REQUEST` | 400 | Invalid action, missing required fields (non-Zod) |
| `VALIDATION_ERROR` | 400 | Zod parse failure |
| `UNAUTHORIZED` | 401 | No session |
| `FORBIDDEN` | 403 | Insufficient permissions (future RBAC) |
| `NOT_FOUND` | 404 | Record doesn't exist |
| `CONFLICT` | 409 | Duplicate detection (lead/account name) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 5. Route-by-Route Changes

Each route file gets:
1. Import schema from `src/lib/schemas/<entity>.ts`
2. Wrap POST handler with `withHandler(schema, handler)`
3. GET handler: add pagination params, use `paginate()` helper (for list endpoints)
4. Replace ad-hoc error returns with `api-errors.ts` helpers
5. Remove manual `await req.json()` + destructuring (handled by wrapper)

### Client-side migration (breaking change)

The `api-client.ts` create methods for leads, opportunities, and tasks currently send bodies WITHOUT an `action` field. These must be updated to include `action: 'create'` explicitly:

```typescript
// Before (existing):
leads: { create: (data) => post('/api/leads', data) }
// After:
leads: { create: (data) => post('/api/leads', { action: 'create', ...data }) }
```

Same pattern for `opportunities.create()` and `tasks.create()`.

**Deployment note:** Since this is a monolithic Next.js app, client and server deploy atomically. No backward-compatibility shim is needed in `withHandler` — both sides update in the same deployment.

### Barrel export

Add `src/lib/schemas/index.ts` re-exporting all schemas for clean imports.

### Frontend query key note

Adding `cursor` to query keys means each page is a separate cache entry. The existing `keepPreviousData` option (already used in hooks) prevents UI flicker during page transitions.

### Files touched

- `src/lib/api-handler.ts` (new)
- `src/lib/api-errors.ts` (add `zodError()`)
- `src/lib/schemas/pagination.ts` (new)
- `src/lib/schemas/queue.ts` (new)
- `src/lib/schemas/signals.ts` (new)
- `src/lib/schemas/leads.ts` (new)
- `src/lib/schemas/accounts.ts` (new)
- `src/lib/schemas/opportunities.ts` (new)
- `src/lib/schemas/tasks.ts` (new)
- `src/lib/schemas/activities.ts` (new)
- `src/lib/schemas/inbox.ts` (new)
- `src/app/api/queue/route.ts` (modify)
- `src/app/api/signals/route.ts` (modify)
- `src/app/api/leads/route.ts` (modify)
- `src/app/api/accounts/route.ts` (modify)
- `src/app/api/opportunities/route.ts` (modify)
- `src/app/api/tasks/route.ts` (modify)
- `src/app/api/activities/route.ts` (modify)
- `src/app/api/inbox/route.ts` (modify)
- `src/lib/queries/*.ts` (modify — add cursor/limit params)
- `src/lib/api-client.ts` (modify — add pagination params to list methods)
- `package.json` (add `zod` dependency)

---

## 6. Testing Strategy

- Unit tests for Zod schemas (valid/invalid inputs)
- Unit tests for `paginate()` helper (empty, exact limit, over limit, cursor extraction)
- Integration tests for `withHandler()` (auth rejection, validation error, success)
- Manual verification: each route returns proper error format and pagination meta

---

## Out of Scope

- Rate limiting (API-12) — separate backlog item
- Idempotency keys (API-13) — separate backlog item
- `useInfiniteQuery` migration — follow-up after pagination is available
- New API endpoints (API-04 through API-10) — separate sub-projects

# API-04 + API-06 + UX-06: Account PATCH, Meetings API, Optimistic Updates

> Date: 2026-03-13
> Status: Approved
> Backlog items: API-04, API-06, UX-06

---

## 1. API-04: PATCH /api/accounts/[id]

### Goal

Allow updating any editable field on an account, including FIUAC scores and AI brief fields, with activity logging and dedup protection on name changes.

### Route

`PATCH /api/accounts/[id]` in `src/app/api/accounts/[id]/route.ts`

Note: Account detail GET uses query param (`/accounts?id=X`) while PATCH uses path param (`/accounts/[id]`). This is intentional — the `[id]` directory already exists for contacts (`[id]/contacts/route.ts`). The mixed pattern is acceptable; migrating GET detail to path param is out of scope.

### Zod Schema

Replace the existing `updateAccountSchema` in `src/lib/schemas/accounts.ts` with a more complete `patchAccountSchema`:

```ts
export const patchAccountSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.string().trim().optional(),
  country: z.string().trim().optional(),
  countryCode: z.string().trim().optional(),
  region: z.string().trim().optional(),
  status: z.enum(['Prospect', 'Active', 'Partner', 'Churned']).optional(),
  notes: z.string().trim().optional(),
  // AI brief fields
  pain: z.string().trim().optional(),
  whyNow: z.string().trim().optional(),
  moduleFit: z.array(z.string()).optional(),  // String[] in Prisma
  competitors: z.string().trim().optional(),
  aiConfidence: z.number().min(0).max(100).optional(),
  // FIUAC scores
  scoreFit: z.number().min(0).max(100).optional(),
  scoreIntent: z.number().min(0).max(100).optional(),
  scoreUrgency: z.number().min(0).max(100).optional(),
  scoreAccess: z.number().min(0).max(100).optional(),
  scoreCommercial: z.number().min(0).max(100).optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});
```

### Handler Logic

1. Auth check via `auth()` (same pattern as `[name]/route.ts`)
2. Validate body with `patchAccountSchema`
3. Find account by `id`; return 404 if not found
4. If `name` is being changed: case-insensitive dedup check excluding current account; return 409 if taken
5. Determine if AI fields changed (`pain`, `whyNow`, `moduleFit`, `competitors`, `scoreFit`...`scoreCommercial`). If so, set `aiUpdatedAt: new Date()`
6. Update account via `db.account.update()`
7. Create Activity record: type `note`, summary `"Account updated"`, detail containing changed field names (e.g. `"Changed: status, pain"`), source `"user"`, with the account relation
8. Return adapted account via `adaptAccount()` (include owner + contacts)

### API Client Addition

```ts
// In api.accounts:
update: (id: string, data: Record<string, unknown>) =>
  patch<any>(`/accounts/${id}`, data),
```

### React Query Hook

```ts
// In queries/accounts.ts:
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.accounts.update(id, data),
    // Optimistic update added in UX-06 section
  });
}
```

---

## 2. API-06: Meetings API

### Goal

Provide REST endpoints for listing, viewing, creating, and updating meetings. The existing `adaptMeeting()` adapter and Prisma `Meeting` model are already in place.

### Routes

#### `GET /api/meetings` — List meetings

File: `src/app/api/meetings/route.ts`

Query params:
- `date` — ISO date string (defaults to today)
- `range` — number of days forward (default 7)
- `cursor`, `limit` — standard pagination

Query: `db.meeting.findMany()` where `date` is between `date` and `date + range` days. Order by `date asc, startTime asc`.

Returns: `{ data: Meeting[], meta: { cursor?, hasMore } }`

#### `POST /api/meetings` — Create meeting

File: `src/app/api/meetings/route.ts`

Schema:
```ts
export const createMeetingSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  date: z.string().trim().min(1, 'Date is required'),  // ISO date
  startTime: z.string().trim().min(1, 'Start time is required'),  // "HH:MM"
  duration: z.string().trim().default('30 min'),
  attendees: z.array(z.string()).default([]),
  accountId: z.string().optional(),
});
```

Logic:
1. Auth check
2. If `accountId` provided, look up account name for `accountName` denormalization
3. Create meeting via `db.meeting.create()`
4. Return 201 with adapted meeting

#### `GET /api/meetings/[id]` — Meeting detail

File: `src/app/api/meetings/[id]/route.ts`

Response shape (mirrors accounts detail pattern with top-level keys):
```ts
{
  data: Meeting,           // adapted meeting
  account?: Account,       // adapted account (if linked)
  contacts?: Contact[],    // account's contacts (if linked)
  activities?: Activity[], // last 5 account activities (if linked)
}
```

The GET handler is a bare `async function GET(req, { params })` (not wrapped with `withHandler`), consistent with the existing accounts GET pattern. Only POST/PATCH use `withHandler`.

#### `PATCH /api/meetings/[id]` — Update meeting

File: `src/app/api/meetings/[id]/route.ts`

Schema:
```ts
export const patchMeetingSchema = z.object({
  prepStatus: z.enum(['draft', 'ready']).optional(),
  title: z.string().trim().min(1).optional(),
  startTime: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  attendees: z.array(z.string()).optional(),
  date: z.string().trim().optional(),  // ISO date, can reschedule
  accountId: z.string().nullable().optional(),
}).superRefine(/* at least one field */);
```

Logic: Standard find-by-id, validate, update, return adapted. If `accountId` changes, update `accountName` denormalization.

Note: The meetings GET handler reads `date` and `range` from `req.nextUrl.searchParams` directly (not via `withHandler`), consistent with how accounts GET handles its custom query params.

### API Client Additions

```ts
meetings: {
  list: (opts?: { date?: string; range?: number; cursor?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.date) params.set('date', opts.date);
    if (opts?.range) params.set('range', String(opts.range));
    if (opts?.cursor) params.set('cursor', opts.cursor);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return get<any>(`/meetings${qs ? `?${qs}` : ''}`);
  },
  detail: (id: string) => get<any>(`/meetings/${id}`),
  create: (data: any) => post<any>('/meetings', data),
  update: (id: string, data: any) => patch<any>(`/meetings/${id}`, data),
},
```

### React Query Hooks

New file: `src/lib/queries/meetings.ts`

```ts
export const meetingKeys = {
  all: ['meetings'] as const,
  list: (date?: string, range?: number) => ['meetings', 'list', date, range] as const,
  detail: (id: string) => ['meetings', id] as const,
};

export function useMeetingsQuery(date?: string, range?: number) { ... }
export function useMeetingDetail(id: string) { ... }
export function useCreateMeeting() { ... }
export function useUpdateMeeting() { ... }
```

### Zod Schema File

New file: `src/lib/schemas/meetings.ts` with `createMeetingSchema` and `patchMeetingSchema`.

### Home Page Integration

The Home page currently fetches meetings inline via `/api/home`. Meetings mutations should invalidate both `meetingKeys.all` and `homeKeys.all` (the home summary query) so the Home meeting section stays in sync.

---

## 3. UX-06: Optimistic Updates for All Mutations

### Goal

Add optimistic cache updates to every existing mutation hook so the UI responds instantly, with rollback on error.

### Pattern

Every mutation hook gains three callbacks:

```ts
onMutate: async (variables) => {
  // 1. Cancel in-flight queries for this data
  await qc.cancelQueries({ queryKey: ... });
  // 2. Snapshot current cache
  const previous = qc.getQueryData(queryKey);
  // 3. Optimistically update cache
  qc.setQueryData(queryKey, (old) => /* modified data */);
  // 4. Return snapshot for rollback
  return { previous };
},
onError: (_err, _vars, context) => {
  // Restore snapshot
  if (context?.previous) qc.setQueryData(queryKey, context.previous);
},
onSettled: () => {
  // Always refetch to sync with server truth
  qc.invalidateQueries({ queryKey: ... });
},
```

The existing `onSuccess` callbacks move their invalidation logic into `onSettled` (which fires on both success and error). Any per-call `onSuccess`/`onError` callbacks in page components (for toasts, drawer closing) continue to work — React Query merges hook-level and call-level callbacks.

### Mutation-by-Mutation Optimistic Behavior

#### Queue (`queries/queue.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useApproveQueueItem` | Filter item out of `pending` list |
| `useRejectQueueItem` | Filter item out of `pending` list |

#### Signals (`queries/signals.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useDismissSignal` | Filter item out of list |
| `useConvertSignal` | Filter item out of list; secondary invalidation (leads) via `onSettled` only |

#### Leads (`queries/leads.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useAdvanceLead` | Update lead's `stage` to next stage in list |
| `useDisqualifyLead` | Update lead's `stage` to `Disqualified` in list |
| `useConvertLead` | Filter item out of list; secondary invalidation (accounts, opps) via `onSettled` only |

#### Accounts (`queries/accounts.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useCreateAccount` | Prepend new account with temp data to list |
| `useUpdateAccount` (new) | Merge updated fields into detail cache |
| `useCreateContact` | Append contact to account detail's contacts array |

#### Opportunities (`queries/opportunities.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useCreateOpportunity` | Prepend to list with temp data |
| `useMoveStage` | Update `stage` field on item in list and detail |
| `useCloseWon` | Update `stage` to `Closed Won` in list |
| `useCloseLost` | Update `stage` to `Closed Lost` in list |

#### Inbox (`queries/inbox.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useMarkEmailRead` | Set `read: true` on item in list |
| `useArchiveEmail` | Filter item out of list |
| `useCreateTaskFromEmail` | No list change (email stays); secondary invalidation (tasks) via `onSettled` |
| `useCreateAccountFromEmail` | No list change; secondary invalidation (accounts) via `onSettled` |

#### Tasks (`queries/tasks.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useCreateTask` | Prepend to list with temp data |
| `useCompleteTask` | Set `status` to `Done` / filter from active list |
| `useCommentOnTask` | Append comment to task detail (if detail query exists) |

#### Activities (`queries/activities.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `useLogActivity` | Prepend to activity list with temp data; secondary invalidation (account detail, opps) via `onSettled` |

#### Settings (`queries/settings.ts`)

| Hook | Optimistic behavior |
|------|-------------------|
| `usePatchAgent` | Update agent's `status`/`parameters` in agents list cache |

#### Meetings (`queries/meetings.ts`) — new

| Hook | Optimistic behavior |
|------|-------------------|
| `useCreateMeeting` | Prepend to list with temp data |
| `useUpdateMeeting` | Merge updated fields (e.g., `prepStatus`) into list and detail cache |

### Cross-Query Invalidation

Mutations that affect multiple query domains keep their cross-query `invalidateQueries` calls in `onSettled` (not optimistically updated). This means:
- Signal convert: signals list updates instantly; leads list refetches on settle
- Lead convert: leads list updates instantly; accounts + opps refetch on settle
- Inbox createTask: inbox unchanged; tasks refetch on settle
- Activity log: activities updated instantly; account detail + opps refetch on settle

### Temp IDs for Create Operations

For mutations that prepend new items to lists (create account, create task, etc.), the optimistic item uses a temp ID like `temp-${Date.now()}`. On `onSettled`, `invalidateQueries` refetches the real data with the server-assigned ID, replacing the temp entry.

---

## Files Changed Summary

### New Files
- `src/app/api/accounts/[id]/route.ts` — PATCH handler
- `src/app/api/meetings/route.ts` — GET list + POST create
- `src/app/api/meetings/[id]/route.ts` — GET detail + PATCH update
- `src/lib/schemas/meetings.ts` — Zod schemas
- `src/lib/queries/meetings.ts` — React Query hooks

### Modified Files
- `src/lib/schemas/accounts.ts` — Replace `updateAccountSchema` with `patchAccountSchema`
- `src/lib/schemas/index.ts` — Update export to `patchAccountSchema`, add meetings schemas
- `src/lib/api-client.ts` — Add `accounts.update()`, `meetings.*` methods
- `src/lib/queries/accounts.ts` — Add `useUpdateAccount`, optimistic updates to existing hooks
- `src/lib/queries/queue.ts` — Add optimistic updates
- `src/lib/queries/signals.ts` — Add optimistic updates
- `src/lib/queries/leads.ts` — Add optimistic updates
- `src/lib/queries/opportunities.ts` — Add optimistic updates
- `src/lib/queries/inbox.ts` — Add optimistic updates
- `src/lib/queries/tasks.ts` — Add optimistic updates
- `src/lib/queries/activities.ts` — Add optimistic updates
- `src/lib/queries/settings.ts` — Add optimistic updates

### Not Changed
- `src/lib/adapters.ts` — `adaptMeeting()` already exists
- `src/lib/types.ts` — `Meeting` UI type already exists
- Page components — no changes needed; existing mutation call patterns (with inline `onSuccess`/`onError` for toasts) are preserved

---

## Testing Strategy

- API routes: integration tests verifying PATCH validation, dedup, activity logging, meetings CRUD
- Optimistic updates: manual verification — mutation fires, UI updates instantly, refetch confirms server state
- Error rollback: simulate API failure, verify cache restores to pre-mutation state

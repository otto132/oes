# API-04 + API-06 + UX-06 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PATCH /accounts/:id, full meetings CRUD API, and optimistic updates to all mutation hooks.

**Architecture:** Three independent workstreams — API-04 (account PATCH) and API-06 (meetings API) are backend-first with Zod schemas, route handlers, api-client methods, and React Query hooks. UX-06 (optimistic updates) modifies all existing query hook files to add onMutate/onError/onSettled callbacks. All follow established patterns.

**Tech Stack:** Next.js App Router, Prisma, Zod, React Query (TanStack Query), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-13-api-meetings-account-patch-optimistic-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/app/api/accounts/[id]/route.ts` | PATCH handler for account updates |
| `src/app/api/meetings/route.ts` | GET list + POST create for meetings |
| `src/app/api/meetings/[id]/route.ts` | GET detail + PATCH update for meetings |
| `src/lib/schemas/meetings.ts` | Zod schemas for meeting create/patch |
| `src/lib/queries/meetings.ts` | React Query hooks for meetings |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/schemas/accounts.ts` | Replace `updateAccountSchema` with `patchAccountSchema` |
| `src/lib/schemas/index.ts` | Update exports |
| `src/lib/api-client.ts` | Add `accounts.update()`, `meetings.*` methods |
| `src/lib/queries/accounts.ts` | Add `useUpdateAccount`, optimistic updates |
| `src/lib/queries/queue.ts` | Add optimistic updates |
| `src/lib/queries/signals.ts` | Add optimistic updates |
| `src/lib/queries/leads.ts` | Add optimistic updates |
| `src/lib/queries/opportunities.ts` | Add optimistic updates |
| `src/lib/queries/inbox.ts` | Add optimistic updates |
| `src/lib/queries/tasks.ts` | Add optimistic updates |
| `src/lib/queries/activities.ts` | Add optimistic updates |
| `src/lib/queries/settings.ts` | Add optimistic updates |

---

## Chunk 1: API-04 — PATCH /accounts/:id

### Task 1: Account PATCH Schema

**Files:**
- Modify: `src/lib/schemas/accounts.ts`
- Modify: `src/lib/schemas/index.ts`

- [ ] **Step 1: Replace `updateAccountSchema` with `patchAccountSchema`**

In `src/lib/schemas/accounts.ts`, replace the existing `updateAccountSchema` with:

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
  moduleFit: z.array(z.string()).optional(),
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

- [ ] **Step 2: Update schema barrel export**

In `src/lib/schemas/index.ts`, change:
```ts
export { createAccountSchema, updateAccountSchema } from './accounts';
```
to:
```ts
export { createAccountSchema, patchAccountSchema } from './accounts';
```

- [ ] **Step 3: Check for any imports of `updateAccountSchema`**

Run: `grep -r "updateAccountSchema" src/`

If any other files import `updateAccountSchema`, update them to use `patchAccountSchema`. Based on exploration, no other files import it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas/accounts.ts src/lib/schemas/index.ts
git commit -m "feat(schemas): replace updateAccountSchema with patchAccountSchema (API-04)"
```

---

### Task 2: Account PATCH Route Handler

**Files:**
- Create: `src/app/api/accounts/[id]/route.ts`

- [ ] **Step 1: Create the PATCH handler**

Create `src/app/api/accounts/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { adaptAccount } from '@/lib/adapters';
import { patchAccountSchema } from '@/lib/schemas/accounts';
import { unauthorized, notFound, conflict, zodError } from '@/lib/api-errors';

const AI_FIELDS = new Set([
  'pain', 'whyNow', 'moduleFit', 'competitors', 'aiConfidence',
  'scoreFit', 'scoreIntent', 'scoreUrgency', 'scoreAccess', 'scoreCommercial',
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;

  const raw = await req.json();
  const parsed = patchAccountSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  // Find existing account
  const existing = await db.account.findUnique({ where: { id } });
  if (!existing) return notFound('Account not found');

  // Dedup check if name is changing
  if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await db.account.findFirst({
      where: {
        name: { equals: body.name, mode: 'insensitive' },
        id: { not: id },
      },
    });
    if (dup) return conflict(`Account "${dup.name}" already exists`);
  }

  // Check if any AI fields changed
  const hasAiChange = Object.keys(body).some(k => AI_FIELDS.has(k));
  const changedFields = Object.keys(body);

  // Update account
  const updated = await db.account.update({
    where: { id },
    data: {
      ...body,
      ...(hasAiChange ? { aiUpdatedAt: new Date() } : {}),
    },
    include: { owner: true, contacts: { orderBy: { role: 'asc' } } },
  });

  // Log activity
  await db.activity.create({
    data: {
      type: 'note',
      summary: 'Account updated',
      detail: `Changed: ${changedFields.join(', ')}`,
      source: 'user',
      accountId: id,
      authorId: session.user.id,
    },
  });

  return NextResponse.json({ data: adaptAccount(updated) });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file

- [ ] **Step 3: Commit**

```bash
git add src/app/api/accounts/\[id\]/route.ts
git commit -m "feat(api): PATCH /accounts/:id with validation, dedup, activity logging (API-04)"
```

---

### Task 3: Account Update API Client + Query Hook

**Files:**
- Modify: `src/lib/api-client.ts`
- Modify: `src/lib/queries/accounts.ts`

- [ ] **Step 1: Add `update` method to api-client**

In `src/lib/api-client.ts`, inside `api.accounts`, add after `create`:

```ts
    update: (id: string, data: Record<string, unknown>) =>
      patch<any>(`/accounts/${id}`, data),
```

- [ ] **Step 2: Add `useUpdateAccount` hook**

In `src/lib/queries/accounts.ts`, add:

```ts
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.accounts.update(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-client.ts src/lib/queries/accounts.ts
git commit -m "feat: add accounts.update() client method and useUpdateAccount hook (API-04)"
```

---

## Chunk 2: API-06 — Meetings API

### Task 4: Meeting Zod Schemas

**Files:**
- Create: `src/lib/schemas/meetings.ts`
- Modify: `src/lib/schemas/index.ts`

- [ ] **Step 1: Create meetings schema file**

Create `src/lib/schemas/meetings.ts`:

```ts
import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  date: z.string().trim().min(1, 'Date is required'),
  startTime: z.string().trim().min(1, 'Start time is required'),
  duration: z.string().trim().default('30 min'),
  attendees: z.array(z.string()).default([]),
  accountId: z.string().optional(),
});

export const patchMeetingSchema = z.object({
  prepStatus: z.enum(['draft', 'ready']).optional(),
  title: z.string().trim().min(1).optional(),
  startTime: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  date: z.string().trim().optional(),
  attendees: z.array(z.string()).optional(),
  accountId: z.string().nullable().optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});
```

- [ ] **Step 2: Add to schema barrel export**

In `src/lib/schemas/index.ts`, add:

```ts
export { createMeetingSchema, patchMeetingSchema } from './meetings';
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/meetings.ts src/lib/schemas/index.ts
git commit -m "feat(schemas): add meeting create and patch schemas (API-06)"
```

---

### Task 5: Meetings List + Create Route

**Files:**
- Create: `src/app/api/meetings/route.ts`

- [ ] **Step 1: Create the GET + POST handler**

Create `src/app/api/meetings/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptMeeting } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { createMeetingSchema } from '@/lib/schemas/meetings';
import { parsePagination, paginate } from '@/lib/schemas/pagination';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const dateParam = url.searchParams.get('date');
  const rangeParam = parseInt(url.searchParams.get('range') ?? '7', 10);
  const range = Math.min(Math.max(rangeParam || 7, 1), 90);

  const startDate = dateParam ? new Date(dateParam) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + range);

  const pagination = parsePagination(req);

  const meetings = await db.meeting.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(meetings, pagination.limit);
  return NextResponse.json({ data: data.map(adaptMeeting), meta });
}

export const POST = withHandler(createMeetingSchema, async (_req, ctx) => {
  const { title, date, startTime, duration, attendees, accountId } = ctx.body;

  let accountName: string | null = null;
  if (accountId) {
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: { name: true },
    });
    accountName = account?.name ?? null;
  }

  const meeting = await db.meeting.create({
    data: {
      title,
      date: new Date(date),
      startTime,
      duration,
      attendees,
      accountId: accountId ?? null,
      accountName,
    },
  });

  return NextResponse.json({ data: adaptMeeting(meeting) }, { status: 201 });
});
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meetings/route.ts
git commit -m "feat(api): GET /meetings (list) + POST /meetings (create) (API-06)"
```

---

### Task 6: Meeting Detail + Patch Route

**Files:**
- Create: `src/app/api/meetings/[id]/route.ts`

- [ ] **Step 1: Create the GET + PATCH handler**

Create `src/app/api/meetings/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { adaptMeeting, adaptAccount, adaptContact, adaptActivity } from '@/lib/adapters';
import { patchMeetingSchema } from '@/lib/schemas/meetings';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const meeting = await db.meeting.findUnique({ where: { id } });
  if (!meeting) return notFound('Meeting not found');

  const result: Record<string, unknown> = { data: adaptMeeting(meeting) };

  // Include account context if linked
  if (meeting.accountId) {
    const account = await db.account.findUnique({
      where: { id: meeting.accountId },
      include: {
        owner: true,
        contacts: { orderBy: { role: 'asc' } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { author: true },
        },
      },
    });
    if (account) {
      result.account = adaptAccount(account);
      result.contacts = account.contacts.map(adaptContact);
      result.activities = account.activities.map(a =>
        adaptActivity({ ...a, account: { id: account.id, name: account.name } }),
      );
    }
  }

  return NextResponse.json(result);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;

  const raw = await req.json();
  const parsed = patchMeetingSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  const existing = await db.meeting.findUnique({ where: { id } });
  if (!existing) return notFound('Meeting not found');

  // If accountId is changing, update denormalized accountName
  let accountName: string | null | undefined = undefined;
  if (body.accountId !== undefined) {
    if (body.accountId === null) {
      accountName = null;
    } else {
      const account = await db.account.findUnique({
        where: { id: body.accountId },
        select: { name: true },
      });
      accountName = account?.name ?? null;
    }
  }

  const updated = await db.meeting.update({
    where: { id },
    data: {
      ...body,
      ...(body.date ? { date: new Date(body.date) } : {}),
      ...(accountName !== undefined ? { accountName } : {}),
    },
  });

  return NextResponse.json({ data: adaptMeeting(updated) });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meetings/\[id\]/route.ts
git commit -m "feat(api): GET + PATCH /meetings/:id with account context (API-06)"
```

---

### Task 7: Meetings API Client + Query Hooks

**Files:**
- Modify: `src/lib/api-client.ts`
- Create: `src/lib/queries/meetings.ts`

- [ ] **Step 1: Add meetings namespace to api-client**

In `src/lib/api-client.ts`, add before the `// ── Search` section:

```ts
  // ── Meetings ────────────────────────────────────
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
    create: (data: { title: string; date: string; startTime: string; duration?: string; attendees?: string[]; accountId?: string }) =>
      post<any>('/meetings', data),
    update: (id: string, data: Record<string, unknown>) =>
      patch<any>(`/meetings/${id}`, data),
  },
```

- [ ] **Step 2: Create meetings query hooks**

Create `src/lib/queries/meetings.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { homeKeys } from './home';

export const meetingKeys = {
  all: ['meetings'] as const,
  list: (date?: string, range?: number) => ['meetings', 'list', date, range] as const,
  detail: (id: string) => ['meetings', id] as const,
};

export function useMeetingsQuery(date?: string, range?: number) {
  return useQuery({
    queryKey: meetingKeys.list(date, range),
    queryFn: () => api.meetings.list({ date, range }),
    placeholderData: keepPreviousData,
  });
}

export function useMeetingDetail(id: string) {
  return useQuery({
    queryKey: meetingKeys.detail(id),
    queryFn: () => api.meetings.detail(id),
    enabled: !!id,
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; date: string; startTime: string; duration?: string; attendees?: string[]; accountId?: string }) =>
      api.meetings.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meetingKeys.all });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.meetings.update(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: meetingKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: meetingKeys.all });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-client.ts src/lib/queries/meetings.ts
git commit -m "feat: add meetings api-client methods and React Query hooks (API-06)"
```

---

## Chunk 3: UX-06 — Optimistic Updates (Queue, Signals, Leads)

### Task 8: Queue Optimistic Updates

**Files:**
- Modify: `src/lib/queries/queue.ts`

- [ ] **Step 1: Add optimistic updates to queue hooks**

Replace the full contents of `src/lib/queries/queue.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

type QueueResponse = Awaited<ReturnType<typeof api.queue.list>>;

export const queueKeys = {
  all: ['queue'] as const,
  list: (status: string, type?: string) => ['queue', status, type] as const,
};

export function useQueueQuery(status: 'pending' | 'completed', type?: string) {
  return useQuery<QueueResponse>({
    queryKey: queueKeys.list(status, type),
    queryFn: () => api.queue.list(status, type),
    placeholderData: keepPreviousData,
  });
}

export function useApproveQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, editedPayload }: { id: string; editedPayload?: Record<string, unknown> }) =>
      api.queue.approve(id, editedPayload),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: queueKeys.all });
      const queries = qc.getQueriesData<QueueResponse>({ queryKey: queueKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData<QueueResponse>({ queryKey: queueKeys.all }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter(item => item.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}

export function useRejectQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.queue.reject(id, reason),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: queueKeys.all });
      const queries = qc.getQueriesData<QueueResponse>({ queryKey: queueKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData<QueueResponse>({ queryKey: queueKeys.all }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter(item => item.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/queue.ts
git commit -m "feat(ux): add optimistic updates to queue mutations (UX-06)"
```

---

### Task 9: Signals Optimistic Updates

**Files:**
- Modify: `src/lib/queries/signals.ts`

- [ ] **Step 1: Add optimistic updates to signal hooks**

Replace the full contents of `src/lib/queries/signals.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { leadKeys } from './leads';

export const signalKeys = {
  all: ['signals'] as const,
  list: (type?: string) => ['signals', type] as const,
};

export function useSignalsQuery(type?: string) {
  return useQuery({
    queryKey: signalKeys.list(type),
    queryFn: () => api.signals.list(type),
    placeholderData: keepPreviousData,
  });
}

export function useDismissSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.signals.dismiss(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: signalKeys.all });
      const queries = qc.getQueriesData({ queryKey: signalKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: signalKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((s: any) => s.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: signalKeys.all });
    },
  });
}

export function useConvertSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, company, type, country }: { id: string; company: string; type?: string; country?: string }) =>
      api.signals.convert(id, company, type, country),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: signalKeys.all });
      const queries = qc.getQueriesData({ queryKey: signalKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: signalKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((s: any) => s.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: signalKeys.all });
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/signals.ts
git commit -m "feat(ux): add optimistic updates to signal mutations (UX-06)"
```

---

### Task 10: Leads Optimistic Updates

**Files:**
- Modify: `src/lib/queries/leads.ts`

- [ ] **Step 1: Add optimistic updates to lead hooks**

Replace the full contents of `src/lib/queries/leads.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';

export const leadKeys = {
  all: ['leads'] as const,
  list: () => ['leads', 'list'] as const,
};

export function useLeadsQuery() {
  return useQuery({
    queryKey: leadKeys.list(),
    queryFn: () => api.leads.list(),
    placeholderData: keepPreviousData,
  });
}

export function useAdvanceLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.leads.advance(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const queries = qc.getQueriesData({ queryKey: leadKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((l: any) =>
            l.id === id ? { ...l, stage: getNextStage(l.stage) } : l,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

export function useDisqualifyLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.leads.disqualify(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const queries = qc.getQueriesData({ queryKey: leadKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((l: any) =>
            l.id === id ? { ...l, stage: 'Disqualified' } : l,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; accountName?: string; accountType?: string; oppName?: string; oppAmount?: number; oppStage?: string }) =>
      api.leads.convert(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const queries = qc.getQueriesData({ queryKey: leadKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((l: any) => l.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}

// Lead stage progression order
const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Converted'];
function getNextStage(current: string): string {
  const idx = LEAD_STAGES.indexOf(current);
  return idx >= 0 && idx < LEAD_STAGES.length - 1 ? LEAD_STAGES[idx + 1] : current;
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/leads.ts
git commit -m "feat(ux): add optimistic updates to lead mutations (UX-06)"
```

---

## Chunk 4: UX-06 — Optimistic Updates (Accounts, Opportunities, Inbox)

### Task 11: Accounts Optimistic Updates

**Files:**
- Modify: `src/lib/queries/accounts.ts`

- [ ] **Step 1: Add optimistic updates to all account hooks**

Replace the full contents of `src/lib/queries/accounts.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const accountKeys = {
  all: ['accounts'] as const,
  list: (q?: string, type?: string) => ['accounts', 'list', q, type] as const,
  detail: (id: string) => ['accounts', id] as const,
};

export function useAccountsQuery(q?: string, type?: string) {
  return useQuery({
    queryKey: accountKeys.list(q, type),
    queryFn: () => api.accounts.list({ q, type }),
    placeholderData: keepPreviousData,
  });
}

export function useAccountDetail(id: string) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: () => api.accounts.detail(id),
    enabled: !!id,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type?: string; country?: string; notes?: string }) =>
      api.accounts.create(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: accountKeys.all });
      const queries = qc.getQueriesData({ queryKey: accountKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const tempAccount = { id: `temp-${Date.now()}`, name: data.name, type: data.type || 'Unknown', country: data.country || '', status: 'Prospect' };
      qc.setQueriesData({ queryKey: accountKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: [tempAccount, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.accounts.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: accountKeys.detail(id) });
      const previousDetail = qc.getQueryData(accountKeys.detail(id));
      qc.setQueryData(accountKeys.detail(id), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: { ...old.data, ...data } };
      });
      return { previousDetail };
    },
    onError: (_err, vars, context) => {
      if (context?.previousDetail) qc.setQueryData(accountKeys.detail(vars.id), context.previousDetail);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useCreateContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; title?: string; role?: string; warmth?: string; email?: string; phone?: string }) => {
      const res = await fetch(`/api/accounts/${accountId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to create contact');
      }
      return res.json();
    },
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: accountKeys.detail(accountId) });
      const previousDetail = qc.getQueryData(accountKeys.detail(accountId));
      const tempContact = { id: `temp-${Date.now()}`, name: data.name, title: data.title || '', role: data.role || 'User', warmth: data.warmth || 'Neutral', email: data.email || '', phone: data.phone || '' };
      qc.setQueryData(accountKeys.detail(accountId), (old: any) => {
        if (!old?.data) return old;
        const contacts = old.data.contacts ? [...old.data.contacts, tempContact] : [tempContact];
        return { ...old, data: { ...old.data, contacts } };
      });
      return { previousDetail };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail) qc.setQueryData(accountKeys.detail(accountId), context.previousDetail);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/accounts.ts
git commit -m "feat(ux): add optimistic updates to account mutations (UX-06)"
```

---

### Task 12: Opportunities Optimistic Updates

**Files:**
- Modify: `src/lib/queries/opportunities.ts`

- [ ] **Step 1: Add optimistic updates to opportunity hooks**

Replace the full contents of `src/lib/queries/opportunities.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const oppKeys = {
  all: ['opportunities'] as const,
  list: () => ['opportunities', 'list'] as const,
  detail: (id: string) => ['opportunities', id] as const,
};

export function useOpportunitiesQuery() {
  return useQuery({
    queryKey: oppKeys.list(),
    queryFn: () => api.opportunities.list(),
    placeholderData: keepPreviousData,
  });
}

export function useOpportunityDetail(id: string) {
  return useQuery({
    queryKey: oppKeys.detail(id),
    queryFn: () => api.opportunities.detail(id),
    enabled: !!id,
  });
}

export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.opportunities.move(id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((o: any) => o.id === id ? { ...o, stage } : o) };
      });
      const previousDetail = qc.getQueryData(oppKeys.detail(id));
      qc.setQueryData(oppKeys.detail(id), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: { ...old.data, stage } };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail) qc.setQueryData(oppKeys.detail(context.id), context.previousDetail);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}

export function useCloseWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; winNotes?: string; competitorBeaten?: string }) =>
      api.opportunities.closeWon(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((o: any) => o.id === id ? { ...o, stage: 'Closed Won' } : o) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}

export function useCloseLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; lossReason: string; lossCompetitor?: string; lossNotes?: string }) =>
      api.opportunities.closeLost(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((o: any) => o.id === id ? { ...o, stage: 'Closed Lost' } : o) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; accountId: string; stage?: string; amount?: number; closeDate?: string }) =>
      api.opportunities.create(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const tempOpp = { id: `temp-${Date.now()}`, name: data.name, stage: data.stage || 'Discovery', amt: data.amount || 0 };
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: [tempOpp, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/opportunities.ts
git commit -m "feat(ux): add optimistic updates to opportunity mutations (UX-06)"
```

---

### Task 13: Inbox Optimistic Updates

**Files:**
- Modify: `src/lib/queries/inbox.ts`

- [ ] **Step 1: Add optimistic updates to inbox hooks**

Replace the full contents of `src/lib/queries/inbox.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { taskKeys } from './tasks';

export const inboxKeys = {
  all: ['inbox'] as const,
  list: () => ['inbox', 'list'] as const,
};

export function useInboxQuery() {
  return useQuery({
    queryKey: inboxKeys.list(),
    queryFn: () => api.inbox.list(),
    placeholderData: keepPreviousData,
  });
}

export function useMarkEmailRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.markRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all });
      const queries = qc.getQueriesData({ queryKey: inboxKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: inboxKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((e: any) => e.id === id ? { ...e, read: true } : e) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useArchiveEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.archive(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all });
      const queries = qc.getQueriesData({ queryKey: inboxKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: inboxKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.filter((e: any) => e.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useCreateTaskFromEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.createTask(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCreateAccountFromEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.createAccount(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/inbox.ts
git commit -m "feat(ux): add optimistic updates to inbox mutations (UX-06)"
```

---

## Chunk 5: UX-06 — Optimistic Updates (Tasks, Activities, Settings, Meetings)

### Task 14: Tasks Optimistic Updates

**Files:**
- Modify: `src/lib/queries/tasks.ts`

- [ ] **Step 1: Add optimistic updates to task hooks**

Replace the full contents of `src/lib/queries/tasks.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (includeCompleted?: boolean) => ['tasks', 'list', includeCompleted] as const,
};

export function useTasksQuery(includeCompleted = false) {
  return useQuery({
    queryKey: taskKeys.list(includeCompleted),
    queryFn: () => api.tasks.list(includeCompleted),
    placeholderData: keepPreviousData,
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: any }) =>
      api.tasks.complete(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const queries = qc.getQueriesData({ queryKey: taskKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      // For the active (non-completed) list, filter out the task
      qc.setQueryData(taskKeys.list(false), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.filter((t: any) => t.id !== id) };
      });
      // For the completed list, mark as Done
      qc.setQueryData(taskKeys.list(true), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((t: any) => t.id === id ? { ...t, status: 'Done' } : t) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCommentOnTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.tasks.comment(id, text),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; accountId?: string; priority?: string; due?: string; goalId?: string }) =>
      api.tasks.create(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const queries = qc.getQueriesData({ queryKey: taskKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const tempTask = { id: `temp-${Date.now()}`, title: data.title, status: 'To Do', pri: data.priority || 'Medium', due: data.due || '' };
      qc.setQueriesData({ queryKey: taskKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: [tempTask, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/tasks.ts
git commit -m "feat(ux): add optimistic updates to task mutations (UX-06)"
```

---

### Task 15: Activities Optimistic Updates

**Files:**
- Modify: `src/lib/queries/activities.ts`

- [ ] **Step 1: Add optimistic updates to activity hook**

Replace the full contents of `src/lib/queries/activities.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';

export const activityKeys = {
  all: ['activities'] as const,
};

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type?: string;
      summary: string;
      detail?: string;
      accountId: string;
      source?: string;
    }) => api.activities.log(data),
    onMutate: async (data) => {
      // Optimistically update the account detail's activity list
      await qc.cancelQueries({ queryKey: accountKeys.detail(data.accountId) });
      const previousDetail = qc.getQueryData(accountKeys.detail(data.accountId));
      const tempActivity = {
        id: `temp-${Date.now()}`,
        type: data.type || 'note',
        summary: data.summary,
        detail: data.detail || '',
        source: data.source || 'user',
        date: new Date().toISOString(),
      };
      qc.setQueryData(accountKeys.detail(data.accountId), (old: any) => {
        if (!old?.activities) return old;
        return { ...old, activities: [tempActivity, ...old.activities] };
      });
      return { previousDetail, accountId: data.accountId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail) {
        qc.setQueryData(accountKeys.detail(context.accountId), context.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: activityKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.detail(vars.accountId) });
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/activities.ts
git commit -m "feat(ux): add optimistic updates to activity mutations (UX-06)"
```

---

### Task 16: Settings Optimistic Updates

**Files:**
- Modify: `src/lib/queries/settings.ts`

- [ ] **Step 1: Add optimistic updates to settings hook**

Replace the full contents of `src/lib/queries/settings.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  agents: () => ['settings', 'agents'] as const,
  integrations: () => ['settings', 'integrations'] as const,
};

export function useTeamQuery() {
  return useQuery({
    queryKey: settingsKeys.team(),
    queryFn: () => api.settings.team(),
    retry: false,
  });
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: settingsKeys.agents(),
    queryFn: () => api.settings.agents(),
  });
}

export function useIntegrationsQuery() {
  return useQuery({
    queryKey: settingsKeys.integrations(),
    queryFn: () => api.settings.integrations(),
  });
}

export function usePatchAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: { status?: string; parameters?: Record<string, string> } }) =>
      api.settings.patchAgent(name, data),
    onMutate: async ({ name, data }) => {
      await qc.cancelQueries({ queryKey: settingsKeys.agents() });
      const previousAgents = qc.getQueryData(settingsKeys.agents());
      qc.setQueryData(settingsKeys.agents(), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((a: any) =>
            a.name === name ? { ...a, ...data } : a,
          ),
        };
      });
      return { previousAgents };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAgents) qc.setQueryData(settingsKeys.agents(), context.previousAgents);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.agents() });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/settings.ts
git commit -m "feat(ux): add optimistic updates to settings mutations (UX-06)"
```

---

### Task 17: Meetings Optimistic Updates

**Files:**
- Modify: `src/lib/queries/meetings.ts`

- [ ] **Step 1: Add optimistic updates to meeting hooks**

Replace the full contents of `src/lib/queries/meetings.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { homeKeys } from './home';

export const meetingKeys = {
  all: ['meetings'] as const,
  list: (date?: string, range?: number) => ['meetings', 'list', date, range] as const,
  detail: (id: string) => ['meetings', id] as const,
};

export function useMeetingsQuery(date?: string, range?: number) {
  return useQuery({
    queryKey: meetingKeys.list(date, range),
    queryFn: () => api.meetings.list({ date, range }),
    placeholderData: keepPreviousData,
  });
}

export function useMeetingDetail(id: string) {
  return useQuery({
    queryKey: meetingKeys.detail(id),
    queryFn: () => api.meetings.detail(id),
    enabled: !!id,
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; date: string; startTime: string; duration?: string; attendees?: string[]; accountId?: string }) =>
      api.meetings.create(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: meetingKeys.all });
      const queries = qc.getQueriesData({ queryKey: meetingKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const tempMeeting = {
        id: `temp-${Date.now()}`,
        title: data.title,
        time: data.startTime,
        dur: data.duration || '30 min',
        date: data.date,
        acc: '',
        accId: data.accountId || '',
        who: data.attendees || [],
        prep: 'draft',
      };
      qc.setQueriesData({ queryKey: meetingKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: [tempMeeting, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: meetingKeys.all });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.meetings.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: meetingKeys.all });
      // Snapshot list queries
      const queries = qc.getQueriesData({ queryKey: meetingKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      // Snapshot detail
      const previousDetail = qc.getQueryData(meetingKeys.detail(id));
      // Update in list
      qc.setQueriesData({ queryKey: meetingKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((m: any) => m.id === id ? { ...m, ...data } : m) };
      });
      // Update in detail
      qc.setQueryData(meetingKeys.detail(id), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: { ...old.data, ...data } };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail) qc.setQueryData(meetingKeys.detail(context.id), context.previousDetail);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: meetingKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: meetingKeys.all });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/meetings.ts
git commit -m "feat(ux): add optimistic updates to meeting mutations (UX-06)"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All existing tests pass

- [ ] **Step 3: Dev server smoke test**

Run: `npm run dev`
Verify: App loads without console errors, navigate between pages

# Wire Settings Page to Real State — Design Spec

> Covers: E2-09, API-08, API-09
> Date: 2026-03-13

## Overview

Replace all hardcoded data in the Settings page with real API-backed state. Implement two new API endpoint groups (agents, integrations), add React Query hooks, and wire the frontend to read/write through them. The team API already exists.

## API-08: Agent Config Endpoints

### `GET /api/settings/agents`

- **Auth**: Any authenticated user (read-only view of agent status is safe for all roles)
- **Behavior**: Returns all `AgentConfig` rows from DB
- **Auto-seed**: If zero rows exist, seeds the 6 default agents before returning:

| name | displayName | description | default status | parameters (JSON) |
|------|-------------|-------------|----------------|-------------------|
| signal_hunter | Signal Hunter | Monitors news, LinkedIn, registries for GoO market signals | active | `{"sources":"Reuters, Bloomberg, LinkedIn, Montel, AIB, ENTSO-E","scan_frequency":"Every 4 hours","min_relevance_threshold":"60/100","auto_dismiss_below":"30/100"}` |
| lead_qualifier | Lead Qualifier | Scores new leads using FIUAC dimensions | active | `{"auto_qualify_threshold":"FIUAC ≥ 70","auto_disqualify":"FIUAC ≤ 25","route_to_queue":"25 < FIUAC < 70"}` |
| account_enricher | Account Enricher | Updates account briefs with new intelligence | active | `{"refresh_cycle":"Weekly","sources":"Signals, email sync, LinkedIn","min_confidence_auto_update":"85%","below_85":"Route to Queue"}` |
| outreach_drafter | Outreach Drafter | Generates personalized outreach using account context | active | `{"always_route_to_queue":"Yes","template_style":"Consultative","personalization_sources":"Pain, WhyNow, Signals","max_sequence_length":"4 steps"}` |
| pipeline_hygiene | Pipeline Hygiene | Monitors deal health and flags stale opportunities | active | `{"stale_threshold":"7 days no activity","auto_decay":"5 pts/week engagement","alert_threshold":"health < 40"}` |
| inbox_classifier | Inbox Classifier | Classifies incoming emails by intent | active | `{"classification_types":"Positive, Question, Objection, Meeting, OOO, New Domain","auto_link_by_domain":"Enabled","new_domain_detection":"Enabled","min_classification_confidence":"70%"}` |

- **Response**: `{ data: AgentConfig[] }`

```ts
// AgentConfig shape from DB
{
  id: string;
  name: string;         // unique key, e.g. "signal_hunter"
  displayName: string;  // e.g. "Signal Hunter"
  description: string;
  status: string;       // "active" | "paused" (PATCH only allows these two; "disabled" reserved for system use)
  parameters: Record<string, string>;  // Prisma stores as Json; API layer casts to flat string map
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### `PATCH /api/settings/agents/[name]`

- **Auth**: Admin only
- **Path param**: `name` — the agent's unique name (e.g. `signal_hunter`). Uses `name` instead of `id` because agent names are stable identifiers meaningful to both humans and code, unlike opaque CUIDs.
- **Body** (all optional):
  ```ts
  {
    status?: "active" | "paused";
    parameters?: Record<string, string>;
  }
  ```
- **Validation**: Zod schema. Returns 404 if agent name not found.
- **Response**: `{ data: AgentConfig }` — the updated row

## API-09: Integrations Endpoint

### `GET /api/settings/integrations`

- **Auth**: Any authenticated user
- **Behavior**: Returns a fixed list of 3 known integrations with status derived from DB:

| Integration | Status logic |
|-------------|-------------|
| Microsoft 365 / Outlook | "Connected" if any `IntegrationToken` with `provider="microsoft"` exists and `expiresAt > now`; else "Disconnected" |
| Calendar Sync | Same check as Microsoft (calendar uses the same OAuth token) |
| LinkedIn (manual) | Always `status: "Manual enrichment"`, `active: false` |

- **Response**:
  ```ts
  {
    data: Array<{
      name: string;       // e.g. "Microsoft 365 / Outlook"
      status: string;     // "Connected" | "Disconnected" | "Manual enrichment"
      active: boolean;
      lastSyncAt: string | null;  // from IntegrationToken.updatedAt (token refresh time; best available proxy until dedicated sync tracking exists)
    }>
  }
  ```

## API Client Updates

Add a `patch()` helper to `api-client.ts` alongside existing `get()` and `post()`:

```ts
async function patch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, extractErrorMessage(err, `API ${path}: ${res.status}`));
  }
  return res.json();
}
```

Add settings namespace:

```ts
settings: {
  team: () => get<any>('/settings/team'),
  agents: () => get<any>('/settings/agents'),
  patchAgent: (name: string, data: { status?: string; parameters?: Record<string, string> }) =>
    patch<any>(`/settings/agents/${name}`, data),
  integrations: () => get<any>('/settings/integrations'),
},
```

## React Query Hooks

New file: `src/lib/queries/settings.ts`

```ts
export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  agents: () => ['settings', 'agents'] as const,
  integrations: () => ['settings', 'integrations'] as const,
};
```

Hooks:
- `useTeamQuery()` — `queryKey: settingsKeys.team()`, calls `api.settings.team()`
- `useAgentsQuery()` — `queryKey: settingsKeys.agents()`, calls `api.settings.agents()`
- `useIntegrationsQuery()` — `queryKey: settingsKeys.integrations()`, calls `api.settings.integrations()`
- `usePatchAgent()` — mutation calling `api.settings.patchAgent()`, invalidates `settingsKeys.agents()`

## Frontend Wiring (E2-09)

### Settings Page Changes

1. **Remove hardcoded data**: Delete the `AGENTS`, `INTEGRATIONS` constants and the `users` array
2. **Add hooks**: Use `useTeamQuery()`, `useAgentsQuery()`, `useIntegrationsQuery()`
3. **Loading states**: Show simple "Loading..." text or skeleton while queries load
4. **Error states**: Show inline error message if a query fails
5. **Team section**: Render from `useTeamQuery()` data, derive initials from name
6. **Agents section**: Render from `useAgentsQuery()` data, show status from DB
7. **Integrations section**: Render from `useIntegrationsQuery()` data

### Agent Drawer Updates

The existing `openAgentConfig()` function renders a drawer with Configure/Pause/Save buttons:

- **Parameters display**: Render from `agent.parameters` object (iterate over key-value pairs)
- **Status display**: Show actual status from DB (`active`/`paused`) with appropriate badge
- **Pause/Resume button**: Calls `patchAgent(name, { status: "paused" })` or `{ status: "active" }`. Label toggles based on current status.
- **Save button**: Currently no editable fields exist in the drawer (params are read-only display). Save button closes the drawer. Editable param fields are out of scope (future AG-01 work).
- **After mutation**: Close drawer, agents query auto-invalidates to reflect new status

### Data Mapping

Team API returns `{ id, name, initials, email, role, color, isActive, createdAt }`. The `User` model already stores `initials` and `color` fields, so the frontend uses them directly — no derivation needed. Update the existing team GET route's `select` clause to include `initials` and `color`.

**Note**: The existing `GET /api/settings/team` requires Admin role. The settings page should handle a 403 gracefully for non-admin users by hiding the Team section or showing a "requires admin" message.

## Files to Create/Modify

### New files:
- `src/app/api/settings/agents/route.ts` — GET handler with auto-seed
- `src/app/api/settings/agents/[name]/route.ts` — PATCH handler
- `src/app/api/settings/integrations/route.ts` — GET handler
- `src/lib/queries/settings.ts` — React Query hooks

### Modified files:
- `src/lib/api-client.ts` — Add `patch()` helper and `settings` namespace
- `src/app/(dashboard)/settings/page.tsx` — Wire to real data

## Error Handling

All API routes follow existing patterns:
- `unauthorized()` for missing session
- `forbidden()` for non-admin on write endpoints
- `notFound()` for unknown agent name
- `zodError()` for invalid PATCH body
- `internalError()` for unexpected failures

## Out of Scope

- Editable parameter fields in the agent drawer (AG-01)
- Integration connect/disconnect actions (I-04)
- Agent cron execution / actual pause behavior (AG-01)
- Team invite UI wiring (separate backlog item)

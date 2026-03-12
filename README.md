# Eco-Insight Revenue OS

AI-assisted Revenue OS for the GoO / renewable certificates / PPA market.
Next.js 15 + React 19 + TypeScript + Tailwind CSS.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Structure

```
src/
├── app/                    # Pages (App Router)
│   ├── page.tsx            # Home — actions, stats, schedule
│   ├── queue/              # Approval Queue
│   ├── signals/            # Market signals
│   ├── leads/              # Lead kanban
│   ├── accounts/[id]/      # Account detail
│   ├── pipeline/[id]/      # Deal detail
│   ├── inbox/              # AI-classified emails
│   ├── tasks/              # Task management
│   └── settings/           # Agents, integrations
├── lib/
│   ├── types.ts            # All types, enums, scoring functions
│   ├── data.ts             # Seed data (mutable in-memory)
│   └── utils.ts            # Formatting helpers
└── components/
    ├── layout/             # Sidebar, TopBar, BottomNav
    └── ui/index.tsx        # Badge, ScorePill, HealthBar, etc.
```

## What's Working

All 10 screens render with real data. Navigation, badges, responsive layout.
Data lives in `src/lib/data.ts` — replace with Prisma when ready.

## Next Steps

1. Add mutations (approve queue, complete tasks, move stages)
2. Build Drawer component for create/edit flows
3. Add Command Palette (⌘K)
4. Wire drag-and-drop on kanban views
5. Add toast notifications
6. Connect to real API using the spec in `eco-insight-api-contract.md`

## Companion Specs

- `eco-insight-types.ts` — Production data model
- `eco-insight-agent-specs.md` — All 6 AI agent specs
- `eco-insight-api-contract.md` — Full REST API contract

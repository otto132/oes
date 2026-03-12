# Eco-Insight Revenue OS

AI-assisted Revenue OS for the GoO / renewable certificates / PPA market.

## Tech Stack

- **Frontend:** Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **State:** Zustand (UI state) + React Query (server state)
- **Backend:** Next.js API Routes + Prisma ORM + PostgreSQL
- **Auth:** NextAuth v5 with Microsoft Entra ID (SSO)
- **Icons:** Lucide React

## Quick Start

```bash
nvm use            # Uses Node version from .nvmrc
npm install        # Also runs prisma generate via postinstall
cp .env.example .env   # Fill in your credentials
npm run db:migrate     # Run database migrations
npm run db:seed        # Seed with demo data
npm run dev            # http://localhost:3000
```

### Environment Variables

See `.env.example` for all required variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AZURE_AD_CLIENT_ID` | Microsoft Entra ID app client ID |
| `AZURE_AD_CLIENT_SECRET` | Microsoft Entra ID app secret |
| `AZURE_AD_TENANT_ID` | Microsoft Entra ID tenant |
| `NEXTAUTH_SECRET` | Session encryption key (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App URL (http://localhost:3000 for dev) |
| `MICROSOFT_CLIENT_ID` | Graph API client ID (for Outlook/Calendar sync) |
| `MICROSOFT_CLIENT_SECRET` | Graph API secret |
| `CRON_SECRET` | Protects `/api/sync` cron endpoint |

## Architecture

```
Browser
  └── Pages (App Router, authenticated via NextAuth middleware)
        └── React Query hooks → api-client.ts
              └── /api/* routes (13 endpoints)
                    └── Prisma → PostgreSQL

UI-only state (theme, drawer, filters) → Zustand
Server data (signals, leads, accounts, ...) → React Query → API → DB
```

### Data Flow

All domain data flows through the API. Prisma enums (e.g., `SolutionFit`) are mapped to UI display strings (e.g., `'Solution Fit'`) via adapters in `src/lib/adapters.ts`.

## Structure

```
src/
├── app/
│   ├── (dashboard)/        # Authenticated route group with shared layout
│   │   ├── page.tsx         # Home — actions, stats, schedule
│   │   ├── queue/           # Approval Queue
│   │   ├── signals/         # Market signals
│   │   ├── leads/           # Lead kanban
│   │   ├── accounts/[id]/   # Account detail
│   │   ├── pipeline/[id]/   # Deal detail
│   │   ├── inbox/           # AI-classified emails
│   │   ├── tasks/           # Task management
│   │   └── settings/        # Agents, integrations
│   ├── login/               # Login page (SSO)
│   └── api/                 # 13+ API route handlers
│       ├── auth/            # NextAuth handler
│       ├── home/            # Dashboard summary
│       ├── queue/           # Approval queue CRUD
│       ├── signals/         # Signal list + actions
│       ├── leads/           # Lead management
│       ├── accounts/        # Account CRUD
│       ├── opportunities/   # Pipeline/deal management
│       ├── inbox/           # Email inbox
│       ├── tasks/           # Task management
│       ├── activities/      # Activity timeline
│       ├── badge-counts/    # Sidebar badge counts
│       ├── search/          # Global search
│       └── sync/            # Microsoft Graph sync (cron)
├── lib/
│   ├── auth.ts              # NextAuth configuration
│   ├── adapters.ts          # Prisma → UI type adapters
│   ├── api-client.ts        # Type-safe fetch wrapper
│   ├── types.ts             # UI type definitions
│   ├── store.ts             # Zustand store (UI state)
│   ├── data.ts              # Seed/mock data
│   ├── utils.ts             # Formatting helpers
│   └── queries/             # React Query hooks
├── components/
│   ├── layout/              # Sidebar, TopBar, BottomNav
│   └── ui/index.tsx         # Badge, ScorePill, HealthBar, etc.
├── middleware.ts             # Auth protection for all routes
└── prisma/
    ├── schema.prisma         # 20+ models, enums, indexes
    └── seed.ts               # Database seeder
```

## Authentication

All routes are protected by NextAuth middleware. Users sign in via Microsoft Entra ID SSO. The session provides user identity for all API operations (no hardcoded user IDs).

## Database

```bash
npm run db:generate   # Regenerate Prisma client
npm run db:migrate    # Run migrations
npm run db:seed       # Seed demo data
npm run db:studio     # Open Prisma Studio GUI
npm run db:reset      # Reset and re-seed (destructive)
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/home` | Dashboard summary |
| GET/POST | `/api/queue` | Approval queue (approve/reject) |
| GET/POST | `/api/signals` | Signals (dismiss/convert) |
| GET/POST | `/api/leads` | Leads (create/advance/convert) |
| GET/POST | `/api/accounts` | Accounts |
| GET/POST | `/api/opportunities` | Pipeline (stage movement) |
| GET | `/api/inbox` | Classified emails |
| GET | `/api/tasks` | Task management |
| GET | `/api/activities` | Activity timeline |
| GET | `/api/badge-counts` | Sidebar badge counts |
| GET | `/api/search` | Global search |
| POST | `/api/sync` | Microsoft Graph sync (cron-protected) |

See `eco-insight-api-contract.md` for the full REST API specification.

## Companion Specs

- `eco-insight-api-contract.md` — Full REST API contract
- `eco-insight-agent-specs.md` — AI agent specifications
- `AUDIT.md` — Production readiness audit
- `BACKLOG.md` — Full production backlog
- `DATABASE.md` — Database setup and schema docs

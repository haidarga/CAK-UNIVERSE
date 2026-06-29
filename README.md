# CAK AI Ecosystem

Multi-agent platform for an AI UGC marketing agency. Manages 30+ social accounts across 5 brands with 6 AI agents wired through a **Central Intelligence Hub (CIH)** — a single Supabase database that is the source of truth for all campaign state.

> Stack: **Next.js 15 (App Router) · TypeScript · Tailwind (Bento Glass) · Supabase · Vercel** — agents run as API routes + Vercel Cron. LLM layer is provider-agnostic (**Claude or Gemini**).

---

## Architecture

```
Client brief
   ↓
Lead Agent ──────────► CIH (Supabase) ◄────────── Account Monitor Agent
   │  KPI reports          ▲   ▲   ▲                 │ warmup phases + anomalies
   ▼                       │   │   │                 ▼
Strategy Agent ── calendar ┘   │   └ scripts ── Script Writer Agent
   │ trends → directions        │                    │
   ▼                            │                    ▼
Creator Agent ── shot params ───┘        Head of Creator Agent (QC)
```

- **CIH** = the `brands`, `accounts`, `content_pipeline`, `hooks`, `kpi_metrics`, `trends`, `agent_logs` tables.
- Each agent reads/writes the same tables; no copy-paste between Docs/Sheets.

## The 6 agents (`src/lib/agents/`)

| Agent | Method | Role |
|-------|--------|------|
| `AccountMonitorAgent` | `runDailyScan(brandId)` | Warmup phase upgrades (deterministic) + anomaly detection. LLM only narrates the alert. |
| `ScriptWriterAgent` | `generateScript(pipelineId)` | Brand-guardrailed script generation. |
| `HeadOfCreatorAgent` | `reviewScript` / `qcVideo` | Script executability + video QC scoring. |
| `CreatorAgent` | `generateProductionParams(pipelineId)` | Script → per-shot CAK AI prompts (Seedance per-shot rule). |
| `StrategyAgent` | `generateCalendar(brandId)` | 30-day content calendar from trends. |
| `LeadAgent` | `generateReport(brandId)` | Markdown KPI report. |

### Key design decisions
- **Warmup phase upgrades are deterministic code** (`src/lib/warmup.ts`), not LLM guesses. The LLM is reserved for fuzzy anomaly narration. Fully unit-tested.
- **LLM is provider-agnostic** (`src/lib/llm.ts`): set `LLM_PROVIDER=anthropic|gemini`, or override per-agent. JSON output goes through a robust `extractJson` (handles fences/prose).
- **No `NOW()` strings** — all timestamps use `nowIso()`.

## Work OS layer (everyone works in one platform)

Beyond the agents, the platform is a **company operating system** — every role works inside it, everything is tracked, AI helps everywhere.

- **Task & progress tracking** (`tasks`, `task_comments`, `activity_log`, `notifications`) — assignment, status, progress %, deadlines, dependencies. Pure rollup logic in `src/lib/progress.ts` (unit-tested).
- **Lead Command Center** (`/team`) — cross-team mission control: completion %, workload per member, bottlenecks, per-brand progress, dev health, live activity feed.
- **My Tasks** (`/tasks`) — kanban + AI task breakdown.
- **Work surfaces** (`/studio/*`): Strategist (trend board + calendar builder), Script Writer (editor + **live guardrail check** + inline AI + hook bank), Creator (shot generator), QC Station.
- **Dev board + problem reporting** (`/dev`) — anyone reports a problem; AI triages severity/area; dev kanban; GitHub-synced issues.
- **Universal AI Assist** (`src/lib/ai-assist.ts`, `POST /api/ai-assist`) — the "✨ enhance" affordance embedded in every tool (provider-agnostic).

## Integration layer (external tools, in one place)

`src/lib/integrations/registry.ts` catalogs connectors; `/integrations` is the hub. Each implements `IntegrationConnector`.

- **GitHub** — real-ish: pulls issues into `dev_issues` (`/api/cron/github-sync`, every 4h).
- **Lightpanda** — headless browser engine (CDP) for trend/account scraping + Social Growth Engineer automation (wiring point ready).
- **Stubs ready to wire**: Google Docs/Sheets/Drive, TikTok, Instagram, YouTube, Social Growth Engineer, Postiz, Analytics. Embedded docs/sheets/videos open in-platform via `embedded_resources`.

## Pages (Bento Glass UI)

**Command:** `/tasks` · `/team` · `/activity` — **Studios:** `/studio/strategy` · `/studio/script` · `/studio/creator` · `/studio/qc` — **Operations:** `/accounts` (warmup monitor) · `/pipeline` · `/scripts` · `/reports` — **Platform:** `/integrations` · `/dev`.

---

## Setup

1. **Install** (this machine's `C:` was full; cache/temp were redirected to `F:` — adjust as needed):
   ```bash
   npm install
   ```
2. **Database**: in the Supabase SQL editor run the migrations in order:
   `001_initial_schema.sql` → `002_work_os.sql` → `003_integrations.sql`.
3. **Env**: copy `.env.example` → `.env.local` and fill in:
   - `ANTHROPIC_API_KEY` (and/or `GEMINI_API_KEY` + `GEMINI_MODEL`)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` (anomaly alerts)
   - `CRON_SECRET` (protects the cron routes)
4. **Seed** demo data (5 brands, 30 accounts, ~420 KPI rows):
   ```bash
   npm run seed
   ```
5. **Run**:
   ```bash
   npm run dev      # http://localhost:3000 → /accounts
   ```

## Scripts

| Command | What |
|---------|------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest (pure logic: warmup, llm, guardrails, utils) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Seed brands + demo data |

## Cron (Vercel)

`vercel.json` schedules: account scan (6h), KPI sync (daily), trend refresh (daily). Each route checks `Authorization: Bearer $CRON_SECRET`. The TikTok RapidAPI + scraper wiring is stubbed with TODO markers in `src/app/api/cron/`.

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` is server-only (`src/lib/supabase.ts admin()`); never import `admin()` into a client component.
- No secrets are committed; `.env*` is gitignored. Rotate any key that was ever pasted in chat.

---

## Auth

Authentication uses **Supabase Auth via `@supabase/ssr`** (cookie-based sessions). This is an **internal tool — there is no public signup.** Accounts are provisioned by an admin.

### How identity works

1. A user signs in at `/login` with email + password (or magic link).
2. A signed-in Supabase auth user maps to a `team_members` row **by email** (case-insensitive).
3. **Role and identity come from that `team_members` row** — `role` drives route access and nav visibility.

### Provisioning a user

1. **Supabase Dashboard → Authentication → Users → Add user** — set their email + a password (or invite them).
2. Ensure a `team_members` row exists with the **same email** and the correct `role` (one of: `lead`, `strategist`, `script_writer`, `creator`, `head_of_creator`, `account_monitor`, `developer`, `admin`). Seed it via migration/seed or insert directly.
3. If the auth user has no matching `team_members` row, the shell renders as **"Guest"** (degraded — they can sign in but have no resolved role).

### Pieces

| File | Role |
|------|------|
| `src/lib/supabase-server.ts` | `createServerSupabase()` — cookie-bound server client (anon key). Next 15 async `cookies()`. |
| `src/lib/supabase-browser.ts` | `createBrowserSupabase()` — browser client for `signInWithPassword` / `signOut`. |
| `src/lib/auth.ts` | `getSessionUser()`, `getCurrentMember()`, `requireMember()` + re-exports `canAccess`. |
| `src/lib/access.ts` | `canAccess(role, path)` — pure role→route policy (no server imports; safe in client bundle). |
| `src/middleware.ts` | Refreshes the session and redirects unauthenticated requests to `/login?next=…`. |
| `src/app/login/page.tsx` | Public login page (glass card). |

### Route protection

- **Public** (no session required): `/login`, `/api/cron/*` (bearer auth), `/auth/*`, and static assets.
- **Protected** (everything else): no session → redirect to `/login?next=<path>`.
- **Cron routes use `CRON_SECRET`, not a session** — Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. They are exempt from the auth middleware on purpose.

### Role → route policy (`canAccess`)

- `lead` & `admin` → everything.
- Everyone (authenticated) → `/tasks`, `/team`, `/activity`.
- `strategist` → + `/studio/strategy`, `/accounts`, `/pipeline`, `/scripts`, `/reports`.
- `script_writer` → + `/studio/script`, `/scripts`.
- `creator` → + `/studio/creator`.
- `head_of_creator` → + `/studio/qc`, `/qc`, `/accounts`, `/pipeline`, `/scripts`, `/reports`.
- `account_monitor` → + `/accounts`, `/pipeline`, `/reports`.
- `developer` → + `/dev`, `/integrations`, `/activity`.

Nav groups are filtered by this policy. The middleware enforces *authentication*; `canAccess` currently drives *nav visibility* (page-level role enforcement can be added via `requireMember()` + `canAccess` in individual server components).

### Local dev without auth

If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **not set**, the middleware logs a warning and lets requests through (so the UI still renders). **Production MUST set these** — the fallback is dev-only.

# CAK AI Ecosystem

An internal operations platform for an AI-powered UGC marketing agency. Every role in the agency — strategist, scriptwriter, creator, QC, account monitor, lead — is a real job, **enhanced, automated, and sped up by AI**. Work that used to take weeks (a content plan, a batch of scripts, a performance decision) happens in hours, with everything wired through one shared brain.

> **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind ("Ethereal Glass" design system) · Supabase (Postgres) · Vercel · LLM is provider-agnostic (**Claude or Gemini**, defaults to Gemini free tier).

---

## What it does

One connected workflow, not a bag of separate features:

```
BRAND  (the foundation — every agent reads this)
  │
  ▼
STRATEGIST ── trend research (TikTok · YouTube · SGE) + SGE Viral Lab ("bisa viral gak + why")
  │            + 30-day content calendar → pushes directions into the pipeline
  ▼
SCRIPT WRITER ── "Jebret AI": one click turns a direction into a full brand-voice script
  │               (guardrail-checked for prohibited claims)
  ▼
CREATOR ── turns the script into a shot-by-shot production plan for the AI video generator
  │
  ▼
HEAD OF CREATOR (QC) ── script executability review + final video QC (hook / brand / visual)
  │
  ▼
ACCOUNT MONITOR ── warmup phases, anomaly detection, Telegram alerts
  │
  ▼
LEAD ── executive reports + a decision-maker that diagnoses problems and decides how to solve them
```

Everything is glued by the **`content_pipeline`** table: each piece of content is a row that moves through stages (`briefed → direction_set → scripted → script_reviewed → qc_passed → posted`), handed off between roles. The shared **Brand** record gives every agent the same voice, guardrails, products, and KPI targets.

---

## Roles, agents & tools

| Role | Agent | What it does | Key tools |
|------|-------|--------------|-----------|
| **Strategist** | `StrategyAgent` | 30-day content calendar from brand + trends | Trend research (TikTok/YouTube/SGE), **SGE Viral Lab** (`viral_check`), `strategy_suggest` |
| **Script Writer** | `ScriptWriterAgent` | "Jebret" — full script in brand voice | guardrails, persona, top hooks, `script_enhance`, `script_hook` |
| **Creator** | `CreatorAgent` | Script → shot-by-shot production plan | video-generation params |
| **Head of Creator** | `HeadOfCreatorAgent` | Script executability + video QC | guardrails, `qc_explain` |
| **Account Monitor** | `AccountMonitorAgent` | Warmup phases + anomaly alerts | KPI metrics, Telegram |
| **Lead** | `LeadAgent` | Executive reports + **decision-maker** | KPI/pipeline aggregation, `DECISION_SYSTEM` |

Shared AI layer: `aiAssist` (provider-agnostic LLM presets — `script_enhance`, `viral_check`, `brand_extract`, `decision`, etc.) + **deterministic guardrails** (regex claim-checking, not the LLM) so brand-unsafe content never ships.

---

## Key surfaces

- **Brands** — create/edit a brand + all its context (voice, pillars, guardrails, approved claims, products, KPI). Or **AI-extract** a brand profile from a pasted brief / Google Doc.
- **Strategy studio** — realtime trend research, **SGE Viral Lab** (collapsible), content calendar, and inline **Docs & Sheets** (paste a Google link → view/edit/sync the whole document right there).
- **Script studio** — content plan → **Jebret AI** (1-click script) or manual editor with inline AI + live guardrail check, plus the same inline Docs & Sheets.
- **QC station, Accounts, Pipeline, Reports** (incl. the Lead decision-maker), **Tasks / Team / Activity**, **Integrations**, **Dev Board**.

Role-based access (`src/lib/access.ts`) gates which surfaces each role sees.

---

## Run it locally

Three services run together (a one-click `START.cmd` on Windows starts all of them):

| Service | Port | Purpose |
|---------|------|---------|
| Next app | 3000 | the platform |
| Scraper sidecar (Python) | 8900 | TikTok + Instagram |
| Headless Chrome (CDP) | 9222 | SGE Pro + Google-doc browser flows |

```bash
# 1. install + env
npm install
cp .env.example .env.local   # fill in the values (see below)

# 2. database
# apply supabase/migrations/*.sql to your Supabase project, then:
npm run seed                 # demo brands, accounts, pipeline, KPIs

# 3. run
npm run dev                  # → http://localhost:3000
# (start the scraper sidecar + a Chrome on :9222 for TikTok/SGE — see scraper-service/README.md / START.cmd)
```

### Environment variables (`.env.local`)
```
LLM_PROVIDER=gemini                 # or anthropic
GEMINI_API_KEY= / ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET= / GOOGLE_REDIRECT_URI=   # Docs/Sheets sync
YOUTUBE_API_KEY=
SCRAPER_SERVICE_URL=  / SCRAPER_SERVICE_TOKEN=                     # → scraper sidecar
LIGHTPANDA_CDP_URL=                                               # → Chrome CDP (e.g. http://127.0.0.1:9222)
TELEGRAM_BOT_TOKEN= / TELEGRAM_ALERT_CHAT_ID=                     # alerts
POSTIZ_API_URL= / POSTIZ_API_KEY=                                # publishing
CRON_SECRET=
```

---

## Deploy to the cloud

See **[DEPLOY.md](DEPLOY.md)** for the full runbook, including a **100% free stack** (Vercel + Supabase + Gemini free tier + a worker box via free Cloudflare Tunnel or Oracle Always-Free). YouTube, Google Docs/Sheets, Brand, Script, QC, Lead, and notifications run on Vercel directly; TikTok/IG/SGE need the worker box.

---

## Project structure

```
src/
  app/(dash)/...        role surfaces (brands, studio/*, accounts, pipeline, reports, …)
  app/api/...           agent triggers + CRUD + research/docs/sge endpoints
  lib/agents/           the six role agents (+ BaseAgent)
  lib/research/         trend-research orchestrator (TikTok/YouTube/SGE/IG)
  lib/integrations/     google (docs/sheets sync), scrapers, telegram, postiz, registry
  components/           studio UI, docs panel, brand manager, lead decisions, …
scraper-service/        Python sidecar (TikTok + Instagram)
supabase/migrations/    schema
tests/                  vitest regression locks (pure lib logic)
```

## Testing
```
npm test          # vitest run
npm run typecheck # tsc --noEmit
```
Regression locks cover pure logic: brand-input sanitization, topic→tag derivation, Google-link detection, prompt sanitization, warmup planning, guardrails, and more.

---

_Internal tool. Single-org trust model — all authenticated members can manage all brands._

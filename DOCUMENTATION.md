# Caketing Ecosystem - Full Documentation

## 1. Overview
**Caketing** is an internal operations platform designed for an AI-powered UGC (User-Generated Content) marketing agency. It is built to completely automate and enhance every step of the content creation lifecycle, from initial research to final video production, by giving each human role an AI agent counterpart.

Work that traditionally takes weeks—such as drafting a 30-day content calendar, writing 30 individual brand-safe scripts, reviewing them against brand guardrails, and getting client feedback—now happens in hours.

## 2. Architecture & Tech Stack
- **Frontend/Backend:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS ("Ethereal Glass" UI)
- **Database:** Supabase (PostgreSQL) with Row-Level Security
- **LLM Engine:** Provider-agnostic, supporting both **Gemini** (default) and **Claude**.
- **Hosting:** Vercel (for the main web app) + Cloudflare Tunnel/Worker box (for scrapers and heavy Chrome CDP tasks).

## 3. End-to-End Pipeline (`content_pipeline`)
The heart of Caketing is a shared database table called `content_pipeline`. Every piece of content (a TikTok video, a Reel) is a row that moves through a rigid set of stages:

1. **`briefed`**: A brand is created or updated. The Brand record acts as the ultimate truth (voice, banned words, products, KPIs). All agents read from this.
2. **`direction_set`**: The Strategist agent creates content pillars and assigns topics based on viral trends.
3. **`scripted`**: The Scriptwriter agent generates a full shot-by-shot script from the topic direction.
4. **`script_reviewed`**: Scripts are edited, synced with client feedback, and evaluated by the QC engine.
5. **`qc_passed`**: Scripts pass all deterministic guardrails (no banned claims, required words present).
6. **`posted`**: Video is produced and published, feeding metrics back to the Lead agent.

## 4. Roles and Agents
Caketing simulates an agency structure where each role is powered by a specific Agent:

| Human Role | AI Agent | Core Responsibilities & Tools |
|---|---|---|
| **Strategist** | `StrategyAgent` | Reads brand briefs, researches TikTok/YouTube trends, runs the **SGE Viral Lab** (predicting if an idea will go viral), and builds a 30-day content calendar. |
| **Script Writer** | `ScriptWriterAgent` | Uses "Jebret AI" (1-click script generation) to write viral, brand-aligned scripts. Automatically applies hooks and persona constraints. |
| **Head of Creator (QC)** | `HeadOfCreatorAgent` | Reviews script executability. Runs deterministic rule-based QC checks to ensure no banned words/claims are made. |
| **Creator** | `CreatorAgent` | Translates the final approved scripts into a shot-by-shot production plan for video generators. |
| **Account Monitor** | `AccountMonitorAgent` | Monitors live account performance, tracks warmup phases, and sends Telegram alerts for anomalies. |
| **Lead** | `LeadAgent` | The executive decision-maker. Aggregates data, diagnoses pipeline bottlenecks, and makes high-level strategy pivots. |

## 5. How the Logic Works (Key Workflows)

### A. The "Jebret AI" (One-Click Scripting)
When a Strategist approves a content direction, the Scriptwriter clicks "Generate". 
1. The backend pulls the **Brand Context** (voice, pillars, guardrails).
2. It pulls the **Persona** assigned to the script.
3. It constructs a massive, highly-specific system prompt and sends it to the LLM.
4. The LLM outputs a strictly formatted JSON array representing hook, body, and CTA blocks.
5. The script is instantly saved to the database.

### B. Intelligent Feedback Sync & Deep Autofix
A major feature for client collaboration is the Google Sheets Sync integration.
1. Clients review scripts in a linked Google Sheet and leave feedback in a specific column.
2. The QC clicks **"Sync Feedback"** in the Caketing UI.
3. The system dynamically locates the correct sheet, matches rows by UUID, and fetches the client's comments.
4. **Deep Autofix**: Before applying the revision, the system checks the database for any **Active QC Blockers** (e.g., the script is missing the required word "schedule").
5. The AI is prompted with both the client's comment AND the QC Blockers, forcing it to rewrite the script to solve both simultaneously.
6. The system auto-runs the deterministic rule-based QC on the new text. If the blockers are gone, the warnings are instantly cleared from the UI.

### C. Deterministic Guardrails
LLMs hallucinate, so Caketing does not rely purely on AI for safety. Before any script reaches the `qc_passed` stage, it runs through `qc-rules.ts`. This engine uses Regex and string matching to enforce:
- No banned words or prohibited claims are present.
- Required brand messaging or persona vocabulary is included.
- The hook is punchy and fits within time limits. 

If a rule is broken, the script is flagged as a **BLOCKER** and cannot proceed until fixed (either manually or via Deep Autofix).

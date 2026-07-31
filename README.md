# Caketing (CAK AI Ecosystem)

Welcome to **Caketing**! This is the core operations platform for our AI-powered UGC marketing agency. It acts as a central hub connecting Strategists, Scriptwriters, Creators, and QC (Quality Control) into one seamless, automated pipeline powered by AI (LLMs like Claude and Gemini).

> **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres) · Vercel

---

## 🌟 Highlight Feature: Deep Autofix & Google Sheets Sync

One of the most powerful features in Caketing is the **Intelligent Feedback Sync Engine** (`sync-feedback`).

When a client reviews a script in Google Sheets and leaves a comment (e.g., *"bikin lebih santai"*), the Scriptwriter doesn't need to manually rewrite it:
1. **Pull Feedback**: Caketing pulls the client's revision comments directly from Google Sheets.
2. **Contextual AI Rewrite**: Caketing's AI engine automatically rewrites the script block to incorporate the client's feedback.
3. **Deep Autofix (QC Integration)**: Before the AI rewrites the script, the system pulls all **active QC blockers** (e.g., missing required persona words like *"jurnal"* or *"schedule"*). It injects these blockers into the AI prompt so the LLM fixes both the client's feedback AND the internal QC errors simultaneously.
4. **Auto QC Re-run**: After the AI generates the new script version, the system automatically re-runs the rule-based QC to verify the blockers were actually fixed, updating the UI instantly without needing a manual refresh.

---

## 🏗️ Architecture & How It Works

The platform uses a role-based workflow driven by the `content_pipeline` table. Content moves through stages: 
`briefed` → `direction_set` → `scripted` → `script_reviewed` → `qc_passed` → `posted`.

### Core Modules
- **Triage Queue (`TriageQueue.tsx`)**: The UI where the Head of Creator / QC reviews scripts, checks for rule-based flags (Blockers/Warnings), and syncs client feedback.
- **Sync Feedback API (`sync-feedback/route.ts`)**: The backend engine responsible for fetching Google Sheets data, matching rows, and executing the Deep Autofix AI revisions.
- **Rule-Based QC (`qc-rules.ts`)**: A deterministic engine that scans scripts for banned words, required persona vocabulary, and structural formatting (so brand-unsafe content never ships).

---

## 🚀 Running Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables (`.env.local`):**
   Copy `.env.example` to `.env.local` and fill in your Supabase and LLM API keys:
   ```env
   LLM_PROVIDER=gemini # or anthropic
   GEMINI_API_KEY=your_api_key
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the app.

---

*Built with ❤️ for internal operations.*

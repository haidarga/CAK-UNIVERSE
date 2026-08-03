# 🚨 CRITICAL AGENT DIRECTIVES & WORKSPACE SAFETY RULES
> **READ THIS BEFORE PERFORMING ANY EDIT, COMMAND, OR GIT OPERATION.**

---

## 1. WORKSPACE DIRECTORY MAP (WHERE IS LIVE?)

| Path | Status | Role & Rules |
|---|---|---|
| **`F:\KERJAAN\CAK AI\caketing`** | 🟢 **ACTIVE / LIVE WORKSPACE** | **THIS IS THE ONLY DIRECTORY TO EDIT & PUSH FROM.**<br>• Repo: `https://github.com/haidarga/CAK-UNIVERSE.git`<br>• Vercel Live: `cakaiuniverseindonesia.vercel.app`<br>• Production Supabase: `https://hrsdzstbizbkrniczizo.supabase.co` |
| **`F:\tmp\cak-v3`** | 🟢 **ACTIVE VIDEO STUDIO** | **CAK Video Studio v3 Repo.**<br>• Production Video Factory & Rendering Engine. |
| **`F:\KERJAAN\CAK AI\cakai-ecosystem`** | 🔴 **STALE / DEAD WORKSPACE** | **DO NOT TOUCH, EDIT, OR PUSH FROM THIS FOLDER.**<br>• Warning: This is an outdated clone that shares the same remote `CAK-UNIVERSE.git`. Pushing from here WILL OVERWRITE & DESTROY live production code! |

---

## 2. STRICT RULES FOR AI AGENTS

1. **NEVER USE `git push --force` or `git push -f`:**
   - Always push using standard `git push origin main`.
   - Never force-push or overwrite remote history under any circumstances.

2. **NEVER RUN DESTRUCTIVE DATABASE COMMANDS:**
   - Do NOT run `supabase db reset`, `supabase migration down`, or any `DROP TABLE` / `TRUNCATE` script on production Supabase (`hrsdzstbizbkrniczizo.supabase.co`).
   - Production table name prefix for scriptwriter is `sw_gen_jobs`, `sw_naskah`, `sw_batches`, etc. (or public view aliases `gen_jobs`, `naskah`).

3. **ALWAYS RUN TESTS & BUILD BEFORE PUSHING:**
   - Run `npx vitest run tests/` (All 129+ unit tests must pass).
   - Run `npm run build` (Next.js build must complete with 0 errors).
   - Only after both pass cleanly, commit and push to `origin main`.

4. **WORK EXCLUSIVELY IN `F:\KERJAAN\CAK AI\caketing`:**
   - Always verify working directory using `pwd` / `Cwd` before executing terminal commands or file edits.

---

## 3. STANDARD DEPLOYMENT FLOW (SOP)

```bash
# Step 1: Check status in caketing
git status

# Step 2: Test & Build
npx vitest run tests/
npm run build

# Step 3: Stage & Commit
git add <modified-files>
git commit -m "feat/fix: descriptive message"

# Step 4: Safe Push to Live Production
git push origin main
# Vercel auto-deploys main branch to cakaiuniverseindonesia.vercel.app
```

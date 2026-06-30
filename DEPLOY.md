# Deploy CAK AI Ecosystem to the cloud

Goal: the team uses ONE URL, everything auto, nobody logs into SGE/TikTok/IG/YouTube again.

---

## ⭐ RECOMMENDED: always-on, 100% free, everything works (all-in-one)

One container runs the Next app + scraper sidecar + headless Chrome together (all on localhost), on a free always-on VM. No Vercel, no tunnel-to-CDP headaches — TikTok, IG, and SGE all work.

**1. Get a free always-on VM.** [Oracle Cloud Always-Free](https://www.oracle.com/cloud/free/) gives a forever-free VM (Ampere ARM, up to 4 vCPU / 24 GB). Pick Ubuntu 22.04. (Any always-on Docker host works.)

**2. On the VM — install Docker + clone:**
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/haidarga/CAK-UNIVERSE.git && cd CAK-UNIVERSE
```

**3. Create the two env files** (copy your local values):
```bash
nano .env.local                 # Supabase, GEMINI_API_KEY, LLM_PROVIDER=gemini, GOOGLE_*, YOUTUBE_API_KEY, TELEGRAM_*, CRON_SECRET, SCRAPER_SERVICE_TOKEN
cp scraper-service/.env.example scraper-service/.env && nano scraper-service/.env   # SERVICE_TOKEN (== SCRAPER_SERVICE_TOKEN), MS_TOKEN, IG_USERNAME/PASSWORD
```

**4. One-time SGE login** (OTP can't run headless): on your laptop run `START.cmd`, complete the SGE login once, then copy the profile to the VM:
```bash
scp -r "F:/chrome-cdp-profile/." ubuntu@<vm-ip>:~/CAK-UNIVERSE/chrome-profile/
```

**5. Launch everything:**
```bash
docker compose up -d --build      # app on :3000, sidecar + Chrome inside the same container
```

**6. Expose it with a free Cloudflare Tunnel** (stable HTTPS URL, no open ports):
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login
cloudflared tunnel create cakai
cloudflared tunnel route dns cakai cakai.<your-domain>        # or use the free trycloudflare quick URL: cloudflared tunnel --url http://localhost:3000
cloudflared tunnel run --url http://localhost:3000 cakai
```

**7. Point Google OAuth at the public URL:** set `GOOGLE_REDIRECT_URI=https://<your-url>/api/integrations/google/callback` in `.env.local`, add the same URL in Google Cloud Console → OAuth → Authorized redirect URIs, then `docker compose up -d` again.

Done — share the URL. Always on, free, everything works. PC can be off.

> Total cost: $0 (Oracle Always-Free VM + Supabase free + Gemini free + Cloudflare Tunnel free).

---

## Reference: the component shape

```
            ┌── Vercel (Next app) ──────────────┐
 team ───►  │  YouTube (API)   Google Docs/Sheets│  ──► Supabase (DB, already cloud)
            │  Claude / Gemini   Postiz  Telegram │
            └──────────────┬─────────────────────┘
                           │  SCRAPER_SERVICE_URL + LIGHTPANDA_CDP_URL
                           ▼
            ┌── Worker box (1 small VPS, ~$5–10/mo) ──┐
            │  scraper sidecar :8900  (TikTok + IG)    │  ◄─ sessions persist here:
            │  headless Chrome :9222  (SGE Pro)        │     msToken, IG login, SGE cookie
            └──────────────────────────────────────────┘
```

**Why a worker box:** Vercel is serverless — it can't run a persistent Chrome or the Python sidecar. TikTok needs Chromium (msToken), IG needs a logged-in instagrapi session, and SGE Pro needs a logged-in Chrome cookie. Putting all three on ONE always-on box means you set the credentials/sessions ONCE and the whole team uses them automatically.

What runs WHERE:
| Source | Where | Auth | Re-login? |
|--------|-------|------|-----------|
| YouTube | Vercel | `YOUTUBE_API_KEY` | never |
| Google Docs/Sheets | Vercel | OAuth (connect once) | never |
| TikTok | worker | `MS_TOKEN` | never |
| Instagram | worker | `IG_USERNAME/PASSWORD` (cached session) | rarely |
| SGE Pro | worker | OTP cookie in chrome-profile | only if cookie expires |

## 1. Supabase (DB)
Already cloud. Apply `supabase/migrations/*.sql`, then `npm run seed` (points at your Supabase via env).

## 2. Vercel (the app)
1. Push this repo to GitHub → "Import Project" on Vercel.
2. Set env vars (Project → Settings → Environment Variables): everything in `.env.local` EXCEPT point these two at the worker box:
   - `SCRAPER_SERVICE_URL = http://<box-ip>:8900`
   - `LIGHTPANDA_CDP_URL  = http://<box-ip>:9222`
   - plus `SCRAPER_SERVICE_TOKEN` (must match the box's `SERVICE_TOKEN`).
3. Deploy. Done — YouTube + Docs + Brand + Script(Jebret) + QC + Lead + notifications work immediately.

## 3. Worker box (TikTok + IG + SGE)
Any Docker host (Hetzner/DigitalOcean VPS, Railway, Fly.io):
```bash
git clone <repo> && cd cakai-ecosystem
cp scraper-service/.env.example scraper-service/.env   # fill MS_TOKEN, IG_USERNAME/PASSWORD, SERVICE_TOKEN, PROXY?
docker compose up -d
```
- `scraper` (:8900) → TikTok + IG. Verify: `curl -H "x-service-token: <token>" http://localhost:8900/health`
- `chrome` (:9222) → SGE Pro. Needs the SGE login cookie ONCE (next step).

### One-time SGE login (cookie transfer)
The SGE Pro cookie can't be obtained headlessly (passwordless OTP). Easiest path:
1. On your laptop, run `START.cmd` and complete the SGE OTP login once (already done locally → cookie is in `F:\chrome-cdp-profile`).
2. Copy that profile to the box's volume:
   ```bash
   scp -r "F:/chrome-cdp-profile/." user@box:/path/cakai-ecosystem/chrome-profile/
   docker compose restart chrome
   ```
3. The headless Chrome on the box now starts already logged in. Re-do only if the cookie expires.

## 4. Lock it down
- Don't expose :8900 / :9222 to the public internet. Use a private network, a firewall allowing only Vercel egress, or a reverse proxy with the `SERVICE_TOKEN`.
- Rotate `SERVICE_TOKEN`, `MS_TOKEN`, and API keys after first setup.

## 💸 100% FREE stack (recommended)

Every layer has a real free tier — the only "cost" is the worker box, which you avoid two ways:

| Layer | Free option |
|-------|-------------|
| App | **Vercel Hobby** (free) |
| DB | **Supabase free** (500MB, plenty for an internal tool) |
| LLM | **Gemini free tier** — set `LLM_PROVIDER=gemini` + `GEMINI_API_KEY` (already wired). No Claude bill. |
| YouTube | API free quota |
| Google Docs/Sheets | free |
| Worker (TikTok/IG/SGE) | pick ONE free option below |

### Worker — free option A: your own PC + free tunnel (zero hosting)
You already run the worker locally via `START.cmd` (sidecar :8900 + Chrome :9222). Expose it to Vercel with a **free Cloudflare Tunnel** (no paid plan, stable URL):
```bash
# one-time: install cloudflared, then
cloudflared tunnel --url http://localhost:8900   # → gives https://xxx.trycloudflare.com
cloudflared tunnel --url http://localhost:9222   # second tunnel for Chrome CDP
```
Set those two HTTPS URLs as `SCRAPER_SERVICE_URL` + `LIGHTPANDA_CDP_URL` in Vercel.
- ✅ Truly free, uses your existing local setup, sessions already logged in.
- ⚠️ Your PC must be on when the team uses TikTok/IG/SGE. Fine for a small team; the app degrades gracefully (those panels just go empty) when it's off.

### Worker — free option B: Oracle Cloud Always Free VM (always-on, no PC)
Oracle gives a genuinely free-forever VM (ARM Ampere, 4 vCPU / 24GB). Run `docker compose up -d` there (this repo's compose file). Always on, no monthly bill. Setup is more involved (Oracle account + ARM image) but it's the proper free cloud worker.

### Free tier honest limits
- Gemini free: rate-limited (fine for a small team; upgrade later if you hit caps).
- Vercel/Supabase free: generous for internal use; watch bandwidth/row limits as you grow.
- Cloudflare quick tunnels rotate URLs on restart — use a **named tunnel** (still free) for a stable URL.

## Paid alternative (nothing to operate)
- TikTok + IG → **RapidAPI** (`RAPIDAPI_KEY` already in env) — fully serverless, no worker.
- SGE Pro → **browserless.io** hosted Chrome.
Costs a bit monthly but zero ops. Ask and we wire the RapidAPI path.

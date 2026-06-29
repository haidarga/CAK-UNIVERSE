# CAK AI — Scraper Service (Python sidecar)

Reliable TikTok + Instagram data for the trend-research feature, wrapping
[TikTok-Api](https://github.com/davidteather/TikTok-Api) and
[instagrapi](https://github.com/subzeroid/instagrapi). The Next.js app calls
this over HTTP (`SCRAPER_SERVICE_URL`). It's **opt-in** — if the app doesn't
have `SCRAPER_SERVICE_URL` set, it falls back to the built-in Chrome scrapers.

## Why a separate service
Both libraries are Python. They hit TikTok's signed JSON API + Instagram's
private mobile API — far more reliable than DOM scraping. Keeping them in a
sidecar lets the TS app stay clean.

## Run (Windows)
```bash
cd scraper-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
copy .env.example .env        # fill the values
uvicorn main:app --port 8900
```

## Configure the Next app (.env.local)
```
SCRAPER_SERVICE_URL=http://127.0.0.1:8900
SCRAPER_SERVICE_TOKEN=<same as SERVICE_TOKEN in scraper-service/.env>
```

## What you need
- **TikTok**: `MS_TOKEN` (cookie `msToken` from tiktok.com). A **residential proxy**
  (`PROXY`) is strongly recommended — TikTok blocks datacenter IPs / bots.
- **Instagram**: `IG_USERNAME` + `IG_PASSWORD` (preferred — the mobile API often
  rejects a browser `sessionid`). Use a **research/burner account**; private-API
  automation carries ban risk. Session is cached to `ig_session.json`.

## Endpoints
- `GET /health`
- `GET /tiktok/trending?count=30`
- `GET /tiktok/hashtag?tag=skincare&count=30`
- `GET /tiktok/search?q=skincare%20lokal&count=30`
- `GET /instagram/hashtag?tag=skincare&amount=20`

All require header `x-service-token: <SERVICE_TOKEN>` when set.

## Deploy (prod)
Vercel can't host this (long-running Python). Put it on Railway / Render / Fly,
set the env vars there, and point the Next app's `SCRAPER_SERVICE_URL` at it.

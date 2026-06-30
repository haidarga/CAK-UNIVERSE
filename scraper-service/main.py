# ============================================================
# CAK AI — Scraper sidecar (Python FastAPI)
# Wraps TikTok-Api (davidteather) + instagrapi (subzeroid) and exposes
# clean JSON the Next.js app consumes for realtime trend research.
#
# Run:
#   cd scraper-service
#   python -m venv .venv && .venv\Scripts\activate   (Windows)
#   pip install -r requirements.txt
#   python -m playwright install chromium
#   copy .env.example .env   (fill MS_TOKEN / IG creds / PROXY)
#   uvicorn main:app --port 8900
#
# Then in the Next app .env.local:
#   SCRAPER_SERVICE_URL=http://127.0.0.1:8900
#   SCRAPER_SERVICE_TOKEN=<same as SERVICE_TOKEN below>
# ============================================================
import os
import asyncio
from contextlib import suppress
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query

load_dotenv()

MS_TOKEN = os.getenv("MS_TOKEN", "")
IG_USERNAME = os.getenv("IG_USERNAME", "")
IG_PASSWORD = os.getenv("IG_PASSWORD", "")
IG_SESSIONID = os.getenv("IG_SESSIONID", "")
PROXY = os.getenv("PROXY", "")  # e.g. http://user:pass@host:port
SERVICE_TOKEN = os.getenv("SERVICE_TOKEN", "")  # shared secret with the Next app

app = FastAPI(title="CAK AI Scraper Service")


def _auth(token: str | None) -> None:
    # Fail CLOSED: an unset SERVICE_TOKEN must reject every request, not allow
    # all of them (an empty .env on the worker box must not open the sidecar).
    if not SERVICE_TOKEN or token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


# ---------------- TikTok ----------------
async def _tiktok(fetch) -> list[dict[str, Any]]:
    """Spin a TikTok session, run `fetch(api)`, always close. Returns items."""
    from TikTokApi import TikTokApi

    items: list[dict[str, Any]] = []
    async with TikTokApi() as api:
        await api.create_sessions(
            ms_tokens=[MS_TOKEN] if MS_TOKEN else None,
            num_sessions=1,
            sleep_after=3,
            browser=os.getenv("TIKTOK_BROWSER", "chromium"),
            proxies=[PROXY] if PROXY else None,
        )
        async for v in fetch(api):
            d = v.as_dict
            stats = d.get("stats") or d.get("statsV2") or {}
            author = d.get("author") or {}
            vid = d.get("id") or d.get("video", {}).get("id") or ""
            uname = author.get("uniqueId") or ""
            items.append(
                {
                    "platform": "tiktok",
                    "url": f"https://www.tiktok.com/@{uname}/video/{vid}" if vid else "",
                    "title": (d.get("desc") or "")[:300],
                    "thumbnail": (d.get("video") or {}).get("cover"),
                    "views": int(stats.get("playCount") or stats.get("playCountStr") or 0),
                    "likes": int(stats.get("diggCount") or 0),
                    "comments": int(stats.get("commentCount") or 0),
                    "author": uname,
                }
            )
    return items


@app.get("/tiktok/trending")
async def tiktok_trending(count: int = Query(30, le=50), x_service_token: str | None = Header(None)):
    _auth(x_service_token)
    try:
        items = await _tiktok(lambda api: api.trending.videos(count=count))
        return {"ok": True, "items": items}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "items": [], "error": str(e)}


@app.get("/tiktok/hashtag")
async def tiktok_hashtag(tag: str, count: int = Query(30, le=50), x_service_token: str | None = Header(None)):
    _auth(x_service_token)
    try:
        items = await _tiktok(lambda api: api.hashtag(name=tag).videos(count=count))
        return {"ok": True, "items": items}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "items": [], "error": str(e)}


@app.get("/tiktok/search")
async def tiktok_search(q: str, count: int = Query(30, le=50), x_service_token: str | None = Header(None)):
    _auth(x_service_token)
    # TikTok-Api v7 has no stable video search; map the query to a hashtag
    # (the reliable path). "skincare lokal" -> "skincarelokal".
    import re

    tag = re.sub(r"[^a-z0-9]", "", q.lower()) or q.lower().replace(" ", "")
    try:
        items = await _tiktok(lambda api: api.hashtag(name=tag).videos(count=count))
        return {"ok": True, "items": items, "via": f"hashtag:{tag}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "items": [], "error": str(e)}


# ---------------- Instagram (instagrapi, sync → threadpool) ----------------
_ig_client = None


def _ig():
    global _ig_client
    if _ig_client is not None:
        return _ig_client
    from instagrapi import Client

    cl = Client()
    if PROXY:
        cl.set_proxy(PROXY)
    settings_path = os.getenv("IG_SETTINGS", "ig_session.json")
    with suppress(Exception):
        if os.path.exists(settings_path):
            cl.load_settings(settings_path)
    if IG_USERNAME and IG_PASSWORD:
        cl.login(IG_USERNAME, IG_PASSWORD)
    elif IG_SESSIONID:
        cl.login_by_sessionid(IG_SESSIONID)
    else:
        raise RuntimeError("set IG_USERNAME/IG_PASSWORD (preferred) or IG_SESSIONID")
    with suppress(Exception):
        cl.dump_settings(settings_path)
    _ig_client = cl
    return cl


def _ig_medias(medias) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in medias:
        code = getattr(m, "code", "")
        out.append(
            {
                "platform": "instagram",
                "url": f"https://www.instagram.com/p/{code}/" if code else "",
                "title": (getattr(m, "caption_text", "") or "")[:300],
                "thumbnail": str(getattr(m, "thumbnail_url", "") or ""),
                "views": int(getattr(m, "play_count", 0) or getattr(m, "view_count", 0) or 0),
                "likes": int(getattr(m, "like_count", 0) or 0),
                "comments": int(getattr(m, "comment_count", 0) or 0),
            }
        )
    return out


@app.get("/instagram/hashtag")
async def instagram_hashtag(tag: str, amount: int = Query(20, le=50), x_service_token: str | None = Header(None)):
    _auth(x_service_token)
    try:
        medias = await asyncio.to_thread(lambda: _ig().hashtag_medias_top(tag, amount=amount))
        return {"ok": True, "items": _ig_medias(medias)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "items": [], "error": str(e)}


@app.get("/health")
async def health():
    return {
        "ok": True,
        "tiktok_configured": bool(MS_TOKEN),
        "ig_configured": bool((IG_USERNAME and IG_PASSWORD) or IG_SESSIONID),
        "proxy": bool(PROXY),
    }

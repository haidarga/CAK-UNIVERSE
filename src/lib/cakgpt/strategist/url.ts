import type { Platform } from '@/lib/cakgpt/strategist/types'

// Parse + VALIDATE a user-pasted TikTok/Instagram URL into { platform, handle }.
//
// This is a security boundary, not just a convenience parser: the input is an
// arbitrary user-supplied URL. We never fetch it directly — the scraper adapter
// is called with the extracted handle, not the raw URL — but we still hard-gate
// on a host allowlist so nothing but tiktok.com / instagram.com can flow deeper
// (defense-in-depth against SSRF and against garbage handles reaching the
// paid/quota'd scraper). Anything that isn't clearly one of those two account
// URLs is rejected with a plain-language reason.

export type ParsedAccountUrl =
  | { ok: true; platform: Platform; handle: string; normalizedUrl: string }
  | { ok: false; error: string }

// Hosts we accept, matched as exact host or subdomain (www.tiktok.com etc.).
const ALLOWED_HOSTS: Record<string, Platform> = {
  'tiktok.com': 'tiktok',
  'instagram.com': 'instagram',
}

// Instagram path segments that are NOT usernames — a link to one of these is a
// post/reel/feature, not an account, so we can't derive an account handle.
const IG_RESERVED = new Set([
  'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'directs',
  'direct', 'about', 'developer', 'legal', 'privacy', 'session',
])

const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/

function matchAllowedHost(hostname: string): Platform | null {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  for (const [allowed, platform] of Object.entries(ALLOWED_HOSTS)) {
    if (host === allowed || host.endsWith('.' + allowed)) return platform
  }
  return null
}

export function parseAccountUrl(input: string): ParsedAccountUrl {
  const raw = (input || '').trim()
  if (!raw) return { ok: false, error: 'Link kosong — paste link akun TikTok atau Instagram.' }

  // Tolerate a pasted bare handle/URL without a scheme (e.g. "tiktok.com/@x").
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: 'Format link nggak valid.' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Cuma link http/https yang didukung.' }
  }

  const platform = matchAllowedHost(url.hostname)
  if (!platform) {
    return { ok: false, error: 'Cuma link tiktok.com atau instagram.com yang didukung.' }
  }

  const segments = url.pathname.split('/').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) {
    return { ok: false, error: 'Link ini nggak nunjuk ke akun tertentu.' }
  }

  let handle: string
  if (platform === 'tiktok') {
    // tiktok.com/@handle  |  tiktok.com/@handle/video/123
    const first = segments[0]
    if (!first.startsWith('@')) {
      return { ok: false, error: 'Link TikTok harus ke profil akun, contoh: tiktok.com/@namaakun' }
    }
    handle = first.slice(1)
  } else {
    // instagram.com/handle  |  instagram.com/handle/ (reject /p/, /reel/, etc.)
    const first = segments[0].toLowerCase()
    if (IG_RESERVED.has(first)) {
      return { ok: false, error: 'Link ini ke post/reel, bukan profil akun. Paste link profil-nya.' }
    }
    handle = segments[0]
  }

  handle = handle.replace(/^@/, '').toLowerCase()
  if (!HANDLE_RE.test(handle)) {
    return { ok: false, error: 'Username akun nggak kebaca dari link.' }
  }

  const normalizedUrl =
    platform === 'tiktok'
      ? `https://www.tiktok.com/@${handle}`
      : `https://www.instagram.com/${handle}`

  return { ok: true, platform, handle, normalizedUrl }
}

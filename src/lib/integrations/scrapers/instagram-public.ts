// Follower/post counts straight off Instagram's own public profile page.
//
// A last-resort SUPPLEMENT, not a provider. Zapi's Instagram profile endpoint
// returns followerCount 0 for smaller accounts (confirmed across several: large
// verified accounts read fine, small ones come back zeroed) and the RapidAPI
// fallback answers 403. Meanwhile Instagram itself publishes the numbers in the
// page's own og:description meta tag:
//
//   "2,658 Followers, 35 Following, 380 Posts - See Instagram photos and ..."
//
// Public page, public metadata, no auth and no key. Used ONLY to fill a count
// the real provider failed to read — never to replace the post data, which the
// providers return correctly.
//
// Honest caveat: Instagram rate-limits and sometimes blocks datacenter IPs, so
// this can fail on Vercel even when it works locally. Every call is therefore
// best-effort on a short timeout, and a failure simply leaves the count
// unreadable rather than failing the request.

const TIMEOUT_MS = 8_000

export type PublicCounts = { followers: number | null; posts: number | null }

// "2,658 Followers, 35 Following, 380 Posts - ..." and the k/m shorthand
// Instagram uses on larger accounts ("1.2M Followers").
const FOLLOWERS_RE = /([\d.,]+\s*[KMkm]?)\s*Followers/i
const POSTS_RE = /([\d.,]+\s*[KMkm]?)\s*Posts/i

/** "2,658" -> 2658 · "1.2M" -> 1200000 · "12.5K" -> 12500 */
export function parseCount(raw: string | undefined | null): number | null {
  const s = (raw || '').trim()
  if (!s) return null
  const m = s.match(/^([\d.,]+)\s*([KMkm]?)$/)
  if (!m) return null
  const suffix = m[2].toUpperCase()
  // Without a suffix the separators are thousands grouping ("2,658", "2.658").
  // With one, the dot is a decimal point ("1.2M").
  const numeric = suffix ? m[1].replace(/,/g, '') : m[1].replace(/[.,]/g, '')
  const value = Number(numeric)
  if (!Number.isFinite(value)) return null
  return Math.round(value * (suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1))
}

export function parseCountsFromHtml(html: string): PublicCounts {
  const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    // Attribute order varies between Instagram's server-rendered variants.
    ?? html.match(/<meta[^>]+content=["']([^"']*Followers[^"']*)["'][^>]*property=["']og:description["']/i)?.[1]
  if (!og) return { followers: null, posts: null }
  return {
    followers: parseCount(og.match(FOLLOWERS_RE)?.[1]),
    posts: parseCount(og.match(POSTS_RE)?.[1]),
  }
}

export async function fetchInstagramPublicCounts(handle: string): Promise<PublicCounts> {
  const clean = (handle || '').replace(/^@/, '').trim()
  if (!clean) return { followers: null, posts: null }
  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(clean)}/`, {
      headers: {
        // Instagram serves the meta tags to crawlers; a browser UA gets the
        // login-walled shell instead.
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { followers: null, posts: null }
    return parseCountsFromHtml(await res.text())
  } catch {
    return { followers: null, posts: null }
  }
}

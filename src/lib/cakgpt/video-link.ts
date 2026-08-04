// Resolve a pasted social video link into something the Content Translator can
// analyse.
//
// Two very different routes, decided by platform — verified live before this
// was written:
//
//   YouTube            -> no download at all. Gemini accepts a YouTube URL
//                         directly as video input (fileData.fileUri), so the
//                         link is handed straight to the model. Fastest path
//                         and it costs no Zapi quota or Storage.
//   TikTok / Instagram -> Zapi post/:id returns a direct CDN URL for the media
//                         (TikTok `play` is the WATERMARK-FREE render), which
//                         we fetch and feed to the existing Files API pipeline.
//
// Zapi also returns caption, likes, views and comment count, which the caller
// folds into the analysis note — a direction backed by real performance data
// beats one guessed from visuals alone.
import { fetchTikTokPost, fetchInstagramPost, zapiConfigured } from '@/lib/integrations/scrapers/zapi'

export type VideoPlatform = 'youtube' | 'tiktok' | 'instagram'

export type ResolvedVideoLink =
  // Handed to Gemini as a URL — nothing is downloaded.
  | { kind: 'gemini_uri'; platform: 'youtube'; uri: string; stats?: VideoStats }
  // A direct media URL for us to fetch.
  | { kind: 'media_url'; platform: 'tiktok' | 'instagram'; url: string; mimeType: string; stats?: VideoStats }

export type VideoStats = {
  caption?: string | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  author?: string | null
}

export class VideoLinkError extends Error {}

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i
const TIKTOK_ID_RE = /tiktok\.com\/(?:@[^/]+\/)?(?:video|photo)\/(\d+)/i
const TIKTOK_SHORT_RE = /(?:vt|vm)\.tiktok\.com\/([A-Za-z0-9]+)/i
const INSTAGRAM_RE = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i

export function detectVideoPlatform(url: string): VideoPlatform | null {
  const u = (url || '').trim()
  if (!u) return null
  if (YOUTUBE_RE.test(u)) return 'youtube'
  if (TIKTOK_ID_RE.test(u) || TIKTOK_SHORT_RE.test(u)) return 'tiktok'
  if (INSTAGRAM_RE.test(u)) return 'instagram'
  return null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function statsFrom(raw: Record<string, unknown>): VideoStats {
  const author = raw.author
  return {
    caption: str(raw.title) || str(raw.caption) || str(raw.desc),
    views: num(raw.playCount) ?? num(raw.viewCount),
    likes: num(raw.diggCount) ?? num(raw.likeCount),
    comments: num(raw.commentCount),
    author: str(author) || (author && typeof author === 'object' ? str((author as Record<string, unknown>).uniqueId) || str((author as Record<string, unknown>).username) : null),
  }
}

/**
 * Turns a pasted link into either a Gemini-readable URI or a direct media URL.
 *
 * Throws VideoLinkError with a message meant for the operator — an unsupported
 * link or a private post is an ordinary thing to paste, not a bug.
 */
export async function resolveVideoLink(rawUrl: string): Promise<ResolvedVideoLink> {
  const url = (rawUrl || '').trim()
  const platform = detectVideoPlatform(url)
  if (!platform) {
    throw new VideoLinkError('Link-nya gak dikenali. Dukungannya: YouTube, TikTok, Instagram.')
  }

  // YouTube: Gemini reads the URL itself, so there is nothing to resolve.
  if (platform === 'youtube') {
    return { kind: 'gemini_uri', platform, uri: url }
  }

  if (!zapiConfigured()) {
    throw new VideoLinkError('ZAPI_KEY belum di-set — dibutuhin buat narik video TikTok/Instagram.')
  }

  if (platform === 'tiktok') {
    // Zapi accepts the full URL as the :id param, so a short vt.tiktok.com link
    // resolves without us having to follow the redirect ourselves.
    const raw = await fetchTikTokPost(url) as Record<string, unknown>
    // `play` is the watermark-free render; `wmplay` still carries the TikTok
    // overlay, which would end up described as part of the creative.
    const media = str(raw?.play) || str(raw?.hdplay) || str(raw?.wmplay)
    if (!media) throw new VideoLinkError('Video TikTok-nya gak bisa diambil — mungkin private atau udah dihapus.')
    return { kind: 'media_url', platform, url: media, mimeType: 'video/mp4', stats: statsFrom(raw) }
  }

  const code = url.match(INSTAGRAM_RE)?.[1]
  const raw = await fetchInstagramPost(code || url) as Record<string, unknown>
  const video = str(raw?.video)
  const image = str(raw?.image)
  if (!video && !image) {
    throw new VideoLinkError('Postingan Instagram-nya gak bisa diambil — mungkin private atau udah dihapus.')
  }
  return {
    kind: 'media_url',
    platform,
    // A photo/carousel post is still worth translating — the still frame
    // carries the composition and on-screen text.
    url: video || image!,
    mimeType: video ? 'video/mp4' : 'image/jpeg',
    stats: statsFrom(raw),
  }
}

const MAX_MEDIA_BYTES = 45 * 1024 * 1024 // matches MAX_VIDEO_UPLOAD_BYTES

/**
 * Downloads resolved media. Size-capped BEFORE buffering so a long video cannot
 * exhaust the function's memory, and capped again while reading because a CDN
 * may omit content-length.
 */
export async function downloadMedia(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new VideoLinkError(`Gagal download media (HTTP ${res.status}).`)

  const declared = Number(res.headers.get('content-length') || 0)
  if (declared > MAX_MEDIA_BYTES) {
    throw new VideoLinkError(`Videonya kegedean (${(declared / 1024 / 1024).toFixed(1)} MB, maks ${MAX_MEDIA_BYTES / 1024 / 1024} MB).`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MAX_MEDIA_BYTES) {
    throw new VideoLinkError(`Videonya kegedean (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB, maks ${MAX_MEDIA_BYTES / 1024 / 1024} MB).`)
  }
  return buf
}

/** Performance context folded into the analysis note, when Zapi supplied it. */
export function statsNote(stats: VideoStats | undefined): string {
  if (!stats) return ''
  const parts = [
    stats.author ? `Creator: @${stats.author}` : '',
    stats.views != null ? `${stats.views.toLocaleString('id-ID')} views` : '',
    stats.likes != null ? `${stats.likes.toLocaleString('id-ID')} likes` : '',
    stats.comments != null ? `${stats.comments.toLocaleString('id-ID')} komentar` : '',
  ].filter(Boolean)
  const caption = stats.caption ? `\nCaption asli: ${stats.caption.slice(0, 500)}` : ''
  if (parts.length === 0 && !caption) return ''
  return `\n\nData performa asli video ini: ${parts.join(' · ')}.${caption}`
}

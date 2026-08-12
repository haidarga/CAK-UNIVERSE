// Shared, provider-agnostic normalization for Strategist Mode.
//
// Extracted from the RapidAPI adapter when Zapi was added: both providers face
// the same problem (vendor JSON shapes differ and change without notice), and
// keeping two copies of the candidate-path lists guaranteed they would drift —
// a field added for one provider silently missing from the other.
//
// Every field is pulled defensively across several candidate paths. If a new
// provider's JSON differs, widen the lists HERE and both adapters gain it.
import type { Platform, ScrapedAccount, ScrapedPost } from '@/lib/cakgpt/strategist/types'
import { ScraperError } from '@/lib/cakgpt/strategist/errors'

export function pull(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = obj
    let ok = true
    for (const seg of path.split('.')) {
      if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[seg]
      } else {
        ok = false
        break
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur
  }
  return undefined
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// Providers report verification as true | "true" | 1 — normalize them all.
export function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === 'true' || v === '1'
}

export function toIso(v: unknown): string | null {
  const n = num(v)
  if (n !== null && n > 0) {
    // Heuristic: 13-digit = ms epoch, else seconds.
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const s = str(v)
  if (s) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

export function normalizePosts(raw: unknown): ScrapedPost[] {
  const list = pull(raw, [
    'data.videos', 'videos', // tiktok-scraper7
    'data.items', 'items', 'result.items', 'result', // instagram120 variants
    'data.data.items', 'data.posts', 'posts', 'aweme_list',
    'data.user.edge_owner_to_timeline_media.edges', 'edges', // IG GraphQL
    // Zapi returns a bare array for posts, or wraps it under data/list.
    'list', 'data.list',
  ]) as unknown[]
  // A bare top-level array is itself the post list — checked after `pull` so a
  // wrapped shape still wins, and before bailing out so Zapi's flat array works.
  const entries = Array.isArray(list) ? list : Array.isArray(raw) ? raw : null
  if (!entries) return []
  return entries
    .map((entry): ScrapedPost | null => {
      // IG GraphQL wraps each post in { node: {...} } — unwrap it.
      const item =
        entry && typeof entry === 'object' && 'node' in (entry as Record<string, unknown>)
          ? (entry as Record<string, unknown>).node
          : entry
      const likes = num(pull(item, [
        'digg_count', 'like_count', 'likes', 'statistics.digg_count',
        'edge_liked_by.count', 'edge_media_preview_like.count',
        // Zapi mirrors TikTok's own camelCase web fields.
        'diggCount', 'likeCount', 'stats.diggCount',
      ]))
      const comments = num(pull(item, [
        'comment_count', 'comments', 'statistics.comment_count', 'edge_media_to_comment.count',
        'commentCount', 'stats.commentCount',
      ]))
      if (likes === null && comments === null) return null
      return {
        id: str(pull(item, ['id', 'aweme_id', 'pk', 'video_id', 'shortcode', 'code', 'videoId', 'postId'])),
        views: num(pull(item, [
          'play_count', 'view_count', 'views', 'statistics.play_count', 'video_view_count', 'ig_play_count',
          'playCount', 'viewCount', 'stats.playCount',
        ])),
        likes,
        comments,
        shares: num(pull(item, [
          'share_count', 'shares', 'statistics.share_count', 'reshare_count',
          'shareCount', 'stats.shareCount',
        ])),
        saves: num(pull(item, ['collect_count', 'save_count', 'saved', 'collectCount', 'stats.collectCount'])),
        isVideo: (() => {
          const v = pull(item, ['isVideo', 'is_video'])
          if (typeof v === 'boolean') return v
          // No explicit flag: a play count is the reliable tell — Instagram
          // photos never carry one.
          const plays = num(pull(item, ['playCount', 'play_count', 'video_view_count']))
          return plays === null ? null : plays > 0
        })(),
        takenAt: toIso(pull(item, [
          'create_time', 'created_at', 'taken_at', 'taken_at_timestamp', 'timestamp', 'device_timestamp',
          'createTime', 'takenAt',
        ])),
        caption: str(pull(item, [
          'desc', 'caption', 'title', 'caption.text', 'edge_media_to_caption.edges.0.node.text',
          'description', 'shareDescription',
        ])),
      }
    })
    .filter((p): p is ScrapedPost => p !== null)
}

export function normalizeAccount(
  platform: Platform,
  handle: string,
  accountRaw: unknown,
  postsRaw: unknown,
  provider: string,
): ScrapedAccount {
  const followers = num(
    pull(accountRaw, [
      'data.stats.followerCount', 'stats.followerCount', // tiktok-scraper7
      'follower_count', 'data.follower_count',
      'edge_followed_by.count', 'user.edge_followed_by.count', 'data.user.edge_followed_by.count',
      'result.user.edge_followed_by.count', 'graphql.user.edge_followed_by.count', // IG variants
      'usersCount', 'data.usersCount', 'followers',
      // Zapi returns these flat at the top level.
      'followerCount', 'data.followerCount', 'followersCount',
    ]),
  )
  if (followers === null) {
    throw new ScraperError('Data akun nggak kebaca — kemungkinan akun privat, nggak ada, atau format response provider berbeda.')
  }
  return {
    platform,
    handle,
    displayName: str(pull(accountRaw, [
      'data.user.nickname', 'user.nickname', 'nickname', 'full_name', 'data.full_name',
      'data.user.full_name', 'result.user.full_name', 'user.full_name', 'name', 'screenName',
      'fullName', 'data.nickname', // Zapi: TikTok=nickname, Instagram=fullName
    ])),
    bio: str(pull(accountRaw, [
      'data.user.signature', 'user.signature', 'signature', 'biography', 'data.biography',
      'data.user.biography', 'result.user.biography', 'user.biography', 'description',
      'data.signature', 'bio', // Zapi Instagram uses `biography`, already listed above
    ])),
    followers,
    following: num(pull(accountRaw, [
      'data.stats.followingCount', 'following_count', 'edge_follow.count', 'user.edge_follow.count',
      'followingCount', 'data.followingCount',
    ])),
    totalPosts: num(pull(accountRaw, [
      'data.stats.videoCount', 'media_count', 'edge_owner_to_timeline_media.count',
      'data.user.edge_owner_to_timeline_media.count', 'result.user.edge_owner_to_timeline_media.count', 'aweme_count',
      'videoCount', 'data.videoCount', 'postCount', 'mediaCount', // Zapi: TikTok=videoCount, Instagram=postCount
    ])),
    verified: truthy(pull(accountRaw, [
      'data.user.verified', 'is_verified', 'verified', 'data.user.is_verified',
      'user.is_verified', 'result.user.is_verified', 'data.verified', 'isVerified',
    ])),
    avatarUrl: str(pull(accountRaw, [
      'data.user.avatarLarger', 'profile_pic_url_hd', 'profile_pic_url', 'avatar_url',
      'data.user.profile_pic_url', 'result.user.profile_pic_url', 'hd_profile_pic_url_info.url', 'image',
      'avatarLarger', 'avatarMedium', 'avatarThumb', 'data.avatarLarger', 'profilePicUrl',
      'avatar', // Zapi Instagram
    ])),
    recentPosts: normalizePosts(postsRaw),
    scrapedAt: new Date().toISOString(),
    provider,
  }
}

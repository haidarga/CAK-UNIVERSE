import { describe, it, expect, vi, afterEach } from 'vitest'
import { detectVideoPlatform, resolveVideoLink, statsNote, VideoLinkError } from '@/lib/cakgpt/video-link'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('detectVideoPlatform', () => {
  it('recognises every YouTube URL shape', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      'https://youtu.be/jNQXAC9IVRw',
      'https://www.youtube.com/shorts/abc123XYZ',
      'https://www.youtube.com/embed/abc123XYZ',
    ]) expect(detectVideoPlatform(u)).toBe('youtube')
  })

  it('recognises TikTok long and short links', () => {
    expect(detectVideoPlatform('https://www.tiktok.com/@mrbeast/video/7534')).toBe('tiktok')
    expect(detectVideoPlatform('https://www.tiktok.com/@x/photo/7534')).toBe('tiktok')
    expect(detectVideoPlatform('https://vt.tiktok.com/ZSabc123/')).toBe('tiktok')
  })

  it('recognises Instagram posts and reels', () => {
    expect(detectVideoPlatform('https://www.instagram.com/reel/DblswrEy-OK/')).toBe('instagram')
    expect(detectVideoPlatform('https://www.instagram.com/p/DblswrEy-OK/')).toBe('instagram')
  })

  it('returns null for anything else', () => {
    expect(detectVideoPlatform('https://example.com/video.mp4')).toBeNull()
    expect(detectVideoPlatform('')).toBeNull()
    // An Instagram PROFILE is not a post — resolving it would 404 downstream.
    expect(detectVideoPlatform('https://www.instagram.com/instagram/')).toBeNull()
  })
})

describe('resolveVideoLink', () => {
  it('hands a YouTube URL straight to Gemini without downloading', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const r = await resolveVideoLink('https://youtu.be/jNQXAC9IVRw')
    expect(r).toMatchObject({ kind: 'gemini_uri', platform: 'youtube' })
    // The whole point of this path: no Zapi call, no media fetch.
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects an unsupported link with an operator-facing message', async () => {
    await expect(resolveVideoLink('https://example.com/x')).rejects.toBeInstanceOf(VideoLinkError)
  })

  it('says what is missing when Zapi is not configured', async () => {
    vi.stubEnv('ZAPI_KEY', '')
    await expect(resolveVideoLink('https://www.tiktok.com/@x/video/1')).rejects.toThrow(/ZAPI_KEY/)
  })

  function stubZapi(payload: unknown) {
    vi.stubEnv('ZAPI_KEY', 'zpi_test')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ project: 'p', timestamp: 't', data: payload }),
    })))
  }

  it('prefers the watermark-free TikTok render', async () => {
    // wmplay carries the TikTok overlay, which the model would otherwise
    // describe as part of the creative.
    stubZapi({ play: 'https://cdn/clean.mp4', wmplay: 'https://cdn/watermarked.mp4', playCount: 100 })
    const r = await resolveVideoLink('https://www.tiktok.com/@x/video/1')
    expect(r).toMatchObject({ kind: 'media_url', platform: 'tiktok', url: 'https://cdn/clean.mp4', mimeType: 'video/mp4' })
  })

  it('falls back to the watermarked render only when nothing else exists', async () => {
    stubZapi({ wmplay: 'https://cdn/watermarked.mp4' })
    const r = await resolveVideoLink('https://www.tiktok.com/@x/video/1')
    expect(r).toMatchObject({ url: 'https://cdn/watermarked.mp4' })
  })

  it('carries the real engagement numbers through', async () => {
    stubZapi({ play: 'https://cdn/a.mp4', playCount: 79296352, diggCount: 15046228, commentCount: 510463, title: 'Btw this dance' })
    const r = await resolveVideoLink('https://www.tiktok.com/@x/video/1')
    expect(r.stats).toMatchObject({ views: 79296352, likes: 15046228, comments: 510463, caption: 'Btw this dance' })
  })

  it('takes the Instagram video when the post has one', async () => {
    stubZapi({ video: 'https://cdn/v.mp4', image: 'https://cdn/i.jpg', likeCount: 5 })
    const r = await resolveVideoLink('https://www.instagram.com/reel/ABC/')
    expect(r).toMatchObject({ url: 'https://cdn/v.mp4', mimeType: 'video/mp4' })
  })

  it('falls back to the still image for a photo post', async () => {
    // A carousel or photo post still carries composition and on-screen text
    // worth translating, so it is analysed as an image rather than rejected.
    stubZapi({ image: 'https://cdn/i.jpg', isVideo: false })
    const r = await resolveVideoLink('https://www.instagram.com/p/ABC/')
    expect(r).toMatchObject({ url: 'https://cdn/i.jpg', mimeType: 'image/jpeg' })
  })

  it('explains a private or deleted post instead of failing opaquely', async () => {
    stubZapi({ postId: 'x' })
    await expect(resolveVideoLink('https://www.instagram.com/p/ABC/')).rejects.toThrow(/private|dihapus/i)
  })
})

describe('statsNote', () => {
  it('renders the performance context appended to the analysis note', () => {
    const n = statsNote({ author: 'mrbeast', views: 1000, likes: 50, comments: 4, caption: 'halo' })
    expect(n).toContain('@mrbeast')
    expect(n).toContain('1.000 views')
    expect(n).toContain('Caption asli: halo')
  })

  it('is empty when there is nothing to say', () => {
    expect(statsNote(undefined)).toBe('')
    expect(statsNote({})).toBe('')
  })

  it('omits a metric the platform did not report', () => {
    const n = statsNote({ views: null, likes: 10 })
    expect(n).not.toContain('views')
    expect(n).toContain('10 likes')
  })
})

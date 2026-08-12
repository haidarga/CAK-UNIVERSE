import { describe, it, expect } from 'vitest'
import { looksUnreadable, followersLookBroken } from '@/lib/cakgpt/strategist/scraper'
import { computeMetrics } from '@/lib/cakgpt/strategist/metrics'
import type { ScrapedAccount, ScrapedPost } from '@/lib/cakgpt/strategist/types'

function acc(followers: number | null, posts: Partial<ScrapedPost>[], platform: 'instagram' | 'tiktok' = 'instagram'): ScrapedAccount {
  return {
    platform,
    handle: 'x',
    followers,
    recentPosts: posts.map((p) => ({ likes: null, comments: null, ...p })) as ScrapedPost[],
    scrapedAt: new Date().toISOString(),
    provider: 'zapi',
  }
}

describe('followersLookBroken', () => {
  it('flags the exact shape Zapi returns for small Indonesian accounts', () => {
    // Confirmed against the API: profile returns followerCount 0 / postCount 0
    // while the posts endpoint returns a full feed with real engagement.
    expect(followersLookBroken(acc(0, [{ views: 7932, likes: 333, comments: 13 }]))).toBe(true)
  })

  it('flags it on likes alone, when the platform reports no views', () => {
    expect(followersLookBroken(acc(0, [{ views: null, likes: 333 }]))).toBe(true)
  })

  it('ACCEPTS a genuinely tiny account — 0 followers and lifeless posts', () => {
    expect(followersLookBroken(acc(0, [{ views: 0, likes: 0, comments: 0 }]))).toBe(false)
  })

  it('accepts any account reporting real followers', () => {
    expect(followersLookBroken(acc(202400, [{ views: 9375, likes: 241 }]))).toBe(false)
  })

  it('is not triggered by an already-null count', () => {
    expect(followersLookBroken(acc(null, [{ likes: 500 }]))).toBe(false)
  })
})

describe('looksUnreadable', () => {
  it('is now ONLY about having no posts', () => {
    // A broken follower count no longer discards the scrape — the post metrics
    // are real and useful on their own.
    expect(looksUnreadable(acc(0, [{ views: 7932, likes: 333 }]))).toBe(false)
    expect(looksUnreadable(acc(1000, []))).toBe(true)
    expect(looksUnreadable(null)).toBe(true)
  })
})

describe('computeMetrics with an unreadable follower count', () => {
  const posts = [
    { views: 20000, likes: 400, comments: 10 },
    { views: 10000, likes: 200, comments: 6 },
  ]

  it('keeps every post average intact', () => {
    const m = computeMetrics(acc(null, posts), 30)
    expect(m.avgViews).toBe(15000)
    expect(m.avgLikes).toBe(300)
    expect(m.avgComments).toBe(8)
  })

  it('reports followers as null, never as 0', () => {
    expect(computeMetrics(acc(null, posts), 30).followers).toBeNull()
  })

  it('switches the engagement basis to views instead of losing the figure', () => {
    // Instagram normally divides by followers. With none readable that would be
    // a divide-by-zero reported as 0% — a wrong number, not a missing one.
    const m = computeMetrics(acc(null, posts), 30)
    expect(m.engagementBasis).toBe('views')
    expect(m.engagementRatePct).toBeGreaterThan(0)
  })

  it('still prefers followers on Instagram when they ARE readable', () => {
    const m = computeMetrics(acc(10000, posts), 30)
    expect(m.engagementBasis).toBe('followers')
  })
})

import { describe, it, expect } from 'vitest'
import { looksUnreadable } from '@/lib/cakgpt/strategist/scraper'
import type { ScrapedAccount, ScrapedPost } from '@/lib/cakgpt/strategist/types'

function acc(followers: number, posts: Partial<ScrapedPost>[]): ScrapedAccount {
  return {
    platform: 'instagram',
    handle: 'x',
    followers,
    recentPosts: posts.map((p) => ({ likes: null, comments: null, ...p })) as ScrapedPost[],
    scrapedAt: new Date().toISOString(),
    provider: 'zapi',
  }
}

describe('looksUnreadable', () => {
  it('rejects the exact shape Zapi returned live: 0 followers with live posts', () => {
    // profile said followerCount 0 / postCount 0 while the posts endpoint
    // returned seven posts averaging 7.9k views and 333 likes.
    expect(looksUnreadable(acc(0, [{ views: 7932, likes: 333, comments: 13 }]))).toBe(true)
  })

  it('rejects it on likes alone, when the platform hides views', () => {
    expect(looksUnreadable(acc(0, [{ views: null, likes: 333, comments: null }]))).toBe(true)
  })

  it('rejects it on comments alone', () => {
    expect(looksUnreadable(acc(0, [{ views: null, likes: null, comments: 4 }]))).toBe(true)
  })

  it('ACCEPTS a genuinely tiny account — 0 followers and lifeless posts', () => {
    // This is a real state, and refusing it would block a legitimate lookup.
    expect(looksUnreadable(acc(0, [{ views: 0, likes: 0, comments: 0 }]))).toBe(false)
  })

  it('accepts any account that reports real followers', () => {
    expect(looksUnreadable(acc(26082, [{ views: 9375, likes: 241 }]))).toBe(false)
    expect(looksUnreadable(acc(1, [{ views: 0, likes: 0 }]))).toBe(false)
  })

  it('rejects a scrape with no posts at all', () => {
    expect(looksUnreadable(acc(1000, []))).toBe(true)
    expect(looksUnreadable(null)).toBe(true)
  })

  it('only needs ONE live post to call the zero suspicious', () => {
    expect(looksUnreadable(acc(0, [{ likes: 0 }, { likes: 500 }]))).toBe(true)
  })
})

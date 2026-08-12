import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { selectFallbackProviders, followersLookBroken } from '@/lib/cakgpt/strategist/scraper'
import type { ScraperProvider } from '@/lib/cakgpt/strategist/types'

const stub = (name: string): ScraperProvider => ({ name, scrape: async () => { throw new Error('nope') } })

describe('fallback chain ordering', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    process.env.ZAPI_KEY = 'z'
    process.env.RAPIDAPI_KEY = 'r'
    process.env.APIFY_TOKEN = 'a'
  })
  afterEach(() => { process.env = { ...saved } })

  it('puts the paid provider last so free sources are exhausted first', () => {
    const chain = selectFallbackProviders(stub('zapi'), 'instagram').map((p) => p.name)
    expect(chain).toEqual(['rapidapi', 'apify'])
  })

  it('never offers apify for tiktok', () => {
    const chain = selectFallbackProviders(stub('zapi'), 'tiktok').map((p) => p.name)
    expect(chain).toEqual(['rapidapi'])
  })

  it('omits apify entirely when no token is configured', () => {
    delete process.env.APIFY_TOKEN
    const chain = selectFallbackProviders(stub('zapi'), 'instagram').map((p) => p.name)
    expect(chain).toEqual(['rapidapi'])
  })

  it('never lists the primary provider as its own fallback', () => {
    const chain = selectFallbackProviders(stub('apify'), 'instagram').map((p) => p.name)
    expect(chain).not.toContain('apify')
  })
})

describe('apify mapping assumptions', () => {
  it('a real apify shape passes the broken-followers check', () => {
    // Numbers taken verbatim from a live run against @awshomedecor, the account
    // Zapi reported as 0 followers.
    const account = {
      platform: 'instagram' as const,
      handle: 'awshomedecor',
      displayName: 'AWS Homedecor',
      bio: null,
      followers: 2661,
      following: 35,
      totalPosts: 380,
      verified: false,
      avatarUrl: null,
      recentPosts: [{ id: 'x', views: 4200, likes: 88, comments: 3, shares: null, saves: null, isVideo: true, takenAt: null, caption: null }],
      scrapedAt: new Date().toISOString(),
      provider: 'apify',
    }
    expect(followersLookBroken(account)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { parseCount, parseCountsFromHtml } from '@/lib/integrations/scrapers/instagram-public'

describe('parseCount', () => {
  it('reads a grouped integer', () => {
    // The exact string Instagram served for @awshomedecor.
    expect(parseCount('2,658')).toBe(2658)
    expect(parseCount('380')).toBe(380)
  })

  it('reads dot grouping, which Instagram uses in some locales', () => {
    expect(parseCount('2.658')).toBe(2658)
  })

  it('expands the K/M shorthand used on larger accounts', () => {
    expect(parseCount('1.2M')).toBe(1_200_000)
    expect(parseCount('12.5K')).toBe(12_500)
    expect(parseCount('685M')).toBe(685_000_000)
  })

  it('does not read a suffixed decimal as thousands grouping', () => {
    // "1.2M" is one point two million, not twelve million.
    expect(parseCount('1.2M')).not.toBe(12_000_000)
  })

  it('returns null for anything unparseable', () => {
    expect(parseCount('')).toBeNull()
    expect(parseCount(null)).toBeNull()
    expect(parseCount('banyak')).toBeNull()
  })
})

describe('parseCountsFromHtml', () => {
  const og = (content: string) => `<html><head><meta property="og:description" content="${content}" /></head></html>`

  it('reads the real meta tag Instagram serves', () => {
    const html = og('2,658 Followers, 35 Following, 380 Posts - See Instagram photos and videos from AWS Homedecor')
    expect(parseCountsFromHtml(html)).toEqual({ followers: 2658, posts: 380 })
  })

  it('does not confuse Following with Followers', () => {
    // "35 Following" sits between the two numbers we want.
    expect(parseCountsFromHtml(og('2,658 Followers, 35 Following, 380 Posts')).followers).toBe(2658)
  })

  it('handles the reversed attribute order', () => {
    const html = '<meta content="1.2M Followers, 10 Following, 500 Posts" property="og:description">'
    expect(parseCountsFromHtml(html)).toEqual({ followers: 1_200_000, posts: 500 })
  })

  it('returns nulls when the tag is missing — a login wall, not a zero account', () => {
    expect(parseCountsFromHtml('<html><head></head></html>')).toEqual({ followers: null, posts: null })
  })

  it('returns nulls rather than throwing on junk', () => {
    expect(parseCountsFromHtml('')).toEqual({ followers: null, posts: null })
  })
})

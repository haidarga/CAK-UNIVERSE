import { describe, it, expect } from 'vitest'
import {
  BrandContextSchema,
  parseRuleList,
  brandContextSection,
  brandQcWords,
  riskyRuleEntries,
  isBrandContextEmpty,
  type BrandContext,
} from '@/lib/cakgpt/brand-context'

const full: BrandContext = {
  profil_brand: 'AceKid — susu pertumbuhan anak 1-12 tahun.',
  posisi_brand: 'Premium tapi terjangkau, lawan utama SGM.',
  konteks_pasar: 'Ibu Indonesia sensitif harga, sangat percaya rekomendasi sesama ibu.',
  cara_pengucapan: 'Dibaca "Es-Kid", bukan "Ace-Kid".',
  tagline_kampanye: '#TumbuhBarengAceKid',
  product_usps: 'Natural whole milk, one-step process, tanpa maltodekstrin.',
  boleh: 'Boleh bilang "bantu dukung pertumbuhan".',
  dilarang: 'menyembuhkan\nobat\npaling ampuh',
  wajib_gunakan: 'AceKid\nnatural whole milk',
}

describe('parseRuleList', () => {
  it('splits one rule per line and trims', () => {
    expect(parseRuleList('menyembuhkan\n  obat  \npaling ampuh')).toEqual(['menyembuhkan', 'obat', 'paling ampuh'])
  })

  it('drops blank lines and bullet markers writers paste in', () => {
    expect(parseRuleList('- obat\n\n• menyembuhkan\n*  ampuh\n')).toEqual(['obat', 'menyembuhkan', 'ampuh'])
  })

  it('dedupes case-insensitively, keeping the first spelling', () => {
    expect(parseRuleList('Obat\nobat\nOBAT')).toEqual(['Obat'])
  })

  it('returns an empty list for empty input', () => {
    expect(parseRuleList('')).toEqual([])
    expect(parseRuleList(null)).toEqual([])
    expect(parseRuleList(undefined)).toEqual([])
  })
})

describe('brandQcWords', () => {
  it('turns DILARANG into banned words and WAJIB into required words', () => {
    expect(brandQcWords(full)).toEqual({
      banned: ['menyembuhkan', 'obat', 'paling ampuh'],
      required: ['AceKid', 'natural whole milk'],
    })
  })

  it('is empty when the brand set no rules', () => {
    expect(brandQcWords({ ...full, dilarang: '', wajib_gunakan: '' })).toEqual({ banned: [], required: [] })
  })

  it('handles a null context', () => {
    expect(brandQcWords(null)).toEqual({ banned: [], required: [] })
  })
})

describe('riskyRuleEntries', () => {
  it('flags an entry too short to be safe as a whole-word ban', () => {
    const risky = riskyRuleEntries({ ...full, dilarang: 'no\nobat' }, 'AceKid')
    expect(risky.some((r) => r.entry === 'no')).toBe(true)
    expect(risky.some((r) => r.entry === 'obat')).toBe(false)
  })

  it('flags banning a word that appears in the brand name itself', () => {
    // Banning "susu" for a milk brand blocks every naskah that brand will ever
    // produce — the writer finds out only when nothing can be approved.
    const risky = riskyRuleEntries({ ...full, dilarang: 'susu' }, 'Susu AceKid')
    expect(risky).toHaveLength(1)
    expect(risky[0].reason).toMatch(/nama brand/i)
  })

  it('flags banning a word the brand also requires', () => {
    // Self-contradictory: every naskah is blocked twice, once for each rule.
    const risky = riskyRuleEntries({ ...full, dilarang: 'AceKid', wajib_gunakan: 'AceKid' }, 'AceKid')
    expect(risky.some((r) => /wajib/i.test(r.reason))).toBe(true)
  })

  it('says nothing about a sane rule set', () => {
    expect(riskyRuleEntries(full, 'AceKid')).toEqual([])
  })

  it('handles a null context', () => {
    expect(riskyRuleEntries(null, 'AceKid')).toEqual([])
  })
})

describe('brandContextSection', () => {
  it('returns empty string when there is no context', () => {
    expect(brandContextSection(null, 'AceKid')).toBe('')
    expect(brandContextSection({} as BrandContext, 'AceKid')).toBe('')
  })

  it('states that brand rules outrank the brief', () => {
    const s = brandContextSection(full, 'AceKid')
    expect(s).toContain('OVERRIDE THE BRIEF')
  })

  it('includes every filled field under a readable label', () => {
    const s = brandContextSection(full, 'AceKid')
    expect(s).toContain('AceKid — susu pertumbuhan anak')
    expect(s).toContain('Es-Kid')
    expect(s).toContain('#TumbuhBarengAceKid')
    expect(s).toContain('natural whole milk')
  })

  it('omits fields the writer left blank instead of printing empty labels', () => {
    const s = brandContextSection({ ...full, cara_pengucapan: '', tagline_kampanye: '   ' }, 'AceKid')
    expect(s).not.toContain('Cara pengucapan')
    expect(s).not.toContain('Tagline')
  })

  it('renders DILARANG as a hard prohibition list', () => {
    const s = brandContextSection(full, 'AceKid')
    expect(s).toContain('NEVER use')
    expect(s).toContain('menyembuhkan')
  })

  it('sanitizes control and bidi characters out of brand text', () => {
    // Brand context is typed by humans and can be AI-filled from an uploaded
    // file — same untrusted-input rules as persona/brief.
    const s = brandContextSection({ ...full, profil_brand: 'AceKid​‮' }, 'AceKid')
    expect(s).not.toContain('​')
    expect(s).not.toContain('‮')
  })
})

describe('BrandContextSchema', () => {
  it('accepts a fully filled context', () => {
    expect(BrandContextSchema.parse(full)).toMatchObject({ profil_brand: full.profil_brand })
  })

  it('defaults every field to empty string so partial AI output still saves', () => {
    const parsed = BrandContextSchema.parse({ profil_brand: 'X' })
    expect(parsed.dilarang).toBe('')
    expect(parsed.posisi_brand).toBe('')
  })

  it('rejects an absurdly long field instead of storing it', () => {
    expect(() => BrandContextSchema.parse({ profil_brand: 'x'.repeat(20_000) })).toThrow()
  })
})

describe('isBrandContextEmpty', () => {
  it('is true for null, {} and all-blank', () => {
    expect(isBrandContextEmpty(null)).toBe(true)
    expect(isBrandContextEmpty({} as BrandContext)).toBe(true)
    expect(isBrandContextEmpty({ ...full, ...Object.fromEntries(Object.keys(full).map((k) => [k, '  '])) } as BrandContext)).toBe(true)
  })

  it('is false as soon as one field has content', () => {
    expect(isBrandContextEmpty({ profil_brand: 'X' } as BrandContext)).toBe(false)
  })
})

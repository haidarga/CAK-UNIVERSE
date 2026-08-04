import { describe, it, expect } from 'vitest'
import {
  unionBannedWords, intersectRequiredWords, buildGeneralPersona, generalPersonaSection,
  GENERAL_PERSONA_ID,
} from '@/lib/cakgpt/general-persona'

const personas = [
  { id: '1', name: 'Zoe Kaylani', banned_words: ['obat', 'sembuh'], required_words: ['AceKid', 'natural'] },
  { id: '2', name: 'Fajar Sondang', banned_words: ['obat', 'paling ampuh'], required_words: ['AceKid'] },
  { id: '3', name: 'Orla Sondang', banned_words: ['klinis'], required_words: ['AceKid', 'natural', 'susu'] },
]

describe('unionBannedWords', () => {
  it('takes every word ANY persona forbids', () => {
    // A general script must be safe in all voices, so one persona's ban is
    // binding on the whole thing.
    expect(unionBannedWords(personas).sort()).toEqual(['klinis', 'obat', 'paling ampuh', 'sembuh'])
  })

  it('dedupes case-insensitively, keeping the first spelling', () => {
    expect(unionBannedWords([
      { id: '1', name: 'A', banned_words: ['Obat'] },
      { id: '2', name: 'B', banned_words: ['obat', 'OBAT'] },
    ])).toEqual(['Obat'])
  })

  it('handles personas with no list at all', () => {
    expect(unionBannedWords([{ id: '1', name: 'A' }])).toEqual([])
    expect(unionBannedWords([])).toEqual([])
  })

  it('ignores blank entries', () => {
    expect(unionBannedWords([{ id: '1', name: 'A', banned_words: ['  ', 'obat'] }])).toEqual(['obat'])
  })
})

describe('intersectRequiredWords', () => {
  it('keeps only what EVERY persona requires', () => {
    // "natural" is required by two of three, so it cannot be forced on a script
    // the third will also deliver.
    expect(intersectRequiredWords(personas)).toEqual(['AceKid'])
  })

  it('is empty when any persona requires nothing', () => {
    expect(intersectRequiredWords([
      { id: '1', name: 'A', required_words: ['X'] },
      { id: '2', name: 'B', required_words: [] },
    ])).toEqual([])
  })

  it('is empty for no personas', () => {
    expect(intersectRequiredWords([])).toEqual([])
  })

  it('matches case-insensitively', () => {
    expect(intersectRequiredWords([
      { id: '1', name: 'A', required_words: ['AceKid'] },
      { id: '2', name: 'B', required_words: ['acekid'] },
    ])).toEqual(['AceKid'])
  })
})

describe('buildGeneralPersona', () => {
  it('carries the union of bans and the intersection of requirements', () => {
    const p = buildGeneralPersona(personas)
    expect(p.banned_words).toContain('klinis')
    expect(p.banned_words).toContain('sembuh')
    expect(p.required_words).toEqual(['AceKid'])
  })

  it('does NOT merge sample lines or diction quirks', () => {
    // Those are what make each persona sound like itself; concatenating them
    // tells the model to sound like all eight at once.
    const p = buildGeneralPersona(personas)
    expect(p.sample_lines).toEqual([])
    expect(String(p.diction_quirks)).toMatch(/tidak ada/i)
  })

  it('warns off the details that only fit one persona', () => {
    const flags = (buildGeneralPersona(personas).red_flags as string[]).join(' ')
    expect(flags).toMatch(/bunda|ayah|sis/i)
    expect(flags).toMatch(/pengalaman pribadi/i)
  })

  it('names who will deliver it, so the model can sanity-check the fit', () => {
    const flags = (buildGeneralPersona(personas).red_flags as string[]).join(' ')
    expect(flags).toContain('Zoe Kaylani')
    expect(flags).toContain('Orla Sondang')
  })

  it('survives an empty persona list', () => {
    expect(() => buildGeneralPersona([])).not.toThrow()
    expect(buildGeneralPersona([]).banned_words).toEqual([])
  })
})

describe('generalPersonaSection', () => {
  it('states the script is for every persona, not one', () => {
    const s = generalPersonaSection(personas)
    expect(s).toContain('GENERAL NASKAH')
    expect(s).toContain('NOT for one character')
  })

  it('lists the personas that will deliver it', () => {
    expect(generalPersonaSection(personas)).toContain('Zoe Kaylani, Fajar Sondang, Orla Sondang')
  })

  it('explains why the banned list is stricter than usual', () => {
    expect(generalPersonaSection(personas)).toContain('COMBINED list')
  })

  it('bans gendered address and personal anecdote outright', () => {
    const s = generalPersonaSection(personas)
    expect(s).toContain('No personal anecdote')
    expect(s).toContain('gendered address')
  })
})

describe('GENERAL_PERSONA_ID', () => {
  it('is a sentinel that cannot collide with a real uuid', () => {
    // persona_id is a uuid column; 'general' can never be one, so it is safe to
    // send in the same field without a second flag.
    expect(GENERAL_PERSONA_ID).toBe('general')
    expect(GENERAL_PERSONA_ID).not.toMatch(/^[0-9a-f]{8}-/)
  })
})

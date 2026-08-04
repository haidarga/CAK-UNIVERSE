// "General" — one naskah written to fit EVERY persona, instead of one per
// persona.
//
// Some content is not persona-specific: a destination roundup, a promo
// announcement, a factual explainer. Generating it eight times in eight voices
// produces eight near-identical scripts the writer then has to dedupe.
//
// The synthetic persona is built from the INTERSECTION of what the real ones
// allow, which is the only way a single script can be safe in every voice:
//
//   banned_words   -> UNION. If any persona forbids a word, the general script
//                     cannot use it, or it stops being usable in that voice.
//   required_words -> INTERSECTION. Only what EVERY persona requires; a word
//                     one persona must say would be out of place in the others.
//
// Tone is deliberately described as neutral rather than blended. Averaging
// eight voice profiles produces a contradictory instruction ("warm and clinical
// and cheeky"), and the model resolves that by picking one at random.
import type { PersonaForPrompt } from '@/lib/cakgpt/prompts'

export const GENERAL_PERSONA_ID = 'general'
export const GENERAL_PERSONA_NAME = 'General (semua persona)'

export type PersonaLike = {
  id: string
  name: string
  banned_words?: string[] | null
  required_words?: string[] | null
}

function normList(v: string[] | null | undefined): string[] {
  return (v || []).map((w) => (typeof w === 'string' ? w.trim() : '')).filter(Boolean)
}

/** Every word banned by ANY persona — the general script must avoid them all. */
export function unionBannedWords(personas: PersonaLike[]): string[] {
  const seen = new Map<string, string>() // lowercase -> first spelling
  for (const p of personas) {
    for (const w of normList(p.banned_words)) {
      const k = w.toLowerCase()
      if (!seen.has(k)) seen.set(k, w)
    }
  }
  return [...seen.values()]
}

/** Only words EVERY persona requires. Empty is a normal, correct result. */
export function intersectRequiredWords(personas: PersonaLike[]): string[] {
  if (personas.length === 0) return []
  const lists = personas.map((p) => normList(p.required_words))
  if (lists.some((l) => l.length === 0)) return []
  const [first, ...rest] = lists
  const seen = new Map<string, string>()
  for (const w of first) {
    const k = w.toLowerCase()
    if (rest.every((l) => l.some((x) => x.toLowerCase() === k)) && !seen.has(k)) seen.set(k, w)
  }
  return [...seen.values()]
}

/**
 * A persona profile that any of the real personas could deliver.
 *
 * `sample_lines` and `diction_quirks` are intentionally NOT merged: they are
 * what make each persona sound like itself, and pasting eight sets together
 * tells the model to sound like all of them at once.
 */
export function buildGeneralPersona(personas: PersonaLike[]): PersonaForPrompt {
  const names = personas.map((p) => p.name).filter(Boolean)
  return {
    name: GENERAL_PERSONA_NAME,
    tone:
      'Netral dan mudah dibawakan siapa pun. Hangat tapi tidak spesifik ke satu karakter, ' +
      'tanpa ciri khas pribadi (panggilan sayang, logat, catchphrase, cerita pribadi) yang ' +
      'cuma cocok di satu orang.',
    diction_quirks:
      'Tidak ada. Hindari quirk khas persona manapun — bahasa Indonesia yang wajar dan bersih.',
    banned_words: unionBannedWords(personas),
    required_words: intersectRequiredWords(personas),
    sample_lines: [],
    red_flags: [
      'Jangan menyebut pengalaman pribadi yang cuma dimiliki satu persona (punya anak, kerja kantoran, dll).',
      'Jangan pakai sapaan yang mengunci gender atau peran (bunda, ayah, sis) — pakai sapaan netral.',
      names.length > 0
        ? `Naskah ini akan dibawakan oleh salah satu dari: ${names.join(', ')}. Harus terdengar wajar di mulut semuanya.`
        : '',
    ].filter(Boolean),
  }
}

/**
 * The extra prompt block for a general naskah. Without it the model still
 * writes to a single implied speaker, because every other section of the prompt
 * is phrased around "the persona".
 */
export function generalPersonaSection(personas: PersonaLike[]): string {
  const names = personas.map((p) => p.name).filter(Boolean)
  return [
    '## GENERAL NASKAH — WRITTEN FOR EVERY PERSONA',
    'This naskah is NOT for one character. The same script will be delivered by each of the',
    'personas below, so it must sound natural in every one of their mouths.',
    names.length > 0 ? `Personas that will use it: ${names.join(', ')}.` : '',
    '- Write in a neutral voice. No personal anecdote, no household role, no gendered address.',
    '- Do not name or imply a specific speaker.',
    '- The banned-word list is the COMBINED list of every persona, so it is stricter than usual.',
    '  Treat all of it as forbidden.',
    '- Where a persona-specific detail would normally go, use something universally true instead.',
    '',
  ].filter(Boolean).join('\n')
}

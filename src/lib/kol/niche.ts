import { z } from 'zod'
import { callGeminiJSON } from '@/lib/cakgpt/llm'
import type { KolNiche } from '@/lib/kol/types'

// Niche consistency — the filter that separates a KOL from a passer-by.
//
// Hashtag membership alone is a weak signal. A fashion creator who posted one
// Mobile Legends clip carries #gaming forever, and every cheap KOL tool happily
// returns them. If the shortlist is full of those, the researcher goes back to
// checking accounts by hand and the tool has bought nothing.
//
// So we ask a different question: out of this creator's last ~20 posts, how many
// are actually about the topic? The answer is shown as a raw fraction — "8/12
// post" — rather than a verdict, because the fraction is auditable and a
// confidence percentage invented by a model is not.

const NicheSchema = z.object({
  label: z.string().max(80).nullable(),
  matched: z.number().int().min(0),
  reason: z.string().max(300).nullable(),
})

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'Short Indonesian label for what this creator actually posts about' },
    matched: { type: 'integer', description: 'How many of the numbered captions are genuinely about the topic' },
    reason: { type: 'string', description: 'One short sentence in Indonesian explaining the judgement' },
  },
  required: ['label', 'matched', 'reason'],
} as const

export interface NicheInput {
  handle: string
  bio: string | null
  captions: string[]
  topic: string
}

/**
 * Classifies one creator against the searched topic.
 *
 * Returns null rather than throwing: niche is an enrichment, and losing it must
 * degrade a row to "unclassified" instead of dropping a creator whose follower
 * count and performance were measured perfectly well.
 */
export async function classifyNiche(input: NicheInput): Promise<KolNiche | null> {
  const captions = input.captions.filter(Boolean).slice(0, 20)
  if (!captions.length) return null

  const numbered = captions.map((c, i) => `${i + 1}. ${c.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')
  const prompt = `Kamu menilai apakah satu kreator TikTok benar-benar fokus di sebuah topik, atau cuma kebetulan pernah menyinggungnya.

TOPIK YANG DICARI: "${input.topic}"

KREATOR: @${input.handle}
BIO: ${input.bio || '(kosong)'}

${captions.length} CAPTION TERBARU:
${numbered}

Tugas:
1. "label" — sebutkan singkat kreator ini sebenarnya bikin konten apa (bahasa Indonesia). Jujur saja kalau ternyata bukan topik yang dicari.
2. "matched" — hitung berapa caption dari ${captions.length} di atas yang MEMANG tentang topik "${input.topic}". Hitung yang benar-benar membahasnya, bukan yang cuma kebetulan menyebut satu kata. Jawab angka saja, maksimal ${captions.length}.
3. "reason" — satu kalimat pendek kenapa.

Kalau kreator ini jelas bukan di topik itu, tulis matched yang kecil. Jangan dibesar-besarkan supaya kelihatan cocok.`

  try {
    const raw = await callGeminiJSON({
      apiKey: '',
      prompt,
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.1, // a counting task; creativity here is only a source of error
      maxOutputTokens: 400,
      disableThinking: true,
    })
    const parsed = NicheSchema.safeParse(raw)
    if (!parsed.success) return null
    return {
      // A model that returns 15 of 12 has miscounted; clamping keeps a nonsense
      // number from rendering as "15/12 post".
      matched: Math.min(parsed.data.matched, captions.length),
      total: captions.length,
      label: parsed.data.label,
      reason: parsed.data.reason,
    }
  } catch {
    return null
  }
}

/** Classifies a batch with bounded concurrency. Failures degrade to null, never throw. */
export async function classifyNiches(inputs: NicheInput[], concurrency = 4): Promise<Map<string, KolNiche>> {
  const out = new Map<string, KolNiche>()
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= inputs.length) return
      const niche = await classifyNiche(inputs[i])
      if (niche) out.set(inputs[i].handle, niche)
    }
  })
  await Promise.all(workers)
  return out
}

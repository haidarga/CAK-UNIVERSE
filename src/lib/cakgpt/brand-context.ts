// Brand & Market Context — the client-level rules every naskah for that brand
// must obey (voice, positioning, pronunciation, and the hard do/don't lists).
//
// Before this existed, sw_clients.notes was a single free-text box that NOTHING
// read: it never reached buildGenerationPrompt and never reached QC, so brand
// rules were documentation the machine ignored. These fields are wired into
// both — the prompt (so the model writes to them) and the deterministic QC pass
// (so a violation is caught even when the model ignores the prompt).
import { z } from 'zod'

const FIELD_MAX = 8000

// One JSONB column rather than nine columns: adding a tenth field later is a
// code change instead of another production migration, and nothing here is ever
// filtered on in SQL.
export const BrandContextSchema = z.object({
  profil_brand: z.string().max(FIELD_MAX).default(''),
  posisi_brand: z.string().max(FIELD_MAX).default(''),
  konteks_pasar: z.string().max(FIELD_MAX).default(''),
  cara_pengucapan: z.string().max(FIELD_MAX).default(''),
  tagline_kampanye: z.string().max(FIELD_MAX).default(''),
  product_usps: z.string().max(FIELD_MAX).default(''),
  boleh: z.string().max(FIELD_MAX).default(''),
  // These two are LINE-DELIMITED lists, not prose: each line becomes a
  // deterministic QC rule (banned / required word). Prose here would look
  // filled in but enforce nothing.
  dilarang: z.string().max(FIELD_MAX).default(''),
  wajib_gunakan: z.string().max(FIELD_MAX).default(''),
})
export type BrandContext = z.infer<typeof BrandContextSchema>

export const BRAND_CONTEXT_FIELDS: Array<{
  key: keyof BrandContext
  label: string
  hint: string
  isRuleList?: boolean
}> = [
  { key: 'profil_brand', label: 'Profil Brand', hint: 'Brand ini jual apa, buat siapa, kategorinya apa' },
  { key: 'posisi_brand', label: 'Posisi Brand', hint: 'Premium / value / challenger — dan lawan utamanya siapa' },
  { key: 'konteks_pasar', label: 'Konteks Pasar Indonesia', hint: 'Perilaku, sensitivitas harga, kebiasaan beli audiens di Indonesia' },
  { key: 'cara_pengucapan', label: 'Cara Pengucapan Wajib', hint: 'Cara baca nama brand/produk yang benar — dipakai buat voice over' },
  { key: 'tagline_kampanye', label: 'Tagline & Kampanye Utama', hint: 'Tagline resmi, hashtag, nama kampanye yang lagi jalan' },
  { key: 'product_usps', label: 'Product USPs', hint: 'Keunggulan produk yang boleh diklaim' },
  { key: 'boleh', label: 'BOLEH', hint: 'Klaim / gaya bicara yang diizinkan klien' },
  { key: 'dilarang', label: 'DILARANG', hint: 'Satu kata atau frasa per baris — tiap baris jadi blocker QC otomatis', isRuleList: true },
  { key: 'wajib_gunakan', label: 'Wajib Gunakan Ini', hint: 'Satu kata atau frasa per baris — wajib muncul di naskah, dicek QC', isRuleList: true },
]

export const EMPTY_BRAND_CONTEXT: BrandContext = {
  profil_brand: '', posisi_brand: '', konteks_pasar: '', cara_pengucapan: '',
  tagline_kampanye: '', product_usps: '', boleh: '', dilarang: '', wajib_gunakan: '',
}

/**
 * Reads the raw JSONB value off sw_clients.brand_context.
 *
 * Never throws: a client row predating migration 020, or one holding a shape
 * from an older field set, must not be able to fail a generation job. Anything
 * unparseable degrades to "no brand context" — which is exactly how every
 * client behaved before this feature existed.
 */
export function parseBrandContext(raw: unknown): BrandContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const parsed = BrandContextSchema.safeParse(raw)
  if (!parsed.success) return null
  return isBrandContextEmpty(parsed.data) ? null : parsed.data
}

/**
 * Splits a rule textarea into individual QC entries — one per line.
 *
 * Tolerates the bullet markers writers paste from a deck ("- obat", "• obat")
 * because those characters would otherwise become part of the banned phrase and
 * silently stop it matching anything.
 */
export function parseRuleList(value: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of (value || '').split('\n')) {
    const entry = raw.replace(/^\s*[-–—•*]\s*/, '').trim()
    if (!entry) continue
    const key = entry.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

// Minimal structural type so this helper stays usable from both the service
// client and the RLS-scoped server client without importing either's generics.
type QueryableClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }
      }
    }
  }
}

/**
 * Resolves a naskah's brand context by walking brief -> client.
 *
 * Returns null on any missing link (no brief, no client, empty context) — all
 * ordinary states that must not fail the caller.
 */
export async function loadBrandContextForBrief(
  client: unknown,
  briefId: string | null | undefined,
  createdBy: string,
): Promise<BrandContext | null> {
  if (!briefId) return null
  const db = client as QueryableClient
  const { data: brief } = await db
    .from('sw_strategist_briefs').select('client_id').eq('id', briefId).eq('created_by', createdBy).maybeSingle()
  const clientId = brief?.client_id
  if (!clientId || typeof clientId !== 'string') return null

  const { data: row } = await db
    .from('sw_clients').select('brand_context').eq('id', clientId).eq('created_by', createdBy).maybeSingle()
  return parseBrandContext(row?.brand_context)
}

export function brandQcWords(ctx: BrandContext | null | undefined): { banned: string[]; required: string[] } {
  if (!ctx) return { banned: [], required: [] }
  return { banned: parseRuleList(ctx.dilarang), required: parseRuleList(ctx.wajib_gunakan) }
}

export function isBrandContextEmpty(ctx: BrandContext | null | undefined): boolean {
  if (!ctx) return true
  return BRAND_CONTEXT_FIELDS.every(({ key }) => !(ctx[key] || '').trim())
}

// Minimum length for a banned entry. QC matches whole words, so a 1-3 character
// entry ("no", "ai") collides with ordinary Indonesian text constantly and
// would block every naskah the brand ever produces.
const MIN_SAFE_RULE_LEN = 4

export type RuleRisk = { entry: string; reason: string }

/**
 * Rules that would block far more than the writer intends. Surfaced in the form
 * BEFORE saving, because the failure mode otherwise is silent: naskah generate
 * fine, then nothing can ever be approved and the cause is three screens away.
 */
export function riskyRuleEntries(ctx: BrandContext | null | undefined, brandName: string): RuleRisk[] {
  if (!ctx) return []
  const banned = parseRuleList(ctx.dilarang)
  const required = parseRuleList(ctx.wajib_gunakan)
  const requiredLower = new Set(required.map((r) => r.toLowerCase()))
  const nameLower = (brandName || '').toLowerCase()

  // Every reason is reported, not just the first: one entry can be wrong in
  // more than one way, and fixing only the problem we happened to mention
  // leaves the writer back here with the same blocked queue.
  const risks: RuleRisk[] = []
  for (const entry of banned) {
    const lower = entry.toLowerCase()
    if (entry.length < MIN_SAFE_RULE_LEN) {
      risks.push({ entry, reason: `Terlalu pendek (${entry.length} huruf) — bakal kena ke kalimat biasa dan nge-block semua naskah.` })
    }
    if (nameLower && nameLower.includes(lower)) {
      risks.push({ entry, reason: `Kata ini ada di nama brand "${brandName}" — semua naskah bakal ke-block.` })
    }
    if (requiredLower.has(lower)) {
      risks.push({ entry, reason: 'Kata ini juga ada di "Wajib Gunakan Ini" — aturannya saling bertabrakan, naskah gak akan pernah lolos.' })
    }
  }
  return risks
}

// Same treatment persona/brief text gets: this is human- (and AI-) authored
// content interpolated into a prompt, so control and bidi characters that could
// hide instructions are stripped before it goes anywhere near the model.
const CONTROL_AND_HIDDEN_CHARS_RE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\uFEFF]',
  'g',
)
function clean(value: string): string {
  return value.replace(CONTROL_AND_HIDDEN_CHARS_RE, '').trim().slice(0, FIELD_MAX)
}

/**
 * The prompt block. Sits ABOVE the brief and below the writer's steering:
 * brand rules are a contract with the client so they outrank a single brief,
 * but the writer's per-naskah steering still outranks everything.
 */
export function brandContextSection(ctx: BrandContext | null | undefined, brandName: string): string {
  if (isBrandContextEmpty(ctx)) return ''
  const c = ctx as BrandContext

  const prose = BRAND_CONTEXT_FIELDS
    .filter((f) => !f.isRuleList && (c[f.key] || '').trim())
    .map((f) => `${f.label}: ${clean(c[f.key])}`)

  const banned = parseRuleList(c.dilarang).map(clean).filter(Boolean)
  const required = parseRuleList(c.wajib_gunakan).map(clean).filter(Boolean)

  return [
    `## BRAND RULES — ${clean(brandName || 'brand')} (OVERRIDE THE BRIEF)`,
    'These are the client\'s standing rules for this brand. Where a brief conflicts with them, the',
    'brand rules win. Only the writer steering above may override these.',
    ...prose,
    banned.length ? `NEVER use these words or phrases anywhere in the naskah: ${banned.map((w) => `"${w}"`).join(', ')}. There is no acceptable context for them.` : '',
    required.length ? `MUST appear naturally somewhere in the naskah: ${required.map((w) => `"${w}"`).join(', ')}.` : '',
    '',
  ].filter(Boolean).join('\n')
}

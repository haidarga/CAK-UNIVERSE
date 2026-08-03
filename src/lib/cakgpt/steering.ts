// Writer steering ("Arahan") — the free-text box where the writer overrides
// what the brief says for ONE generation.
//
// Why this module exists: the generation prompt states "Target duration: Ns" as
// a hard number derived from the BRIEF. Telling the model in prose to "follow
// the steering" loses to an explicit, contradicting number sitting right above
// it — the writer asked for 10 detik and got a 30s script. So duration is
// resolved deterministically HERE and the resolved number is what goes into the
// prompt; the model is never asked to reconcile two conflicting durations.
//
// Location/wardrobe are deliberately NOT extracted. They are free Indonesian
// prose and any regex that tried to slice them out would mangle the writer's
// own words. We only DETECT that they were steered, so the prompt can mark them
// as locked and forbid the model from inventing its own instead.

// Bare `s`/`m` are included so "8s" / "2m" work. The trailing \b is what keeps
// them from eating the first letter of an unrelated word — "10 shot" and
// "4 scene" do not match, because `s` there is followed by a word character.
const SECONDS_RE = /(\d+(?:[.,]\d+)?)\s*(?:detik|dtk|seconds?|secs?|s)\b/gi
const MINUTES_RE = /(\d+(?:[.,]\d+)?)\s*(?:menit|mnt|minutes?|mins?|m)\b/gi

// Same bounds generateNaskah already clamps a brief-derived duration to, so a
// steered duration can never produce a format_meta the schema would reject.
const MIN_DURATION_S = 3
const MAX_DURATION_S = 600

type Hit = { index: number; seconds: number }

function collect(text: string, re: RegExp, toSeconds: (n: number) => number): Hit[] {
  const hits: Hit[] = []
  // Fresh lastIndex per call — these are module-level /g regexes, so reusing
  // them without resetting would skip matches on the second call.
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const value = Number(m[1].replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) continue
    hits.push({ index: m.index, seconds: toSeconds(value) })
  }
  return hits
}

/**
 * The duration the writer steered toward, in seconds — or null if they did not
 * mention one (in which case the caller keeps the brief's own duration).
 *
 * Returns the FIRST duration mentioned: "durasi 10 detik, jangan sampai 30
 * detik" means 10, not 30.
 */
export function parseSteeringDurationS(steering: string | null | undefined): number | null {
  const text = (steering || '').trim()
  if (!text) return null

  const hits = [
    ...collect(text, SECONDS_RE, (n) => n),
    ...collect(text, MINUTES_RE, (n) => n * 60),
  ].sort((a, b) => a.index - b.index)

  const first = hits[0]
  if (!first) return null

  const seconds = Math.round(first.seconds)
  return Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, seconds))
}

const LOCATION_RE = /\b(?:lokasi|location|setting|tempat|latar|berlokasi|bertempat)\b/i
// "ambil di laboratorium" / "shot di outdoor taman" name a place without ever
// using the word "lokasi", so a preposition + place-noun prefix is matched too.
const LOCATION_PLACE_RE =
  /\bdi\s+(?:lab|dapur|kantor|studio|outdoor|indoor|taman|rumah|kamar|pantai|kafe|cafe|toko|pabrik|sekolah|gudang|ruang|halaman|garasi|kolam|mobil|jalan|klinik|apotek|gym|mall)/i
const WARDROBE_RE =
  /\b(?:wardrobe|pakaian|pakai|baju|bajunya|outfit|kostum|costume|busana|seragam|jas|kemeja|kaos|dress|atasan|jilbab|hijab)\b/i

/**
 * Which shot details the writer explicitly steered. Used to escalate those
 * fields in the prompt from "auto-generate a sensible default" to "the writer
 * fixed this — obey it and do not invent your own".
 */
export function steeringMentions(steering: string | null | undefined): {
  duration: boolean
  location: boolean
  wardrobe: boolean
} {
  const text = (steering || '').trim()
  if (!text) return { duration: false, location: false, wardrobe: false }
  return {
    duration: parseSteeringDurationS(text) !== null,
    location: LOCATION_RE.test(text) || LOCATION_PLACE_RE.test(text),
    wardrobe: WARDROBE_RE.test(text),
  }
}

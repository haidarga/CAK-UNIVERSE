// Content format ("tipe konten") — talking head, vlog, skit, and anything the
// writer invents.
//
// WHY THIS IS A REAL FIELD AND NOT JUST STEERING TEXT:
// Writer steering used to be the only way to ask for a format, and it did not
// work — "jadiin talking head sama vlog" came back as the same directed
// product demo every time. Three reasons, all fixed here:
//   1. Nothing in the schema or the prompt knew what a "format" was, so the
//      instruction had no field to land in and no definition to expand into.
//   2. Only duration/location/wardrobe were hard-locked; everything else was
//      prose that the brief and hook rubric could out-argue.
//   3. The SHOT DETAILS block pushed every naskah toward per-shot location and
//      wardrobe — the grammar of a *directed* piece, the opposite of a vlog.
//
// The presets are a shortcut, not a cage: an unrecognised value becomes a
// CUSTOM format and is locked exactly as hard. What makes this work is the
// lock and the structural rules, not the fact that there is a checkbox.

export type ContentFormat = {
  key: string
  label: string
  blurb: string // shown in the UI
  rules: string[] // injected into the prompt — this is what actually changes the script
}

export const MAX_CUSTOM_FORMAT_LEN = 120
const CUSTOM_PREFIX = 'custom:'

const CONTROL_AND_HIDDEN_CHARS_RE = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\uFEFF]',
  'g',
)

export const CONTENT_FORMAT_PRESETS: ContentFormat[] = [
  {
    key: 'talking_head',
    label: 'Talking Head',
    blurb: 'Persona ngomong langsung ke kamera. Satu lokasi, minim b-roll.',
    rules: [
      'The persona speaks DIRECTLY to camera, aware of it, for the whole video.',
      'ONE LOCATION for the entire naskah. Do not move sets between shots.',
      'Minimal b-roll. At most one short insert cut; everything else is the persona on camera.',
      'visual_note describes FRAMING and DELIVERY (medium shot, close-up, gesture, expression) — not activity.',
      'The hook is spoken by the persona in the first shot, not shown as a scene.',
    ],
  },
  {
    key: 'vlog',
    label: 'Vlog / POV',
    blurb: 'Handheld, persona lagi ngelakuin sesuatu sambil cerita. Boleh pindah lokasi.',
    rules: [
      'Handheld, first-person feel — the camera follows the persona, it is not set up on a tripod.',
      'The persona is DOING a real activity while talking. Narration rides on top of action.',
      'Open with an establishing shot that shows where we are before any explanation.',
      'Moving between locations is allowed and encouraged; show the transition.',
      'Speech is loose and conversational — thinking out loud, not presenting.',
      'visual_note describes CAMERA MOVEMENT and ACTIVITY (walking, filming while cooking, turning to show something).',
    ],
  },
  {
    key: 'skit',
    label: 'Skit / Drama Pendek',
    blurb: 'Ada 2+ karakter dan konflik kecil. Dialog, bukan monolog.',
    rules: [
      'At least TWO speakers. Set a different `speaker` per block — a monologue is not a skit.',
      'There is a small conflict or misunderstanding that resolves by the end.',
      'Characters talk to EACH OTHER, never to camera.',
      'Open in the middle of the situation. No setup narration.',
    ],
  },
  {
    key: 'voiceover_broll',
    label: 'Voice-over + B-roll',
    blurb: 'Persona gak muncul di frame. Semua visual b-roll, teks jadi VO.',
    rules: [
      'The persona NEVER APPEARS ON CAMERA. Their voice narrates over footage only.',
      'Every visual_note describes b-roll: the product, hands, environment, or process.',
      'Keep `speaker` set to the persona — it is still their voice.',
      'Narration must make sense with the eyes closed; the visuals illustrate, they do not carry information.',
    ],
  },
  {
    key: 'tutorial',
    label: 'Tutorial / How-to',
    blurb: 'Langkah demi langkah. Tiap shot satu langkah konkret.',
    rules: [
      'Structure as ordered steps. One concrete step per shot, in the order a viewer would do them.',
      'Show the END RESULT in the final shot so the payoff is visible.',
      'Each visual_note shows the action being performed, close enough to follow.',
      'No step may be skipped or merged — a viewer must be able to reproduce it.',
    ],
  },
  {
    key: 'ugc_review',
    label: 'UGC Review',
    blurb: 'Kesan orang biasa, bukan iklan. Handheld kamera depan HP.',
    rules: [
      'Sounds like a real customer, NOT an ad. No polished marketing phrasing.',
      'Front-facing phone camera, handheld, imperfect framing.',
      'Speak from personal experience ("gue coba", "anak gue") — never brand-voice.',
      'Include one small honest caveat or hesitation; a flawless review reads as paid.',
    ],
  },
  {
    key: 'reaction',
    label: 'Reaction / Duet',
    blurb: 'Persona nanggapi sesuatu — klaim, komentar, atau berita.',
    rules: [
      'Open by SHOWING the thing being reacted to (a comment, claim, screenshot, or clip).',
      'The persona reacts in real time — surprise, disagreement, correction.',
      'Alternate between the source material and the persona\'s response.',
      'visual_note must say what is on screen at that moment (source vs persona).',
    ],
  },
  {
    key: 'street_interview',
    label: 'Street Interview',
    blurb: 'Pewawancara off-screen nanya, jawaban spontan.',
    rules: [
      'An off-screen interviewer asks short questions; the persona answers on camera.',
      'Use `speaker` to distinguish the interviewer from the respondent.',
      'Answers are spontaneous and imperfect — no rehearsed brand lines.',
      'Outdoor / public setting with visible ambient life.',
    ],
  },
]

const BY_KEY = new Map(CONTENT_FORMAT_PRESETS.map((f) => [f.key, f]))
const BY_LABEL = new Map(CONTENT_FORMAT_PRESETS.map((f) => [f.label.toLowerCase(), f]))

export function isCustomFormat(format: ContentFormat): boolean {
  return format.key.startsWith(CUSTOM_PREFIX)
}

function clean(value: string): string {
  return value.replace(CONTROL_AND_HIDDEN_CHARS_RE, '').trim().slice(0, MAX_CUSTOM_FORMAT_LEN)
}

/**
 * Resolves a stored/submitted format value.
 *
 * A value we do not recognise is NOT dropped — it becomes a custom format that
 * gets the same lock. Silently ignoring unknown input is precisely how the old
 * free-text steering failed the writer.
 */
export function resolveContentFormat(value: string | null | undefined): ContentFormat | null {
  const raw = clean(value || '')
  if (!raw) return null

  const preset = BY_KEY.get(raw.toLowerCase()) || BY_LABEL.get(raw.toLowerCase())
  if (preset) return preset

  return {
    key: `${CUSTOM_PREFIX}${raw.toLowerCase()}`,
    label: raw,
    blurb: 'Format custom.',
    rules: [
      `Shoot this as: ${raw}.`,
      'Let that format decide the shot structure, the camera treatment and how the persona speaks.',
      'Where this format conflicts with the brief\'s usual treatment, the format wins.',
    ],
  }
}

/**
 * The prompt block. Locked like duration/location/wardrobe, and placed with the
 * other locks so the model reads one consistent set of constraints.
 */
export function contentFormatSection(format: ContentFormat | null): string {
  if (!format) return ''
  return [
    `## CONTENT FORMAT IS LOCKED — ${format.label}`,
    'This is the shape of the video and it OVERRIDES whatever treatment the brief implies.',
    'Do not blend it with another format, and do not fall back to a generic product demo.',
    ...format.rules.map((r) => `- ${r}`),
    '',
  ].join('\n')
}

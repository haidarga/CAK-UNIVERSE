// Output type — what ARTIFACT a naskah actually is: a video script, a
// TikTok/Instagram carousel, or a blog article.
//
// This sits ABOVE content format. Format ("talking head", "vlog") describes a
// kind of VIDEO; output type decides whether we are making a video at all.
//
// One block shape serves all three. The blocks were already close to generic —
// an ordinal, a section label, text, and a visual note — so rather than forking
// the schema (and with it the editor, Docs render, Sheets export, QC and Studio
// push) each type REINTERPRETS the same fields:
//
//              shot_no      text              visual_note      timestamp/wardrobe
//   video      shot         spoken line       camera direction  used
//   slideshow  slide        on-image text     image direction   unused
//   article    section      paragraph         image suggestion  unused
//
// Two capabilities are genuinely video-only and are gated, not reinterpreted:
// content format, and Push to Studio. The video studio renders shots; handing
// it an article would burn render quota producing nonsense.

export type OutputTypeKey = 'video' | 'slideshow' | 'article'

export type OutputType = {
  key: OutputTypeKey
  label: string
  blurb: string
  /** What one block is called, for UI labels and prompt wording. */
  unit: string
  /** How "how much" is expressed for this type. */
  sizeLabel: string
  supportsContentFormat: boolean
  supportsStudioPush: boolean
  /** Whether timestamp_range / location / wardrobe are meaningful. */
  supportsShotDetails: boolean
  /** Structural rules injected into the generation prompt. */
  rules: string[]
  /** section_key values the model should use. */
  sectionKeys: string[]
}

export const OUTPUT_TYPES: OutputType[] = [
  {
    key: 'video',
    label: 'Naskah Video',
    blurb: 'Shot-by-shot buat direkam. Bisa di-push ke Video Studio.',
    unit: 'shot',
    sizeLabel: 'durasi (detik)',
    supportsContentFormat: true,
    supportsStudioPush: true,
    supportsShotDetails: true,
    sectionKeys: ['hook', 'body', 'cta'],
    rules: [], // the existing video instructions already cover this path
  },
  {
    key: 'slideshow',
    label: 'Slideshow / Carousel',
    blurb: 'Carousel TikTok/IG — foto + teks di atasnya. Ke Docs/Spreadsheet.',
    unit: 'slide',
    sizeLabel: 'jumlah slide',
    supportsContentFormat: false,
    supportsStudioPush: false,
    supportsShotDetails: false,
    sectionKeys: ['hook', 'body', 'cta'],
    rules: [
      'This is an Instagram/TikTok CAROUSEL, not a video. There is no motion, no camera and no spoken dialogue.',
      'One block = ONE SLIDE. Number shot_no as the slide number, starting at 1.',
      '`text` is the text that sits ON the image. Keep it SHORT — a phrase or one line a thumb can read while scrolling, never a paragraph.',
      '`visual_note` describes the IMAGE for that slide: subject, framing, mood, colour. It must be concrete enough to hand to an image generator.',
      'Slide 1 is the scroll-stopper: it carries the hook and must work with no context.',
      'The last slide carries the CTA.',
      'Leave `speaker` null — nobody is speaking. Leave timestamp_range and wardrobe null.',
      'Each slide must stand alone visually, but the sequence must read as one argument top to bottom.',
    ],
  },
  {
    key: 'article',
    label: 'Artikel Blog / SEO',
    blurb: 'Artikel web: judul, meta, H2/H3, paragraf. Ke Docs/Spreadsheet.',
    unit: 'bagian',
    sizeLabel: 'target kata',
    supportsContentFormat: false,
    supportsStudioPush: false,
    supportsShotDetails: false,
    sectionKeys: ['title', 'meta', 'intro', 'h2', 'body', 'h3', 'conclusion', 'cta'],
    rules: [
      'This is a WRITTEN BLOG ARTICLE for a website, not a script. Nothing here is spoken or filmed.',
      'One block = one structural piece. Number shot_no sequentially as the section order.',
      'Use section_key to mark what each block is: "title" (the article title, exactly one, first),',
      '  "meta" (a 150-160 character meta description, exactly one, second), "intro", "h2" (a heading),',
      '  "h3" (a sub-heading), "body" (a paragraph), "conclusion", "cta".',
      'A heading block\'s `text` is the heading itself — short, and containing the topic naturally.',
      'A body block\'s `text` is ONE full paragraph of flowing prose. Do not write bullet fragments.',
      'Write for a reader who found this by searching. Answer the question early, then go deeper.',
      '`visual_note` is an optional suggestion for a supporting image; leave it null where none helps.',
      'Leave speaker, timestamp_range, location and wardrobe null — none of them apply to an article.',
    ],
  },
]

const BY_KEY = new Map(OUTPUT_TYPES.map((t) => [t.key, t]))

export const DEFAULT_OUTPUT_TYPE = OUTPUT_TYPES[0] // video — the pre-existing behavior

/**
 * Resolves a stored/submitted output type. Anything unrecognised (including
 * null, for every naskah created before this feature) falls back to video, so
 * old rows keep rendering exactly as they always did.
 */
export function resolveOutputType(value: string | null | undefined): OutputType {
  const key = (value || '').trim().toLowerCase()
  return BY_KEY.get(key as OutputTypeKey) || DEFAULT_OUTPUT_TYPE
}

export function isVideoOutput(value: string | null | undefined): boolean {
  return resolveOutputType(value).key === 'video'
}

/**
 * The prompt block. Video emits nothing — its instructions are the ones already
 * in buildGenerationPrompt, and repeating them would just add contradiction
 * surface. The other two types have to actively override that video framing.
 */
export function outputTypeSection(type: OutputType): string {
  if (type.rules.length === 0) return ''
  return [
    `## OUTPUT TYPE IS LOCKED — ${type.label}`,
    'This decides WHAT you are producing. It overrides any wording elsewhere in this prompt that',
    'assumes a filmed video: ignore instructions about shots, camera, wardrobe or screen time except',
    'where the rules below reuse them.',
    ...type.rules.map((r) => `- ${r}`),
    `- Use these section_key values: ${type.sectionKeys.join(', ')}.`,
    '',
  ].join('\n')
}

/**
 * How "how much" is expressed. Video keeps seconds of screen time; the others
 * reinterpret the same brief-derived number as slides or words, so a writer who
 * set "durasi 60" on an article brief gets a 60-word target rather than a
 * meaningless runtime.
 */
export function sizeGuidance(type: OutputType, targetNumber: number): string {
  switch (type.key) {
    case 'slideshow':
      // Carousels live or die on being finishable in one scroll.
      return `Produce ${clampSlides(targetNumber)} slides in total.`
    case 'article':
      return `Target roughly ${Math.max(200, targetNumber * 20)} words across the whole article.`
    default:
      return ''
  }
}

// A brief's duration field is in seconds; read as a slide count it would ask for
// 30 slides. Mapped into the range a carousel actually works in.
function clampSlides(fromDuration: number): number {
  if (fromDuration <= 12) return Math.max(3, fromDuration)
  return Math.min(10, Math.max(6, Math.round(fromDuration / 5)))
}

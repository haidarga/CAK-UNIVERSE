import { describe, it, expect } from 'vitest'
import {
  OUTPUT_TYPES, resolveOutputType, isVideoOutput, outputTypeSection, sizeGuidance,
} from '@/lib/cakgpt/output-types'

describe('OUTPUT_TYPES', () => {
  it('offers the three artifacts the team produces', () => {
    expect(OUTPUT_TYPES.map((t) => t.key)).toEqual(['video', 'slideshow', 'article'])
  })

  it('gates the two capabilities that are genuinely video-only', () => {
    const byKey = Object.fromEntries(OUTPUT_TYPES.map((t) => [t.key, t]))
    // Content format ("talking head", "vlog") describes a kind of video, and the
    // Video Studio renders shots — neither means anything for text output.
    expect(byKey.video.supportsContentFormat).toBe(true)
    expect(byKey.slideshow.supportsContentFormat).toBe(false)
    expect(byKey.article.supportsContentFormat).toBe(false)
    expect(byKey.video.supportsStudioPush).toBe(true)
    expect(byKey.slideshow.supportsStudioPush).toBe(false)
    expect(byKey.article.supportsStudioPush).toBe(false)
  })

  it('names the unit each type counts in', () => {
    const byKey = Object.fromEntries(OUTPUT_TYPES.map((t) => [t.key, t]))
    expect(byKey.video.unit).toBe('shot')
    expect(byKey.slideshow.unit).toBe('slide')
    expect(byKey.article.unit).toBe('bagian')
  })

  it('marks shot details as meaningful only for video', () => {
    for (const t of OUTPUT_TYPES) {
      expect(t.supportsShotDetails).toBe(t.key === 'video')
    }
  })
})

describe('resolveOutputType', () => {
  it('resolves each key', () => {
    expect(resolveOutputType('slideshow').key).toBe('slideshow')
    expect(resolveOutputType('article').key).toBe('article')
  })

  it('falls back to video for anything unknown', () => {
    // Every naskah created before this feature has a null output_type and must
    // keep rendering exactly as it always did.
    expect(resolveOutputType(null).key).toBe('video')
    expect(resolveOutputType(undefined).key).toBe('video')
    expect(resolveOutputType('').key).toBe('video')
    expect(resolveOutputType('podcast').key).toBe('video')
  })

  it('is case and whitespace tolerant', () => {
    expect(resolveOutputType('  ARTICLE ').key).toBe('article')
  })
})

describe('isVideoOutput', () => {
  it('is true for video and for legacy nulls', () => {
    expect(isVideoOutput('video')).toBe(true)
    expect(isVideoOutput(null)).toBe(true)
  })

  it('is false for the text types', () => {
    expect(isVideoOutput('slideshow')).toBe(false)
    expect(isVideoOutput('article')).toBe(false)
  })
})

describe('outputTypeSection', () => {
  it('adds nothing for video, whose instructions already exist in the prompt', () => {
    // Repeating them would only create contradiction surface.
    expect(outputTypeSection(resolveOutputType('video'))).toBe('')
  })

  it('tells the model to ignore the video framing for a carousel', () => {
    const s = outputTypeSection(resolveOutputType('slideshow'))
    expect(s).toContain('OUTPUT TYPE IS LOCKED')
    expect(s).toContain('overrides any wording elsewhere')
    expect(s).toContain('not a video')
  })

  it('defines a slide as text-on-image plus an image direction', () => {
    const s = outputTypeSection(resolveOutputType('slideshow'))
    expect(s).toContain('ON the image')
    expect(s).toContain('image generator')
    expect(s.toLowerCase()).toContain('scroll-stopper')
  })

  it('defines an article as headings and full paragraphs', () => {
    const s = outputTypeSection(resolveOutputType('article'))
    expect(s).toContain('BLOG ARTICLE')
    expect(s).toContain('meta description')
    expect(s).toContain('ONE full paragraph')
  })

  it('lists the section keys each type must use', () => {
    expect(outputTypeSection(resolveOutputType('article'))).toContain('title, meta, intro')
    expect(outputTypeSection(resolveOutputType('slideshow'))).toContain('hook, body, cta')
  })

  it('nulls the fields that do not apply', () => {
    expect(outputTypeSection(resolveOutputType('slideshow'))).toContain('Leave `speaker` null')
    expect(outputTypeSection(resolveOutputType('article'))).toContain('Leave speaker, timestamp_range, location and wardrobe null')
  })
})

describe('sizeGuidance', () => {
  it('says nothing for video, which keeps its own duration handling', () => {
    expect(sizeGuidance(resolveOutputType('video'), 30)).toBe('')
  })

  it('maps a brief duration into a workable carousel length', () => {
    // A brief saying "30" means 30 seconds; read as slides that would ask for a
    // 30-slide carousel nobody finishes.
    expect(sizeGuidance(resolveOutputType('slideshow'), 30)).toContain('6 slides')
    expect(sizeGuidance(resolveOutputType('slideshow'), 60)).toContain('10 slides')
  })

  it('honours a small explicit slide count', () => {
    expect(sizeGuidance(resolveOutputType('slideshow'), 8)).toContain('8 slides')
    expect(sizeGuidance(resolveOutputType('slideshow'), 1)).toContain('3 slides')
  })

  it('never asks for more slides than a carousel supports', () => {
    expect(sizeGuidance(resolveOutputType('slideshow'), 600)).toContain('10 slides')
  })

  it('turns a duration into a word target for an article', () => {
    expect(sizeGuidance(resolveOutputType('article'), 60)).toContain('1200 words')
  })

  it('never asks for an absurdly short article', () => {
    expect(sizeGuidance(resolveOutputType('article'), 1)).toContain('200 words')
  })
})

// ── Integration with the generation prompt ──────────────────────────────────
import { buildGenerationPrompt, type PersonaForPrompt, type BriefForPrompt, type HookRubricForPrompt } from '@/lib/cakgpt/prompts'

const persona: PersonaForPrompt = {
  name: 'Orla Sondang', tone: 'hangat', diction_quirks: '-',
  banned_words: [], required_words: [], sample_lines: [], red_flags: [],
}
const brief: BriefForPrompt = { title: 'Nutrisi Anak', product: 'Susu', platform: 'tiktok', fields: {} }
const rubrics: HookRubricForPrompt[] = [
  { slug: 'pattern_interrupt', name: 'Pattern Interrupt', description: 'jolt', example: 'Lihat ini' },
]

function prompt(outputType?: string) {
  return buildGenerationPrompt({
    persona, brief, hookRubrics: rubrics,
    platform: 'tiktok', targetDurationS: 30, aspectRatio: '9:16',
    outputType,
  })
}

describe('output type inside buildGenerationPrompt', () => {
  it('leaves the video prompt exactly as it was', () => {
    const p = prompt('video')
    expect(p).toContain('shot-by-shot breakdown')
    expect(p).toContain('SHOT DETAILS')
    expect(p).toContain('seconds of screen time')
    expect(p).not.toContain('OUTPUT TYPE IS LOCKED')
  })

  it('treats a missing output type as video, for every pre-existing naskah', () => {
    expect(prompt(undefined)).toContain('SHOT DETAILS')
  })

  it('drops the shot-detail block entirely for a carousel', () => {
    // Otherwise the model is asked to invent a wardrobe and a timecode for a
    // still image.
    const p = prompt('slideshow')
    expect(p).not.toContain('SHOT DETAILS')
    expect(p).not.toContain('wardrobe: The persona outfit')
    expect(p).not.toContain('seconds of screen time')
  })

  it('drops it for an article too', () => {
    const p = prompt('article')
    expect(p).not.toContain('SHOT DETAILS')
    expect(p).not.toContain('aspect ratio')
  })

  it('states the artifact before anything that assumes a video', () => {
    const p = prompt('article')
    expect(p.indexOf('OUTPUT TYPE IS LOCKED')).toBeLessThan(p.indexOf('FORMAT / STRUCTURE REQUIREMENTS'))
    expect(p.indexOf('OUTPUT TYPE IS LOCKED')).toBeLessThan(p.indexOf('## STRATEGIST BRIEF'))
  })

  it('opens by naming what is being written', () => {
    expect(prompt('article')).toContain('You are writing a Artikel Blog / SEO')
    expect(prompt('slideshow')).toContain('You are writing a Slideshow / Carousel')
  })

  it('converts the duration into the unit each type actually counts', () => {
    expect(prompt('slideshow')).toContain('slides in total')
    expect(prompt('article')).toContain('words across the whole article')
  })

  it('renames the ordinal so shot_no is not read as a camera shot', () => {
    expect(prompt('slideshow')).toContain('shot_no is the slide number')
    expect(prompt('article')).toContain('shot_no is the bagian number')
  })
})

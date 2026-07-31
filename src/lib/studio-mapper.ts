// Map Caketing naskah blocks → Video Studio shot format.
//
// Caketing blocks: { block_id, section_key, shot_no, line_no, speaker, text, visual_note }
// Video Studio shots: { shot, duration, scene_type, image_prompt, video_motion, dialogue, chars_in_shot }
//
// The blocks are grouped by shot_no. Within each shot, lines are concatenated
// into dialogue and visual notes seed the image_prompt.

import type { Block } from '@/lib/cakgpt/schemas'

type StudioShot = {
  shot: number
  duration: number
  section_key: string
  scene_type: string
  image_prompt: string
  video_motion: string
  dialogue: string
  speaker: string | null
  visual_note: string
  chars_in_shot: string[]
  timestamp_range?: string | null
  location?: string | null
  wardrobe?: string | null
}

// Map section_key → scene_type (best-effort heuristic)
const SECTION_TO_SCENE: Record<string, string> = {
  hook: 'talking_head',
  intro: 'talking_head',
  body: 'default',
  demo: 'product_reveal',
  product: 'product_reveal',
  cta: 'talking_head',
  outro: 'talking_head',
  closing: 'talking_head',
}

// Estimate shot duration from text length (rough heuristic)
function estimateDuration(text: string): number {
  // ~3 words/second for Indonesian speech
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const seconds = Math.ceil(wordCount / 3)
  return Math.max(3, Math.min(10, seconds))
}

/**
 * Convert an array of Caketing blocks into Video Studio shot format.
 * Groups blocks by shot_no, concatenates dialogue within each group.
 */
export function blocksToStudioShots(blocks: Block[]): StudioShot[] {
  if (!blocks || blocks.length === 0) return []

  // Group blocks by shot_no
  const shotGroups = new Map<number, Block[]>()
  for (const block of blocks) {
    const shotNo = block.shot_no || 1
    const existing = shotGroups.get(shotNo) || []
    existing.push(block)
    shotGroups.set(shotNo, existing)
  }

  const shots: StudioShot[] = []

  // Process each shot group
  for (const [shotNo, shotBlocks] of Array.from(shotGroups.entries()).sort(([a], [b]) => a - b)) {
    // Sort blocks by line_no within the shot
    const sorted = [...shotBlocks].sort((a, b) => (a.line_no || 0) - (b.line_no || 0))

    // Extract dialogue (all text lines concatenated)
    const dialogueLines = sorted
      .map(b => b.text)
      .filter(Boolean)

    const dialogue = dialogueLines.join('\n')

    // Extract visual notes, location, wardrobe, timestamp
    const visualNotes = sorted.map(b => b.visual_note).filter(Boolean)
    const locations = sorted.map(b => b.location).filter(Boolean)
    const wardrobes = sorted.map(b => b.wardrobe).filter(Boolean)
    const timestamps = sorted.map(b => b.timestamp_range).filter(Boolean)

    const visualNote = visualNotes.join('. ')
    const location = locations.length > 0 ? locations[0] : null
    const wardrobe = wardrobes.length > 0 ? wardrobes[0] : null
    const timestampRange = timestamps.length > 0 ? timestamps[0] : null

    // Build image_prompt enriched with location + wardrobe + visual_note
    const promptParts = []
    if (location) promptParts.push(`Setting/Lighting: ${location}`)
    if (wardrobe) promptParts.push(`Outfit: ${wardrobe}`)
    if (visualNote) promptParts.push(visualNote)
    if (promptParts.length === 0) promptParts.push(`Scene matching dialogue: ${dialogue.slice(0, 100)}`)

    const imagePrompt = promptParts.join('. ')

    // Get speakers
    const speakers = [...new Set(
      sorted
        .map(b => b.speaker)
        .filter((s): s is string => Boolean(s))
    )]

    // Get section_key (use the first block's section_key)
    const sectionKey = sorted[0]?.section_key || 'body'
    const sceneType = SECTION_TO_SCENE[sectionKey.toLowerCase()] || 'default'

    shots.push({
      shot: shotNo,
      duration: estimateDuration(dialogue),
      section_key: sectionKey,
      scene_type: sceneType,
      image_prompt: imagePrompt,
      video_motion: '', // Will be filled by user or LLM re-parse in Studio
      dialogue,
      speaker: speakers.length > 0 ? speakers[0] : null,
      visual_note: visualNote,
      chars_in_shot: speakers.length > 0 ? speakers : ['Subject'],
      timestamp_range: timestampRange,
      location: location,
      wardrobe: wardrobe,
    })
  }

  return shots
}

/**
 * Convert blocks back to raw naskah text (for the naskah_text field).
 * This is what shows in the read-only naskah preview in Studio.
 */
export function blocksToRawText(blocks: Block[]): string {
  if (!blocks || blocks.length === 0) return ''

  return blocks
    .sort((a, b) => (a.shot_no || 0) - (b.shot_no || 0) || (a.line_no || 0) - (b.line_no || 0))
    .map(b => {
      const speaker = b.speaker ? `${b.speaker}: ` : ''
      const ts = b.timestamp_range ? ` [${b.timestamp_range}]` : ''
      const loc = b.location ? `\n📍 Lokasi & Lighting: ${b.location}` : ''
      const ward = b.wardrobe ? `\n👔 Wardrobe: ${b.wardrobe}` : ''
      const visual = b.visual_note ? `\n🎬 Visual: ${b.visual_note}` : ''
      return `${speaker}${b.text}${ts}${loc}${ward}${visual}`
    })
    .join('\n\n')
}

// Newline-delimited JSON reader for the streaming search response.
//
// Extracted from the component so the one genuinely fragile part of the stream
// can be tested: a network chunk can end ANYWHERE, including halfway through a
// line. Parsing eagerly on each chunk silently drops whichever event straddles
// the boundary — and because progress events are cosmetic, the loss shows up
// only when the boundary happens to land on the final `result` line and the
// search appears to return nothing after ninety seconds.

export type KolStreamEvent =
  | { type: 'progress'; stage: string; message: string; current?: number; total?: number }
  | { type: 'result'; ok: true; results: unknown[]; meta: unknown }
  | { type: 'error'; ok: false; error: string }

/**
 * Stateful line splitter.
 *
 * Feed it chunks in order; it emits only whole lines and keeps any trailing
 * partial for the next call. Call `flush()` once the stream ends to release a
 * final line that arrived without a trailing newline.
 */
export function createNdjsonParser() {
  let buffer = ''

  return {
    push(chunk: string): KolStreamEvent[] {
      buffer += chunk
      const lines = buffer.split('\n')
      // The last element is either an empty string (the chunk ended cleanly on a
      // newline) or a partial line. Either way it is not ready to parse.
      buffer = lines.pop() ?? ''
      return parseLines(lines)
    },
    flush(): KolStreamEvent[] {
      const rest = buffer
      buffer = ''
      return parseLines([rest])
    },
  }
}

function parseLines(lines: string[]): KolStreamEvent[] {
  const out: KolStreamEvent[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      // A line that parses but carries no known type is not an error worth
      // surfacing — it is a future field this client does not understand yet.
      if (parsed && typeof parsed === 'object' && 'type' in parsed) out.push(parsed as KolStreamEvent)
    } catch {
      // A malformed line is skipped rather than aborting the stream: losing one
      // progress tick is survivable, losing the whole search is not.
    }
  }
  return out
}

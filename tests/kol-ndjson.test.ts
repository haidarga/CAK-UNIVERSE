import { describe, it, expect } from 'vitest'
import { createNdjsonParser } from '@/lib/kol/ndjson'

// The search streams for ~90 seconds and ends with a single `result` line that
// carries everything. If a chunk boundary can eat a line, the failure mode is a
// search that runs to completion and then shows nothing.

const progress = (m: string) => JSON.stringify({ type: 'progress', stage: 'resolve', message: m })
const result = JSON.stringify({ type: 'result', ok: true, results: [{ handle: 'a' }], meta: { candidatesFound: 3 } })

describe('ndjson stream parsing', () => {
  it('reads whole lines from one clean chunk', () => {
    const p = createNdjsonParser()
    const events = p.push(`${progress('satu')}\n${result}\n`)
    expect(events).toHaveLength(2)
    expect(events[1].type).toBe('result')
  })

  it('keeps a line that is split across chunks', () => {
    const p = createNdjsonParser()
    const line = result + '\n'
    const cut = Math.floor(line.length / 2)
    expect(p.push(line.slice(0, cut))).toHaveLength(0)
    const events = p.push(line.slice(cut))
    expect(events).toHaveLength(1)
    expect((events[0] as { results: unknown[] }).results).toHaveLength(1)
  })

  it('survives a boundary at EVERY position in the stream', () => {
    // Brute force, because the real bug only appears at one specific offset and
    // a single hand-picked split would not have caught it.
    const stream = `${progress('a')}\n${progress('b')}\n${result}\n`
    for (let cut = 1; cut < stream.length; cut++) {
      const p = createNdjsonParser()
      const events = [...p.push(stream.slice(0, cut)), ...p.push(stream.slice(cut)), ...p.flush()]
      expect(events.filter((e) => e.type === 'result')).toHaveLength(1)
      expect(events).toHaveLength(3)
    }
  })

  it('releases a final line that arrived without a trailing newline', () => {
    const p = createNdjsonParser()
    expect(p.push(result)).toHaveLength(0)
    expect(p.flush()).toHaveLength(1)
  })

  it('skips a malformed line rather than aborting the whole search', () => {
    const p = createNdjsonParser()
    const events = p.push(`{ broken json\n${result}\n`)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('result')
  })

  it('ignores blank lines and unknown payload shapes', () => {
    const p = createNdjsonParser()
    expect(p.push('\n\n{"hello":1}\n')).toHaveLength(0)
  })
})

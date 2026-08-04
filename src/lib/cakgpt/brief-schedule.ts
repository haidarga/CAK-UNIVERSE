// Ordering naskah by the CONTENT CALENDAR rather than by when they finished.
//
// Generation jobs run 12-wide and land out of order, so a queue sorted by
// updated_at shows Wednesday before Monday and interleaves personas — which is
// unreadable when a content plan arrives already organised by week and day.
//
// The schedule lives in the brief's own `fields` (whatever the strategist's
// spreadsheet happened to call them), so the key is derived defensively: a
// missing or unparseable field must sort LAST rather than throw or collapse
// everything into one bucket.

const DAY_INDEX: Record<string, number> = {
  // English
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 7,
  // Indonesian — content plans here are written in either.
  senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6, minggu: 7, ahad: 7,
}

// Sorts after every real value, so anything we cannot read sinks to the bottom
// instead of jumping to the top.
const UNKNOWN = Number.MAX_SAFE_INTEGER

function fieldLookup(fields: Record<string, unknown> | null | undefined, re: RegExp): string | null {
  if (!fields) return null
  for (const [k, v] of Object.entries(fields)) {
    if (re.test(k) && v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

/** Day-of-week as 1..7, or UNKNOWN. Accepts a name or a bare number. */
export function parseDayIndex(raw: string | null | undefined): number {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return UNKNOWN
  for (const [name, idx] of Object.entries(DAY_INDEX)) {
    // Substring rather than equality: plans write "Day 1 - Monday", "Senin (H1)".
    if (v.includes(name)) return idx
  }
  const n = v.match(/\d+/)?.[0]
  if (n) {
    const num = Number(n)
    if (num >= 1 && num <= 31) return num
  }
  return UNKNOWN
}

/**
 * The week a brief belongs to, as a sortable number.
 *
 * Handles both shapes seen in real plans: a date ("6/20/2026", "2026-06-20")
 * and a plain week number ("Week 3", "W3", "3").
 */
export function parseWeekKey(raw: string | null | undefined): number {
  const v = (raw || '').trim()
  if (!v) return UNKNOWN

  // A date is unambiguous and sorts correctly across year boundaries, so try it
  // first — but only when the string actually looks like one. `new Date("3")`
  // parses as a year, which would silently rank "Week 3" in the year 2003.
  if (/\d[/-]\d/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.getTime()
  }

  const n = v.match(/\d+/)?.[0]
  return n ? Number(n) : UNKNOWN
}

export type ScheduleKey = { week: number; day: number }

export function briefScheduleKey(fields: Record<string, unknown> | null | undefined): ScheduleKey {
  return {
    week: parseWeekKey(fieldLookup(fields, /\b(week|minggu|pekan|tanggal|date)\b/i)),
    day: parseDayIndex(fieldLookup(fields, /\b(day|hari)\b/i)),
  }
}

export type SortableNaskah = {
  brief_id?: string | null
  day_no?: number | null
  persona_name?: string | null
  created_at?: string | null
}

/**
 * Comparator putting naskah in the order a human reads a content calendar:
 * week, then day, then the multi-day part, then persona (so a day's personas
 * stay together), then creation time as a stable tiebreak.
 *
 * `scheduleOf` maps a row to its brief's schedule — the caller owns that lookup
 * because the queue, the Doc push and the Sheets export each already load
 * briefs differently.
 */
export function compareBySchedule<T extends SortableNaskah>(
  scheduleOf: (row: T) => ScheduleKey,
): (a: T, b: T) => number {
  return (a, b) => {
    const sa = scheduleOf(a)
    const sb = scheduleOf(b)
    if (sa.week !== sb.week) return sa.week - sb.week
    if (sa.day !== sb.day) return sa.day - sb.day
    const da = a.day_no ?? 0
    const db = b.day_no ?? 0
    if (da !== db) return da - db
    const pa = a.persona_name || ''
    const pb = b.persona_name || ''
    const byPersona = pa.localeCompare(pb)
    if (byPersona !== 0) return byPersona
    return (a.created_at || '').localeCompare(b.created_at || '')
  }
}

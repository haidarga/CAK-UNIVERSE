import { describe, it, expect } from 'vitest'
import {
  parseDayIndex, parseWeekKey, briefScheduleKey, compareBySchedule,
} from '@/lib/cakgpt/brief-schedule'

describe('parseDayIndex', () => {
  it('reads English day names', () => {
    expect(parseDayIndex('Monday')).toBe(1)
    expect(parseDayIndex('wednesday')).toBe(3)
    expect(parseDayIndex('Sun')).toBe(7)
  })

  it('reads Indonesian day names', () => {
    expect(parseDayIndex('Senin')).toBe(1)
    expect(parseDayIndex('Rabu')).toBe(3)
    expect(parseDayIndex('Minggu')).toBe(7)
  })

  it('finds the day inside a decorated label', () => {
    // Real plans write things like "Day 1 - Monday" or "Senin (H1)".
    expect(parseDayIndex('Day 1 - Monday')).toBe(1)
    expect(parseDayIndex('Selasa (H2)')).toBe(2)
  })

  it('falls back to a bare number', () => {
    expect(parseDayIndex('3')).toBe(3)
  })

  it('sorts an unreadable day LAST rather than first', () => {
    // A blank must sink to the bottom; ranking it 0 would put every
    // unschedulable brief above Monday.
    expect(parseDayIndex('')).toBeGreaterThan(7)
    expect(parseDayIndex(null)).toBeGreaterThan(7)
    expect(parseDayIndex('whenever')).toBeGreaterThan(7)
  })
})

describe('parseWeekKey', () => {
  it('reads a date and orders it chronologically', () => {
    expect(parseWeekKey('6/20/2026')).toBeLessThan(parseWeekKey('6/21/2026'))
    expect(parseWeekKey('2026-06-20')).toBeLessThan(parseWeekKey('2026-07-01'))
  })

  it('reads a plain week number', () => {
    expect(parseWeekKey('Week 3')).toBe(3)
    expect(parseWeekKey('W3')).toBe(3)
    expect(parseWeekKey('3')).toBe(3)
  })

  it('does not mistake a bare week number for a year', () => {
    // new Date("3") parses as the year 2003, which would rank "Week 3"
    // millions of units away from "Week 4".
    expect(parseWeekKey('3')).toBe(3)
    expect(parseWeekKey('Week 4') - parseWeekKey('Week 3')).toBe(1)
  })

  it('sorts an unreadable week last', () => {
    expect(parseWeekKey('')).toBeGreaterThan(parseWeekKey('12/31/2099'))
    expect(parseWeekKey(null)).toBeGreaterThan(1000)
  })
})

describe('briefScheduleKey', () => {
  it('reads the fields a real content plan uses', () => {
    const k = briefScheduleKey({ day: 'Monday', week: '6/20/2026', region: 'Jepang' })
    expect(k.day).toBe(1)
    expect(k.week).toBe(new Date('6/20/2026').getTime())
  })

  it('accepts Indonesian column names', () => {
    expect(briefScheduleKey({ hari: 'Rabu', minggu: '2' })).toEqual({ day: 3, week: 2 })
  })

  it('returns sink-to-bottom values when the plan has no schedule', () => {
    const k = briefScheduleKey({ topic: 'x' })
    expect(k.day).toBeGreaterThan(7)
    expect(k.week).toBeGreaterThan(1000)
  })

  it('handles null fields', () => {
    expect(() => briefScheduleKey(null)).not.toThrow()
  })
})

describe('compareBySchedule', () => {
  type Row = { id: string; brief_id: string; day_no?: number | null; persona_name?: string | null; created_at?: string }
  const schedules: Record<string, { week: number; day: number }> = {
    b_mon: { week: 1, day: 1 },
    b_tue: { week: 1, day: 2 },
    b_wed: { week: 1, day: 3 },
    b_nextweek: { week: 2, day: 1 },
  }
  const cmp = compareBySchedule<Row>((r) => schedules[r.brief_id])

  it('orders by day within a week, lowest first', () => {
    const rows: Row[] = [
      { id: 'c', brief_id: 'b_wed' },
      { id: 'a', brief_id: 'b_mon' },
      { id: 'b', brief_id: 'b_tue' },
    ]
    expect(rows.sort(cmp).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('orders by week before day', () => {
    const rows: Row[] = [
      { id: 'next', brief_id: 'b_nextweek' },
      { id: 'thisWed', brief_id: 'b_wed' },
    ]
    expect(rows.sort(cmp).map((r) => r.id)).toEqual(['thisWed', 'next'])
  })

  it('keeps a day\'s personas together and alphabetical', () => {
    const rows: Row[] = [
      { id: 'z', brief_id: 'b_mon', persona_name: 'Zoe' },
      { id: 'f', brief_id: 'b_mon', persona_name: 'Fajar' },
      { id: 'o', brief_id: 'b_mon', persona_name: 'Orla' },
    ]
    expect(rows.sort(cmp).map((r) => r.id)).toEqual(['f', 'o', 'z'])
  })

  it('orders a multi-day series by its day number', () => {
    const rows: Row[] = [
      { id: 'd3', brief_id: 'b_mon', persona_name: 'A', day_no: 3 },
      { id: 'd1', brief_id: 'b_mon', persona_name: 'A', day_no: 1 },
      { id: 'd2', brief_id: 'b_mon', persona_name: 'A', day_no: 2 },
    ]
    expect(rows.sort(cmp).map((r) => r.id)).toEqual(['d1', 'd2', 'd3'])
  })

  it('is stable via created_at when everything else ties', () => {
    const rows: Row[] = [
      { id: 'later', brief_id: 'b_mon', persona_name: 'A', created_at: '2026-08-02T10:00:00Z' },
      { id: 'earlier', brief_id: 'b_mon', persona_name: 'A', created_at: '2026-08-01T10:00:00Z' },
    ]
    expect(rows.sort(cmp).map((r) => r.id)).toEqual(['earlier', 'later'])
  })

  it('pushes unschedulable rows to the end', () => {
    const withUnknown = compareBySchedule<Row>((r) => schedules[r.brief_id] ?? briefScheduleKey(null))
    const rows: Row[] = [
      { id: 'noschedule', brief_id: 'b_missing' },
      { id: 'mon', brief_id: 'b_mon' },
    ]
    expect(rows.sort(withUnknown).map((r) => r.id)).toEqual(['mon', 'noschedule'])
  })
})

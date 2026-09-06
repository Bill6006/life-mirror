import { describe, expect, it } from 'vitest'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { contextTrace, dayValues, heatmapRows, lastDays, latestLogged, weekSeries } from './series'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const mk = (day: string, block: CheckIn['block'], answers: Answers, complete = true): CheckIn => ({
  day,
  block,
  answers,
  startedAt: '',
  completedAt: complete ? `${day}T12:00:00.000Z` : null,
  updatedAt: `${day}T12:05:00.000Z`,
  activeMs: 0,
})

describe('series for the mirror', () => {
  it('gives each block its reading, and null where a block is incomplete or absent', () => {
    const all = [mk('2026-09-05', 'morning', allAt(blockReadings('morning'), 3)), mk('2026-09-05', 'evening', { mood: 5, energy: 5 }, false)]
    const d = dayValues(all, '2026-09-05')
    expect(d.values).toEqual({ morning: 50, afternoon: null, evening: null })
    expect(d.times.morning).toBe('2026-09-05T12:00:00.000Z')
    expect(latestLogged(d)).toBe('morning')
    expect(latestLogged(dayValues(all, '2026-09-04'))).toBeNull()
  })

  it('lists the last days ending today, oldest first, and a week of them', () => {
    expect(lastDays('2026-09-05', 3)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05'])
    const week = weekSeries([], '2026-09-05')
    expect(week).toHaveLength(7)
    expect(week[0].day).toBe('2026-08-30')
    expect(week[6].day).toBe('2026-09-05')
  })

  it('sizes the heatmap from the first check-in: at least a week, at most 28 days', () => {
    expect(heatmapRows([], '2026-09-05')).toHaveLength(7)
    const tenDaysAgo = [mk('2026-08-26', 'evening', allAt(blockReadings('evening'), 2))]
    expect(heatmapRows(tenDaysAgo, '2026-09-05')).toHaveLength(11)
    const long = [mk('2026-06-01', 'evening', allAt(blockReadings('evening'), 2))]
    expect(heatmapRows(long, '2026-09-05')).toHaveLength(28)
  })

  it('traces a context reading by block with the phrase headword as its label', () => {
    const all = [mk('2026-09-05', 'morning', { ...allAt(blockReadings('morning'), 3), hunger: 5 }), mk('2026-09-05', 'evening', { ...allAt(blockReadings('evening'), 3), hunger: 1 })]
    expect(contextTrace(all, '2026-09-05', 'hunger')).toEqual([
      { block: 'morning', position: 5, label: 'Ravenous' },
      { block: 'evening', position: 1, label: 'Stuffed' },
    ])
  })
})

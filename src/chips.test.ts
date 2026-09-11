import { describe, expect, it } from 'vitest'
import { chipAnswer } from './chips'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const mk = (day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn => ({
  day,
  block,
  answers: allAt(blockReadings(block), p),
  startedAt: '',
  completedAt: 'x',
  updatedAt: '',
  activeMs: 0,
  extras,
})

describe('the evening chips, answered from the record', () => {
  it('says first time recorded when the record has none', () => {
    expect(chipAnswer([], 'nothingLanded', '2026-09-11')).toEqual({ times: 0, nextDayMean: null, nextDays: 0 })
    const todayOnly = [mk('2026-09-11', 'evening', 3, { nothingLanded: true })]
    expect(chipAnswer(todayOnly, 'nothingLanded', '2026-09-11').times).toBe(0)
  })

  it('counts earlier evenings with the chip and averages the readings of the days after', () => {
    const all = [
      mk('2026-09-01', 'evening', 2, { nothingLanded: true }),
      mk('2026-09-02', 'morning', 4),
      mk('2026-09-02', 'evening', 2),
      mk('2026-09-05', 'evening', 1, { nothingLanded: true }),
      mk('2026-09-06', 'evening', 4),
      mk('2026-09-08', 'evening', 1, { hardToSeePoint: true }),
    ]
    const a = chipAnswer(all, 'nothingLanded', '2026-09-11')
    expect(a.times).toBe(2)
    expect(a.nextDays).toBe(3)
    // Every reading at one position scores 50: three ingredients read up, three read down.
    expect(a.nextDayMean).toBe(50)
    const b = chipAnswer(all, 'hardToSeePoint', '2026-09-11')
    expect(b).toEqual({ times: 1, nextDayMean: null, nextDays: 0 })
  })
})

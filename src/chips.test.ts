import { describe, expect, it } from 'vitest'
import { chipStates } from './audit'
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
  activeMs: 30_000,
  extras,
})

describe('the evening chips, answered from the record like for like', () => {
  it('says first time recorded when the record has none', () => {
    expect(chipAnswer([], 'nothingLanded', '2026-09-11').times).toBe(0)
    const todayOnly = [mk('2026-09-11', 'evening', 3, { nothingLanded: true })]
    expect(chipAnswer(todayOnly, 'nothingLanded', '2026-09-11').times).toBe(0)
  })

  it('counts earlier evenings with the chip and sets the mornings after against the mornings after evenings that started the same', () => {
    const all = [
      mk('2026-09-01', 'evening', 2, { nothingLanded: true }),
      mk('2026-09-02', 'morning', 4),
      mk('2026-09-02', 'evening', 2),
      mk('2026-09-03', 'morning', 2),
      mk('2026-09-05', 'evening', 1, { nothingLanded: true }),
      mk('2026-09-06', 'morning', 4),
      mk('2026-09-06', 'evening', 4),
      mk('2026-09-08', 'evening', 1, { hardToSeePoint: true }),
    ]
    const a = chipAnswer(all, 'nothingLanded', '2026-09-11')
    expect(a.times).toBe(2)
    expect(a.withEvent.n).toBe(2)
    // Every reading at one position scores 50: three ingredients read up, three read down.
    expect(a.withEvent.mean).toBe(50)
    expect(a.without.n).toBe(1)
    // The one comparison evening (09-02, all at 2) started in the same band as 09-01 (all at 2): a matched difference of zero.
    expect(a.bands).toBe(1)
    expect(a.diff).toBe(0)
    const b = chipAnswer(all, 'hardToSeePoint', '2026-09-11')
    expect(b.times).toBe(1)
    expect(b.withEvent.n).toBe(0)
    expect(b.withEvent.mean).toBeNull()
    expect(chipAnswer(all, 'coolingOff', '2026-09-11').times).toBe(0)
  })
})

describe('the Caffeine item retires by the check-ins it was shown in', () => {
  it('counts only windows where it was on screen, any block, and a single band keeps it', () => {
    const shown = Array.from({ length: 31 }, (_, i) => mk('2026-08-' + String(i + 1).padStart(2, '0'), i % 2 ? 'morning' : 'afternoon', 3, { caffeineShown: true }))
    const states = chipStates(shown, [], {}, '2026-09-01')
    expect(states.find((s) => s.id === 'caffeine')).toMatchObject({ evenings: 31, retired: true })
    // Windows it was never shown in count for nothing: silence is not evidence.
    const unseen = Array.from({ length: 31 }, (_, i) => mk('2026-08-' + String(i + 1).padStart(2, '0'), 'morning', 3))
    expect(chipStates(unseen, [], {}, '2026-09-01').find((s) => s.id === 'caffeine')).toMatchObject({ evenings: 0, retired: false })
    const once = shown.map((c, i) => (i === 29 ? { ...c, extras: { ...c.extras, caffeineIntake: { band: 2 as const, at: '2026-08-30T08:00:00.000Z', since: null } } } : c))
    expect(chipStates(once, [], {}, '2026-09-01').find((s) => s.id === 'caffeine')?.retired).toBe(false)
  })
})

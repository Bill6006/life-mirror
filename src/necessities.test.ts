import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { chipRetired, chipStates, CHIP_STRETCH } from './audit'
import { addDays } from './blocks'
import { db, getCheckIn, setNecessity, setTeethBrushed, type CheckIn, type Extras } from './db'
import { lastNightKeys } from './forecastFlow'
import { necessitiesMissed, TEETH_COUNT_SINCE, teethOf } from './necessities'
import { blockReadings } from './readings'

// Teeth brushed today (2026-10-02): a count, 0, 1 or 2 (twice or more), from explicit taps only. An
// older record's "Teeth not brushed" tap still says what it said, not brushed, and never how often.

const evening = (day: string, extras?: Extras): CheckIn => ({ day, block: 'evening', answers: {}, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000, extras })

describe('teeth brushed today', () => {
  it('reads the count tapped; an older miss as none; nothing tapped as unknown', () => {
    expect(teethOf({ teethBrushed: 2 })).toBe(2)
    expect(teethOf({ teethBrushed: 1 })).toBe(1)
    expect(teethOf({ teethBrushed: 0 })).toBe(0)
    expect(teethOf({ necessities: { teeth: true } })).toBe(0)
    expect(teethOf({})).toBeNull()
    expect(teethOf(undefined)).toBeNull()
    expect(teethOf({ necessities: { shower: true } })).toBeNull()
    // A count tapped later stands over an older miss.
    expect(teethOf({ teethBrushed: 2, necessities: { teeth: true } })).toBe(2)
  })

  it('counts a necessity missed only for none: once or twice is no miss, and unknown is never one', () => {
    expect(necessitiesMissed({ teethBrushed: 0 })).toEqual(['teeth'])
    expect(necessitiesMissed({ teethBrushed: 1 })).toEqual([])
    expect(necessitiesMissed({ teethBrushed: 2 })).toEqual([])
    expect(necessitiesMissed({})).toEqual([])
    expect(necessitiesMissed({ necessities: { teeth: true } })).toEqual(['teeth'])
    expect(necessitiesMissed({ necessities: { shower: true, food: true }, teethBrushed: 0 })).toEqual(['shower', 'teeth', 'food'])
  })

  it('sets last night’s comparison from the same rule: none is a necessity missed, twice is not, an older miss still is', () => {
    expect(lastNightKeys(evening('2026-10-02', { teethBrushed: 0 }), undefined, false)).toEqual(['necessity'])
    expect(lastNightKeys(evening('2026-10-02', { teethBrushed: 2 }), undefined, false)).toEqual([])
    expect(lastNightKeys(evening('2026-09-20', { necessities: { teeth: true } }), undefined, false)).toEqual(['necessity'])
    expect(lastNightKeys(evening('2026-10-02', {}), undefined, false)).toEqual([])
  })

  it('counts any tapped count as an answer for the chip audit, over evenings from the count’s first day only', () => {
    const today = addDays(TEETH_COUNT_SINCE, CHIP_STRETCH + 5)
    // Forty evenings before the count existed with no miss tapped: they no longer count against it.
    const before = Array.from({ length: 40 }, (_, i) => evening(addDays(TEETH_COUNT_SINCE, -(i + 1))))
    const since = (n: number, extras?: Extras) => Array.from({ length: n }, (_, i) => evening(addDays(TEETH_COUNT_SINCE, i), extras))
    expect(chipRetired('teeth', chipStates([...before, ...since(5)], [], {}, today))).toBe(false)
    // Thirty evenings of the count left untapped retire it, as any chip; one count tapped keeps it.
    expect(chipRetired('teeth', chipStates([...before, ...since(CHIP_STRETCH)], [], {}, today))).toBe(true)
    const tapped = [...since(CHIP_STRETCH - 1), evening(addDays(TEETH_COUNT_SINCE, CHIP_STRETCH - 1), { teethBrushed: 2 })]
    expect(chipRetired('teeth', chipStates([...before, ...tapped], [], {}, today))).toBe(false)
  })
})

describe('setting the count', () => {
  const slot = { day: '2026-10-02', block: 'evening' as const }
  const asked = blockReadings('evening')
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('stores only what is tapped, takes it back on a second tap, and lets an older miss give way to it', async () => {
    await setTeethBrushed(slot, asked, 1)
    expect((await getCheckIn(slot.day, slot.block))?.extras?.teethBrushed).toBe(1)
    await setTeethBrushed(slot, asked, null)
    const cleared = (await getCheckIn(slot.day, slot.block))?.extras
    expect(cleared?.teethBrushed).toBeUndefined()
    expect(teethOf(cleared)).toBeNull()

    // A record from before the count, its miss tapped: a count tapped now replaces the miss, and nothing else moves.
    await setNecessity(slot, asked, 'teeth', true)
    await setNecessity(slot, asked, 'shower', true)
    await setTeethBrushed(slot, asked, 2)
    const ex = (await getCheckIn(slot.day, slot.block))?.extras
    expect(ex?.necessities).toEqual({ shower: true })
    expect(ex?.teethBrushed).toBe(2)
    expect(necessitiesMissed(ex)).toEqual(['shower'])
  })

  it('never writes a count by itself: a record touched otherwise holds none', async () => {
    await setNecessity(slot, asked, 'food', true)
    const ex = (await getCheckIn(slot.day, slot.block))?.extras
    expect(ex?.teethBrushed).toBeUndefined()
    expect(teethOf(ex)).toBeNull()
  })
})

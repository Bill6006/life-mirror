import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The level-plus-weekday way under the comparisons' guard (Stage A, 2026-11-21): the way is new math, so the writer asks
// it under the same guard as the challenger. If it throws, the day is left to the four and the failure is kept for the
// Worker's report by its error's name alone. The way's reader is made to throw here on demand, and its asks are counted:
// the writer asks one reader a run, and none while the way is switched off.
const state = vi.hoisted(() => ({ fail: false, readers: 0 }))
vi.mock('./levelWeekday', async (original) => {
  const real = await original<typeof import('./levelWeekday')>()
  return {
    ...real,
    levelWeekdayReader: (...args: Parameters<typeof real.levelWeekdayReader>) => {
      state.readers++
      const reader = real.levelWeekdayReader(...args)
      return state.fail
        ? {
            ...reader,
            rows: () => {
              throw new RangeError('a stand-in failure of the way')
            },
          }
        : reader
    },
  }
})

import { setChallengerForTests } from './challenger'
import { comparisonFaults, resetComparisonFaults } from './counted/fault'
import { db, type CheckIn, type Forecast } from './db'
import { LEVEL_WEEKDAY, MODELS } from './forecast'
import { runForecasting } from './forecastFlow'
import { setLevelWeekdayForTests } from './levelWeekday'
import { RHYTHM_TODAY, rhythmCheckins } from './levelWeekdayTesting'

async function written(checkins: () => CheckIn[], way: boolean, challenger: boolean): Promise<Forecast[]> {
  await db.delete()
  await db.open()
  await db.checkins.bulkAdd(checkins())
  setLevelWeekdayForTests(way)
  setChallengerForTests(challenger)
  await runForecasting(RHYTHM_TODAY)
  return (await db.forecasts.toArray()).map(({ id: _id, ...row }) => row)
}

beforeEach(() => {
  state.fail = false
  state.readers = 0
  resetComparisonFaults()
})
afterEach(() => {
  setLevelWeekdayForTests(null)
  setChallengerForTests(null)
})

describe('the level-plus-weekday way under the comparisons’ guard', () => {
  for (const challenger of [false, true]) {
    it(`leaves the day to the four where the way throws, and keeps the failure for the Worker’s report (the challenger ${challenger ? 'on' : 'off'})`, async () => {
      const four = await written(() => rhythmCheckins(true), false, challenger)
      // The probe: not throwing, the way writes the day.
      expect((await written(() => rhythmCheckins(true), true, challenger)).every((f) => f.model === LEVEL_WEEKDAY)).toBe(true)
      expect(comparisonFaults()).toBeNull()
      state.fail = true
      const after = await written(() => rhythmCheckins(true), true, challenger)
      expect(after.length).toBeGreaterThan(20)
      expect(after.every((f) => (MODELS as readonly string[]).includes(f.model) && f.four === undefined)).toBe(true)
      expect(JSON.stringify(after)).toBe(JSON.stringify(four))
      expect(comparisonFaults()).toEqual({ count: 1, first: RHYTHM_TODAY, last: RHYTHM_TODAY, name: 'RangeError' })
    }, 60_000)
  }

  it('asks one reader a run, the challenger’s forecasts of the way included, and none while the way is switched off', async () => {
    const rows = await written(() => rhythmCheckins(true), true, true)
    expect(rows.some((f) => f.model === LEVEL_WEEKDAY && typeof f.adj === 'number')).toBe(true)
    expect(state.readers).toBe(1)
    state.readers = 0
    await written(() => rhythmCheckins(true), false, true)
    expect(state.readers).toBe(0)
  }, 60_000)
})

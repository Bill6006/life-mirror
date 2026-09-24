import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { contextFromWeek, db, getSettings, type CheckIn, type OutsideDay } from './db'
import { evidence } from './learningFlow'
import { daylightFor, withDefaults } from './settings'
import { eveningWorkoutDays, hardDays, isHard, lastWorkout, sessionSlot } from './workouts'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// Part 35: the other app's sessions read in full, the two comparisons they allow, and daylight from
// where you are. Zero taps: the workouts come from the other app's rows, the sun from arithmetic.

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).toISOString()
const session = (id: string, d: number, h: number, extra: Partial<OutsideDay> = {}): OutsideDay => ({ id, day: `2026-09-${String(d).padStart(2, '0')}`, minutes: 45, at: at(d, h), source: 'workout', ...extra })

describe('the sessions, read in full', () => {
  it('knows when each ended: an evening one, a morning one, and the small hours counting to the evening before', () => {
    expect(sessionSlot(session('a', 20, 18))).toEqual({ day: '2026-09-20', block: 'evening' })
    expect(sessionSlot(session('b', 20, 7))).toEqual({ day: '2026-09-20', block: 'morning' })
    expect(sessionSlot({ at: at(21, 1) })).toEqual({ day: '2026-09-20', block: 'evening' })
    expect(sessionSlot({ at: 'not a time' })).toBeNull()
    expect([...eveningWorkoutDays([session('a', 20, 18), session('b', 21, 7)])]).toEqual(['2026-09-20'])
  })

  it('calls a session hard when you rated it too hard, or its working sets went close to failure, and never from silence', () => {
    expect(isHard({ effort: 'too-hard' })).toBe(true)
    expect(isHard({ effort: 'right', avgRir: 1 })).toBe(true)
    expect(isHard({ effort: 'right', avgRir: 2 })).toBe(false)
    expect(isHard({})).toBe(false)
    expect([...hardDays([session('a', 20, 18, { effort: 'too-hard' }), session('b', 21, 7, { avgRir: 3 })])]).toEqual(['2026-09-20'])
  })

  it('finds the last session, whatever order the rows came in', () => {
    expect(lastWorkout([session('a', 20, 18), session('b', 22, 7), session('c', 21, 19)])?.id).toBe('b')
    expect(lastWorkout([])).toBeNull()
  })
})

describe('daylight from where you are', () => {
  it('uses the hours you set until a place is set, then the sun there', () => {
    const none = withDefaults({})
    expect(none.place).toBeNull()
    expect(daylightFor(none, '2026-06-21')).toEqual({ from: '07:00', to: '19:00' })
    const set = withDefaults({ place: { lat: 40.7, lon: -74.0 } })
    const june = daylightFor(set, '2026-06-21')
    const december = daylightFor(set, '2026-12-21')
    // Longer days in June than in December, whatever this machine's own time zone.
    const len = (w: { from: string; to: string }) => {
      const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
      return (m(w.to) - m(w.from) + 1440) % 1440
    }
    expect(len(june) - len(december)).toBeGreaterThan(5 * 60)
    // Anything stored that is not a place in range is no place.
    expect(withDefaults({ place: { lat: 95, lon: 0 } } as never).place).toBeNull()
    expect(withDefaults({ place: 'somewhere' } as never).place).toBeNull()
  })

  it('keeps the day’s light on its record once a place is set, and nothing before', async () => {
    expect(contextFromWeek('2026-09-24', withDefaults({})).light).toBeUndefined()
    const light = contextFromWeek('2026-09-24', withDefaults({ place: { lat: 40.7, lon: -74.0 } })).light
    expect(light?.rise).toMatch(/^\d{2}:\d{2}$/)
    expect(light?.set).toMatch(/^\d{2}:\d{2}$/)
    expect((await getSettings()).place).toBeNull()
  })
})

describe('the two comparisons, like for like', () => {
  const all = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
  const ci = (day: string, block: CheckIn['block'], p: Position, over: Partial<Answers> = {}): CheckIn => ({ day, block, answers: { ...all(blockReadings(block), p), ...over }, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('sets an evening session against the next morning and its sleep, and a hard session against the next morning’s four readings', async () => {
    // Ten evenings at the middle band; the mornings after the three evening sessions read higher and slept better.
    const checkins: CheckIn[] = []
    for (let d = 10; d <= 19; d++) {
      const day = `2026-09-${d}`
      const next = `2026-09-${d + 1}`
      const after = [12, 14, 16].includes(d)
      checkins.push(ci(day, 'evening', 3))
      checkins.push(ci(next, 'morning', after ? 4 : 3, { sleepQuality: after ? 5 : 3, energy: after ? 4 : 3, stress: after ? 2 : 3, focus: 3 }))
    }
    await db.checkins.bulkAdd(checkins)
    await db.outside.bulkPut([session('e1', 12, 19, { effort: 'too-hard' }), session('e2', 14, 18, { avgRir: 0.5 }), session('e3', 16, 20, { effort: 'too-hard' }), session('m1', 18, 7, { effort: 'right' })])
    const ev = await evidence('2026-09-21')
    expect(ev.eveningWorkout?.morning.times).toBe(3)
    expect(ev.eveningWorkout?.morning.diff).toBeGreaterThan(0)
    expect(ev.eveningWorkout?.sleep.diff).toBe(50)
    expect(ev.hardWorkout?.times).toBe(3)
    expect(ev.hardWorkout?.measures.energy.diff).toBe(1)
    expect(ev.hardWorkout?.measures.stress.diff).toBe(-1)
    expect(ev.hardWorkout?.measures.focus.diff).toBe(0)
  })
})

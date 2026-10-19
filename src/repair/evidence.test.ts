import { describe, expect, it } from 'vitest'
import { addDays } from '../blocks'
import type { TrackCall } from './engine'
import { orderTests, repairEvidenceFrom, revisedKeys, trackLines, type TestShown } from './evidence'
import { START, walkRecord } from './fixtures'
import { builtThrough, type RepairRecord } from './record'

// The learning repair on the screens (stage R4): the tests by rung, the ones the queue runs first; a test whose call did
// not hold marked revised; the track record counted by rung; and one rebuild shared by every screen while the record
// stands still.

const shown = (over: Partial<TestShown>): TestShown => ({ key: 'a|stress|nextBlock', moveId: 'a', target: 'stress', window: 'nextBlock', level: 'none', direction: null, revised: false, theta: null, lo: null, hi: null, offered: 5, heldBack: 5, days: 10, ctx: [], running: false, ...over })
const tc = (over: Partial<TrackCall>): TrackCall => ({ key: 'k', ctx: null, rung: 'early', direction: 'helps', day: 1, p: 0.85, held: null, resolved: null, ...over })

describe('the tests as the screens show them', () => {
  it('the ones the queue runs first, then established, likely, early sign, no call; helps before hurts before little difference', () => {
    const tests = [
      shown({ key: 'q', level: 'none' }),
      shown({ key: 'e', level: 'early', direction: 'little' }),
      shown({ key: 'f', level: 'early', direction: 'helps' }),
      shown({ key: 'r', level: 'none', running: true }),
      shown({ key: 's', level: 'established', direction: 'hurts' }),
      shown({ key: 'l', level: 'likely', direction: 'hurts' }),
    ]
    expect([...tests].sort(orderTests).map((t) => t.key)).toEqual(['r', 's', 'l', 'f', 'e', 'q'])
  })

  it('a test whose call did not hold is marked revised; a context call that did not hold marks no test', () => {
    const track = [tc({ key: 'x', held: false }), tc({ key: 'y', held: true }), tc({ key: 'z', held: false, ctx: 'withHer=1' }), tc({ key: 'w' })]
    expect([...revisedKeys(track)]).toEqual(['x'])
  })

  it('the track record by rung: resolved, held, open, whether enough have resolved, and the rate tested', () => {
    const track = [tc({ held: true, resolved: 4 }), tc({ held: false, resolved: 5 }), tc({}), tc({ rung: 'established', direction: 'hurts' })]
    const [early, likely, established] = trackLines(track, { early: false, likely: false, established: true })
    expect(early).toEqual({ rung: 'early', resolved: 2, held: 1, open: 1, enough: false, tightened: false, tested: 2 / 3 })
    expect(likely).toMatchObject({ resolved: 0, held: 0, open: 0 })
    expect(established).toMatchObject({ resolved: 0, open: 1, tightened: true, tested: 19 / 20 })
  })

  it('ten resolved of a rung are enough for its own record to stand', () => {
    const track = Array.from({ length: 10 }, (_, i) => tc({ key: `k${i}`, held: i < 8, resolved: i + 2 }))
    expect(trackLines(track, { early: false, likely: false, established: false })[0]).toMatchObject({ resolved: 10, held: 8, enough: true })
  })
})

describe('read from the record', () => {
  it('lists the walk’s tests with decisions on both sides, the one the queue runs marked, and keeps no test twice', () => {
    const ev = repairEvidenceFrom(walkRecord(12), addDays(START, 12))
    const all = [...ev.shown, ...ev.quiet]
    expect(all.length).toBeGreaterThan(0)
    expect(new Set(all.map((t) => t.key)).size).toBe(all.length)
    expect(all.every((t) => t.moveId === 'walk-ten' && t.offered >= 1 && t.heldBack >= 1)).toBe(true)
    expect(ev.shown.some((t) => t.running)).toBe(true)
    expect(ev.quiet.every((t) => !t.running && t.level === 'none')).toBe(true)
    expect(ev.track.map((l) => l.rung)).toEqual(['early', 'likely', 'established'])
  })

  it('a strong effect of the walk on stress reaches a call that helps', () => {
    const ev = repairEvidenceFrom(walkRecord(14, true), addDays(START, 14))
    const stress = ev.shown.find((t) => t.key === 'walk-ten|stress|nextBlock')
    expect(stress?.direction).toBe('helps')
    expect(['early', 'likely', 'established']).toContain(stress?.level)
    expect(stress?.theta).toBeGreaterThan(0)
  })
})

describe('a call that newer evidence contradicts', () => {
  it('an effect that reverses: its established call is withdrawn and counted as not held, and the test is marked revised', () => {
    const ev = repairEvidenceFrom(walkRecord(60, true, 20), addDays(START, 60))
    const stress = ev.shown.find((t) => t.key === 'walk-ten|stress|nextBlock')
    expect(stress?.direction).toBe('hurts')
    expect(stress?.revised).toBe(true)
    const established = ev.track.find((l) => l.rung === 'established')
    expect(established).toMatchObject({ resolved: 1, held: 0 })
  })
})

describe('one rebuild shared while the record stands still', () => {
  it('the same record and day give the very same build; a changed answer or another day gives a new one', () => {
    const r = walkRecord(8)
    const day = addDays(START, 8)
    const a = builtThrough(r, day)
    expect(builtThrough(walkRecord(8), day)).toBe(a)
    expect(builtThrough(r, addDays(day, 1))).not.toBe(a)
    const base = walkRecord(8)
    const changed: RepairRecord = { ...base, outcomes: base.outcomes.map((o, i) => (i === 3 ? { ...o, outcome: 'no' as const } : o)) }
    const b = builtThrough(changed, day)
    expect(b).not.toBe(a)
    expect(builtThrough(r, day)).not.toBe(b)
  })
})

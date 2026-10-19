import { describe, expect, it, vi } from 'vitest'
import { addDays, BLOCKS } from '../blocks'
import { EngineB, heldUpper, IN_APP, REPAIR, rungThresholds, tightenFrom, trackStep, type BConfig, type Rung, type TrackCall } from './engine'
import { evidenceOf } from './evidence'
import { START, walkRecord } from './fixtures'
import { answeredOf, contextOf, responseOf, type RepairRecord } from './record'

// Requirement 15 (stage R4): every early sign, likely and established call kept with its day, rung, direction and
// probability, and resolved later on its own test's evidence; the thresholds tightened only by a record of calls not
// holding, and never loosened past the simulation's values.

const KEY = 'walk-ten|stress|nextBlock'

/** One test's days of calls, run through the record from nothing: the calls kept, each as it ended. */
function run(days: [level: TrackCall['rung'] | 'none', direction: TrackCall['direction'] | null][], revisedOn: number | null = null): TrackCall[] {
  let open: TrackCall[] = []
  const kept: TrackCall[] = []
  days.forEach(([level, direction], d) => {
    const { still, opened } = trackStep(open, KEY, null, level, direction, d, 0.9, revisedOn !== null && d >= revisedOn ? revisedOn : null)
    if (opened) kept.push(opened)
    open = still
  })
  return kept
}

const call = (rung: Rung, direction: TrackCall['direction'], held: boolean | null, n: number): TrackCall[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, ctx: null, rung, direction, day: i, p: 0.9, held, resolved: held === null ? null : i + 1 }))

describe('the track record keeps every call, once', () => {
  it('keeps an early sign the first day it is reached, with its day, rung, direction and probability', () => {
    const [c] = run([['none', null], ['early', 'helps']])
    expect(c).toEqual({ key: KEY, ctx: null, rung: 'early', direction: 'helps', day: 1, p: 0.9, held: null, resolved: null })
  })

  it('reaching the same rung and direction again while it is open is the same call', () => {
    expect(run([['early', 'helps'], ['early', 'helps'], ['none', null], ['early', 'helps']])).toHaveLength(1)
  })

  it('a lower rung in the direction of an open, higher call is no new call', () => {
    const kept = run([['early', 'helps'], ['likely', 'helps'], ['early', 'helps']])
    expect(kept.map((c) => c.rung)).toEqual(['early', 'likely'])
  })
})

describe('a call resolves on its own test’s evidence', () => {
  it('an early sign holds when its test reaches likely in the same direction', () => {
    const [early, likely] = run([['early', 'helps'], ['likely', 'helps']])
    expect(early).toMatchObject({ held: true, resolved: 1 })
    expect(likely).toMatchObject({ rung: 'likely', held: null })
  })

  it('an early sign and a likely call both hold when the test is established in their direction', () => {
    const kept = run([['early', 'hurts'], ['likely', 'hurts'], ['established', 'hurts']])
    expect(kept.map((c) => [c.rung, c.held])).toEqual([
      ['early', true],
      ['likely', true],
      ['established', null],
    ])
  })

  it('an early sign does not hold when its test reaches any rung in another direction', () => {
    const [helps, little] = run([['early', 'helps'], ['early', 'little']])
    expect(helps).toMatchObject({ held: false, resolved: 1 })
    expect(little).toMatchObject({ rung: 'early', direction: 'little', held: null })
  })

  it('an early sign whose test falls back to no call stays open', () => {
    const [c] = run([['early', 'helps'], ['none', null], ['none', null]])
    expect(c.held).toBeNull()
  })

  it('an established call withdrawn (revised) does not hold; one never withdrawn holds once it has stood sixty days', () => {
    const days = (n: number) => Array.from({ length: n }, () => ['established', 'helps'] as ['established', 'helps'])
    const [withdrawn] = run([...days(10), ['early', 'helps']], 10)
    expect(withdrawn).toMatchObject({ held: false, resolved: 10 })
    expect(run(days(60))[0].held).toBeNull()
    expect(run(days(61))[0]).toMatchObject({ held: true, resolved: 60 })
  })

  it('a withdrawal before a later established call does not count against it', () => {
    let open: TrackCall[] = []
    let kept: TrackCall | null = null
    for (let d = 20; d <= 30; d++) {
      const { still, opened } = trackStep(open, KEY, null, 'established', 'helps', d, 0.97, 5)
      kept = kept ?? opened
      open = still
    }
    expect(kept?.held).toBeNull()
  })
})

describe('the thresholds follow the record, never looser than the simulation', () => {
  it('the exact interval’s upper end, as the Clopper and Pearson tables give it for ten', () => {
    const table: [number, number][] = [
      [0, 0.3085],
      [3, 0.6525],
      [4, 0.7376],
      [5, 0.8129],
      [7, 0.9333],
      [9, 0.9975],
    ]
    for (const [k, upper] of table) expect(heldUpper(k, 10)).toBeCloseTo(upper, 3)
    expect(heldUpper(10, 10)).toBe(1)
    expect(heldUpper(0, 0)).toBe(1)
  })

  const none = { early: false, likely: false, established: false }

  it('the simulation’s rates stand until ten of a rung’s calls resolve, however few held', () => {
    expect(tightenFrom([...call('early', 'helps', false, 9)], none).early).toBe(false)
    expect(tightenFrom([...call('early', 'helps', false, 9), ...call('early', 'helps', null, 30)], none).early).toBe(false)
  })

  it('a rung tightens once its calls’ interval lies wholly below the rate tested: early signs at 3 of 10 held, not 4', () => {
    expect(tightenFrom([...call('early', 'helps', true, 3), ...call('early', 'helps', false, 7)], none).early).toBe(true)
    expect(tightenFrom([...call('early', 'helps', true, 4), ...call('early', 'helps', false, 6)], none).early).toBe(false)
  })

  it('likely calls at 4 of 10 held and established calls at 7 of 10 tighten their own rung alone', () => {
    const likely = tightenFrom([...call('likely', 'helps', true, 4), ...call('likely', 'helps', false, 6)], none)
    expect(likely).toEqual({ early: false, likely: true, established: false })
    const established = tightenFrom([...call('established', 'helps', true, 7), ...call('established', 'helps', false, 3)], none)
    expect(established).toEqual({ early: false, likely: false, established: true })
  })

  it('tightened, it stays so until the share held is back at the rate tested, then returns to the simulation’s value', () => {
    const tight = { ...none, early: true }
    expect(tightenFrom([...call('early', 'helps', true, 7), ...call('early', 'helps', false, 5)], tight).early).toBe(true)
    expect(tightenFrom([...call('early', 'helps', true, 9), ...call('early', 'helps', false, 4)], tight).early).toBe(false)
  })

  it('a record of calls holding never moves a rung past the simulation’s value: there is no looser state', () => {
    expect(tightenFrom([...call('early', 'helps', true, 50), ...call('likely', 'helps', true, 50), ...call('established', 'helps', true, 50)], none)).toEqual(none)
  })

  it('in force: the simulation’s own thresholds, or a tightened rung’s allowed error halved', () => {
    const cfg = { tauEarly: 0.8, tauLikely: 0.95 }
    expect(rungThresholds(cfg, none)).toEqual({ early: 0.8, likely: 0.95, estScale: 1 })
    const t = rungThresholds(cfg, { early: true, likely: true, established: true })
    expect(t.early).toBeCloseTo(0.9, 12)
    expect(t.likely).toBeCloseTo(0.975, 12)
    expect(t.estScale).toBe(0.5)
    expect(rungThresholds(cfg, { ...none, likely: true })).toEqual({ early: 0.8, likely: t.likely, estScale: 1 })
  })
})

/** A record replayed through an engine of these settings, with calls put into its track record first. */
function replayed(r: RepairRecord, days: number, cfg: BConfig, inject: TrackCall[] = []): EngineB {
  const e = new EngineB(() => 0.5, cfg, new Set(), [], null, () => null, (d) => addDays(START, d))
  ;(e as unknown as { track: TrackCall[] }).track.push(...inject)
  const outcomeOf = new Map(r.outcomes.map((o) => [o.offerId, o]))
  for (let d = 0; d < days; d++) {
    e.learn(d)
    const day = addDays(START, d)
    const ctx = contextOf(day, r.days.find((x) => x.day === day), r.checkins.find((x) => x.day === day && x.block === 'morning'))
    for (const b of BLOCKS) {
      const ci = r.checkins.find((x) => x.day === day && x.block === b)
      if (!ci) continue
      e.observe(answeredOf(ci), d, ctx)
      const o = r.offers.find((x) => x.day === day && x.block === b)
      if (!o) continue
      const id = e.replayOffer(answeredOf(ci), d, ctx, o.target, o.candidates, o.moveId, o.propensities ?? {}, [], false)
      e.respond(id, responseOf(o, outcomeOf.get(o.id as number)))
    }
  }
  return e
}

/** Ten resolved calls of a rung, some held: another test's record, put in to move the rung. */
const record = (rung: Rung, held: number, notHeld: number): TrackCall[] => Array.from({ length: held + notHeld }, (_, i) => ({ key: `other${i}`, ctx: null, rung, direction: 'helps', day: 0, p: 0.9, held: i < held, resolved: 0 }))

describe('the engine runs the rule only as the app does', () => {
  it('the judged design keeps the rule off; the app runs the same design with it on', () => {
    expect(REPAIR.trackRule).toBe(false)
    expect(IN_APP).toEqual({ ...REPAIR, trackRule: true })
  })

  it('each day’s learning tightens a rung from its record while the rule is on, and never while it is off', () => {
    for (const [cfg, on] of [
      [REPAIR, false],
      [IN_APP, true],
    ] as const) {
      const e = replayed(walkRecord(1), 1, cfg, record('early', 3, 7))
      expect(e.tightened().early).toBe(on)
      expect(e.tightened().likely).toBe(false)
    }
  })

  it('a tightened established rung widens the sequence every established call rests on', () => {
    const r = walkRecord(24, true)
    const key = 'walk-ten|stress|nextBlock'
    const plain = replayed(r, 24, IN_APP)
    const tight = replayed(r, 24, IN_APP, record('established', 7, 3))
    expect(tight.tightened().established).toBe(true)
    const width = (e: EngineB) => {
      const c = e.callOfTest(e.testsNow().get(key) as never)
      return (c.csHi as number) - (c.csLo as number)
    }
    expect(width(plain)).toBeGreaterThan(0)
    expect(width(tight)).toBeGreaterThan(width(plain))
  })

  it('every lower rung’s call reads the probability in force', () => {
    const spy = vi.spyOn(EngineB.prototype as unknown as { tauOf: (r: 'early' | 'likely') => number }, 'tauOf')
    try {
      replayed(walkRecord(24, true), 24, IN_APP)
      expect(spy).toHaveBeenCalledWith('likely')
      expect(spy).toHaveBeenCalledWith('early')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('a test whose call did not hold, as the screens show it', () => {
  it('is marked revised, though the engine withdrew no established call of it', () => {
    const key = 'walk-ten|stress|nextBlock'
    const plain = evidenceOf(replayed(walkRecord(24, true), 24, IN_APP)).shown.find((t) => t.key === key)
    expect(plain?.revised).toBe(false)
    const failed: TrackCall = { key, ctx: null, rung: 'early', direction: 'hurts', day: 0, p: 0.85, held: false, resolved: 1 }
    const marked = evidenceOf(replayed(walkRecord(24, true), 24, IN_APP, [failed])).shown.find((t) => t.key === key)
    expect(marked?.revised).toBe(true)
    expect(marked?.level).toBe(plain?.level)
  })
})

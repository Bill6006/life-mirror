import { BLOCKS, type Block } from '../src/blocks'
import { hasMove, moveById, NOTHING, type Strength, type Window } from '../src/catalogue'
import type { ReadingId } from '../src/readings'
import { B_DEFAULT, clsOf, CONTEXTS, EngineB, type BConfig, type CallB, type Direction, type Level, type Test } from './engineB'
import type { Scenario } from './scenarios'
import { phi, stream } from './stats'
import { DAYS, reach, windowOfMove, World } from './world'

// One simulated person through one engine, start to finish, and what the metrics need from it.
// Nothing here judges: the metrics read these results against the frozen criteria.

export interface TrackA {
  key: string
  first: Partial<Record<'promising' | 'holdsUp' | 'unhelpful', { day: number; right: boolean }>>
}

export interface PersonA {
  engine: 'A'
  seed: number
  tracked: TrackA[]
  holdsUp: { key: string; day: number; truth: number }[]
  offers: number
  moveOffers: number
  benefit: number
  checkins: number
}

export interface TrackB {
  key: string
  truth: number
  ittTruth: number
  first: Partial<Record<Level, { day: number; dir: Direction }>>
  firstRight: Partial<Record<Level, number>>
  littleEst: number | null
  revisedDay: number | null
  establishedAtEnd: boolean
  d90: { theta: number; se: number } | null
  d180: { theta: number; se: number } | null
  post120: number | null
  coverAll: boolean | null
  /** Looks with fewer than ten per arm (and enough for a call): how many, and how many of their 95 % belief intervals held the truth. */
  sparseLooks: number
  sparseCovered: number
  offersAfter30: number
  eligibleAfter30: number
  /** The first day each context value's call reached likely or better, with its direction, and the truth there. */
  ctx: Record<string, { day: number; dir: Direction; level: Level; truth: number }>
  establishedCount: number
  /** At the end: decisions per arm, the confidence sequence's half-width on the effect of offering, and every offer of the move. */
  n1End: number
  n0End: number
  csHalfEnd: number | null
  offersAll: number
}

export interface PersonB {
  engine: 'B'
  seed: number
  tracked: TrackB[]
  /** Every established call made, the first time each test or context value reached it in a direction, with the truth. */
  est: { key: string; ctx: string | null; day: number; dir: Direction; truth: number }[]
  /** Every first reach of a level in a direction, for the ladder's calibration. */
  ladder: { key: string; ctx: string | null; level: Level; dir: Direction; truth: number; day: number }[]
  offers: number
  moveOffers: number
  lowOffers: number
  benefit: number
  checkins: number
  reEstablished: number
  /** The learning week, when on: invitations, yeses, days in a week, check-ins it drew, and move offers it made. */
  lw?: { invited: number; accepted: number; days: number; checkins: number; moveOffers: number }
}

export type PersonResult = PersonA | PersonB

/** The scenario's misleading priors, written into the catalogue for this run and undone after. */
function withPriors<T>(s: Scenario, f: () => T): T {
  const saved: [string, number, Strength][] = []
  for (const [id, p] of Object.entries(s.priors ?? {})) {
    const m = moveById(id)
    saved.push([id, m.prior.effect, m.source.strength])
    ;(m.prior as { effect: number }).effect = p.effect
    ;(m.source as { strength: Strength }).strength = p.strength
  }
  try {
    return f()
  } finally {
    for (const [id, e, st] of saved) {
      ;(moveById(id).prior as { effect: number }).effect = e
      ;(moveById(id).source as { strength: Strength }).strength = st
    }
  }
}

const slotBlock = (slot: number): Block => BLOCKS[slot % 3]

/** The true effect of doing a move, as a test with this window reads it at a decision point: what lands in its outcome slots, averaged over them. */
function truthAt(world: World, moveId: string, target: ReadingId, d: number, block: Block, outSlots: readonly number[]): number {
  const eff = world.truth.get(moveId)?.[target]
  if (!eff) return 0
  const e = world.trueEffect(moveId, target, d)
  if (!e) return 0
  const lands = new Map(reach(d, block, eff.window ?? windowOfMove(moveId, target), eff.carry))
  let share = 0
  for (const s of outSlots) share += lands.get(s) ?? 0
  return (e * share) / outSlots.length
}

/**
 * Engine A, the app's old engine, was retired from the app and from here on 2026-10-20 (the owner's requirement): its
 * results stay in the recorded files and the plan, and its comparison can be re-run only by checking out c0611b6.
 */
export const ENGINE_A_RETIRED = 'engine A was retired on 2026-10-20: its results are kept in the recorded files; check out c0611b6 to re-run it'

export function runPerson(s: Scenario, engine: 'A' | 'B', seed: number, cfg: BConfig = B_DEFAULT): PersonResult {
  if (engine === 'A') throw new Error(ENGINE_A_RETIRED)
  return withPriors(s, () => runB(s, seed, cfg))
}

/** A mixture's two-sided 95 % interval, by bisection on its distribution function. */
function mixtureInterval(p: { w: number[]; m: number[]; s: number[] }): [number, number] {
  const cdf = (x: number) => p.w.reduce((a, w, k) => a + w * phi((x - p.m[k]) / p.s[k]), 0)
  const q = (target: number) => {
    let lo = -20
    let hi = 20
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (cdf(mid) < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  return [q(0.025), q(0.975)]
}

function runB(s: Scenario, seed: number, cfg: BConfig): PersonB {
  const world = new World(seed, s.params, s.truth)
  // The person's own answers to learning-week invitations come from a stream of their own, so nothing else they do changes.
  const engine = new EngineB(stream(seed, 'engineB'), cfg, new Set(s.params.away), s.declared ?? [], stream(seed, 'optin'))
  const trackedKeys = s.tracked.map((t) => `${t.moveId}|${t.target}|${t.window ?? windowOfMove(t.moveId, t.target)}`)
  const track = new Map<string, TrackB>(trackedKeys.map((k) => [k, { key: k, truth: 0, ittTruth: 0, first: {}, firstRight: {}, littleEst: null, revisedDay: null, establishedAtEnd: false, d90: null, d180: null, post120: null, coverAll: null, sparseLooks: 0, sparseCovered: 0, offersAfter30: 0, eligibleAfter30: 0, ctx: {}, establishedCount: 0, n1End: 0, n0End: 0, csHalfEnd: null, offersAll: 0 }]))
  /** The true share done of every offer, told or not: the effect of offering is this times the effect of doing. */
  const fractionAt = new Map<number, number>()
  const seenEst = new Map<string, Direction>()
  const est: PersonB['est'] = []
  const ladder: PersonB['ladder'] = []
  const ladderSeen = new Set<string>()
  let reEstablished = 0
  const establishedOnce = new Map<string, number>()
  let offers = 0
  let moveOffers = 0
  let lowOffers = 0
  let benefit = 0
  let checkins = 0
  const testTruth = (t: Test, upTo = Infinity): { theta: number; itt: number; byCtx: Record<string, [number, number]> } => {
    let sum = 0
    let n = 0
    let fr = 0
    let frN = 0
    const ctxSum: Record<string, [number, number, number, number]> = {}
    for (const dec of t.decisions) {
      if (dec.d >= upTo) continue
      const v = truthAt(world, t.moveId, t.target, dec.d, slotBlock(dec.slot), dec.outSlots)
      sum += v
      n++
      if (dec.A === 1 && dec.seen) {
        fr += fractionAt.get(dec.slot) ?? 0
        frN++
      }
      const c = world.context(dec.d)
      const vals: Record<string, boolean> = { withHer: c.withHer, office: c.office, weekend: c.weekend, shortSleep: c.shortSleep }
      for (const k of CONTEXTS) {
        const a = (ctxSum[k] ??= [0, 0, 0, 0])
        if (vals[k]) {
          a[2] += v
          a[3]++
        } else {
          a[0] += v
          a[1]++
        }
      }
    }
    const theta = n ? sum / n : 0
    const frac = frN ? fr / frN : s.params.done + 0.5 * s.params.partly
    const byCtx: Record<string, [number, number]> = {}
    for (const [k, a] of Object.entries(ctxSum)) byCtx[k] = [a[1] ? a[0] / a[1] : 0, a[3] ? a[2] / a[3] : 0]
    return { theta, itt: theta * frac, byCtx }
  }
  const trackedTests = () => trackedKeys.map((k) => engine.testsNow().get(k)).filter((t): t is Test => !!t)
  for (let d = 0; d < DAYS; d++) {
    const calls = engine.learn(d)
    const tests = engine.testsNow()
    for (const c of calls) {
      const t = tests.get(c.key) as Test
      // Established calls and ladder events, with the truth of what each call is about.
      const needTruth = c.level !== 'none' || c.ctx.some((x) => x.level !== 'none')
      const tr = needTruth ? testTruth(t) : null
      if (c.level !== 'none' && tr) {
        const lk = `${c.key}|${c.level}|${c.direction}`
        if (!ladderSeen.has(lk)) {
          ladderSeen.add(lk)
          ladder.push({ key: c.key, ctx: null, level: c.level, dir: c.direction, truth: tr.theta, day: d })
        }
      }
      if (c.level === 'established' && seenEst.get(c.key) !== c.direction && tr) {
        seenEst.set(c.key, c.direction)
        est.push({ key: c.key, ctx: null, day: d, dir: c.direction, truth: tr.theta })
        const prev = establishedOnce.get(c.key) ?? 0
        if (prev > 0 && c.direction !== 'little') reEstablished++
        if (c.direction !== 'little') establishedOnce.set(c.key, prev + 1)
      }
      if (c.level !== 'established' && seenEst.has(c.key)) seenEst.delete(c.key)
      for (const x of c.ctx) {
        if (x.level === 'none' || !tr) continue
        const ck = `${c.key}|${x.context}=${x.value}`
        const truth = tr.byCtx[x.context]?.[x.value] ?? 0
        const lk = `${ck}|${x.level}|${x.direction}`
        if (!ladderSeen.has(lk)) {
          ladderSeen.add(lk)
          ladder.push({ key: c.key, ctx: `${x.context}=${x.value}`, level: x.level, dir: x.direction, truth, day: d })
          if (x.level === 'established') est.push({ key: c.key, ctx: `${x.context}=${x.value}`, day: d, dir: x.direction, truth })
        }
      }
    }
    // The tracked tests, looked at every day, whether or not they are running.
    for (const t of trackedTests()) {
      const tk = track.get(t.key) as TrackB
      const c = calls.find((x) => x.key === t.key) ?? engine.callOfTest(t)
      if (c.level !== 'none' && !tk.first[c.level]) tk.first[c.level] = { day: d, dir: c.direction }
      const tr = testTruth(t)
      const right = c.direction === 'helps' ? tr.theta > 0 : c.direction === 'hurts' ? tr.theta < 0 : c.direction === 'little' ? Math.abs(tr.theta) < cfg.delta : false
      if (c.level !== 'none' && right && tk.firstRight[c.level] === undefined) tk.firstRight[c.level] = d
      if (c.level === 'established' && c.direction === 'little' && tk.littleEst === null) tk.littleEst = d
      if (c.revised && tk.revisedDay === null) tk.revisedDay = d
      if (d === 90 && c.theta !== null && c.thetaSe !== null) tk.d90 = { theta: c.theta, se: c.thetaSe }
      if (d === DAYS - 1 && c.theta !== null && c.thetaSe !== null) tk.d180 = { theta: c.theta, se: c.thetaSe }
      if (d === 120) tk.post120 = t.post.w.reduce((a, w, k) => a + w * t.post.m[k], 0)
      if (c.nDays >= cfg.minDays && c.csLo !== null && c.csHi !== null) {
        const covered = tr.itt >= c.csLo && tr.itt <= c.csHi
        tk.coverAll = (tk.coverAll ?? true) && covered
      }
      if (c.n1 >= cfg.minPerArm && c.n0 >= cfg.minPerArm && (c.n1 < 10 || c.n0 < 10)) {
        const [lo, hi] = mixtureInterval(t.post)
        tk.sparseLooks++
        if (tr.theta >= lo && tr.theta <= hi) tk.sparseCovered++
      }
      for (const x of c.ctx) {
        const ck = `${x.context}=${x.value}`
        if ((x.level === 'likely' || x.level === 'established') && !tk.ctx[ck]) tk.ctx[ck] = { day: d, dir: x.direction, level: x.level, truth: tr.byCtx[x.context]?.[x.value] ?? 0 }
      }
      if (d === DAYS - 1) {
        tk.truth = tr.theta
        tk.ittTruth = tr.itt
        tk.establishedAtEnd = c.level === 'established'
        tk.establishedCount = establishedOnce.get(t.key) ?? 0
        tk.n1End = c.n1
        tk.n0End = c.n0
        tk.csHalfEnd = c.csLo !== null && c.csHi !== null ? (c.csHi - c.csLo) / 2 : null
      }
    }
    for (const b of BLOCKS) {
      const a = world.checkin(d, b)
      if (!a) continue
      checkins++
      const o = engine.checkIn(a, d, world.context(d))
      if (!o) continue
      offers++
      const r = world.respond(o.moveId, d, b)
      const fraction = r.did === 'done' ? 1 : r.did === 'partly' ? 0.5 : 0
      fractionAt.set(d * 3 + BLOCKS.indexOf(b), fraction)
      world.apply(o.moveId, d, b, fraction)
      if (o.moveId !== NOTHING) {
        moveOffers++
        benefit += world.trueEffect(o.moveId, o.target, d) * fraction
        if (o.lowMoves.includes(o.moveId)) lowOffers++
        for (const key of trackedKeys) if (key.startsWith(`${o.moveId}|`)) (track.get(key) as TrackB).offersAll++
      }
      if (d >= 30) {
        for (const key of trackedKeys) {
          const [moveId, target] = key.split('|')
          if (o.target !== target || !o.candidates.includes(moveId)) continue
          const tk = track.get(key) as TrackB
          tk.eligibleAfter30++
          if (o.moveId === moveId) tk.offersAfter30++
        }
      }
      engine.respond(o.id, r)
    }
  }
  return { engine: 'B', seed, tracked: [...track.values()], est, ladder, offers, moveOffers, lowOffers, benefit, checkins, reEstablished, ...(cfg.lw ? { lw: { ...engine.lwStats } } : {}) }
}

export { clsOf, hasMove }
export type { Window }

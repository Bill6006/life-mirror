import { BLOCKS, type Block } from '../src/blocks'
import { moveById, NOTHING, type Strength } from '../src/catalogue'
import type { ReadingId } from '../src/readings'
import { EngineB, IN_APP, type Test } from '../src/repair/engine'
import type { Response as AppResponse } from '../src/repair/world'
import { scenarioById, type Scenario } from './scenarios'
import { stream, wilson } from './stats'
import { DAYS, reach, windowOfMove, World } from './world'

// Ask Life Mirror's asked term (stage A3; the agreed design's point 14) against the stress test's safeguards: the app's own
// engine (src/repair/engine.ts, the design as the app runs it) on the simulated people of the no-effect scenario (S1) and
// the mixed catalogue (S2), each person once with random asked marks and once without, on the same fresh seeds. A mark
// lifts a test the queue has not yet run; the asked term reads nothing else, so S1 and S2 must hold with marks as without.
//
//   node stress/.out/asked.mjs [people per scenario] [first seed] [counts.json] [both|mixed]   — one shard; with a file, its counts
//   node stress/.out/asked.mjs merge [counts.json ...]                                        — the shards judged together
//
// S2 is judged as the verdict judged it (stress/verdict14.ts): on the mixed catalogue at 10,000 people, so its interval
// can decide; S1 on the no-effect scenario's 2,000. "mixed" runs the mixed catalogue alone, for that larger run.

import { readFileSync, writeFileSync } from 'node:fs'

const PEOPLE = Number(process.argv[2] ?? 200)
const BASE = Number(process.argv[3] ?? 600001)
const OUT = process.argv[4] ?? null
const ONLY_MIXED = process.argv[5] === 'mixed'
const TEST = 'walk-ten|stress|nextBlock'
const DELTA = 0.25
const slotBlock = (slot: number): Block => BLOCKS[slot % 3]

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

/** A test's true effect at one of its decisions, as the stress test's runner reads it. */
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

interface Run {
  /** The no-effect test called established in a direction other than little difference, on any day. */
  s1: boolean
  /** Every established call: its direction and the truth of what it is about, when made. */
  est: { dir: string | null; truth: number }[]
  marks: number
  lifted: number
}

function runOne(s: Scenario, seed: number, marks: boolean): Run {
  const world = new World(seed, s.params, s.truth)
  const engine = new EngineB(stream(seed, 'engineB'), IN_APP, new Set(s.params.away), s.declared ?? [], stream(seed, 'optin'))
  const asking = stream(seed, 'asked')
  const seenEst = new Map<string, string | null>()
  const out: Run = { s1: false, est: [], marks: 0, lifted: 0 }
  const truthOf = (t: Test) => {
    let sum = 0
    let n = 0
    for (const dec of t.decisions) {
      sum += truthAt(world, t.moveId, t.target, dec.d, slotBlock(dec.slot), dec.outSlots)
      n++
    }
    return n ? sum / n : 0
  }
  for (let d = 0; d < DAYS; d++) {
    // Once a week, half the people ask about one test the queue has not yet run, at random.
    if (marks && d >= 7 && d % 7 === 0 && asking() < 0.5) {
      const waiting = [...engine.testsNow().values()].filter((t) => t.queuedAt === null)
      if (waiting.length) {
        const t = waiting[Math.floor(asking() * waiting.length)]
        engine.ask(t.key, d)
        out.marks++
      }
    }
    const calls = engine.learn(d)
    const tests = engine.testsNow()
    for (const c of calls) {
      if (c.level === 'established' && seenEst.get(c.key) !== c.direction) {
        seenEst.set(c.key, c.direction)
        out.est.push({ dir: c.direction, truth: truthOf(tests.get(c.key) as Test) })
        if (c.key === TEST && c.direction !== 'little') out.s1 = true
      }
      if (c.level !== 'established' && seenEst.has(c.key)) seenEst.delete(c.key)
    }
    for (const b of BLOCKS) {
      const a = world.checkin(d, b)
      if (!a) continue
      const o = engine.checkIn(a, d, world.context(d))
      if (!o) continue
      const r = world.respond(o.moveId, d, b)
      world.apply(o.moveId, d, b, r.did === 'done' ? 1 : r.did === 'partly' ? 0.5 : 0)
      engine.respond(o.id, r as AppResponse)
    }
  }
  out.lifted = [...engine.testsNow().values()].filter((t) => t.lifted).length
  void NOTHING
  return out
}

const right = (dir: string | null, truth: number) => (dir === 'helps' ? truth > 0 : dir === 'hurts' ? truth < 0 : dir === 'little' ? Math.abs(truth) < DELTA : false)
const pct = (k: number, n: number) => {
  const w = wilson(k, n)
  return `${(100 * w.p).toFixed(1)}% [${(100 * w.lo).toFixed(1)}, ${(100 * w.hi).toFixed(1)}] (${k}/${n})${w.hi < 0.05 ? ' holds' : ' DOES NOT HOLD'}`
}

interface Counts {
  s1: [number, number]
  s2: [number, number]
  marks: number
  lifted: number
}

function shard(marks: boolean): Counts {
  const nul = scenarioById('null')
  const mixed = scenarioById('mixed')
  const s1 = ONLY_MIXED ? [] : withPriors(nul, () => Array.from({ length: PEOPLE }, (_, i) => runOne(nul, BASE + i, marks)))
  const s2 = withPriors(mixed, () => Array.from({ length: PEOPLE }, (_, i) => runOne(mixed, BASE + i, marks)))
  const all = s2.flatMap((r) => r.est)
  return { s1: [s1.filter((r) => r.s1).length, s1.length], s2: [all.filter((e) => !right(e.dir, e.truth)).length, all.length], marks: [...s1, ...s2].reduce((a, r) => a + r.marks, 0), lifted: [...s1, ...s2].reduce((a, r) => a + r.lifted, 0) }
}

const say = (label: string, c: Counts) => console.log(`${label}: S1 ${pct(c.s1[0], c.s1[1])}; S2 ${pct(c.s2[0], c.s2[1])}; marks ${c.marks}, lifted in ${c.lifted}`)

if (process.argv[2] === 'merge') {
  const add = (a: Counts, b: Counts): Counts => ({ s1: [a.s1[0] + b.s1[0], a.s1[1] + b.s1[1]], s2: [a.s2[0] + b.s2[0], a.s2[1] + b.s2[1]], marks: a.marks + b.marks, lifted: a.lifted + b.lifted })
  const zero: Counts = { s1: [0, 0], s2: [0, 0], marks: 0, lifted: 0 }
  const parts = process.argv.slice(3).map((f) => JSON.parse(readFileSync(f, 'utf8')) as { without: Counts; with: Counts })
  say('without marks', parts.reduce((a, p) => add(a, p.without), zero))
  say('with asked marks', parts.reduce((a, p) => add(a, p.with), zero))
} else {
  const counts = { without: shard(false), with: shard(true) }
  if (OUT) writeFileSync(OUT, JSON.stringify(counts))
  say('without marks', counts.without)
  say('with asked marks', counts.with)
}

import { addDays } from '../blocks'
import { hasMove, moveById, type Window } from '../catalogue'
import type { ReadingId } from '../readings'
import { INGREDIENT_IDS } from '../score'
import { pMean, TESTED_RATES, TRACK_ENOUGH, type Direction, type EngineB, type Level, type Rung, type TrackCall } from './engine'
import { repairRecord } from './flow'
import { builtThrough, type RepairRecord } from './record'

// The learning repair on the screens (stage R4): each test with its rung on the evidence ladder (requirement 8), the
// engine's own track record (requirement 15), and what helps you (part 2), read from the engine rebuilt through today.
// Nothing here is stored.

/** One test as the screens show it. */
export interface TestShown {
  key: string
  moveId: string
  target: ReadingId
  window: Window
  level: Level
  direction: Direction
  /** A call of it did not hold, or its established call was withdrawn: it stepped down. */
  revised: boolean
  /** The belief of the effect when done: the owner's record pooled with research and the move's kinds (requirement 7). */
  belief: number
  /** The record's own estimate when done, with its 95 % interval, in steps; null before the record gives one. */
  theta: number | null
  lo: number | null
  hi: number | null
  /**
   * Item 4 (2026-10-23): the effect of suggesting the move against suggesting nothing extra, at moments it fitted, among the
   * cards seen, in steps: what every call rests on, the one effect the fair draws identify; null before the record gives one.
   */
  itt: number | null
  /** The share of times it was done when offered (Partly as half), the record's with a small prior: the estimate when done divides by it. */
  share: number
  /** Randomized decisions read so far: offered, and held back, at moments the move fitted. */
  offered: number
  heldBack: number
  /** Days the sequence counts. */
  days: number
  /** The context values the belief is sure differ, each with its own call. */
  ctx: { context: string; value: 0 | 1; level: Level; direction: Direction }[]
  /** The queue runs it now. */
  running: boolean
  /** The day of its first randomized decision: when the test began. */
  began: string | null
}

/** One rung's track record: its calls resolved, how many held, how many stay open. */
export interface TrackLine {
  rung: Rung
  resolved: number
  held: number
  open: number
  /** Enough have resolved for the record's own rate to stand in place of the simulation's. */
  enough: boolean
  /** The record has tightened this rung: its calls held less often than tested. */
  tightened: boolean
  /** How often this rung was right on simulated people, at least. */
  tested: number
}

/** One move on one reading, as "What helps you" lists it. */
export interface HelpsShown {
  key: string
  moveId: string
  target: ReadingId
  /** The engine's belief of the effect when done: the owner's record pooled with research and the move's kinds (requirement 7). */
  belief: number
  /** Research's starting estimate for the move. */
  research: number
  level: Level
  direction: Direction
}

/** A test the queue would take next, as a place frees (Ask Life Mirror, 2026-10-19). */
export interface WaitingShown {
  key: string
  moveId: string
  target: ReadingId
  window: Window
}

/** A test near a call, with the day it began. */
export interface NearShown {
  key: string
  moveId: string
  target: ReadingId
  window: Window
  /** The day of its first randomized decision: when the test began, never a projected finish. */
  began: string
  /** How near a call: 1 is reached (`nearnessOf`). */
  nearness: number
  level: Level
  direction: Direction
}

export interface RepairEvidence {
  /** The tests the queue runs, then those at a rung, each shown whole. */
  shown: TestShown[]
  /** Tests with randomized decisions on both sides, no call and not running: named only. */
  quiet: TestShown[]
  track: TrackLine[]
  /**
   * "Evidence opens with "what helps you": per reading, moves ranked by the owner's pooled record with research beside them,
   * and the tests nearest finishing with a date." (the whole-app review of 2026-10-09, agreed that day).
   */
  helps: { target: ReadingId; moves: HelpsShown[] }[]
  nearest: NearShown[]
  /** The next tests the queue would take as places free, best first, by its own score: read without changing it. */
  waiting: WaitingShown[]
}

/** Per reading, the moves whose pooled belief says they help, best first, three at most. */
export function helpsOf(all: readonly HelpsShown[], readings: readonly ReadingId[] = INGREDIENT_IDS): { target: ReadingId; moves: HelpsShown[] }[] {
  return readings
    .map((target) => ({ target, moves: all.filter((h) => h.target === target && h.belief > 0).sort((a, b) => b.belief - a.belief || a.key.localeCompare(b.key)).slice(0, 3) }))
    .filter((g) => g.moves.length > 0)
}

/** The tests nearest finishing: no established call yet, nearest a call first, three at most. */
export function nearestOf(all: readonly NearShown[]): NearShown[] {
  return all.filter((n) => n.level !== 'established').sort((a, b) => b.nearness - a.nearness || a.key.localeCompare(b.key)).slice(0, 3)
}

/**
 * How near a test is to a call, 1 when it is reached: helps or hurts once the estimate of offering stands beyond its
 * confidence sequence's half-width; little difference once the worthwhile margin covers the estimate and the half-width.
 */
export function nearnessOf(beta: number, half: number, margin: number): number {
  if (!(half > 0)) return 0
  return Math.max(Math.abs(beta) / half, margin > 0 ? margin / (Math.abs(beta) + half) : 0)
}

const RANK: Record<Level, number> = { none: 0, early: 1, likely: 2, established: 3 }
const DIRECTION_ORDER: Record<string, number> = { helps: 0, hurts: 1, little: 2 }

/** The tests (by key) a general call of which did not hold: each has stepped down, and is marked revised (requirement 8). */
export function revisedKeys(track: readonly TrackCall[]): Set<string> {
  return new Set(track.filter((c) => c.held === false && c.ctx === null).map((c) => c.key))
}

/** The order the screens show tests in: the ones the queue runs first, then by rung, helps before hurts before little difference, then by key. */
export function orderTests(a: TestShown, b: TestShown): number {
  return Number(b.running) - Number(a.running) || RANK[b.level] - RANK[a.level] || (DIRECTION_ORDER[a.direction ?? ''] ?? 3) - (DIRECTION_ORDER[b.direction ?? ''] ?? 3) || a.key.localeCompare(b.key)
}

/** The track record by rung, from the engine's own calls. */
export function trackLines(track: readonly TrackCall[], tightened: Readonly<Record<Rung, boolean>>): TrackLine[] {
  return (['early', 'likely', 'established'] as const).map((rung) => {
    const mine = track.filter((c) => c.rung === rung)
    const resolved = mine.filter((c) => c.held !== null).length
    return { rung, resolved, held: mine.filter((c) => c.held === true).length, open: mine.filter((c) => c.held === null).length, enough: resolved >= TRACK_ENOUGH, tightened: tightened[rung], tested: TESTED_RATES[rung] }
  })
}

export function repairEvidenceFrom(r: RepairRecord, today: string): RepairEvidence {
  const built = builtThrough(r, today)
  return evidenceOf(built.engine, (d) => addDays(built.epoch, d))
}

/**
 * What an engine, rebuilt through a day, shows: its tests with randomized decisions on both sides, its track record, and
 * what helps you. `dayOf` names the engine's day indexes, for the day each test began.
 */
export function evidenceOf(engine: EngineB, dayOf: (d: number) => string = String): RepairEvidence {
  const running = new Set(engine.runningKeys())
  const track = engine.trackRecord()
  const notHeld = revisedKeys(track)
  const all: TestShown[] = []
  const helping: HelpsShown[] = []
  const near: NearShown[] = []
  for (const t of engine.testsNow().values()) {
    if (t.n1 < 1 || t.n0 < 1) continue
    const c = engine.callOfTest(t)
    helping.push({ key: t.key, moveId: t.moveId, target: t.target, belief: pMean(t.post), research: hasMove(t.moveId) ? moveById(t.moveId).prior.effect : 0, level: c.level, direction: c.direction })
    if (c.itt !== null && c.csLo !== null && c.csHi !== null && t.decisions.length) {
      const nearness = nearnessOf(c.itt, (c.csHi - c.csLo) / 2, engine.cfg.delta * c.compliance)
      near.push({ key: t.key, moveId: t.moveId, target: t.target, window: t.window, began: dayOf(t.decisions[0].d), nearness, level: c.level, direction: c.direction })
    }
    all.push({
      key: t.key,
      moveId: t.moveId,
      target: t.target,
      window: t.window,
      level: c.level,
      direction: c.direction,
      revised: c.revised || notHeld.has(t.key),
      belief: pMean(t.post),
      theta: c.theta,
      lo: c.theta !== null && c.thetaSe !== null ? c.theta - 1.96 * c.thetaSe : null,
      hi: c.theta !== null && c.thetaSe !== null ? c.theta + 1.96 * c.thetaSe : null,
      itt: c.itt,
      share: c.compliance,
      offered: c.n1,
      heldBack: c.n0,
      days: c.nDays,
      ctx: c.ctx.filter((x) => x.level !== 'none').map((x) => ({ context: x.context, value: x.value, level: x.level, direction: x.direction })),
      running: running.has(t.key),
      began: t.decisions.length ? dayOf(t.decisions[0].d) : null,
    })
  }
  const shown = all.filter((t) => t.running || t.level !== 'none').sort(orderTests)
  const quiet = all.filter((t) => !t.running && t.level === 'none').sort(orderTests)
  const waiting = engine.queueNext(2).map((t) => ({ key: t.key, moveId: t.moveId, target: t.target, window: t.window }))
  return { shown, quiet, track: trackLines(track, engine.tightened()), helps: helpsOf(helping), nearest: nearestOf(near), waiting }
}

/** The repair's evidence from the record as it stands. */
export async function repairEvidence(today: string): Promise<RepairEvidence> {
  return repairEvidenceFrom(await repairRecord(), today)
}

/** The weekly scorecard's count (stage R7): the tests with fair draws on both sides, and the calls resolved and held. */
export function trackSummary(ev: Pick<RepairEvidence, 'shown' | 'quiet' | 'track'>): { underWay: number; resolved: number; held: number } {
  return { underWay: ev.shown.length + ev.quiet.length, resolved: ev.track.reduce((s, t) => s + t.resolved, 0), held: ev.track.reduce((s, t) => s + t.held, 0) }
}

/** The move card's line: the drawn move's own test, for the moment's reading and window, if it has one. */
export function testOf(ev: RepairEvidence, moveId: string, target: ReadingId, window: Window): TestShown | null {
  const key = `${moveId}|${target}|${window}`
  return ev.shown.find((t) => t.key === key) ?? ev.quiet.find((t) => t.key === key) ?? null
}

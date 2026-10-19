import type { Window } from '../catalogue'
import type { ReadingId } from '../readings'
import { TESTED_RATES, TRACK_ENOUGH, type Direction, type EngineB, type Level, type Rung, type TrackCall } from './engine'
import { repairRecord } from './flow'
import { builtThrough, type RepairRecord } from './record'

// The learning repair on the screens (stage R4): each test with its rung on the evidence ladder (requirement 8), and the
// engine's own track record (requirement 15), read from the engine rebuilt through today. Nothing here is stored.

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
  /** The estimate when done, with its 95 % interval, in steps; null before the record gives one. */
  theta: number | null
  lo: number | null
  hi: number | null
  /** Randomized decisions read so far: offered, and held back, at moments the move fitted. */
  offered: number
  heldBack: number
  /** Days the sequence counts. */
  days: number
  /** The context values the belief is sure differ, each with its own call. */
  ctx: { context: string; value: 0 | 1; level: Level; direction: Direction }[]
  /** The queue runs it now. */
  running: boolean
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

export interface RepairEvidence {
  /** The tests the queue runs, then those at a rung, each shown whole. */
  shown: TestShown[]
  /** Tests with randomized decisions on both sides, no call and not running: named only. */
  quiet: TestShown[]
  track: TrackLine[]
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
  return evidenceOf(builtThrough(r, today).engine)
}

/** What an engine, rebuilt through a day, shows: its tests with randomized decisions on both sides, and its track record. */
export function evidenceOf(engine: EngineB): RepairEvidence {
  const running = new Set(engine.runningKeys())
  const track = engine.trackRecord()
  const notHeld = revisedKeys(track)
  const all: TestShown[] = []
  for (const t of engine.testsNow().values()) {
    if (t.n1 < 1 || t.n0 < 1) continue
    const c = engine.callOfTest(t)
    all.push({
      key: t.key,
      moveId: t.moveId,
      target: t.target,
      window: t.window,
      level: c.level,
      direction: c.direction,
      revised: c.revised || notHeld.has(t.key),
      theta: c.theta,
      lo: c.theta !== null && c.thetaSe !== null ? c.theta - 1.96 * c.thetaSe : null,
      hi: c.theta !== null && c.thetaSe !== null ? c.theta + 1.96 * c.thetaSe : null,
      offered: c.n1,
      heldBack: c.n0,
      days: c.nDays,
      ctx: c.ctx.filter((x) => x.level !== 'none').map((x) => ({ context: x.context, value: x.value, level: x.level, direction: x.direction })),
      running: running.has(t.key),
    })
  }
  const shown = all.filter((t) => t.running || t.level !== 'none').sort(orderTests)
  const quiet = all.filter((t) => !t.running && t.level === 'none').sort(orderTests)
  return { shown, quiet, track: trackLines(track, engine.tightened()) }
}

/** The repair's evidence from the record as it stands. */
export async function repairEvidence(today: string): Promise<RepairEvidence> {
  return repairEvidenceFrom(await repairRecord(), today)
}

/** The move card's line: the drawn move's own test, for the moment's reading and window, if it has one. */
export function testOf(ev: RepairEvidence, moveId: string, target: ReadingId, window: Window): TestShown | null {
  const key = `${moveId}|${target}|${window}`
  return ev.shown.find((t) => t.key === key) ?? ev.quiet.find((t) => t.key === key) ?? null
}

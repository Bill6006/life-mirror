import { BLOCKS, type Block } from '../blocks'
import { hasMove, moveById, type Window } from '../catalogue'
import type { ReadingId } from '../readings'

// What the learning repair's engine needs from a person's days, with no simulation in it: the same names and the same
// code as the stress test's stress/world.ts, so the engine reads the app's record exactly as it read the simulated
// people it was judged on.

/** The scale of the prediction's slow trend, in days: the stress test's horizon, kept so the prediction is the judged one. */
export const DAYS = 180

/** One answered check-in: its day index, its block and its readings as anchors. */
export interface Answered {
  day: string
  block: Block
  answers: Partial<Record<ReadingId, number>>
}

/** The day's context the engine reads. */
export interface DayContext {
  day: string
  weekday: number
  weekend: boolean
  office: boolean
  church: boolean
  studyNight: boolean
  withHer: boolean
  daycare: boolean
  shortSleep: boolean
  away: boolean
}

/** What became of an offer: whether it was seen, what was done, and whether the answer was ever given. */
export interface Response {
  seen: boolean
  /** What was done, whether or not it was told: null when not seen. */
  did: 'done' | 'partly' | 'no' | null
  why: 'noTime' | 'didntWant' | null
  /** Whether the answer was ever given. */
  answered: boolean
}

export function windowOfMove(moveId: string, r: ReadingId): Window {
  if (!hasMove(moveId)) return 'nextBlock'
  const m = moveById(moveId)
  return m.targets.find((t) => t.reading === r)?.window ?? m.targets[0]?.window ?? 'nextBlock'
}

/** The slots a window reaches from a move done at (d, b), each with its share of the effect. */
export function reach(d: number, b: Block, window: Window, carry?: number): [number, number][] {
  const i = BLOCKS.indexOf(b)
  const at = (dd: number, bb: number): number => dd * 3 + bb
  switch (window) {
    case 'nextBlock':
      return [[i < 2 ? at(d, i + 1) : at(d + 1, 0), 1]]
    case 'laterToday':
      return i < 2 ? BLOCKS.slice(i + 1).map((_, k) => [at(d, i + 1 + k), 1] as [number, number]) : [[at(d + 1, 0), 1]]
    case 'evening':
      return [[i < 2 ? at(d, 2) : at(d + 1, 0), 1]]
    case 'nextMorning':
      return [[at(d + 1, 0), 1]]
    case 'sevenDays': {
      const out: [number, number][] = []
      for (let k = 1; k <= 7; k++) for (let bb = 0; bb < 3; bb++) out.push([at(d + k, bb), carry === undefined ? 1 : carry ** (k - 1)])
      return out
    }
  }
}

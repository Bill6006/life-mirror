import { copy } from '../copy'
import { fill } from '../format'
import type { Direction, Level } from './engine'

// The evidence ladder in words (requirement 8), one place for every surface that speaks it: Evidence, the move card, and
// the Brain's facts.

/** A call in words: "Early sign: helps", or "No call yet". */
export function rungWords(level: Level, direction: Direction): string {
  const c = copy.repairEvidence
  if (level === 'none' || direction === null) return c.rungs.none
  return fill(c.call, { rung: c.rungs[level], direction: c.directions[direction] })
}

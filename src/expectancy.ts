import { EXPECTANCIES, type Expectancy, type Outcome } from './db'
import type { PathEntry } from './pathStage'

// The expectancy tap after a People rep (stage 3, item 5; Part 25: "if ever added it is reflection only"): easier than
// you expected, about as expected, or harder. Nothing reads it but the counts under the path's Details: it never
// advances or holds a stage, never changes a draw, and is never evidence, so no fact, comparison or prompt carries it.

/** Optional taps earn their place (Rule 17): after this many People reps running with it shown and no answer, it stops appearing, the learning session's question's dozen. */
export const EXPECTANCY_UNUSED_RETIRES = 12

/** Whether the tap has stopped appearing: the last dozen reps done that it was shown after, since you brought it back, all went unanswered. */
export function expectancyRetired(outcomes: readonly Outcome[], broughtBack: string | null): boolean {
  const asked = outcomes
    .filter((x) => x.outcome === 'done' && (x.expectancyAsked || x.expectancy) && (!broughtBack || x.at >= broughtBack))
    .sort((x, y) => (x.at < y.at ? 1 : -1))
    .slice(0, EXPECTANCY_UNUSED_RETIRES)
  return asked.length >= EXPECTANCY_UNUSED_RETIRES && asked.every((x) => !x.expectancy)
}

/** The answers on a path's reps done, by kind, for its Details; null while none is answered. */
export function expectancyCounts(entries: readonly PathEntry[], outcomes: readonly Outcome[]): Record<Expectancy, number> | null {
  const ids = new Set(entries.map((e) => e.offerId))
  const counts = Object.fromEntries(EXPECTANCIES.map((e) => [e, 0])) as Record<Expectancy, number>
  let answered = 0
  for (const x of outcomes) {
    if (!ids.has(x.offerId) || x.outcome !== 'done' || !x.expectancy) continue
    counts[x.expectancy]++
    answered++
  }
  return answered > 0 ? counts : null
}

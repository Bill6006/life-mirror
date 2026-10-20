import { hasMove, moveById } from '../catalogue'
import { readings } from '../readings'
import type { RepairEvidence, TestShown } from '../repair/evidence'
import { named, words } from './names'

// A typed question while it waits (Ask Life Mirror, stage A1, 2026-10-19; the agreed design's point 4): the findings whose
// reading or move names match words in it, shown at once, by simple matching. No AI: a name matches when one of its own
// words, three letters or more and not a common one, begins a word of the question.

/**
 * The pre-declared contexts (requirement 7) a typed question can name (stage A3), each value by its own words. The words
 * for a context's other value are read first and set aside, so "not at the office" never also reads as "at the office".
 */
const CONTEXT_WORDS: readonly { context: 'withHer' | 'office' | 'weekend' | 'shortSleep'; off: RegExp | null; on: RegExp }[] = [
  { context: 'withHer', off: /\bwithout her\b/gi, on: /\bwith her\b/i },
  { context: 'office', off: /\b(?:not (?:at|in) the office|away from the office|(?:working|work) from home|home days?)\b/gi, on: /\boffice\b/i },
  { context: 'weekend', off: /\bweekdays?\b/gi, on: /\b(?:weekends?|saturdays?|sundays?)\b/i },
  { context: 'shortSleep', off: null, on: /\b(?:short (?:nights?|sleep)|(?:slept|sleep) (?:badly|poorly|little)|bad nights?|little sleep)\b/i },
]

/** The one pre-declared context a typed question names, with its value (stage A3): null when it names none, more than one, or both of one's values. */
export function contextNamed(question: string): { context: 'withHer' | 'office' | 'weekend' | 'shortSleep'; value: 0 | 1 } | null {
  const found: { context: 'withHer' | 'office' | 'weekend' | 'shortSleep'; value: 0 | 1 }[] = []
  for (const c of CONTEXT_WORDS) {
    const off = c.off ? question.match(c.off) !== null : false
    const on = c.on.test(c.off ? question.replace(c.off, ' ') : question)
    if (off && on) return null
    if (off || on) found.push({ context: c.context, value: on ? 1 : 0 })
  }
  return found.length === 1 ? found[0] : null
}

/** The tests a question names by both their move and their reading (stage A3): the ones it asks about. */
export function testsNamed(question: string, ev: Pick<RepairEvidence, 'shown' | 'quiet'>): TestShown[] {
  const q = words(question)
  if (!q.length) return []
  const readingIds = new Set(readings.filter((r) => named(r.name, q)).map((r) => r.id as string))
  return [...ev.shown, ...ev.quiet].filter((t) => readingIds.has(t.target) && hasMove(t.moveId) && named(moveById(t.moveId).name, q))
}

/** The findings a question names: those matching both its reading and its move first, then its move, then its reading; five at most. */
export function matchFindings(question: string, ev: Pick<RepairEvidence, 'shown' | 'quiet'>, most = 5): TestShown[] {
  const q = words(question)
  if (!q.length) return []
  const readingIds = new Set(readings.filter((r) => named(r.name, q)).map((r) => r.id as string))
  const scored: { t: TestShown; score: number }[] = []
  for (const t of [...ev.shown, ...ev.quiet]) {
    const move = hasMove(t.moveId) && named(moveById(t.moveId).name, q)
    const reading = readingIds.has(t.target)
    if (move || reading) scored.push({ t, score: (move ? 2 : 0) + (reading ? 1 : 0) })
  }
  return scored.sort((a, b) => b.score - a.score || a.t.key.localeCompare(b.t.key)).slice(0, most).map((x) => x.t)
}

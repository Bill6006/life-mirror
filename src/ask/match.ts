import { hasMove, moveById } from '../catalogue'
import { readings } from '../readings'
import type { RepairEvidence, TestShown } from '../repair/evidence'
import { named, words } from './names'

// A typed question while it waits (Ask Life Mirror, stage A1, 2026-10-19; the agreed design's point 4): the findings whose
// reading or move names match words in it, shown at once, by simple matching. No AI: a name matches when one of its own
// words, three letters or more and not a common one, begins a word of the question.

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

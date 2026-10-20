import { hasMove, moveById } from '../catalogue'
import { readings } from '../readings'
import type { RepairEvidence, TestShown } from '../repair/evidence'

// A typed question while it waits (Ask Life Mirror, stage A1, 2026-10-19; the agreed design's point 4): the findings whose
// reading or move names match words in it, shown at once, by simple matching. No AI: a name matches when one of its own
// words, three letters or more and not a common one, begins a word of the question.

/** Words too common in the catalogue's names to say which move a question means. */
const COMMON = new Set(['the', 'and', 'for', 'now', 'set', 'one', 'two', 'six', 'her', 'his', 'you', 'day', 'new', 'old', 'own', 'try', 'get', 'put', 'see', 'say', 'use', 'way', 'end', 'top', 'big', 'any', 'all', 'out', 'off', 'its', 'has', 'had', 'was', 'are', 'not', 'but', 'can', 'may', 'did', 'how', 'why', 'who', 'with', 'your', 'from', 'into', 'that', 'this', 'than', 'then', 'them', 'they', 'what', 'when', 'some', 'more', 'less', 'once', 'just', 'over', 'after', 'before', 'about', 'minute', 'minutes', 'something', 'someone', 'short', 'long', 'time', 'take', 'make', 'have', 'done', 'today', 'quick', 'small', 'little', 'good', 'well', 'each', 'other', 'every', 'thing', 'things', 'ten', 'five', 'three'])

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Whether one of a name's own words begins a word of the question: its first letters, all but a short ending ("walk" in "walking", "energy" in "energetic"). */
function named(name: string, question: readonly string[]): boolean {
  const own = words(name).filter((w) => w.length >= 3 && !COMMON.has(w))
  return own.some((w) => {
    const stem = w.slice(0, Math.max(4, w.length - 2))
    return question.some((q) => q.startsWith(stem))
  })
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

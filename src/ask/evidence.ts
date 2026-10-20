import type { RepairEvidence, TestShown } from '../repair/evidence'
import type { Direction, Level } from '../repair/engine'
import { fingerprint } from '../repair/record'
import type { AskCitation, AskTurn } from './types'

// What an answer rests on (Ask Life Mirror, stage A1, 2026-10-19): the evidence version a question was asked on, the
// findings an answer cites with requirement 2's provenance, and, later, what changed for each against today's read (the
// agreed design's point 8). Nothing here reads the database or the engine: it reads the repair's read, as Evidence shows
// it and the Brain receives it.

/** Every test the read shows, by key: those being run or at a rung, and the quiet ones. */
export function testsOf(ev: Pick<RepairEvidence, 'shown' | 'quiet'>): Map<string, TestShown> {
  return new Map([...ev.shown, ...ev.quiet].map((t) => [t.key, t]))
}

/**
 * The evidence version: a short digest of every test's key, rung, direction, revised mark and whether it is being run.
 * Two reads of the same evidence carry the same version; a change of rung, direction or mark, a test begun or no longer
 * shown, or the queue taking another test moves it. Small drift within a rung does not.
 */
export function evidenceVersion(ev: Pick<RepairEvidence, 'shown' | 'quiet'>): string {
  const parts = [...ev.shown, ...ev.quiet].map((t) => `${t.key}:${t.level}:${t.direction ?? '-'}:${t.revised ? 1 : 0}:${t.running ? 1 : 0}`).sort()
  return fingerprint(parts.join('|'))
}

const round2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100)

/** A finding as an answer cites it: what it said then. */
export function citeOf(t: TestShown): AskCitation {
  return { key: t.key, level: t.level, direction: t.direction, revised: t.revised, lo: round2(t.lo), hi: round2(t.hi) }
}

/** One cited finding against today's read: what it said then, and what it says now, or null when the read no longer shows it. */
export interface FindingChange {
  key: string
  before: { level: Level; direction: Direction; revised: boolean }
  after: { level: Level; direction: Direction; revised: boolean } | null
}

/**
 * What changed for each cited finding (point 8): its rung or direction, a revised mark it gained, or the read no longer
 * showing it. Small drift within a rung marks nothing, so a size range that moved is not a change.
 */
export function changesOf(cited: readonly AskCitation[], ev: Pick<RepairEvidence, 'shown' | 'quiet'>): FindingChange[] {
  const now = testsOf(ev)
  const out: FindingChange[] = []
  const seen = new Set<string>()
  for (const c of cited) {
    if (seen.has(c.key)) continue
    seen.add(c.key)
    const t = now.get(c.key)
    const before = { level: c.level, direction: c.direction, revised: c.revised }
    if (!t) {
      out.push({ key: c.key, before, after: null })
      continue
    }
    if (t.level !== c.level || t.direction !== c.direction || (t.revised && !c.revised)) out.push({ key: c.key, before, after: { level: t.level, direction: t.direction, revised: t.revised } })
  }
  return out
}

/** Where a thread stands (points 3 and 7), from its newest turn: waiting, cancelled, answered, or answered on evidence that has changed since. */
export function threadState(turns: readonly AskTurn[], ev: Pick<RepairEvidence, 'shown' | 'quiet'> | null | undefined): 'answered' | 'waiting' | 'cancelled' | 'changed' {
  const last = turns[turns.length - 1]
  if (!last) return 'answered'
  if (last.state !== 'answered') return last.state
  return ev && changesOf(last.cited, ev).length > 0 ? 'changed' : 'answered'
}

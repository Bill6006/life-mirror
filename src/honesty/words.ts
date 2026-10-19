import { hasMove, moveById } from '../catalogue'
import { copy } from '../copy'
import { fill, formatDayShort } from '../format'
import { readingById } from '../readings'
import type { MissCandidate, MissReading } from './misses'
import type { MissingComparison, MissingReading } from './missing'
import type { TogetherFlag } from './together'

// The honesty checks' words (stage R7), one source for the weekly view and the Sunday review's facts. Each says how
// things moved and what that would mean, never a cause.

const r2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
const nameOf = (id: string) => readingById(id).name

export function togetherLine(p: Pick<TogetherFlag, 'a' | 'b' | 'rho' | 'n'>): string {
  return fill(copy.honesty.togetherLine, { a: nameOf(p.a), b: nameOf(p.b), rho: r2(p.rho), n: String(p.n) })
}

/** Where a cluster of misses sits, in words. */
export function missWhere(c: Pick<MissCandidate, 'cause'>): string {
  const w = copy.honesty.causes
  const cause = c.cause
  if (cause.kind === 'context') return fill(w.context, { context: copy.honesty.contexts[cause.context] })
  if (cause.kind === 'trend') return fill(w.trend, { date: formatDayShort(cause.since) })
  if (cause.kind === 'move') return fill(w.move, { move: hasMove(cause.moveId) ? moveById(cause.moveId).name : cause.moveId })
  return fill(w.wording, { reading: nameOf(cause.reading), date: formatDayShort(cause.since) })
}

export function missLine(c: MissCandidate): string {
  return fill(copy.honesty.missesLine, { where: missWhere(c), missesIn: String(c.missesIn), slotsIn: String(c.slotsIn), missesOut: String(c.missesOut), slotsOut: String(c.slotsOut), means: copy.honesty.means[c.cause.kind] })
}

/** The misses' lines: one per cluster, or one saying none gathered. */
export function missLines(m: MissReading): string[] {
  if (m.slots === 0) return [copy.honesty.missesNoneYet]
  if (m.clusters.length === 0) return [fill(copy.honesty.missesNone, { misses: String(m.misses), slots: String(m.slots) })]
  return m.clusters.map(missLine)
}

/** Where missing gathers, in words. */
export function missingWhere(c: Pick<MissingComparison, 'split'>): string {
  const w = copy.honesty.missingWhere
  if (c.split.by === 'before') return w.before
  if (c.split.by === 'block') return fill(w.block, { block: copy.blocks[c.split.block].toLowerCase() })
  return fill(w.context, { context: copy.honesty.contexts[c.split.context] })
}

export function missingLine(c: MissingComparison): string {
  return fill(copy.honesty.missingLine[c.kind], { where: missingWhere(c), inside: String(c.missingIn), nIn: String(c.slotsIn), outside: String(c.missingOut), nOut: String(c.slotsOut) })
}

/** Which way the record may lean, from the relations shown: after low readings more missing leans it high; less, low. */
export function leanOf(m: MissingReading): 'low' | 'high' | 'other' | null {
  if (m.relations.length === 0) return null
  const before = m.relations.find((c) => c.split.by === 'before')
  if (!before) return 'other'
  return before.missingIn / before.slotsIn > before.missingOut / before.slotsOut ? 'low' : 'high'
}

/** The missing lines: one per relation with which way the record may lean, or one saying missing stays missing. */
export function missingLines(m: MissingReading): string[] {
  if (m.slots === 0) return [copy.honesty.missingNoneYet]
  if (m.relations.length === 0) return [fill(copy.honesty.missingNone, { missed: String(m.missed), slots: String(m.slots), unanswered: String(m.unanswered), started: String(m.started) })]
  const lean = leanOf(m)
  return [...m.relations.map(missingLine), copy.honesty.leans[lean ?? 'other'], copy.honesty.revisit]
}

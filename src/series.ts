import { addDays, BLOCKS, daysBetween, type Block } from './blocks'
import type { CheckIn } from './db'
import { anchorFor, headword, type Position, type ReadingId } from './readings'
import { readingOf } from './score'

// Series for the mirror. Every value here is a calculation from the record; a block with no
// completed check-in is null and stays null: a gap on the chart, never a filled-in guess.

export interface DayValues {
  day: string
  values: Record<Block, number | null>
  times: Record<Block, string | null>
}

function perBlock<T>(v: T): Record<Block, T> {
  return { morning: v, afternoon: v, evening: v }
}

export function dayValues(all: readonly CheckIn[], day: string): DayValues {
  const values = perBlock<number | null>(null)
  const times = perBlock<string | null>(null)
  for (const c of all) {
    if (c.day !== day) continue
    const r = readingOf(c)
    values[c.block] = r ? r.value : null
    times[c.block] = c.completedAt ?? c.updatedAt
  }
  return { day, values, times }
}

/** The n days ending today, oldest first. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}

export function firstDay(all: readonly CheckIn[]): string | null {
  let first: string | null = null
  for (const c of all) if (first === null || c.day < first) first = c.day
  return first
}

export function weekSeries(all: readonly CheckIn[], today: string): DayValues[] {
  return lastDays(today, 7).map((d) => dayValues(all, d))
}

/** Rows for the heatmap: from the first check-in to today, at least 7 days, at most `max`. */
export function heatmapRows(all: readonly CheckIn[], today: string, max = 28): DayValues[] {
  const first = firstDay(all)
  const span = first ? Math.min(max, Math.max(7, daysBetween(first, today) + 1)) : 7
  return lastDays(today, span).map((d) => dayValues(all, d))
}

/** The latest block of the day with a reading, or null. */
export function latestLogged(day: DayValues): Block | null {
  let latest: Block | null = null
  for (const b of BLOCKS) if (day.values[b] !== null) latest = b
  return latest
}

export interface ContextPoint {
  block: Block
  position: Position
  label: string
}

/** A context reading's answers across the day's blocks, with the phrase's headword as its label. */
export function contextTrace(all: readonly CheckIn[], day: string, id: ReadingId): ContextPoint[] {
  return BLOCKS.flatMap((block) => {
    const c = all.find((x) => x.day === day && x.block === block)
    const p = c?.answers[id]
    return p === undefined ? [] : [{ block, position: p, label: headword(anchorFor(id, p)) }]
  })
}

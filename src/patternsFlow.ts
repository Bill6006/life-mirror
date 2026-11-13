import { writeFactsRow } from './brainFlow'
import { noteComparisonFault } from './counted/fault'
import type { CountedInput } from './counted/kinds'
import { storedPatterns } from './counted/patterns'
import { PATTERNS_FORMAT, PATTERNS_ID, readPatterns, samePatterns } from './counted/stored'
import { patternTableKept } from './counted/table'
import { db, getSettings } from './db'
import { allOwnChips } from './settings'

// The pattern table on the phone (2026-11-13): built from the whole record with the counted core, kept as one record
// with a fixed id, and synced like every record, for the Worker to serve a kind at a time. It is built after the
// day's sheet is written and when a question is asked, a kind at a time with the screen let through between kinds,
// and no screen waits for it. The record is rewritten only when its content changes. If the build throws, no table is
// written, the failure is kept with the comparisons' own for the Worker's report, and Ask answers from the sheet.

/** How long a question waits for a fresh table before it goes on without one. */
export const PATTERNS_ASK_WAIT_MS = 4000

/** The record as the counted core reads it, in one read: every check-in, day, private item, chip of your own, offer, answer and workout day. */
export async function countedRecord(): Promise<CountedInput> {
  const [checkins, contexts, items, settings, offers, outcomes, outside] = await Promise.all([db.checkins.toArray(), db.days.toArray(), db.privateItems.toArray(), getSettings(), db.offers.toArray(), db.outcomes.toArray(), db.outside.toArray()])
  return { checkins, contexts, items, chips: allOwnChips(settings), offers, outcomes, workoutDays: [...new Set(outside.map((o) => o.day))].sort() }
}

/** The screen let through: the next kind is worked out on a later turn of the event loop. */
const letThrough = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Builds the table for the days before `day` and keeps it when its content changed. True when it was written. Never
 * throws: a build that fails writes nothing and is kept as a failure of the comparisons. A stored record of another
 * format, written by a newer version of the app, is not this version's to overwrite.
 */
export async function writePatternsRow(day: string, now: Date = new Date(), opts: { pause?: () => Promise<void> } = {}): Promise<boolean> {
  try {
    const table = await patternTableKept(await countedRecord(), day, opts.pause ?? letThrough)
    const next = storedPatterns(table, now.toISOString())
    const raw = (await db.patterns.get(PATTERNS_ID)) as unknown
    const existing = readPatterns(raw)
    if (raw !== undefined && existing === null && (raw as { format?: unknown }).format !== PATTERNS_FORMAT) return false
    if (samePatterns(existing, next)) return false
    await db.patterns.put(next)
    return true
  } catch (e) {
    noteComparisonFault(day, e)
    return false
  }
}

let last: Promise<unknown> = Promise.resolve()

/** One build after another, never two at once: a kind already worked out for the same occasions is not worked out again. */
export function refreshPatterns(day: string, now: Date = new Date()): Promise<boolean> {
  const next = last.then(() => writePatternsRow(day, now))
  last = next.catch(() => undefined)
  return next
}

/** The day's sheet, and after it the pattern table, which no screen waits for. */
export async function writeDayRows(day: string, now: Date = new Date()): Promise<boolean> {
  const wrote = await writeFactsRow(day, now)
  void refreshPatterns(day, now)
  return wrote
}

/** A fresh table for a question just asked, waited for a short while at most: the question never waits on it longer. */
export async function patternsForAsk(day: string, now: Date = new Date(), waitMs: number = PATTERNS_ASK_WAIT_MS): Promise<void> {
  await Promise.race([refreshPatterns(day, now), new Promise<void>((resolve) => setTimeout(resolve, waitMs))])
}

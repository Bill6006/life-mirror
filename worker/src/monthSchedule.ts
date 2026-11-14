import { quietHours } from '../../src/pathJob'
import { monthSpan } from './month'

// Which month is read next, and when (2026-11-13). One month at a time, two a day at most, never between 9:00 and
// 11:30, never while the Brain's own run of the day or an answer to a question is under way. The oldest month that
// holds records, has had its three days after it pass, and has no write-up is read first: the months already recorded
// get the same read once. A month that has a write-up is not read again by this rule, forgotten or not; a re-read is
// the re-read rules' own. Nothing here reads the usage meter or the weekly reset.

/** The most months read in a day, and the most tries a day for a month whose read failed. */
export const MONTHS_A_DAY = 2
export const MONTH_TRIES_A_DAY = 3

/** One of today's month runs: under way, written, or failed. */
export interface MonthRun {
  month: string
  status: 'open' | 'written' | 'failed'
}

export interface MonthScheduleInput {
  /** The app's day, and the local time as HH:MM. */
  today: string
  hhmm: string
  /** The months that hold records, YYYY-MM. */
  months: readonly string[]
  /** The months that have a write-up, forgotten or not. */
  written: readonly string[]
  /** Today's month runs. */
  runs: readonly MonthRun[]
  /** The Brain's own run of the day, or an answer to a question, is under way. */
  busy: boolean
}

/** Whether a month's days after it have all passed: it is read from its fourth day after it ends. */
export function monthReady(month: string, today: string): boolean {
  const span = monthSpan(`${month}-01`)
  return span !== null && today > span.servedTo
}

/** The month to read now, by its first day, or why none is read. */
export function monthToRead(x: MonthScheduleInput): { first: string } | { reason: string } {
  if (quietHours(x.hhmm)) return { reason: 'quiet hours: 9:00 to 11:30 keep the window for the day’s line' }
  if (x.busy) return { reason: 'waiting for the Brain’s run under way' }
  if (x.runs.some((r) => r.status === 'open')) return { reason: 'a month is being read' }
  if (x.runs.filter((r) => r.status === 'written').length >= MONTHS_A_DAY) return { reason: `${MONTHS_A_DAY} months are read a day at most` }
  const failed = (month: string): number => x.runs.filter((r) => r.month === month && r.status === 'failed').length
  const waiting = x.months.filter((m) => monthReady(m, x.today) && !x.written.includes(m)).sort()
  const next = waiting.find((m) => failed(m) < MONTH_TRIES_A_DAY)
  if (next) return { first: `${next}-01` }
  return { reason: waiting.length ? `today’s ${MONTH_TRIES_A_DAY} tries are used; the month is tried again tomorrow` : 'no month is waiting to be read' }
}

// ─── Read again ─────────────────────────────────────────────────────────────────────────────────

/** A month's record must have been still this long before it is read again: long enough to gather several changes into one re-read, hours and never days. */
export const REREAD_QUIET_MS = 6 * 3_600_000

export interface RereadState {
  month: string
  /** When the lines its newest write-up rests on were built, and the method that wrote it. */
  builtAt: string
  method: number
  /** When a row of the month was last written, a deleted one too; null when none is known. */
  changed: string | null
  /** A change already looked at and found to leave the month's lines as they were. */
  checked: string | null
}

/**
 * The month to read again, the oldest first, and why; or null. A write-up an older method wrote is read again, which
 * happens only when the method's version is raised by hand after a real improvement. Else a month whose record changed
 * after its lines were built, once that record has been still for six hours. Nothing here reads the usage meter.
 */
export function monthToReread(x: { now: Date; method: number; months: readonly RereadState[] }): { month: string; why: 'method' | 'changed' } | null {
  for (const m of [...x.months].sort((a, b) => (a.month < b.month ? -1 : 1))) {
    if (m.method < x.method) return { month: m.month, why: 'method' }
    if (!m.changed || m.changed === m.checked) continue
    const changed = Date.parse(m.changed)
    if (changed > Date.parse(m.builtAt) && x.now.getTime() - changed >= REREAD_QUIET_MS) return { month: m.month, why: 'changed' }
  }
  return null
}

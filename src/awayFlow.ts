import { addDays, dayKey } from './blocks'
import { awayShaped, awayUnshaped, db, getSettings, updateSettings, type DayContext } from './db'
import { awayProblem, onTrip, type AwayProblem, type AwayRange } from './postWindow'
import { awayOn, type GateMode, awayMode } from './postWindowFlow'

// Away from home (post-window, gated; agreed 2026-10-04): a trip you set ahead, with a start and a
// required end, so it always ends by itself. Each of its days is shaped when the day begins: the
// week's office, daycare, church and preferred study day give way, the moves that need the house
// wait, nothing you committed to is due, and the days are not read as a drop. Days already lived are
// never rewritten; only today follows a change. While the gate is closed nothing here is shown,
// stored or read.

/** The trip as it stands today: under way, set for a later day, or none. */
export type AwayStatus = { state: 'away'; range: AwayRange } | { state: 'ahead'; range: AwayRange } | null

/** The trip as it stands on a day: none while the gate is closed, and none once its last day has passed. */
export function awayStatus(range: AwayRange | null | undefined, today: string, mode: GateMode = awayMode()): AwayStatus {
  if (!awayOn(mode) || !range) return null
  if (onTrip(range, today)) return { state: 'away', range }
  if (range.from > today) return { state: 'ahead', range }
  return null
}

/** Today's day record follows the trip: shaped when today is inside it, given back when it is not. A day not yet seen is shaped when it begins. */
async function reshapeToday(today: string): Promise<void> {
  const ctx = await db.days.get(today)
  if (!ctx) return
  const range = (await getSettings()).away
  const next = onTrip(range, today) ? awayShaped(ctx) : awayUnshaped(ctx)
  if (next !== ctx) await db.days.put(next)
}

/**
 * Sets the trip, or changes the one set: both days, the end required. A trip under way keeps its
 * start; only its end may move. Refused while the gate is closed, or with the reason it cannot stand.
 */
export async function setAway(from: string, to: string, now: Date = new Date()): Promise<AwayProblem | 'gated' | null> {
  if (!awayOn()) return 'gated'
  const today = dayKey(now)
  const current = (await getSettings()).away
  const started = Boolean(current && current.from === from && current.from < today && onTrip(current, today))
  const problem = awayProblem(from, to, today, started)
  if (problem) return problem
  await db.transaction('rw', [db.settings, db.days], async () => {
    await updateSettings((s) => ({ ...s, away: { from, to, setAt: now.toISOString() } }))
    await reshapeToday(today)
  })
  return null
}

/**
 * Ends the trip now: today is at home again. A trip already under way keeps the days it had, ending
 * yesterday; one that has not begun, or began today, is taken away whole.
 */
export async function endAway(now: Date = new Date()): Promise<void> {
  if (!awayOn()) return
  const today = dayKey(now)
  await db.transaction('rw', [db.settings, db.days], async () => {
    await updateSettings((s) => {
      const { away, ...rest } = s
      return away && away.from < today && away.to >= today ? { ...rest, away: { ...away, to: addDays(today, -1), setAt: now.toISOString() } } : rest
    })
    await reshapeToday(today)
  })
}

/** The days a trip shaped, from their own records: none while the gate is closed, so nothing is ever left out then. */
export async function awayDays(mode: GateMode = awayMode()): Promise<ReadonlySet<string>> {
  if (!awayOn(mode)) return NONE
  return new Set((await db.days.toArray()).filter((d: DayContext) => d.awayFromHome).map((d) => d.day))
}

const NONE: ReadonlySet<string> = new Set()

/** Rows of the days at home: a trip's days left out. With none, the very same rows. */
export function homeDaysOnly<T extends { day: string }>(rows: T[], away: ReadonlySet<string>): T[] {
  return away.size ? rows.filter((r) => !away.has(r.day)) : rows
}

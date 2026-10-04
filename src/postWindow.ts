// The two features agreed for after the clean window (the owner's word, 2026-10-04): the moves that
// need the house, with Skip's "Not home"; and Away from home, a trip with a start and a required
// end. Built behind these two gates and shipped closed (the owner's word, 2026-10-04): closed,
// nothing of either is shown, stored, read or sent, so the day's sheet, the draw, eligibility,
// every prompt and the monitoring stay exactly as they were. Opened only at the owner's word once
// Pass 1B is complete and activated, the Worker first; the phone and the Worker read these values.

/** Moves that need the house, and Skip's "Not home". */
export const HOME_ONLY: 'gated' | 'open' = 'gated'

/** Away from home: a trip's days, set ahead with a required end. */
export const AWAY_FROM_HOME: 'gated' | 'open' = 'gated'

/** A trip: its first and last day, both away from home. The last day is required, so a trip always ends by itself. */
export interface AwayRange {
  from: string
  to: string
  /** When it was set or last changed. */
  setAt: string
}

/** The longest trip that may be set, first and last day included: three weeks. */
export const AWAY_MAX_DAYS = 21

/** What a day's record held before a trip shaped it: ending the trip gives the day these back. */
export interface AwayHeld {
  atOffice: boolean
  pickupTime: string | null
  churchDay: boolean
  studyNight: boolean
}

/** Whether a day falls inside a trip, first and last day included. */
export function onTrip(range: Pick<AwayRange, 'from' | 'to'> | null | undefined, day: string): boolean {
  return Boolean(range && range.from <= day && day <= range.to)
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function utcDay(day: string): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
}

/** Days from one day to another, both YYYY-MM-DD: 0 for the same day. */
export function daysFrom(a: string, b: string): number {
  return Math.round((utcDay(b) - utcDay(a)) / 86_400_000)
}

export type AwayProblem = 'noStart' | 'noEnd' | 'startPast' | 'endBeforeStart' | 'tooLong'

/**
 * Why a trip cannot be set as typed, or null when it can: both days given, starting today or later,
 * ending on or after its start, and no longer than three weeks. A trip under way keeps its start;
 * only its end may change, so `started` lets a start before today stand.
 */
export function awayProblem(from: string, to: string, today: string, started = false): AwayProblem | null {
  if (!DAY_RE.test(from)) return 'noStart'
  if (!DAY_RE.test(to)) return 'noEnd'
  if (from < today && !started) return 'startPast'
  if (to < from) return 'endBeforeStart'
  if (daysFrom(from, to) + 1 > AWAY_MAX_DAYS) return 'tooLong'
  return null
}

// "Said" means seen (stage 1, item m): a line counts as said, for the follow-up, the repeat check,
// the ranking's rest and the usage counts alike, only once it was on screen. The phone's own line is
// marked on its log entry; the Worker's line and review on the record of the day it was seen, since
// the phone never writes the Worker's rows and a day the phone never opened has no record to mark.
// One test for every reader, the Worker's included, so it names plain shapes rather than the phone's
// database types.

/** When the phone began marking its own line shown (Part 33). */
const SHOWN_MARKED_FROM = '2026-09-25T00:00:00.000Z'

/** When the phone began marking the Worker's lines and reviews shown (stage 1, item m). */
export const WORKER_SHOWN_MARKED_FROM = '2026-10-17T00:00:00.000Z'

/** A day's record as the shown test reads it: the Worker's rows first seen that day, by key. */
export interface ShownMarks {
  day: string
  shown?: Record<string, string>
}

/**
 * Whether the phone's own line was on screen, and so was said: marked when shown; before the mark
 * existed, a line logged while the brain's own line already stood that day was never shown, since
 * the brain's line takes the card.
 */
export function wasShown(l: { day: string; at: string; shownAt?: string }, briefs: readonly { day: string; at: string; kind: string }[]): boolean {
  if (l.shownAt) return true
  if (l.at >= SHOWN_MARKED_FROM) return false
  return !briefs.some((w) => w.kind === 'brief' && w.day === l.day && w.at <= l.at)
}

/** The key a Worker's row is shown and answered under. */
export function workerKey(b: { id: string }): string {
  return `worker:${b.id}`
}

/**
 * Whether the Worker's line or review was on screen, and so was said: marked on the record of the day
 * it was first seen, whichever day that was. One written before that mark existed counts as said, as
 * it always did: whether it was seen then cannot be known now.
 */
export function workerShown(b: { id: string; at: string }, days: readonly ShownMarks[]): boolean {
  if (b.at < WORKER_SHOWN_MARKED_FROM) return true
  const key = workerKey(b)
  return days.some((c) => Boolean(c.shown?.[key]))
}

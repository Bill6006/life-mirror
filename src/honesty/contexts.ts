import { parseDay } from '../blocks'
import type { CheckIn, DayContext } from '../db'
import { SHORT_SLEEP_ANCHOR } from '../repair/record'

// The day's contexts the honesty checks read (stage R7): each one the day's own record keeps, and a short night from the
// morning's own answer. Unknown is never "no": a day with no morning sleep answer has no short night either way.

export const HONESTY_CONTEXTS = ['withHer', 'office', 'church', 'studyNight', 'unwell', 'amongPeople', 'away', 'weekend', 'shortNight'] as const
export type HonestyContext = (typeof HONESTY_CONTEXTS)[number]

/** Whether each context held on a day: true, false, or null when the record cannot say. */
export function contextFlags(day: string, rec: DayContext | undefined, morning: CheckIn | undefined): Record<HonestyContext, boolean | null> {
  const weekday = parseDay(day).getDay()
  const slept = morning?.answers.sleepHours
  return {
    withHer: rec ? rec.withHer : null,
    office: rec ? Boolean(rec.atOffice) : null,
    church: rec ? rec.churchDay : null,
    studyNight: rec ? rec.studyNight : null,
    unwell: rec ? Boolean(rec.unwell) : null,
    amongPeople: rec ? Boolean(rec.amongPeople) : null,
    away: rec ? Boolean(rec.awayFromHome) : null,
    weekend: weekday === 0 || weekday === 6,
    shortNight: slept === undefined ? null : slept <= SHORT_SLEEP_ANCHOR,
  }
}

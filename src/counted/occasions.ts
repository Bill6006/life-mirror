import { BLOCKS, type Block } from '../blocks'
import { isComplete, type CheckIn } from '../db'
import { bandOf, readingOf, type Band } from '../score'

// The occasions the counted foundation counts over (2026-11-12; in shadow: nothing reads it yet). One occasion for
// each complete check-in, with the window of the day it covers, and what came before: only what the record held
// before the day began. A thing counted at a check-in could have happened at any moment of its window, so nothing
// that was read later than the day's start may be set before it. That is why "what came before" is the night's
// sleep and the day before, the same for every check-in of a day.

/** The app's day begins at this hour: a check-in at half past one at night is filed under the day before. */
export const DAY_START_HOUR = 4
/** An evening that read under this, out of 100, was a low evening. */
export const LOW_READING = 40
/** Sleep hours answered at this anchor or lower was a short night: under five hours, or five to six. */
export const SHORT_NIGHT = 2

export interface Occasion {
  checkin: CheckIn
  day: string
  block: Block
  /** 0 Sunday to 6 Saturday, of the day it is filed under. */
  weekday: number
  /** What it read out of 100, and the band that falls in. */
  reading: number
  band: Band
  /** When it was completed. */
  at: string
  /** When the window it covers began: the completion of the check-in completed before it that day, else the day's start. */
  since: string
}

const parts = (day: string): [number, number, number] => [Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))]

/** The weekday a day is filed under, 0 Sunday to 6 Saturday. */
export function weekdayOf(day: string): number {
  const [y, m, d] = parts(day)
  return new Date(y, m, d).getDay()
}

/** The moment the app's day begins, by the phone's own clock. */
export function dayStart(day: string): string {
  const [y, m, d] = parts(day)
  return new Date(y, m, d, DAY_START_HOUR).toISOString()
}

/** The day before a day, as it is filed. */
export function dayBefore(day: string): string {
  const [y, m, d] = parts(day)
  const before = new Date(y, m, d - 1)
  return `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-${String(before.getDate()).padStart(2, '0')}`
}

/** A record's days, laid out once. */
export interface Days {
  /** Every occasion, by day and then by check-in. */
  occasions: Occasion[]
  /** Each day's occasions, in the order of the check-ins. */
  byDay: Map<string, Occasion[]>
  /** Every check-in of each day, complete or not: an answer given is an answer. */
  checkins: Map<string, CheckIn[]>
}

/** One occasion for each complete check-in that has a reading out of 100. */
export function occasionsOf(checkins: readonly CheckIn[]): Occasion[] {
  return daysOf(checkins).occasions
}

export function daysOf(checkins: readonly CheckIn[]): Days {
  const all = new Map<string, CheckIn[]>()
  for (const c of checkins) {
    const list = all.get(c.day)
    if (list) list.push(c)
    else all.set(c.day, [c])
  }
  const byDay = new Map<string, Occasion[]>()
  for (const [day, list] of all) {
    const complete = list.filter((c) => c.completedAt !== null && isComplete(c) && readingOf(c) !== null)
    if (!complete.length) continue
    // The window runs from the check-in completed before it, whichever block that was.
    const byTime = [...complete].sort((a, b) => (a.completedAt as string).localeCompare(b.completedAt as string))
    const start = dayStart(day)
    const weekday = weekdayOf(day)
    const made = byTime.map((c, i): Occasion => {
      const reading = readingOf(c)?.value as number
      return { checkin: c, day, block: c.block, weekday, reading, band: bandOf(reading), at: c.completedAt as string, since: i > 0 ? (byTime[i - 1].completedAt as string) : start }
    })
    byDay.set(day, made.sort((a, b) => BLOCKS.indexOf(a.block) - BLOCKS.indexOf(b.block)))
  }
  const occasions = [...byDay.keys()].sort().flatMap((day) => byDay.get(day) as Occasion[])
  return { occasions, byDay, checkins: all }
}

/** What the record held before a day began. Each is null where the record cannot say. */
export interface Before {
  /** Last night was short: the day's own morning answer for sleep hours, at its lowest two anchors. */
  shortNight: boolean | null
  /** The evening of the day before read under 40. Null when that evening was not completed, or was completed after this day had begun. */
  lowEvening: boolean | null
  /** The day before, whose own kinds came before this day. */
  yesterday: string
}

/** What came before a day: the night's sleep, and the day before. The same for every check-in of the day. */
export function beforeDay(day: string, days: Days): Before {
  const morning = days.checkins.get(day)?.find((c) => c.block === 'morning')
  const slept = morning?.answers.sleepHours
  const yesterday = dayBefore(day)
  const evening = days.byDay.get(yesterday)?.find((o) => o.block === 'evening')
  const inTime = evening !== undefined && evening.at <= dayStart(day)
  return { shortNight: slept === undefined ? null : slept <= SHORT_NIGHT, lowEvening: inTime ? (evening as Occasion).reading < LOW_READING : null, yesterday }
}

/**
 * The band of the check-in completed before an occasion's window began: earlier the same day, else the evening of the
 * day before if it was completed by this day's start. For display only: it changes inside the day, so it is no split.
 */
export function previousBand(o: Occasion, days: Days): Band | null {
  const earlier = (days.byDay.get(o.day) ?? []).filter((x) => x.at <= o.since && x !== o).sort((a, b) => b.at.localeCompare(a.at))[0]
  if (earlier) return earlier.band
  const evening = days.byDay.get(dayBefore(o.day))?.find((x) => x.block === 'evening')
  return evening && evening.at <= dayStart(o.day) ? evening.band : null
}

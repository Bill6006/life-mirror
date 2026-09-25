import { parseDay } from './blocks'

/** Replaces {name} placeholders in a copy string. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
}

/** "today", "yesterday", "3 days ago": never "1 days ago". */
export function daysAgoWords(n: number, words: { today: string; yesterday: string; daysAgo: string }): string {
  if (n <= 0) return words.today
  if (n === 1) return words.yesterday
  return words.daysAgo.replace('{n}', String(n))
}

/**
 * A clock time as the owner reads one: 5:30 PM, no leading zero, whatever the phone's locale. Only what
 * is shown: times are kept, compared and scheduled as HH:MM (truth audit, 2026-09-24).
 */
export function clock12(hours: number, minutes: number): string {
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

/** A time of day kept as HH:MM, shown: 17:30 as 5:30 PM. */
export function formatHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 24 && m >= 0 && m < 60 ? clock12(h, m) : hhmm
}

/** The time of day of a moment on record, shown: 5:30 PM. */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : clock12(d.getHours(), d.getMinutes())
}

/** A moment on record with its date, shown: Sep 24, 2026, 5:30 PM. */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${clock12(d.getHours(), d.getMinutes())}`
}

// A 24-hour time in running text (17:30), or a 12-hour one (5:30 pm); never part of a longer number or a ratio.
const TIME_IN_TEXT = /(?<![\d:.])(\d{1,2}):([0-5]\d)(?:\s?([AaPp])\.?[Mm](?![A-Za-z]))?(?![\d:])/g

/** A matched time as minutes after midnight, or null when it is no time of day (25:10, 13:30 PM). */
function minutesOfMatch(hh: string, mm: string, half: string | undefined): number | null {
  const h = Number(hh)
  if (half) return h >= 1 && h <= 12 ? ((h % 12) + (half.toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(mm) : null
  return h <= 23 ? h * 60 + Number(mm) : null
}

/** The clock times a text names, in either form, as minutes after midnight. */
export function clockTimesIn(text: string): number[] {
  return [...text.matchAll(TIME_IN_TEXT)].flatMap((m) => {
    const minutes = minutesOfMatch(m[1], m[2], m[3])
    return minutes === null ? [] : [minutes]
  })
}

// The day's shape names the hour as a bare 24-hour number for its writers: "the hour is 16".
const HOUR_IN_TEXT = /\bthe hour is (\d{1,2})\b(?![:.]\d)(?!\s?[AaPp]\.?[Mm](?![A-Za-z]))/g

/** Words written from facts that keep HH:MM, shown with every clock time as 5:30 PM, and the day's hour as 4 PM; a token that is no time of day is left as written. */
export function clockTimes12(text: string): string {
  return text
    .replace(TIME_IN_TEXT, (whole: string, hh: string, mm: string, half: string | undefined) => {
      const minutes = minutesOfMatch(hh, mm, half)
      return minutes === null ? whole : clock12(Math.floor(minutes / 60), minutes % 60)
    })
    .replace(HOUR_IN_TEXT, (whole: string, hh: string) => {
      const h = Number(hh)
      return h <= 23 ? `the hour is ${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` : whole
    })
}

export function formatDayLong(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function formatDayShort(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Sat 5": for tight chart labels. */
export function formatDayTiny(day: string): string {
  const d = parseDay(day)
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`
}

/** "Sun": the weekday alone, for a chart's x axis. */
export function weekdayShort(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'short' })
}

export function weekdayInitial(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'narrow' })
}

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

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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

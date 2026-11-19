import { copy } from './copy'
import { eventTypeOf } from './noteEvents/types'

// What a reader of a stored forecast needs to say of it (2026-11-14), shared by the phone and the Worker: each of the
// challenger's conditions in words and the Brain switch it is read under, the ways of forecasting in the Weekly View's
// own words and which of them can tell one weekday from another, and from how many scored day-ahead forecasts the
// Weekly View says how often they land.

/** The Weekly View says how often its day-ahead forecasts land once this many are scored (the screen's own MEASURED_FROM). */
export const DAY_AHEAD_MEASURED_FROM = 20

/** The ways of forecasting with a weekday term (forecast.ts's tellsWeekdaysApart). */
export const WEEKDAY_WAYS: readonly string[] = ['weekdayBlock', 'blend']

/** A way in the Weekly View's own words, or null for a name it does not know. */
export function wayWords(model: string): string | null {
  const words = (copy.brief.models as Readonly<Record<string, string>>)[model]
  return typeof words === 'string' ? words : null
}

const NIGHT = copy.brief.lastNightEvents as Readonly<Record<string, string>>

export type ConditionCategory = 'dayRecord' | 'faith' | 'privateItems' | 'notes'

/** The Brain switch a condition is read under; null for an id the forecast does not know, which is then read nowhere. */
export function conditionCategory(id: string): ConditionCategory | null {
  if (id === 'sleep.short' || id === 'evening.band') return 'dayRecord'
  if (id.startsWith('night.')) {
    const key = id.slice('night.'.length)
    return typeof NIGHT[key] !== 'string' ? null : key === 'churchDay' ? 'faith' : 'dayRecord'
  }
  if (/^private\.\d+$/.test(id)) return 'privateItems'
  if (id.startsWith('noticed.')) return eventTypeOf(id.slice('noticed.'.length)) ? 'notes' : null
  return null
}

/**
 * A condition in words, as an answer may say it: a private item by its name only where `privateName` gives one, and
 * otherwise as "a private item". Null for an id the forecast does not know.
 */
export function conditionWords(id: string, privateName: (itemId: string) => string | null): string | null {
  if (conditionCategory(id) === null) return null
  if (id === 'sleep.short') return 'whether the last night reported before the day was short'
  if (id === 'evening.band') return 'the band the evening before read in'
  if (id.startsWith('night.')) return `${NIGHT[id.slice('night.'.length)]} the evening before`
  if (id.startsWith('private.')) return `${privateName(id.slice('private.'.length)) ?? 'a private item'} marked the evening before`
  const type = eventTypeOf(id.slice('noticed.'.length))
  return `the evening before’s note, which Claude noticed as “${type?.label ?? ''}”`
}

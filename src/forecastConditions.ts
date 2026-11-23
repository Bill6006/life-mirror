import { copy } from './copy'
import type { Fact } from './factTypes'
import { eventTypeOf } from './noteEvents/types'

// What a reader of a stored forecast needs to say of it (2026-11-14), shared by the phone and the Worker: each of the
// challenger's conditions in words and the Brain switch it is read under, the ways of forecasting in the Weekly View's
// own words and which of them can tell one weekday from another, and from how many scored day-ahead forecasts the
// Weekly View says how often they land.

/** The Weekly View says how often its day-ahead forecasts land once this many are scored (the screen's own MEASURED_FROM). */
export const DAY_AHEAD_MEASURED_FROM = 20

/** The ways of forecasting with a weekday term (forecast.ts's tellsWeekdaysApart), the level-plus-weekday way among them (2026-11-21), and Stage C's with a weekday shift (2026-11-22). */
export const WEEKDAY_WAYS: readonly string[] = ['weekdayBlock', 'blend', 'levelWeekday', 'levelReadings', 'levelWeekdayWeather']

/** The ways whose days ahead can differ (forecast.ts's daysCanDiffer): those with a weekday term, and Stage C's weather way, whose days differ by the forecast for each (2026-11-22). */
export const DAYS_APART_WAYS: readonly string[] = [...WEEKDAY_WAYS, 'levelWeather']

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

/** Each thing of last night's comparison on the day's sheet, by its key (lastNight.ts's LAST_NIGHT_IDS, which a test holds it to). */
export const NIGHT_FACT_IDS: Readonly<Record<string, string>> = {
  dinner: 'assoc.dinner',
  caffeine: 'assoc.caffeine.evening',
  coolingOff: 'assoc.coolingOff',
  bigSocial: 'assoc.bigSocial',
  napped: 'assoc.napped',
  nature: 'assoc.nature.morning',
  sweet: 'assoc.sweet.evening',
  nothingLanded: 'assoc.nothingLanded',
  hardToSeePoint: 'assoc.hardToSeePoint',
  necessity: 'assoc.necessity',
  churchDay: 'assoc.churchDay',
  workout: 'assoc.eveningWorkout',
}

/** The day's sheet comparison of a condition for the next morning, or null where the sheet holds none: the first two conditions and a note event have none. */
export function comparisonOf(condition: string): string | null {
  if (condition.startsWith('night.')) return NIGHT_FACT_IDS[condition.slice('night.'.length)] ?? null
  if (/^private\.\d+$/.test(condition)) return condition
  return null
}

const STORED = /^forecasts\.(\d{4})-(\d{2})-(\d{2})\.(?:morning|afternoon|evening)\.\d+$/
const MOVED = /^forecasts\.\d{4}-\d{2}-\d{2}\.(?:morning|afternoon|evening)\.\d+\.moved$/
const LEVEL_WEEKDAY = /^pattern\.level\.(?:low|high)\.weekday\.([0-6])$/

/**
 * Where a stored forecast and a counted pattern or comparison that an answer cites point different ways (2026-11-18),
 * decided from their structured fields alone, in two narrow cases, each said in words for the checker's reason. One: a
 * cell of the reading's level on the forecast's own weekday (under 40, or 80 or more) stands at a steady pattern, and
 * the forecast's way cannot tell one weekday from another. Two: a forecast was moved one way, and the day's sheet
 * comparison of a condition that moved it stands at a steady pattern the other way. Nothing else is read as a difference.
 */
export function forecastDifferences(cited: readonly Fact[]): string[] {
  const out: string[] = []
  const steady = (f: Fact): boolean => f.values.standing === 'pattern'
  for (const f of cited) {
    const m = STORED.exec(f.id)
    if (!m || typeof f.values.model !== 'string' || WEEKDAY_WAYS.includes(f.values.model)) continue
    const weekday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
    for (const p of cited) {
      const w = LEVEL_WEEKDAY.exec(p.id)
      if (w && Number(w[1]) === weekday && steady(p)) out.push(`${p.id} stands at a steady pattern on the weekday of ${f.id}, whose way cannot tell one weekday from another`)
    }
  }
  for (const f of cited) {
    if (!MOVED.test(f.id) || (f.values.dir !== 'lower' && f.values.dir !== 'higher') || typeof f.values.by !== 'string') continue
    const other = f.values.dir === 'lower' ? 'higher' : 'lower'
    for (const condition of f.values.by.split('|')) {
      const id = comparisonOf(condition)
      const c = id ? cited.find((x) => x.id === id) : undefined
      if (c && steady(c) && c.values.direction === other) out.push(`${f.id} was set ${f.values.dir}, and ${c.id} stands at a steady pattern ${other}`)
    }
  }
  return out
}

/** The words that say a forecast and a pattern differ: one of them stands in an answer wherever they do. */
export const DIFFER_WORDS = /\b(?:differ(?:s|ed)?|disagree(?:s|d)?|(?:does|do|did) not match|(?:doesn|don|didn)[’']t match)\b/i

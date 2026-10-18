import { dayAssociation, type Association } from './associations'
import { dayKey } from './blocks'
import type { CheckIn, DayContext, DayWeather } from './db'
import { minutesOf } from './reminderRules'
import type { Place } from './sun'

// Weather as context (stage 3, item 6), built as designed at the owner's word of 2026-10-18: "Agreed: build weather as
// designed, with Open-Meteo, off until I turn it on." Once a day, only while Life Mirror is open and its switch is on,
// Open-Meteo is asked for yesterday's and today's weather at the area the sun's times use, to one decimal. Nothing else
// is put in the request. What comes back is kept with each day's record, values only, never the area.

/** The one address asked. */
export const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
/** The credit its licence (CC BY 4.0) asks for beside wherever its data shows. */
export const WEATHER_CREDIT_URL = 'https://open-meteo.com/'
/** A rainy day, by the meteorologists' wet-day line: a millimetre of rain or more. Under it, the day is dry. */
export const RAIN_DAY_MM = 1
/** Rain forecast in an hour at or above this, the smallest amount measured: a move that needs the outdoors waits. */
export const RAIN_HOUR_MM = 0.1
/** The comparisons, on Evidence and the day's sheet, wait for this many days with weather. */
export const WEATHER_DAYS_MIN = 14

/** One decimal, as the place is typed and the area kept: about eleven kilometres. */
export function oneDecimal(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1)
}

/**
 * The one request of a day: the area to one decimal, yesterday's and today's dates, and what is asked back (the day's
 * rain, showers, sunshine and high, and the hour's rain and showers), in the area's own time zone.
 */
export function weatherUrl(p: Place, yesterday: string, today: string): string {
  return `${WEATHER_ENDPOINT}?latitude=${oneDecimal(p.lat)}&longitude=${oneDecimal(p.lon)}&daily=rain_sum,showers_sum,sunshine_duration,temperature_2m_max&hourly=rain,showers&timezone=auto&start_date=${yesterday}&end_date=${today}`
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const tenth = (v: number) => Math.round(v * 10) / 10
const hundredth = (v: number) => Math.round(v * 100) / 100

/** The units asked for: a value in any other would be misread, so nothing is read. */
const DAILY_UNITS: Readonly<Record<string, string>> = { rain_sum: 'mm', showers_sum: 'mm', sunshine_duration: 's', temperature_2m_max: '°C' }
const HOURLY_UNITS: Readonly<Record<string, string>> = { rain: 'mm', showers: 'mm' }

function unitsAre(units: Record<string, unknown>, want: Readonly<Record<string, string>>): boolean {
  return Object.entries(want).every(([k, u]) => units[k] === u)
}

/**
 * The rain forecast in each clock hour of the day, from midnight: each hourly value sums the hour before its time, so
 * the hour from h:00 is read at h+1:00, and the last hour's lies past the day asked. Null where none came back.
 */
function hoursOf(hourly: Record<string, unknown>, day: string): (number | null)[] | null {
  const time = arr(hourly.time)
  const rain = arr(hourly.rain)
  const showers = arr(hourly.showers)
  const out: (number | null)[] = []
  for (let h = 0; h < 24; h++) {
    const i = h < 23 ? time.indexOf(`${day}T${String(h + 1).padStart(2, '0')}:00`) : -1
    const a = i >= 0 ? num(rain[i]) : null
    const b = i >= 0 ? num(showers[i]) : null
    out.push(a === null || b === null || a < 0 || b < 0 ? null : hundredth(a + b))
  }
  return out.some((v) => v !== null) ? out : null
}

/**
 * What came back, by day: a day is kept only when each of its values came back as a number in the unit asked; anything
 * else leaves it unknown, never dry. Today's carries its hours.
 */
export function readWeather(json: unknown, days: readonly string[], at: string, today: string): Record<string, DayWeather> {
  const o = obj(json)
  const daily = obj(o.daily)
  if (!unitsAre(obj(o.daily_units), DAILY_UNITS)) return {}
  const time = arr(daily.time)
  const out: Record<string, DayWeather> = {}
  for (const day of days) {
    const i = time.indexOf(day)
    if (i < 0) continue
    const rain = num(arr(daily.rain_sum)[i])
    const showers = num(arr(daily.showers_sum)[i])
    const sun = num(arr(daily.sunshine_duration)[i])
    const high = num(arr(daily.temperature_2m_max)[i])
    if (rain === null || showers === null || sun === null || high === null || rain < 0 || showers < 0 || sun < 0) continue
    const w: DayWeather = { rain: tenth(rain + showers), sun: tenth(sun / 3600), high: tenth(high), at }
    const hours = day === today && unitsAre(obj(o.hourly_units), HOURLY_UNITS) ? hoursOf(obj(o.hourly), day) : null
    out[day] = hours ? { ...w, hours } : w
  }
  return out
}

/**
 * Whether rain is forecast where you are in this clock hour or the next, from the day's own record: a move that needs
 * the outdoors waits while it is. Null when that is not known: the day holds no hours, or it is past them.
 */
export function rainSoon(w: DayWeather | undefined, day: string, now: Date): boolean | null {
  if (!w?.hours || dayKey(now) !== day) return null
  const h = now.getHours()
  const known = [w.hours[h], w.hours[h + 1]].filter((v): v is number => typeof v === 'number')
  return known.length ? known.some((v) => v >= RAIN_HOUR_MM) : null
}

/** The share of a day's daylight in sun, from its record's sunrise and sunset; null without both. */
export function sunShare(ctx: Pick<DayContext, 'weather' | 'light'>): number | null {
  if (!ctx.weather || !ctx.light) return null
  const span = minutesOf(ctx.light.set) - minutesOf(ctx.light.rise)
  return span > 0 ? Math.min(1, (ctx.weather.sun * 60) / span) : null
}

export interface WeatherEvidence {
  /** Days before today whose record holds weather. */
  days: number
  /** Of those, the rainy ones. */
  rainy: number
  /** Of those, the ones whose share of daylight in sun is known, and the ones above the middle day's share. */
  shared: number
  sunnier: number
  /** Rainy days against dry ones: the evening's reading, like for like on the morning's band. */
  rain: Association
  /** Days with more of their daylight in sun than the middle day's, against the rest, the same way. */
  sun: Association
}

/**
 * The two comparisons, once WEATHER_DAYS_MIN days before today hold weather; null until then. A day without weather enters
 * neither side, and the sunnier days are those above the middle day's share of daylight in sun, so a long summer day is
 * not counted sunnier for its length alone.
 */
export function weatherEvidence(checkins: readonly CheckIn[], contexts: readonly DayContext[], today: string): WeatherEvidence | null {
  const known = new Map(contexts.filter((c) => c.day < today && c.weather).map((c) => [c.day, c]))
  if (known.size < WEATHER_DAYS_MIN) return null
  const isRainy = (day: string) => (known.get(day)?.weather?.rain ?? 0) >= RAIN_DAY_MM
  const rain = dayAssociation(checkins, today, isRainy, (day) => known.has(day))
  const shares = new Map([...known.values()].flatMap((c) => {
    const s = sunShare(c)
    return s === null ? [] : [[c.day, s] as const]
  }))
  const sorted = [...shares.values()].sort((a, b) => a - b)
  const middle = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : 0
  const isSunnier = (day: string) => (shares.get(day) ?? 0) > middle
  const sun = dayAssociation(checkins, today, isSunnier, (day) => shares.has(day))
  return { days: known.size, rainy: [...known.keys()].filter(isRainy).length, shared: shares.size, sunnier: [...shares.keys()].filter(isSunnier).length, rain, sun }
}

/** Countries that read a temperature in Fahrenheit. */
const FAHRENHEIT = new Set(['US', 'BS', 'BZ', 'KY', 'LR', 'PW', 'FM', 'MH'])

/** A temperature in °C as this phone's region reads it: Fahrenheit where that is the habit, else Celsius. */
export function temperatureHere(celsius: number, locale: string = typeof navigator === 'undefined' ? 'en' : navigator.language): string {
  const region = locale.split(/[-_]/)[1]?.toUpperCase() ?? ''
  return FAHRENHEIT.has(region) ? `${Math.round(celsius * 1.8 + 32)} °F` : `${Math.round(celsius)} °C`
}

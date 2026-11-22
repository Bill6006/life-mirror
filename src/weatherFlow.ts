import { addDays, blockAt } from './blocks'
import { db, ensureDayContext, getSettings, type DayWeather, type WeatherIssued } from './db'
import { sunPlace } from './settings'
import { issuedFrom, readWeather, WEATHER_AHEAD_DAYS, weatherUrl } from './weather'

// Weather as context (stage 3, item 6): the one request of a day, made only while Life Mirror is open and its switch is
// on, and what came back kept with the days' records. The request names nothing but the area to one decimal and the two
// dates; it carries no referrer and no cookie.
//
// Stage C0 (2026-11-22): the two dates are yesterday's and the one seven days past today. Yesterday's and today's
// weather are kept exactly as before; the forecast for today and each of the next seven days is also kept, once, on
// today's record, as it was issued.

/** The day the one request of a day was made, kept on this phone: at most one a day, whatever came of it. */
const ASKED = 'lm.weather.asked'

function askedOn(): string | null {
  try {
    return localStorage.getItem(ASKED)
  } catch {
    return null
  }
}

function markAsked(day: string): void {
  try {
    localStorage.setItem(ASKED, day)
  } catch {
    // Storage refused (a private window): the mark held in memory still keeps it to one a day while the app stays open.
  }
}

let askedHere: string | null = null
let inflight: Promise<WeatherRead> | null = null

/** What a try came to: switched off, no place to ask for, already asked today, read, or nothing usable came back. */
export type WeatherRead = 'off' | 'noPlace' | 'asked' | 'read' | 'failed'

/** Forgets the marks, for tests. */
export function resetWeatherMarks(): void {
  askedHere = null
  inflight = null
  try {
    localStorage.removeItem(ASKED)
  } catch {
    // Nothing to forget.
  }
}

/**
 * Reads yesterday's and today's weather once today, while the switch is on and a place is known, and keeps each with its
 * day's record; the forecast issued today for the days ahead is kept with today's. The day is marked asked before the
 * request goes, so a failure is not tried again until tomorrow.
 */
export function readWeatherToday(now: Date = new Date(), fetcher: typeof fetch = (...a) => fetch(...a)): Promise<WeatherRead> {
  if (inflight) return inflight
  inflight = read(now, fetcher).finally(() => {
    inflight = null
  })
  return inflight
}

async function read(now: Date, fetcher: typeof fetch): Promise<WeatherRead> {
  const settings = await getSettings()
  if (!settings.weather.on) return 'off'
  const where = sunPlace(settings)
  if (!where) return 'noPlace'
  const today = blockAt(now).day
  const once = async (): Promise<WeatherRead> => {
    if (askedHere === today || askedOn() === today) return 'asked'
    askedHere = today
    markAsked(today)
    const yesterday = addDays(today, -1)
    /** Today and each day asked for after it, in order. */
    const ahead = Array.from({ length: WEATHER_AHEAD_DAYS + 1 }, (_, k) => addDays(today, k))
    let json: unknown
    try {
      const res = await fetcher(weatherUrl(where.place, yesterday, ahead[ahead.length - 1]), { referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' })
      if (!res.ok) return 'failed'
      json = await res.json()
    } catch {
      return 'failed'
    }
    const at = now.toISOString()
    const got = readWeather(json, [yesterday, today], at, today)
    await keep(got, today, issuedFrom(readWeather(json, ahead, at, today), ahead, at))
    return Object.keys(got).length ? 'read' : 'failed'
  }
  // Two tabs open at once ask once between them.
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request('lm-weather', once) : once()
}

/**
 * Each day's weather onto its record; a day with no record keeps none, since a record is never made up to hold it. The
 * forecast issued today goes onto today's record alone, and only where that record holds none yet: it is kept as first
 * read, whatever a later read brings.
 */
async function keep(got: Readonly<Record<string, DayWeather>>, today: string, issued: WeatherIssued | null): Promise<void> {
  if (got[today]) await ensureDayContext(today, await getSettings())
  await db.transaction('rw', db.days, async () => {
    for (const [day, weather] of Object.entries(got)) {
      const ctx = await db.days.get(day)
      if (!ctx) continue
      const first = day === today && issued && !ctx.weatherIssued ? { weatherIssued: issued } : {}
      await db.days.put({ ...ctx, weather, ...first })
    }
  })
}

/**
 * While the switch is on and the app open: once at launch, and again on coming back to it or every half hour in view,
 * each a no-op until the next day begins. `onRead` runs after weather is kept, so the day's sheet can carry it.
 */
export function watchWeather(onRead: () => void, page: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document, clock: () => Date = () => new Date()): () => void {
  const tryNow = () => {
    void readWeatherToday(clock()).then((r) => {
      if (r === 'read') onRead()
    })
  }
  tryNow()
  const onVisible = () => {
    if (page.visibilityState === 'visible') tryNow()
  }
  page.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => {
    if (page.visibilityState === 'visible') tryNow()
  }, 30 * 60_000)
  return () => {
    page.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}

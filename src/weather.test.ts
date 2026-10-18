import { describe, expect, it } from 'vitest'
import type { CheckIn, DayContext, DayWeather } from './db'
import { weatherFacts } from './facts'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { rainSoon, readWeather, sunShare, temperatureHere, weatherEvidence, weatherUrl } from './weather'

// Weather as context (stage 3, item 6): the one request names the area to one decimal and two dates, and nothing else;
// what comes back is read only in the units asked, a day missing anything is unknown, never dry; rain this hour or the
// next keeps a move that needs the outdoors waiting; the comparisons wait for 14 days with weather, and a day without
// weather enters neither side. Stand-in places and records only.

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
/** A check-in at the middle of every reading but Mood, Energy and Focus, which read p: the reading out of 100 runs 25, 38, 50, 63, 75. */
const ci = (day: string, block: CheckIn['block'], p: Position): CheckIn => ({ day, block, answers: { ...allAt(blockReadings(block), 3), mood: p, energy: p, focus: p }, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })
const ctx = (day: string, weather?: DayWeather, light: DayContext['light'] = { rise: '07:00', set: '19:00' }): DayContext => ({ day, weekday: 1, withHer: true, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '', light, ...(weather ? { weather } : {}) })
const w = (rain: number, sun: number, high = 15): DayWeather => ({ rain, sun, high, at: '2026-10-01T07:00:00.000Z' })
const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}`

/** A reply in Open-Meteo's own shape, for two days, with the hour's rain and showers for each. */
function reply(over: Record<string, unknown> = {}) {
  const hours = (d: string) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)
  const rain = Array.from({ length: 48 }, (_, i) => (i === 24 + 15 ? 0.4 : 0))
  const showers = Array.from({ length: 48 }, (_, i) => (i === 24 + 16 ? 0.3 : 0))
  return {
    latitude: 51.5,
    longitude: -0.1,
    utc_offset_seconds: 3600,
    timezone: 'Europe/London',
    daily_units: { time: 'iso8601', rain_sum: 'mm', showers_sum: 'mm', sunshine_duration: 's', temperature_2m_max: '°C' },
    daily: { time: ['2026-10-17', '2026-10-18'], rain_sum: [1.24, 0.4], showers_sum: [0.5, 0.3], sunshine_duration: [18_360, 7_200], temperature_2m_max: [14.26, 16.81] },
    hourly_units: { time: 'iso8601', rain: 'mm', showers: 'mm' },
    hourly: { time: [...hours('2026-10-17'), ...hours('2026-10-18')], rain, showers },
    ...over,
  }
}

describe('the one request', () => {
  it('names the area to one decimal, yesterday and today, and what is asked back: nothing else', () => {
    const url = weatherUrl({ lat: 51.46, lon: -0.13 }, '2026-10-17', '2026-10-18')
    expect(url).toBe('https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&daily=rain_sum,showers_sum,sunshine_duration,temperature_2m_max&hourly=rain,showers&timezone=auto&start_date=2026-10-17&end_date=2026-10-18')
    expect([...new URL(url).searchParams.keys()]).toEqual(['latitude', 'longitude', 'daily', 'hourly', 'timezone', 'start_date', 'end_date'])
    // An area at the equator or the prime meridian is sent without a sign; one far west keeps its own.
    expect(weatherUrl({ lat: -0.04, lon: -122.44 }, '2026-10-17', '2026-10-18')).toContain('latitude=0.0&longitude=-122.4&')
  })
})

describe('what comes back', () => {
  it('keeps each day’s rain and showers, hours of sun and high, and today’s rain by the clock hour', () => {
    const got = readWeather(reply(), ['2026-10-17', '2026-10-18'], 'T', '2026-10-18')
    expect(got['2026-10-17']).toEqual({ rain: 1.7, sun: 5.1, high: 14.3, at: 'T' })
    const today = got['2026-10-18']
    expect({ ...today, hours: undefined }).toEqual({ rain: 0.7, sun: 2, high: 16.8, at: 'T', hours: undefined })
    // Each hourly value sums the hour before it: the rain at 15:00 fell from 14:00, the showers at 16:00 from 15:00.
    expect(today.hours?.[14]).toBe(0.4)
    expect(today.hours?.[15]).toBe(0.3)
    expect(today.hours?.[13]).toBe(0)
    // The last hour's value lies past the day asked.
    expect(today.hours?.[23]).toBeNull()
    expect(today.hours).toHaveLength(24)
  })

  it('reads nothing in a unit it did not ask for', () => {
    const r = reply()
    expect(readWeather({ ...r, daily_units: { ...r.daily_units, sunshine_duration: 'h' } }, ['2026-10-17', '2026-10-18'], 'T', '2026-10-18')).toEqual({})
    expect(readWeather({ ...r, daily_units: { ...r.daily_units, temperature_2m_max: '°F' } }, ['2026-10-17', '2026-10-18'], 'T', '2026-10-18')).toEqual({})
    // The hours in another unit are left out; the day itself is kept.
    const got = readWeather({ ...r, hourly_units: { rain: 'inch', showers: 'inch' } }, ['2026-10-17', '2026-10-18'], 'T', '2026-10-18')
    expect(got['2026-10-18']).toEqual({ rain: 0.7, sun: 2, high: 16.8, at: 'T' })
  })

  it('leaves a day unknown, never dry, when any of its values is missing or not a number', () => {
    const r = reply()
    const nulled = { ...r, daily: { ...r.daily, showers_sum: [null, 0.3] } }
    expect(Object.keys(readWeather(nulled, ['2026-10-17', '2026-10-18'], 'T', '2026-10-18'))).toEqual(['2026-10-18'])
    const negative = { ...r, daily: { ...r.daily, rain_sum: [1.24, -1] } }
    expect(Object.keys(readWeather(negative, ['2026-10-17', '2026-10-18'], 'T', '2026-10-18'))).toEqual(['2026-10-17'])
    expect(readWeather(reply(), ['2026-10-16'], 'T', '2026-10-18')).toEqual({})
    expect(readWeather('not json', ['2026-10-17'], 'T', '2026-10-18')).toEqual({})
    expect(readWeather({ error: true, reason: 'x' }, ['2026-10-17'], 'T', '2026-10-18')).toEqual({})
  })
})

describe('rain this hour or the next', () => {
  const hours = Array.from({ length: 24 }, (_, h) => (h === 15 ? 0.2 : h === 20 ? null : 0))
  const today = { ...w(2, 3), hours }
  const at = (h: number, m = 30) => new Date(2026, 9, 18, h, m)

  it('says yes while either hour holds a tenth of a millimetre or more, and no while both hold less', () => {
    expect(rainSoon(today, '2026-10-18', at(14))).toBe(true)
    expect(rainSoon(today, '2026-10-18', at(15))).toBe(true)
    expect(rainSoon(today, '2026-10-18', at(16))).toBe(false)
    expect(rainSoon({ ...today, hours: hours.map((v) => (v === 0.2 ? 0.09 : v)) }, '2026-10-18', at(15))).toBe(false)
  })

  it('knows nothing without the day’s own hours, on another day, or where none came back', () => {
    expect(rainSoon(w(5, 3), '2026-10-18', at(14))).toBeNull()
    expect(rainSoon(undefined, '2026-10-18', at(14))).toBeNull()
    expect(rainSoon(today, '2026-10-17', at(14))).toBeNull()
    expect(rainSoon({ ...today, hours: Array.from({ length: 24 }, () => null) }, '2026-10-18', at(14))).toBeNull()
    // Half known: what is known decides.
    expect(rainSoon(today, '2026-10-18', at(19))).toBe(false)
    expect(rainSoon(today, '2026-10-18', at(23))).toBe(false)
  })
})

describe('the comparisons', () => {
  // Sixteen days with weather, each morning Getting by: the six rainy days' evenings read 25, the dry days' 75; the sun
  // alternates nine hours and three of twelve hours' daylight. One day before them has no weather and a low evening.
  const checkins: CheckIn[] = []
  const contexts: DayContext[] = [ctx('2026-09-30')]
  checkins.push(ci('2026-09-30', 'morning', 3), ci('2026-09-30', 'evening', 1))
  for (let d = 1; d <= 16; d++) {
    const rainy = d <= 6
    contexts.push(ctx(day(d), w(rainy ? 3 : 0.2, d % 2 ? 9 : 3)))
    checkins.push(ci(day(d), 'morning', 3), ci(day(d), 'evening', rainy ? 1 : 5))
  }

  it('wait for 14 days with weather before today', () => {
    expect(weatherEvidence(checkins, contexts.slice(0, 14), day(17))).toBeNull()
    expect(weatherEvidence(checkins, contexts.slice(0, 15), day(17))?.days).toBe(14)
    // Today's own weather is not yet a day to compare.
    expect(weatherEvidence(checkins, contexts.slice(0, 15), day(14))).toBeNull()
  })

  it('set rainy days against dry ones, like for like, and leave a day without weather on neither side', () => {
    const ev = weatherEvidence(checkins, contexts, day(17))
    expect(ev).toMatchObject({ days: 16, rainy: 6 })
    expect(ev?.rain).toEqual({ times: 6, withEvent: { mean: 25, n: 6 }, without: { mean: 75, n: 10 }, diff: -50, bands: 1 })
  })

  it('set sunnier days against greyer ones at the middle day’s share of its daylight in sun', () => {
    expect(sunShare(ctx(day(1), w(0, 9)))).toBe(0.75)
    expect(sunShare(ctx(day(1), w(0, 13)))).toBe(1)
    expect(sunShare({ ...ctx(day(1), w(0, 9)), light: undefined })).toBeNull()
    expect(sunShare(ctx(day(1)))).toBeNull()
    const ev = weatherEvidence(checkins, contexts, day(17))
    expect(ev).toMatchObject({ shared: 16, sunnier: 8 })
    // Of the eight sunnier days three were rainy, of the eight greyer three: the same evenings, no difference.
    expect(ev?.sun).toEqual({ times: 8, withEvent: { mean: 56.25, n: 8 }, without: { mean: 56.25, n: 8 }, diff: 0, bands: 1 })
  })
})

describe('the day’s sheet', () => {
  it('carries today’s forecast, values only and never the area, and nothing without it', () => {
    const facts = weatherFacts([], [ctx(day(18), w(2.3, 5.1, 17.6))], day(18))
    expect(facts).toEqual([{ id: 'weather.today', tags: [], text: 'Today’s forecast where you are: 2.3 mm of rain, 5.1 hours of sun, a high of 18 °C (64 °F).', values: { rain: 2.3, sun: 5.1, high: 18, highF: 64 } }])
    expect(weatherFacts([], [ctx(day(18))], day(18))).toEqual([])
  })

  it('carries the two comparisons once 14 days hold weather', () => {
    const contexts: DayContext[] = []
    const checkins: CheckIn[] = []
    for (let d = 1; d <= 14; d++) {
      contexts.push(ctx(day(d), w(d <= 3 ? 3 : 0, d % 2 ? 9 : 3)))
      checkins.push(ci(day(d), 'morning', 3), ci(day(d), 'evening', d <= 3 ? 1 : 5))
    }
    const facts = weatherFacts(checkins, contexts, day(15))
    expect(facts.map((f) => f.id)).toEqual(['assoc.weather.rain', 'assoc.weather.sun'])
    expect(facts[0].text).toBe('Evenings of rainy days (1 mm of rain or more) read -50 against evenings of dry days, like for like on the morning’s band, 3 rainy days of 14 with weather (unclear).')
    expect(facts[0].values).toEqual({ diff: -50, with: 25, without: 75, times: 3, days: 14, bands: 1, mm: 1, rainy: 3 })
    // Two of the seven sunnier days were rainy, one of the seven greyer: (2 × 25 + 5 × 75) / 7 against (25 + 6 × 75) / 7.
    expect(facts[1].text).toBe('Evenings of sunnier days read -7 against greyer ones, like for like on the morning’s band, 7 sunnier days of 14 with weather and daylight known, split at the middle day’s share of its daylight in sun (unclear).')
    expect(facts[1].values).toMatchObject({ diff: -7, with: 61, without: 68, times: 7, days: 14, sunnier: 7, shared: 14 })
    expect(weatherFacts(checkins, contexts.slice(1), day(15))).toEqual([])
  })
})

describe('the high as this phone’s region reads it', () => {
  it('says Fahrenheit where that is the habit, else Celsius', () => {
    expect(temperatureHere(17.6, 'en-US')).toBe('64 °F')
    expect(temperatureHere(17.6, 'en-GB')).toBe('18 °C')
    expect(temperatureHere(-3.2, 'de-DE')).toBe('-3 °C')
    expect(temperatureHere(17.6, 'en')).toBe('18 °C')
  })
})

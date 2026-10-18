import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { factSheet } from './brainFlow'
import { bodyForCloud } from './cloudOutbox'
import { contextFromWeek, db, getSettings, updateSettings } from './db'
import { todayState } from './offerFlow'
import { screen } from './offers'
import { moveById } from './catalogue'
import { readWeatherToday, resetWeatherMarks } from './weatherFlow'

// Weather as context (stage 3, item 6) on the phone: off, nothing is asked; on, one request a day at most, naming the
// area to one decimal and two dates, carrying no referrer and no cookie; a failure is not tried again that day; what
// comes back goes onto the days' own records, never onto a record made up for it; the switch stays on this phone; rain
// forecast for the hour keeps a move that needs the outdoors waiting while the switch is on, and only then.

const TODAY = '2026-10-18'
const YESTERDAY = '2026-10-17'
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m)

/** Open-Meteo's reply, stood in for: the two days asked, rain at 15:00 (the hour from 14:00) on the second. */
function reply(first: string, second: string) {
  const hours = (d: string) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)
  return {
    daily_units: { time: 'iso8601', rain_sum: 'mm', showers_sum: 'mm', sunshine_duration: 's', temperature_2m_max: '°C' },
    daily: { time: [first, second], rain_sum: [1.2, 2], showers_sum: [0, 0.3], sunshine_duration: [3600, 18_000], temperature_2m_max: [12.4, 15.5] },
    hourly_units: { time: 'iso8601', rain: 'mm', showers: 'mm' },
    hourly: { time: [...hours(first), ...hours(second)], rain: Array.from({ length: 48 }, (_, i) => (i === 24 + 15 ? 0.6 : 0)), showers: Array.from({ length: 48 }, () => 0) },
  }
}

type Call = { url: string; init: RequestInit | undefined }
function stubFetch(answer: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return answer(String(input))
  }) as typeof fetch
  return { calls, fetcher }
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('weather on the phone', () => {
  const store = new Map<string, string>()
  beforeEach(async () => {
    await db.delete()
    await db.open()
    store.clear()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
    resetWeatherMarks()
    await updateSettings((s) => ({ ...s, place: { lat: 51.46, lon: -0.13 } }))
    const settings = await getSettings()
    await db.days.bulkPut([contextFromWeek(YESTERDAY, settings), contextFromWeek(TODAY, settings)])
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks nothing while the switch is off, as on a fresh install', async () => {
    expect((await getSettings()).weather.on).toBe(false)
    const { calls, fetcher } = stubFetch(() => ok(reply(YESTERDAY, TODAY)))
    expect(await readWeatherToday(at(18, 9), fetcher)).toBe('off')
    expect(calls).toEqual([])
    expect((await db.days.get(TODAY))?.weather).toBeUndefined()
  })

  it('asks nothing without a place, even switched on', async () => {
    await updateSettings((s) => ({ ...s, place: null, weather: { on: true } }))
    const { calls, fetcher } = stubFetch(() => ok(reply(YESTERDAY, TODAY)))
    expect(await readWeatherToday(at(18, 9), fetcher)).toBe('noPlace')
    expect(calls).toEqual([])
  })

  it('switched on, makes one request a day, naming only the area to one decimal and two dates, with no referrer and no cookie', async () => {
    await updateSettings((s) => ({ ...s, weather: { on: true } }))
    const { calls, fetcher } = stubFetch(() => ok(reply(YESTERDAY, TODAY)))
    expect(await readWeatherToday(at(18, 9), fetcher)).toBe('read')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&daily=rain_sum,showers_sum,sunshine_duration,temperature_2m_max&hourly=rain,showers&timezone=auto&start_date=2026-10-17&end_date=2026-10-18')
    expect(calls[0].init).toEqual({ referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' })
    // Again today, at launch or on return: nothing more is asked.
    expect(await readWeatherToday(at(18, 14), fetcher)).toBe('asked')
    resetWeatherMarksInMemoryOnly()
    expect(await readWeatherToday(at(18, 20), fetcher)).toBe('asked')
    expect(calls).toHaveLength(1)
    // The next day begins at four: then once more.
    const next = stubFetch(() => ok(reply(TODAY, '2026-10-19')))
    expect(await readWeatherToday(at(19, 3, 30), next.fetcher)).toBe('asked')
    expect(await readWeatherToday(at(19, 4, 5), next.fetcher)).toBe('read')
    expect(next.calls.map((c) => c.url.endsWith('&start_date=2026-10-18&end_date=2026-10-19'))).toEqual([true])
  })

  it('keeps each day’s weather on its own record, today’s with its hours, and makes no record up for it', async () => {
    await updateSettings((s) => ({ ...s, weather: { on: true } }))
    await db.days.delete(YESTERDAY)
    const { fetcher } = stubFetch(() => ok(reply(YESTERDAY, TODAY)))
    await readWeatherToday(at(18, 9), fetcher)
    expect(await db.days.get(YESTERDAY)).toBeUndefined()
    const today = await db.days.get(TODAY)
    expect({ ...today?.weather, hours: undefined }).toEqual({ rain: 2.3, sun: 5, high: 15.5, at: at(18, 9).toISOString(), hours: undefined })
    expect(today?.weather?.hours?.[14]).toBe(0.6)
    expect(today?.changed).toBe(false)
    // Read again the day after, the day is as it was (the reply's first day), and its hours go.
    const next = stubFetch(() => ok(reply(TODAY, '2026-10-19')))
    await readWeatherToday(at(19, 9), next.fetcher)
    expect((await db.days.get(TODAY))?.weather).toEqual({ rain: 1.2, sun: 1, high: 12.4, at: at(19, 9).toISOString() })
  })

  it('reads the area Location Context last read while it is on, ahead of the place typed', async () => {
    await updateSettings((s) => ({ ...s, weather: { on: true }, location: { on: true, area: { lat: 40.71, lon: -74.04, at: 'x' } } }))
    const { calls, fetcher } = stubFetch(() => ok(reply(YESTERDAY, TODAY)))
    await readWeatherToday(at(18, 9), fetcher)
    expect(calls[0].url).toContain('?latitude=40.7&longitude=-74.0&')
  })

  it('does not try again the same day after a failure, and keeps nothing from a reply it cannot read', async () => {
    await updateSettings((s) => ({ ...s, weather: { on: true } }))
    const down = stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await readWeatherToday(at(18, 9), down.fetcher)).toBe('failed')
    const up = stubFetch(() => ok(reply(YESTERDAY, TODAY)))
    expect(await readWeatherToday(at(18, 10), up.fetcher)).toBe('asked')
    expect(up.calls).toEqual([])
    resetWeatherMarks()
    const refused = stubFetch(() => new Response('{"error":true}', { status: 400 }))
    expect(await readWeatherToday(at(18, 11), refused.fetcher)).toBe('failed')
    resetWeatherMarks()
    const odd = stubFetch(() => ok({ daily_units: { sunshine_duration: 'h' }, daily: {} }))
    expect(await readWeatherToday(at(18, 12), odd.fetcher)).toBe('failed')
    expect((await db.days.get(TODAY))?.weather).toBeUndefined()
  })

  it('keeps the switch on this phone: the cloud copy never carries it, and the day’s weather goes with the day', async () => {
    expect(bodyForCloud('settings', { id: 1, weather: { on: true }, depth: 'full' })).toEqual({ id: 1, depth: 'full' })
    await updateSettings((s) => ({ ...s, weather: { on: true } }))
    const { fetcher } = stubFetch(() => ok(reply(YESTERDAY, TODAY)))
    await readWeatherToday(at(18, 9), fetcher)
    const queued = (await db.outbox.toArray()).filter((r) => r.store === 'days').map((r) => r.body ?? '')
    expect(queued.some((b) => b.includes('"weather":{"rain":2.3,"sun":5,"high":15.5'))).toBe(true)
    // The area is nowhere in the days that go: they hold values only. (The place typed under The week travels in your own
    // copy of the settings, as it always has.)
    expect(queued.join('\n')).not.toMatch(/51\.4|51\.5|-0\.1|lat|lon/)
  })
})

describe('a move that needs the outdoors', () => {
  const walk = moveById('walk-ten')
  const situation = { block: 'afternoon' as const, target: walk.targets[0].reading, band: 'gettingBy' as const, key: 'k', reading: 50, targetPosition: 3 as const }

  beforeEach(async () => {
    await db.delete()
    await db.open()
    const settings = await getSettings()
    const hours = Array.from({ length: 24 }, (_, h) => (h === 14 ? 0.6 : 0))
    await db.days.put({ ...contextFromWeek(TODAY, settings), weather: { rain: 2.3, sun: 5, high: 15.5, at: 'x', hours } })
  })

  it('waits while rain is forecast for this hour or the next, with the switch on', async () => {
    await updateSettings((s) => ({ ...s, weather: { on: true } }))
    const settings = await getSettings()
    const t = await todayState(TODAY, settings, at(18, 13, 30))
    expect(t.rain).toBe(true)
    expect(screen(walk, situation, t)).toBe('rain')
    // Two hours on, the forecast is dry: it is offered as before.
    const later = await todayState(TODAY, settings, at(18, 16, 10))
    expect(later.rain).toBeUndefined()
    expect(screen(walk, situation, later)).not.toBe('rain')
  })

  it('is offered as before with the switch off, whatever the record holds', async () => {
    const t = await todayState(TODAY, await getSettings(), at(18, 13, 30))
    expect(t.rain).toBeUndefined()
    expect(screen(walk, situation, t)).not.toBe('rain')
    // A move that does not need the outdoors never waits for rain.
    const tea = moveById('glass-of-water')
    expect(tea.needs).not.toContain('outdoors')
    expect(screen(tea, situation, { ...t, rain: true })).not.toBe('rain')
  })
})

/** The mark held in memory forgotten, as on a reload; the one kept on the phone stays. */
function resetWeatherMarksInMemoryOnly(): void {
  const kept = localStorage.getItem('lm.weather.asked')
  resetWeatherMarks()
  if (kept) localStorage.setItem('lm.weather.asked', kept)
}

describe('the day’s sheet the phone writes', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    const settings = await getSettings()
    await db.days.put({ ...contextFromWeek(TODAY, settings), weather: { rain: 2.3, sun: 5.1, high: 17.6, at: 'x' } })
  })

  it('carries the weather only while the switch is on: off, the sheet is as it was', async () => {
    const off = await factSheet(TODAY, at(18, 9))
    expect(off.facts.filter((f) => f.id.startsWith('weather.') || f.id.startsWith('assoc.weather.'))).toEqual([])
    await updateSettings((s) => ({ ...s, weather: { on: true } }))
    const on = await factSheet(TODAY, at(18, 9))
    expect(on.facts.filter((f) => f.id.startsWith('weather.'))).toEqual([{ id: 'weather.today', tags: [], text: 'Today’s forecast where you are: 2.3 mm of rain, 5.1 hours of sun, a high of 18 °C (64 °F).', values: { rain: 2.3, sun: 5.1, high: 18, highF: 64 } }])
    // Everything else on the sheet is as it was.
    const rest = (s: typeof on) => JSON.stringify(s.facts.filter((f) => f.id !== 'weather.today'))
    expect(rest(on)).toBe(rest(off))
  })
})

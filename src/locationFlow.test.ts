import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bodyForCloud } from './cloudOutbox'
import { db, getSettings, updateSettings } from './db'
import { cellBlock, geohash } from './location'
import { answerQuestion, bestFix, forgetAll, nameHere, pendingQuestion, sense, turnOff, turnOn } from './locationFlow'
import { daylightFor } from './settings'
import { sunLocal } from './sun'

// Part 43 on the phone: a position is used at once and let go. Nothing stored holds a coordinate, a
// map cell or a trail; only kinds of place leave the phone; a place is learned from three different
// days and asked about once; the sun follows the area; off stops it; denied falls back.

const HOME = { lat: 51.50722, lon: -0.1275, accuracy: 25 }
const CAFE = { lat: 51.51391, lon: -0.09875, accuracy: 25 }
const FAR = { lat: 52.20534, lon: 0.12182, accuracy: 25 }
const at = (day: number, h: number) => new Date(2026, 9, day, h, 0)

/** The phone's location service, stood in for: it answers with `fix`, or refuses. */
function stubLocation(fix: { lat: number; lon: number; accuracy: number } | 'denied') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void, fail: (e: unknown) => void) => (fix === 'denied' ? fail({ code: 1 }) : ok({ coords: { latitude: fix.lat, longitude: fix.lon, accuracy: fix.accuracy } })),
      },
      permissions: { query: async () => ({ state: fix === 'denied' ? 'denied' : 'granted' }) },
    },
  })
}

/** Everything the phone holds, as text: what a search for a coordinate or a cell must never find. */
async function everything(): Promise<string> {
  const out: string[] = []
  for (const t of db.tables) out.push(JSON.stringify(await t.toArray()))
  return out.join('\n')
}

const tracesOf = (p: { lat: number; lon: number }) => [String(p.lat), String(p.lon), p.lat.toFixed(3), p.lon.toFixed(3), ...cellBlock(p.lat, p.lon).map((c) => c.slice(0, 5))]

describe('Location Context on the phone', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await updateSettings((s) => ({ ...s, location: { on: true, area: null }, week: { ...s.week, officeDays: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false } } }))
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'navigator')
  })

  it('notes the kind of place for the part of the day, and keeps no coordinate, no map cell and no trail', async () => {
    for (const [d, h] of [[20, 9], [20, 14], [20, 20], [21, 9]] as const) await sense(HOME, at(d, h))
    const day = await db.days.get('2026-10-20')
    expect(day?.where).toEqual({ morning: ['out'], afternoon: ['out'], evening: ['out'] })
    const all = await everything()
    for (const t of tracesOf(HOME)) expect(all).not.toContain(t)
    // The area for the sun, to a tenth of a degree, is the one number kept.
    expect((await getSettings()).location.area).toMatchObject({ lat: 51.5, lon: -0.1 })
  })

  it('sends nothing of where you are to your database but the kinds of place', async () => {
    await sense(HOME, at(20, 9))
    const queued = (await db.outbox.toArray()).map((r) => r.body ?? '').join('\n')
    expect(queued).toContain('"where":{"morning":["out"]}')
    expect(queued).not.toMatch(/"area"|"location"|"cells"|"secret"/)
    for (const t of tracesOf(HOME)) expect(queued).not.toContain(t)
    expect(bodyForCloud('settings', { id: 1, location: { on: true, area: { lat: 51.5, lon: -0.1, at: '' } } })).toEqual({ id: 1 })
    // The tables that recognise a place are this phone's alone.
    expect((await db.outbox.toArray()).some((r) => ['places', 'placeCandidates', 'placeMeta'].includes(r.store))).toBe(false)
  })

  it('learns a place seen on three different days and asks about it once, with what it looks like first', async () => {
    // A weekday office place, afternoons: Tuesday to Thursday.
    for (const d of [20, 21, 22]) await sense(CAFE, at(d, 14))
    const q = await pendingQuestion('2026-10-23')
    expect(q?.candidate.days).toBe(3)
    expect(q?.guess).toBe('work')
    await answerQuestion(q?.candidate.id as number, 'work', at(23, 9))
    expect(await pendingQuestion('2026-10-23')).toBeNull()
    expect((await db.places.toArray()).map((p) => p.kind)).toEqual(['work'])
    // From then on it is known, and nothing is asked about it again.
    expect(await sense(CAFE, at(24, 14))).toBe('work')
    expect(await db.placeCandidates.count()).toBe(0)
  })

  it('asks nothing after one or two days, however often it was seen: three different days, no fewer', async () => {
    for (const h of [9, 12, 14, 16, 20]) await sense(CAFE, at(20, h))
    expect(await pendingQuestion('2026-10-21')).toBeNull()
    await sense(CAFE, at(21, 14))
    expect(await pendingQuestion('2026-10-22')).toBeNull()
    await sense(CAFE, at(22, 14))
    expect((await pendingQuestion('2026-10-22'))?.candidate.days).toBe(3)
  })

  it('asks at most once a day, waits a week after "not now", and never again after "not one to note"', async () => {
    for (const d of [20, 21, 22]) await sense(CAFE, at(d, 14))
    const q = await pendingQuestion('2026-10-23')
    await answerQuestion(q?.candidate.id as number, 'later', at(23, 9))
    expect(await pendingQuestion('2026-10-23')).toBeNull()
    expect(await pendingQuestion('2026-10-29')).toBeNull()
    expect((await pendingQuestion('2026-10-30'))?.candidate.id).toBe(q?.candidate.id)
    await answerQuestion(q?.candidate.id as number, 'none', at(30, 9))
    for (const d of [31]) await sense(CAFE, at(d, 14))
    expect(await pendingQuestion('2026-11-02')).toBeNull()
    expect(await sense(CAFE, at(31, 15))).toBe('out')
  })

  it('names where you are at once, from the one-time setup, and knows it again nearby', async () => {
    stubLocation(HOME)
    expect(await nameHere('home', null, at(20, 20))).toBe('named')
    expect(await sense({ ...HOME, lat: HOME.lat + 0.0008 }, at(21, 7))).toBe('home')
    expect((await db.days.get('2026-10-20'))?.where?.evening).toEqual(['home'])
  })

  it('corrects the part of the day when you name the spot you are at: the out the last reading added there becomes its kind', async () => {
    stubLocation(HOME)
    await sense(HOME, at(20, 20))
    expect((await db.days.get('2026-10-20'))?.where?.evening).toEqual(['out'])
    await nameHere('home', null, at(20, 20))
    expect((await db.days.get('2026-10-20'))?.where?.evening).toEqual(['home'])
  })

  it('still corrects it after a second reading at the same spot, as when turning it on starts the watch', async () => {
    stubLocation(HOME)
    await sense(HOME, at(20, 20))
    await sense(HOME, new Date(2026, 9, 20, 20, 1))
    await nameHere('home', null, new Date(2026, 9, 20, 20, 2))
    expect((await db.days.get('2026-10-20'))?.where?.evening).toEqual(['home'])
  })

  it('keeps an out from somewhere else in the same part of the day: that visit was real', async () => {
    stubLocation(HOME)
    await sense(CAFE, at(20, 19))
    await sense(HOME, at(20, 20))
    await nameHere('home', null, at(20, 20))
    expect((await db.days.get('2026-10-20'))?.where?.evening).toEqual(['out', 'home'])
  })

  it('corrects it too when the question is answered where the place is', async () => {
    for (const d of [20, 21, 22]) await sense(CAFE, at(d, 14))
    const q = await pendingQuestion('2026-10-22')
    await answerQuestion(q?.candidate.id as number, 'work', at(22, 14))
    expect((await db.days.get('2026-10-22'))?.where?.afternoon).toEqual(['work'])
    expect((await db.days.get('2026-10-21'))?.where?.afternoon).toEqual(['out'])
  })

  it('says away in a different area, and out when nearby at no place you named', async () => {
    stubLocation(HOME)
    await nameHere('home', null, at(20, 20))
    expect(await sense(CAFE, at(21, 10))).toBe('out')
    expect(await sense(FAR, at(21, 15))).toBe('away')
  })

  it('tries once more, precisely, when the quick reading is too rough to know a place by; never twice for a good one', async () => {
    const asked: boolean[] = []
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition: (ok: (p: unknown) => void, _fail: unknown, o: { enableHighAccuracy?: boolean }) => {
            asked.push(o.enableHighAccuracy === true)
            ok({ coords: { latitude: HOME.lat, longitude: HOME.lon, accuracy: o.enableHighAccuracy ? 30 : 1_800 } })
          },
        },
        permissions: { query: async () => ({ state: 'granted' }) },
      },
    })
    expect(await bestFix()).toMatchObject({ accuracy: 30 })
    expect(asked).toEqual([false, true])
    stubLocation(HOME)
    expect(await bestFix()).toMatchObject({ accuracy: 25 })
  })

  it('recognises no place from a rough reading, while its area still sets the sun', async () => {
    expect(await sense({ ...HOME, accuracy: 2_000 }, at(20, 9))).toBeNull()
    expect(await db.placeCandidates.count()).toBe(0)
    expect((await getSettings()).location.area).toMatchObject({ lat: 51.5, lon: -0.1 })
  })

  it('moves the day’s sun with the area, ahead of the place you typed, and back to it when off', async () => {
    await updateSettings((s) => ({ ...s, place: { lat: 40.7, lon: -74 } }))
    await sense(FAR, at(20, 9))
    const s = await getSettings()
    const far = sunLocal('2026-10-20', { lat: 52.2, lon: 0.1 })
    expect(daylightFor(s, '2026-10-20')).toEqual({ from: far?.rise, to: far?.set })
    expect((await db.days.get('2026-10-20'))?.light).toEqual(far)
    await turnOff()
    const typed = sunLocal('2026-10-20', { lat: 40.7, lon: -74 })
    expect(daylightFor(await getSettings(), '2026-10-20')).toEqual({ from: typed?.rise, to: typed?.set })
  })

  it('reads nothing while off, and forgets everything it learned on your word', async () => {
    await turnOff()
    expect(await sense(HOME, at(20, 9))).toBeNull()
    expect(await db.days.count()).toBe(0)
    await updateSettings((s) => ({ ...s, location: { on: true, area: null } }))
    stubLocation(HOME)
    await nameHere('home', null, at(20, 20))
    await sense(CAFE, at(20, 21))
    await forgetAll()
    expect(await db.places.count()).toBe(0)
    expect(await db.placeCandidates.count()).toBe(0)
    expect(await db.placeMeta.count()).toBe(0)
    expect((await getSettings()).location.area).toBeNull()
  })

  it('when the phone refuses: says so, reads nothing, and the sun keeps to the place you typed or the hours you set', async () => {
    await updateSettings((s) => ({ ...s, location: { on: false, area: null } }))
    stubLocation('denied')
    expect(await turnOn(at(20, 9))).toBe('denied')
    expect(await nameHere('home', null, at(20, 9))).toBe('denied')
    expect(await db.days.count()).toBe(0)
    expect(daylightFor(await getSettings(), '2026-10-20')).toEqual({ from: '07:00', to: '19:00' })
  })

  it('keeps geohash cells out of the record even at a cell’s edge', async () => {
    const edge = { lat: 51.50742, lon: -0.12772, accuracy: 30 }
    await sense(edge, at(20, 9))
    const all = await everything()
    expect(all).not.toContain(geohash(edge.lat, edge.lon, 6))
  })
})

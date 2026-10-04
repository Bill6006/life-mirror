import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import { awayDays, awayStatus, endAway, homeDaysOnly, setAway } from './awayFlow'
import { factSheet } from './brainFlow'
import { dayGuard, HOME_WORDS, shapeFor } from './brainShared'
import { liveMoves, moveById } from './catalogue'
import { awayShaped, awayUnshaped, contextFromWeek, db, ensureDayContext, getSettings, updateSettings, type CheckIn, type DayContext, type Offer } from './db'
import { factById, tripFact } from './facts'
import { chooseModel, forecastsDue, type Chosen } from './forecast'
import { HOME_ONLY_MOVES, needsHome } from './homeOnly'
import { candidatesFor, everySituation, screen, situationOf, type TodayState } from './offers'
import { ensureOffer, replacementsFor, skipOffer, todayState } from './offerFlow'
import { AWAY_FROM_HOME, AWAY_MAX_DAYS, awayProblem, daysFrom, HOME_ONLY, onTrip } from './postWindow'
import { awayMode, awayOn, homeOnlyMode, homeOnlyOn } from './postWindowFlow'
import { blockReadings, type Answers, type Position } from './readings'
import { dueOf, quiet } from './rhythm'
import { SITUATION_SHEETS } from './situationFixtures'
import { phoneReview, SITUATIONS } from './situations'

// The two features agreed for after the clean window, built behind closed gates (the owner's word,
// 2026-10-04): what each does once open, read here through the preview an automated browser alone
// may have, and that both ship closed. That closed they change nothing at all is held by
// postWindowGated.test.ts, recorded before either was built.

const HOME_KEY = 'life-mirror.preview.homeOnly'
const AWAY_KEY = 'life-mirror.preview.away'

/** An automated browser with the previews on: the way a test opens a gate that ships closed. */
function preview(keys: readonly string[] = [HOME_KEY, AWAY_KEY]): Map<string, string> {
  const store = new Map<string, string>([['lm.inStep', '1'], ...keys.map((k) => [k, '1'] as [string, string])])
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  })
  vi.stubGlobal('navigator', { webdriver: true })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the gates', () => {
  it('ship closed, the Worker and the phone reading the same two values', () => {
    expect(HOME_ONLY).toBe('gated')
    expect(AWAY_FROM_HOME).toBe('gated')
    expect(homeOnlyMode()).toBe('gated')
    expect(awayMode()).toBe('gated')
    expect(homeOnlyOn()).toBe(false)
    expect(awayOn()).toBe(false)
  })

  it('open to a preview only in an automated browser with the flag set, and each to its own flag', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    vi.stubGlobal('localStorage', { getItem: () => '1' })
    expect(awayMode()).toBe('gated')
    preview([AWAY_KEY])
    expect(awayMode()).toBe('preview')
    expect(homeOnlyMode()).toBe('gated')
    expect(awayMode('open')).toBe('open')
    expect(homeOnlyMode('open')).toBe('open')
  })

  it('stay closed where there is no browser at all, as in the service worker', () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('localStorage', undefined)
    expect(awayMode()).toBe('gated')
    expect(homeOnlyMode()).toBe('gated')
  })
})

describe('a trip’s dates', () => {
  it('holds its first and last day, both included', () => {
    const r = { from: '2026-10-15', to: '2026-10-21' }
    expect(onTrip(r, '2026-10-14')).toBe(false)
    expect(onTrip(r, '2026-10-15')).toBe(true)
    expect(onTrip(r, '2026-10-21')).toBe(true)
    expect(onTrip(r, '2026-10-22')).toBe(false)
    expect(onTrip(null, '2026-10-15')).toBe(false)
    expect(daysFrom('2026-10-15', '2026-11-04')).toBe(20)
  })

  it('needs both days, starts today or later, ends on or after its start, and lasts three weeks at most', () => {
    const today = '2026-10-15'
    expect(awayProblem('', '2026-10-20', today)).toBe('noStart')
    expect(awayProblem('2026-10-16', '', today)).toBe('noEnd')
    expect(awayProblem('2026-10-14', '2026-10-20', today)).toBe('startPast')
    expect(awayProblem('2026-10-14', '2026-10-20', today, true)).toBeNull()
    expect(awayProblem('2026-10-18', '2026-10-17', today)).toBe('endBeforeStart')
    expect(awayProblem(today, addDays(today, AWAY_MAX_DAYS - 1), today)).toBeNull()
    expect(awayProblem(today, addDays(today, AWAY_MAX_DAYS), today)).toBe('tooLong')
    expect(awayProblem(today, today, today)).toBeNull()
  })
})

describe('the moves that need the house', () => {
  it('are live catalogue moves, the windows among them, and none that a trip can also hold', () => {
    const live = new Set(liveMoves.map((m) => m.id))
    for (const id of HOME_ONLY_MOVES) {
      expect(live.has(id), id).toBe(true)
      expect(needsHome(id)).toBe(true)
    }
    expect(needsHome('open-windows')).toBe(true)
    for (const id of ['walk-ten', 'warm-shower-bath', 'cook-tonight', 'book-page', 'game-with-turns', 'no-such-move']) expect(needsHome(id)).toBe(false)
  })

  it('wait in every situation once a day or a block is away from home, and nothing else moves', () => {
    const base: TodayState = { doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs: new Map(), studyNight: true, withHer: true, churchDay: true, noTimeCeiling: null }
    let seen = 0
    for (const s of everySituation()) {
      for (const m of liveMoves) {
        const home = screen(m, s, base)
        const away = screen(m, s, { ...base, homeOut: true })
        if (needsHome(m.id)) {
          // Waiting for the house comes with the needs, before the band and today: a move already out for an earlier reason keeps it.
          if (home === null) seen++
          expect(away === 'home' || away === home, `${m.id} ${s.key}`).toBe(true)
          if (home === null) expect(away).toBe('home')
        } else expect(away).toBe(home)
      }
      // Every other candidate stays a candidate, with the same weight.
      const at = candidatesFor(s, base).candidates.filter((c) => !needsHome(c.id))
      expect(candidatesFor(s, { ...base, homeOut: true }).candidates).toEqual(at)
    }
    expect(seen).toBeGreaterThan(0)
  })
})

describe('a trip’s day, shaped', () => {
  const W = '2026-10-13' // a Tuesday
  async function weekWithOffice() {
    return updateSettings((s) => ({ ...s, week: { ...s.week, churchDay: 0, officeDays: { ...s.week.officeDays, 2: true }, studyNights: { ...s.week.studyNights, 2: true }, pickupTime: '17:30' } }))
  }

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('gives way the office, the daycare, church and the study day, keeps them aside and gives them back', async () => {
    const s = { ...(await weekWithOffice()), away: { from: W, to: addDays(W, 3), setAt: '' } }
    const home = contextFromWeek(W, s, 'c', 'gated')
    expect(home).toMatchObject({ atOffice: true, pickupTime: '17:30', studyNight: true })
    expect(home).not.toHaveProperty('awayFromHome')
    const away = contextFromWeek(W, s, 'c', 'open')
    expect(away).toMatchObject({ atOffice: false, pickupTime: null, churchDay: false, studyNight: false, withHer: home.withHer, soloUntil: home.soloUntil })
    expect(away.awayFromHome?.held).toEqual({ atOffice: true, pickupTime: '17:30', churchDay: false, studyNight: true })
    expect(awayUnshaped(away)).toEqual(home)
    expect(awayShaped(away)).toBe(away)
    expect(awayUnshaped(home)).toBe(home)
    // The day after the trip is a home day.
    expect(contextFromWeek(addDays(W, 4), s, 'c', 'open')).not.toHaveProperty('awayFromHome')
  })

  it('is set and ended only while the gate is open; ending gives today back and leaves the days lived', async () => {
    vi.useFakeTimers({ now: new Date(`${W}T09:00:00`), toFake: ['Date'] })
    const s = await weekWithOffice()
    await ensureDayContext(addDays(W, -1), s)
    await ensureDayContext(W, s)
    expect(await setAway(W, addDays(W, 2))).toBe('gated')
    expect((await getSettings()).away).toBeUndefined()

    preview()
    expect(await setAway(addDays(W, -1), addDays(W, 2))).toBe('startPast')
    expect(await setAway(W, '')).toBe('noEnd')
    expect(await setAway(W, addDays(W, AWAY_MAX_DAYS))).toBe('tooLong')
    expect(await setAway(W, addDays(W, 2))).toBeNull()
    expect((await getSettings()).away).toMatchObject({ from: W, to: addDays(W, 2) })
    expect((await db.days.get(W))?.awayFromHome).toBeDefined()
    expect((await db.days.get(W))?.atOffice).toBe(false)
    expect((await db.days.get(addDays(W, -1)))?.awayFromHome).toBeUndefined()
    expect(awayStatus((await getSettings()).away, W)).toMatchObject({ state: 'away' })

    // A trip that began today and ends now is taken away whole; today has its office back.
    await endAway()
    expect((await getSettings()).away).toBeUndefined()
    expect(await db.days.get(W)).toMatchObject({ atOffice: true, pickupTime: '17:30', studyNight: true })
    expect((await db.days.get(W))?.awayFromHome).toBeUndefined()
  })

  it('keeps a trip’s lived days when it ends partway, ending it the day before', async () => {
    preview()
    vi.useFakeTimers({ now: new Date(`${W}T09:00:00`), toFake: ['Date'] })
    await weekWithOffice()
    expect(await setAway(W, addDays(W, 5))).toBeNull()
    await ensureDayContext(W, await getSettings())
    vi.setSystemTime(new Date(`${addDays(W, 2)}T09:00:00`))
    await ensureDayContext(addDays(W, 1), await getSettings())
    await ensureDayContext(addDays(W, 2), await getSettings())
    // The start of a trip under way stands; only its end may move.
    expect(await setAway(W, addDays(W, 6))).toBeNull()
    await endAway()
    expect((await getSettings()).away).toMatchObject({ from: W, to: addDays(W, 1) })
    expect((await db.days.get(W))?.awayFromHome).toBeDefined()
    expect((await db.days.get(addDays(W, 1)))?.awayFromHome).toBeDefined()
    expect((await db.days.get(addDays(W, 2)))?.awayFromHome).toBeUndefined()
    expect(awayStatus((await getSettings()).away, addDays(W, 2))).toBeNull()
  })

  it('says a trip set ahead, and none once it has passed or while the gate is closed', () => {
    const r = { from: '2026-10-20', to: '2026-10-25', setAt: '' }
    expect(awayStatus(r, '2026-10-15', 'open')).toEqual({ state: 'ahead', range: r })
    expect(awayStatus(r, '2026-10-26', 'open')).toBeNull()
    expect(awayStatus(r, '2026-10-21', 'gated')).toBeNull()
  })
})

const allAt = (block: CheckIn['block'], p: Position): Answers => Object.fromEntries(blockReadings(block).map((id) => [id, p])) as Answers
function checkin(day: string, block: CheckIn['block'], p: Position = 3): CheckIn {
  const at = new Date(`${day}T${block === 'morning' ? '07' : block === 'afternoon' ? '13' : '19'}:30:00`).toISOString()
  return { day, block, asked: [...blockReadings(block)], answers: allAt(block, p), startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000 }
}

describe('the draw away from home', () => {
  const D = '2026-10-14'
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('keeps the moves that need the house out of a trip’s day, and only while the gate is open', async () => {
    const s = { ...(await getSettings()), away: { from: D, to: addDays(D, 2), setAt: '' } }
    await updateSettings(() => s)
    const now = new Date(`${D}T10:00:00`)
    await db.days.put(contextFromWeek(D, s, 'c', 'open'))
    expect((await todayState(D, await getSettings(), now)).homeOut).toBeUndefined()
    preview()
    const t = await todayState(D, await getSettings(), now)
    expect(t.homeOut).toBe(true)
    for (const sit of everySituation()) for (const c of candidatesFor(sit, t).candidates) expect(needsHome(c.id), `${c.id} in ${sit.key}`).toBe(false)
  })

  it('takes "Not home" with a skip only while its gate is open, and keeps the house’s moves out of the rest of that block', async () => {
    const rng = (() => {
      let x = 7
      return () => ((x = (x * 9301 + 49297) % 233280) / 233280)
    })()
    vi.useFakeTimers({ now: new Date(`${D}T09:00:00`), toFake: ['Date'] })
    await db.checkins.add(checkin(D, 'morning', 2))
    const first = (await ensureOffer(D, 'morning', rng)) as Offer
    // Closed: the reason is never kept.
    await skipOffer(first, 'notHome')
    expect((await db.offers.get(first.id as number))?.skipReason).toBeUndefined()

    preview()
    const live = (await db.offers.where('day').equals(D).filter((o) => o.skippedAt === null).first()) as Offer
    // Asked before the skip: what "Not home" could show is what fits without the house.
    const all = await replacementsFor(live, new Date(`${D}T09:00:00`))
    const away = await replacementsFor(live, new Date(`${D}T09:00:00`), true)
    expect(away).toBeLessThanOrEqual(all)
    await skipOffer(live, 'notHome')
    expect((await db.offers.get(live.id as number))?.skipReason).toBe('notHome')
    const after = (await db.offers.where('day').equals(D).filter((o) => o.skippedAt === null).first()) as Offer
    expect(after).toBeDefined()
    expect(needsHome(after.moveId)).toBe(false)
    for (const id of after.candidates) expect(needsHome(id), id).toBe(false)
  })
})

describe('a commitment on a trip’s day', () => {
  it('is never due, and Start stays a quiet tap', () => {
    const due = dueOf({ rhythm: { perWeek: 3, restDays: 0 }, schedule: [], paused: false, started: false, doneToday: false, partlyToday: false, planned: false, faith: false, practiceDays: [], today: '2026-10-14', away: true })
    expect(due).toEqual({ state: 'away', by: null })
    expect(quiet(due)).toBe(true)
    // A plan you made for the day, and a session under way, still say so.
    expect(dueOf({ rhythm: null, schedule: [3], paused: false, started: false, doneToday: false, partlyToday: false, planned: true, faith: false, practiceDays: [], today: '2026-10-14', away: true }).state).toBe('planned')
    expect(dueOf({ rhythm: null, schedule: [3], paused: false, started: true, doneToday: false, partlyToday: false, planned: false, faith: false, practiceDays: [], today: '2026-10-14', away: true }).state).toBe('started')
  })
})

describe('the sheet on a trip', () => {
  const D = '2026-10-14'
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('says the day is away from home, today and tomorrow, and the trip, once the gate is open', async () => {
    preview()
    const s = await updateSettings((x) => ({ ...x, week: { ...x.week, officeDays: { ...x.week.officeDays, 3: true } }, away: { from: D, to: addDays(D, 4), setAt: '' } }))
    await db.days.put(contextFromWeek(D, s))
    await db.checkins.bulkAdd(BLOCKS.map((b) => checkin(addDays(D, -1), b)))
    const sheet = await factSheet(D, new Date(`${D}T08:00:00`))
    const today = factById(sheet, 'week.today')
    expect(today?.text).toContain('away from home on a trip')
    expect(today?.text).not.toContain('at the office')
    expect(today?.values).toMatchObject({ trip: 1, office: 0, daycare: 0 })
    expect(factById(sheet, 'week.tomorrow')?.values).toMatchObject({ trip: 1 })
    const trip = factById(sheet, 'trip')
    expect(trip?.values).toMatchObject({ state: 'away', from: D, to: addDays(D, 4), a0: 1 })
    expect(trip?.text).toContain('You are away from home on a trip')
    // The day guard holds a line to it.
    expect(dayGuard('Open the windows at home for ten minutes.', sheet, D)).toMatch(/away from home/)
    expect(dayGuard('A walk on the beach before lunch.', sheet, D)).toBeNull()
    expect(shapeFor(sheet, D)?.trip).toBe(true)
  })

  it('says a trip set for the week ahead, one just ended, and days away within four weeks, and nothing otherwise', () => {
    const D2 = '2026-10-20'
    const r = { from: '2026-10-24', to: '2026-10-27', setAt: '' }
    expect(tripFact(r, [], D2)?.values).toMatchObject({ state: 'ahead', a0: 0 })
    expect(tripFact({ ...r, from: '2026-10-28', to: '2026-10-30' }, [], D2)).toBeNull()
    const lived = ['2026-10-12', '2026-10-13', '2026-10-14'].map((day) => ({ day, awayFromHome: { held: { atOffice: false, pickupTime: null, churchDay: false, studyNight: false } } }) as unknown as DayContext)
    expect(tripFact({ from: '2026-10-12', to: '2026-10-14', setAt: '' }, lived, D2)?.values).toMatchObject({ state: 'back', a0: 1, a1: 2 })
    expect(tripFact(null, lived, D2)?.values).toMatchObject({ state: 'past', from: null, to: null })
    expect(tripFact(null, lived, '2026-11-30')).toBeNull()
  })
})

describe('the weekly readings, with a trip on the sheet', () => {
  const trip = (a: [number, number, number, number]) => ({ id: 'trip', tags: [], text: '', values: { state: 'back', from: null, to: null, a3: a[0], a2: a[1], a3x: 0, a1: a[2], a0: a[3] } })

  for (const id of ['cadence-dropping', 'commitment-fading', 'commitment-thinning']) {
    it(`never read a trip as a drop: ${id}`, () => {
      const s = SITUATIONS.find((x) => x.id === id)!
      const sheet = SITUATION_SHEETS[id]()
      expect(s.test(sheet)).not.toBeNull()
      expect(s.test({ ...sheet, facts: [...sheet.facts, trip([0, 0, 0, 3])] })).toBeNull()
      // A trip only in the oldest week leaves the reading as it was.
      expect(s.test({ ...sheet, facts: [...sheet.facts, trip([3, 0, 0, 0])] })).not.toBeNull()
    })
  }

  it('says the trip once in the phone’s week review, instead of what the week could not hold', () => {
    const sheet = SITUATION_SHEETS['commitment-thinning']()
    const before = phoneReview(sheet, [])
    const after = phoneReview({ ...sheet, facts: [...sheet.facts, trip([0, 0, 0, 4])] }, [])
    expect(after.didNot).toContain('A trip away from home held 4 of these seven days')
    expect(after.didNot).not.toBe(before.didNot)
  })
})

describe('what the app learns and what is usual, around a trip', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('leaves out a trip’s days only while the gate is open, and with none leaves the very same rows', async () => {
    await db.days.put({ ...contextFromWeek('2026-10-14', await getSettings(), 'c', 'gated'), awayFromHome: { held: { atOffice: false, pickupTime: null, churchDay: false, studyNight: false } } })
    await db.days.put(contextFromWeek('2026-10-15', await getSettings(), 'c', 'gated'))
    expect((await awayDays()).size).toBe(0)
    expect([...(await awayDays('open'))]).toEqual(['2026-10-14'])
    const rows = [{ day: '2026-10-14' }, { day: '2026-10-15' }]
    expect(homeDaysOnly(rows, await awayDays())).toBe(rows)
    expect(homeDaysOnly(rows, await awayDays('open'))).toEqual([{ day: '2026-10-15' }])
  })

  it('never forecasts a slot already logged, whatever the model was fitted on', () => {
    const fitted = new Map<string, number>()
    for (let k = 30; k >= 2; k--) for (const b of BLOCKS) fitted.set(`${addDays('2026-10-14', -k)}|${b}`, 40 + ((k * 7) % 21))
    const chosen = chooseModel(fitted, '2026-10-14') as Chosen
    expect(chosen).toBeTruthy()
    const logged = new Map(fitted)
    logged.set('2026-10-14|morning', 70)
    const due = forecastsDue(chosen, fitted, [], '2026-10-14', new Set(), logged)
    expect(due.some((f) => f.day === '2026-10-14' && f.block === 'afternoon')).toBe(true)
    expect(due.some((f) => f.day === '2026-10-14' && f.block === 'morning')).toBe(false)
    // Without the logged map, the fitted values alone would have forecast it: the guard is what keeps it out.
    expect(forecastsDue(chosen, fitted, [], '2026-10-14', new Set()).some((f) => f.day === '2026-10-14' && f.block === 'morning')).toBe(true)
  })
})

describe('the day guard, once a sheet says the day is a trip’s', () => {
  it('bars the house’s own places, and nothing on any other sheet', () => {
    const sheet = (trip: boolean) => ({ version: 1, day: '2026-10-14', builtAt: '', hour: 8, weeks: 4, days: 30, direction: null, said: [], shortlist: [], facts: [{ id: 'week.today', tags: [], text: '', values: { weekday: 'Wednesday', daycare: 0, office: 0, church: 0, studyNight: 0, ...(trip ? { trip: 1 } : {}) } }] }) as never
    for (const l of ['Open the windows at home.', 'Clear the kitchen counter in your kitchen.', 'Tidy one surface around the house.']) {
      expect(HOME_WORDS.test(l), l).toBe(true)
      expect(dayGuard(l, sheet(true), '2026-10-14')).toMatch(/away from home on a trip/)
      expect(dayGuard(l, sheet(false), '2026-10-14')).toBeNull()
    }
    expect(dayGuard('A walk by the water before lunch.', sheet(true), '2026-10-14')).toBeNull()
    // A day the sheet does not know is not barred for home words: only a trip's day is.
    expect(dayGuard('Open the windows at home.', sheet(true), '2026-10-30')).toBeNull()
  })
})

it('names each move that needs the house by its catalogue name', () => {
  expect([...HOME_ONLY_MOVES].map((id) => moveById(id).name)).toMatchInlineSnapshot(`
    [
      "Open the windows for ten minutes",
      "Clear one surface completely",
      "One load of washing, start to finish",
      "A speaker in the bathroom, set up once",
      "A toothbrush where you actually are at night",
      "Running shoes by the door, always",
      "Five no-cook dinners in the cupboard",
    ]
  `)
})

describe('a "Not home" skip and the record around a trip, held to their gates', () => {
  const D = '2026-10-14'
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('reads a stored "Not home" only while its gate is open: closed, Skip could show what it always could', async () => {
    vi.useFakeTimers({ now: new Date(`${D}T09:00:00`), toFake: ['Date'] })
    const settings = await getSettings()
    await ensureDayContext(D, settings)
    // A morning whose situation admits a move that needs the house, found rather than assumed.
    const t = await todayState(D, settings, new Date(`${D}T09:00:00`))
    const p = ([1, 2, 3, 4, 5] as Position[]).find((x) => {
      const s = situationOf(checkin(D, 'morning', x))
      return s !== null && candidatesFor(s, t).candidates.filter((c) => needsHome(c.id)).length > 0
    })
    expect(p).toBeDefined()
    await db.checkins.add(checkin(D, 'morning', p as Position))
    const live = (await ensureOffer(D, 'morning', () => 0.5)) as Offer
    const before = await replacementsFor(live, new Date(`${D}T09:00:00`))
    // A skip given "Not home" earlier in the block, stored as an open gate would store it.
    await db.offers.add({ ...live, id: undefined, moveId: 'nothing', skippedAt: new Date(`${D}T08:30:00`).toISOString(), skipReason: 'notHome' } as Offer)
    expect(await replacementsFor(live, new Date(`${D}T09:00:00`))).toBe(before)
    preview([HOME_KEY])
    expect(await replacementsFor(live, new Date(`${D}T09:00:00`))).toBeLessThan(before)
  })

  it('leaves a trip’s days out of what the app learns only once open', async () => {
    const away = { ...contextFromWeek(D, await getSettings(), 'c', 'gated'), awayFromHome: { held: { atOffice: false, pickupTime: null, churchDay: false, studyNight: false } } }
    await db.days.put(away)
    await db.checkins.bulkAdd([checkin(D, 'morning'), checkin(addDays(D, -1), 'morning')])
    const { learningRecords } = await import('./learningFlow')
    expect((await learningRecords()).checkins.map((c) => c.day).sort()).toEqual([addDays(D, -1), D])
    preview([AWAY_KEY])
    expect((await learningRecords()).checkins.map((c) => c.day)).toEqual([addDays(D, -1)])
  })

  it('leaves a trip’s days out of what is usual only once open', async () => {
    const { runForecasting, usualFor } = await import('./forecastFlow')
    const today = '2026-10-20'
    async function seed(): Promise<void> {
      await db.delete()
      await db.open()
      const rows: CheckIn[] = []
      // The better-up readings at the position and the better-down ones mirrored, so the reading itself moves (all alike, they cancel to 50).
      const UP = new Set(['mood', 'energy', 'focus'])
      const DOWN = new Set(['stress', 'overwhelm', 'irritation'])
      const at = (day: string, b: CheckIn['block'], q: Position): CheckIn => ({ ...checkin(day, b, 3), answers: Object.fromEntries(blockReadings(b).map((id) => [id, UP.has(id) ? q : DOWN.has(id) ? 6 - q : 3])) as Answers })
      for (let back = 30; back >= 1; back--) for (const b of BLOCKS) rows.push(at(addDays(today, -back), b, back <= 4 ? 5 : 2))
      await db.checkins.bulkAdd(rows)
      for (let back = 4; back >= 1; back--) await db.days.put({ ...contextFromWeek(addDays(today, -back), await getSettings(), 'c', 'gated'), awayFromHome: { held: { atOffice: false, pickupTime: null, churchDay: false, studyNight: false } } })
    }
    await seed()
    await runForecasting(today)
    const closed = await usualFor(today, 'morning')
    await seed()
    preview([AWAY_KEY])
    await runForecasting(today)
    const open = await usualFor(today, 'morning')
    expect(closed).not.toBeNull()
    expect(open).not.toBeNull()
    // The trip's four days read high; once left out, what is usual is the home days' alone.
    expect((open as { point: number }).point).toBeLessThan((closed as { point: number }).point)
  })
})

describe('the export', () => {
  const offer = { id: 1, kind: 'block', day: '2026-10-14', block: 'morning', at: '2026-10-14T13:00:00.000Z', situationKey: 'morning:energy', target: 'energy', stance: '', band: '', reading: 50, moveId: 'open-windows', cardId: null, candidates: ['open-windows'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: '2026-10-14T13:10:00.000Z', skipReason: 'notHome', closedAt: null } as unknown as Offer
  const held = { atOffice: true, pickupTime: '17:30', churchDay: false, studyNight: false }
  const day = { day: '2026-10-14', weekday: 3, withHer: true, studyNight: false, churchDay: false, atOffice: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '', awayFromHome: { held } } as DayContext

  it('carries a trip, its days and "Not home" only once the gates are open; closed, not a byte changes', async () => {
    const { buildExport } = await import('./export')
    vi.useFakeTimers({ now: new Date('2026-10-14T15:00:00.000Z'), toFake: ['Date'] })
    const settings = { ...(await getSettings()), away: { from: '2026-10-14', to: '2026-10-16', setAt: '' } }
    const records = { offers: [offer], outcomes: [], cards: [], declarations: [], days: [day] }
    const plain = { ...records, offers: [{ ...offer, skipReason: undefined }], days: [{ ...day, awayFromHome: undefined }] }
    const closed = buildExport([], [], [], settings, { includePrivate: false }, undefined, records)
    const without = buildExport([], [], [], { ...settings, away: undefined }, { includePrivate: false }, undefined, plain)
    // Closed: the export, its CSVs included, is what it would be with none of either stored.
    expect(closed.json).toBe(without.json)
    expect(closed.csv).toBe(without.csv)
    expect(closed.offersCsv).toBe(without.offersCsv)
    expect(closed.json).not.toContain('notHome')
    expect(closed.json).not.toContain('awayFromHome')

    preview()
    const open = JSON.parse(buildExport([], [], [], settings, { includePrivate: false }, undefined, records).json) as { offers: { skipReason?: string }[]; awayFromHome: unknown[]; settings: { away?: unknown } }
    expect(open.offers[0].skipReason).toBe('notHome')
    expect(open.awayFromHome).toEqual([{ day: '2026-10-14', held }])
    expect(open.settings.away).toEqual({ from: '2026-10-14', to: '2026-10-16' })
  })
})

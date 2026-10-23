import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from './blocks'
import { validateAsk, validateOutput } from './brainShared'
import { factSheet } from './brainFlow'
import { moveById } from './catalogue'
import { churchBlocks, churchOf, churchSchedule, churchWords, sabbathOf } from './church'
import { memoryStore } from './cloudStore'
import { resetCloudForTests, setStoreFactory, syncNow } from './cloudSync'
import { contextFromWeek, dayByHand, db, ensureDayContext, getSettings, refreshChurchToday, setDayContext, updateSettings, type CheckIn, type DayContext } from './db'
import { bigSocialToday } from './evidenceFlow'
import { factById } from './facts'
import { screen, type Situation } from './offers'
import { shapeWords } from './pathStage'
import { todayState } from './offerFlow'
import { outAmongPeople, peopleAround, peopleAroundByBlock } from './people'
import { blockReadings, type Answers, type Position } from './readings'
import { DEFAULT_SETTINGS, DEFAULT_WEEK, type Settings, type Weekday } from './settings'

// Sabbath Day and Third Day (Item 3, 2026-10-23): the Sabbath the whole of its day, the Third Day its services' blocks; a
// schedule is context, never attendance, and touches nothing of home or office; a day keeps the schedule it was made under.

const SAT = '2026-10-24'
const TUE = '2026-10-27'
const WED = '2026-10-28'
const week = (w: Partial<Settings['week']> = {}): Settings => ({ ...DEFAULT_SETTINGS, week: { ...DEFAULT_WEEK, ...w } })
const officeTuesday = week({ officeDays: { ...DEFAULT_WEEK.officeDays, 2: true } })
const situation = (block: Situation['block']): Situation => ({ block, target: 'mood', band: 'gettingBy', key: `${block}:mood`, reading: 50, targetPosition: 3 })
const ci = (day: string, block: CheckIn['block'], p: Position): CheckIn => ({ day, block, answers: Object.fromEntries(blockReadings(block).map((id) => [id, p])) as Answers, startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000 })

describe('the two schedules', () => {
  it('default to the Sabbath on Saturday, the whole day, at 07:30, 14:30 and 19:30, and the Third Day on Tuesday at 19:30', () => {
    expect(churchSchedule(DEFAULT_WEEK)).toEqual({ sabbath: { day: 6, services: ['07:30', '14:30', '19:30'] }, third: { day: 2, services: ['19:30'] } })
    // A week from before Item 3 reads the same, its Sabbath its old church day.
    const { thirdDay: _t, sabbathServices: _s, thirdDayServices: _d, ...before } = DEFAULT_WEEK
    expect(churchSchedule(before)).toEqual(churchSchedule(DEFAULT_WEEK))
    const sat = contextFromWeek(SAT, week())
    expect(sat).toMatchObject({ churchDay: true, church: 'sabbath', services: ['07:30', '14:30', '19:30'], schedule: 1 })
    expect(churchBlocks(sat)).toEqual({ morning: true, afternoon: true, evening: true })
    const tue = contextFromWeek(TUE, week())
    expect(tue).toMatchObject({ churchDay: false, church: 'third', services: ['19:30'] })
    expect(churchBlocks(tue)).toEqual({ morning: false, afternoon: false, evening: true })
    expect(churchBlocks(contextFromWeek(WED, week()))).toEqual({ morning: false, afternoon: false, evening: false })
    expect([sabbathOf(sat), sabbathOf(tue)]).toEqual([true, false])
    // A day made before Item 3 kept only "a church day": its Sabbath still.
    expect([sabbathOf({ churchDay: true }), sabbathOf({ churchDay: false })]).toEqual([true, false])
  })

  it('follows a changed weekday and changed times, several a day, for the days made after', () => {
    const w = week({ churchDay: 0, thirdDay: 4, sabbathServices: ['14:30', '09:00', '09:00'], thirdDayServices: ['10:00', '18:45'] })
    expect(churchOf(w.week, 0)).toEqual({ church: 'sabbath', services: ['09:00', '14:30'] })
    expect(churchOf(w.week, 6)).toEqual({})
    const thu = contextFromWeek('2026-10-29', w)
    expect(churchBlocks(thu)).toEqual({ morning: true, afternoon: false, evening: true })
    expect(churchBlocks(contextFromWeek(TUE, w))).toEqual({ morning: false, afternoon: false, evening: false })
    expect(churchBlocks(contextFromWeek(TUE, week({ thirdDay: null })))).toEqual({ morning: false, afternoon: false, evening: false })
    // An afternoon service is the afternoon's; both schedules on one weekday make it the Sabbath.
    expect(churchBlocks(contextFromWeek(TUE, week({ thirdDayServices: ['15:00'] })))).toEqual({ morning: false, afternoon: true, evening: false })
    expect(churchOf(week({ thirdDay: 6 }).week, 6)).toEqual({ church: 'sabbath', services: ['07:30', '14:30', '19:30'] })
  })
})

describe('home, office and church, three things apart', () => {
  it('leaves an office Tuesday at the office until the evening, and puts church on its evening alone', () => {
    const ctx = contextFromWeek(TUE, officeTuesday)
    expect(ctx).toMatchObject({ atOffice: true, officeDay: true, church: 'third' })
    expect(peopleAroundByBlock(ctx)).toEqual({ morning: true, afternoon: true, evening: true })
    // The office is why the day has people; church only the evening.
    expect(churchBlocks(ctx)).toEqual({ morning: false, afternoon: false, evening: true })
  })

  it('leaves a Tuesday worked from home at home until the evening, and church its evening alone', () => {
    const ctx: DayContext = { ...contextFromWeek(TUE, officeTuesday), atOffice: false }
    expect(peopleAroundByBlock(ctx)).toEqual({ morning: false, afternoon: false, evening: true })
  })

  it('invents no home or office for a Tuesday that is neither: church is the evening, and nothing else changes', () => {
    const plain = contextFromWeek(TUE, week({ thirdDay: null }))
    const third = contextFromWeek(TUE, week())
    const { church: _c, services: _s, ...rest } = third
    expect(rest).toEqual(plain)
    expect(peopleAround(third, 'morning')).toBe(peopleAround(plain, 'morning'))
    expect(peopleAround(third, 'afternoon')).toBe(peopleAround(plain, 'afternoon'))
  })

  it('says church in the shape words in its blocks alone, and the office while at it', () => {
    const office = contextFromWeek(TUE, officeTuesday)
    const wfh: DayContext = { ...office, atOffice: false }
    expect(shapeWords(office, 'morning')).toBe('People around by today’s shape: the office')
    expect(shapeWords(office, 'evening')).toBe('People around by today’s shape: church')
    expect(shapeWords(wfh, 'afternoon')).toBe('Nobody around by today’s shape')
    expect(shapeWords(wfh, 'evening')).toBe('People around by today’s shape: church')
    expect(shapeWords(contextFromWeek(SAT, week()), 'afternoon')).toBe('People around by today’s shape: church')
  })
})

describe('a schedule, never attendance', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('writes no check-in, no Out among people, no big social day and no recovery gap, the Sabbath included', async () => {
    const settings = await getSettings()
    const sat = await ensureDayContext(SAT, settings)
    await ensureDayContext(TUE, settings)
    expect(await db.checkins.count()).toBe(0)
    expect(sat.amongPeople).toBeUndefined()
    // Church puts people around for what fits, while the person's own answer stays unanswered.
    expect(peopleAroundByBlock(sat)).toEqual({ morning: true, afternoon: true, evening: true })
    expect(outAmongPeople(sat)).toBe(false)
    expect(await bigSocialToday(SAT)).toBe(false)
    expect(await bigSocialToday(TUE)).toBe(false)
    expect((await db.offers.toArray()).some((o) => o.passiveId === 'recovery-gap')).toBe(false)
  })

  it('keeps every earlier day as it was recorded, and re-shapes today alone on an edit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 9, 0))
    try {
      // Saturday made before Item 3: a church day, read then as its morning; and a Tuesday made before, with no church.
      const oldSat: DayContext = { day: SAT, weekday: 6, withHer: true, studyNight: false, churchDay: true, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '2026-10-24T08:00:00.000Z', officeDay: false }
      const oldTue: DayContext = { ...oldSat, day: '2026-10-20', weekday: 2, churchDay: false }
      const today: DayContext = { ...oldTue, day: TUE }
      await db.days.bulkPut([oldSat, oldTue, today])
      const settings = await getSettings()
      expect(await ensureDayContext(SAT, settings)).toEqual(oldSat)
      expect(await ensureDayContext('2026-10-20', settings)).toEqual(oldTue)
      expect(churchBlocks(oldSat)).toEqual({ morning: true, afternoon: false, evening: false })
      // Today, made before the schedule, takes it once.
      expect(await ensureDayContext(TUE, settings)).toMatchObject({ church: 'third', services: ['19:30'], schedule: 1 })
      // A seasonal change: today follows it; the earlier days never do.
      await updateSettings((s) => ({ ...s, week: { ...s.week, thirdDayServices: ['19:00'] } }))
      await refreshChurchToday(new Date(2026, 9, 27, 9, 0))
      expect(await db.days.get(TUE)).toMatchObject({ church: 'third', services: ['19:00'] })
      // Still a day made from the week: the cloud copy never reads the schedule as a change by hand.
      expect(dayByHand(await db.days.get(TUE))).toBe(false)
      expect(await db.days.get(SAT)).toEqual(oldSat)
      expect(await db.days.get('2026-10-20')).toEqual(oldTue)
      // The Third Day moved off today leaves it no church; the Sabbath moved onto it makes it the Sabbath.
      await updateSettings((s) => ({ ...s, week: { ...s.week, thirdDay: 4 as Weekday } }))
      await refreshChurchToday(new Date(2026, 9, 27, 9, 0))
      const moved = await db.days.get(TUE)
      expect([moved?.churchDay, moved?.church, moved?.services]).toEqual([false, undefined, undefined])
      await updateSettings((s) => ({ ...s, week: { ...s.week, churchDay: 2 as Weekday } }))
      await refreshChurchToday(new Date(2026, 9, 27, 9, 0))
      expect(await db.days.get(TUE)).toMatchObject({ churchDay: true, church: 'sabbath', services: ['07:30', '14:30', '19:30'] })
      expect(await db.days.get(SAT)).toEqual(oldSat)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves a day away from home without church, made before Item 3 or edited after: a trip keeps giving way', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 24, 9, 0))
    try {
      // Today, a Saturday away, made before Item 3: its church day held aside for the trip's end.
      const away: DayContext = { day: SAT, weekday: 6, withHer: true, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '2026-10-24T08:00:00.000Z', officeDay: false, awayFromHome: { held: { atOffice: false, pickupTime: null, churchDay: true, studyNight: false } } }
      await db.days.put(away)
      expect(await ensureDayContext(SAT, await getSettings())).toEqual(away)
      await updateSettings((s) => ({ ...s, week: { ...s.week, sabbathServices: ['09:00'] } }))
      await refreshChurchToday(new Date(2026, 9, 24, 9, 0))
      expect(await db.days.get(SAT)).toEqual(away)
      expect(churchBlocks(away)).toEqual({ morning: false, afternoon: false, evening: false })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('what fits a block with church on the schedule', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('offers the church move in the blocks with a service, keeps the house’s moves out of them, and the Sabbath hour to the Sabbath', async () => {
    const settings = await getSettings()
    const tueEvening = await todayState(TUE, settings, new Date(2026, 9, 27, 19, 0))
    const tueMorning = await todayState(TUE, settings, new Date(2026, 9, 27, 9, 0))
    const satAfternoon = await todayState(SAT, settings, new Date(2026, 9, 24, 14, 0))
    const early = moveById('church-early')
    expect(early.name).toBe('Arrive ten minutes early to church and talk to one person')
    expect(screen(early, situation('evening'), tueEvening)).toBeNull()
    expect(screen(early, situation('morning'), tueMorning)).toBe('schedule')
    expect(screen(early, situation('afternoon'), satAfternoon)).toBeNull()
    // An in-person move fits a block with church; not Tuesday's morning at home.
    const inPerson = moveById('eye-contact-stranger')
    expect(screen(inPerson, situation('evening'), tueEvening)).toBeNull()
    expect(screen(inPerson, situation('morning'), tueMorning)).toBe('people')
    // A move that needs the house waits outside a block with a service.
    expect(screen(moveById('open-windows'), situation('evening'), tueEvening)).toBe('home')
    expect(screen(moveById('open-windows'), situation('morning'), tueMorning)).not.toBe('home')
    const hour = moveById('sabbath-hour')
    expect(hour.name).toBe('One screen-free hour on the Sabbath as rest')
    expect(screen(hour, situation('morning'), tueMorning)).toBe('schedule')
    expect(screen(hour, situation('afternoon'), satAfternoon)).toBeNull()
  })
})

describe('the Brain’s and Ask’s words: scheduled, never attended', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('names the Sabbath and the Third Day with their times only on those days, and a writer may cite them', async () => {
    const settings = await getSettings()
    for (const d of [SAT, TUE, WED]) await ensureDayContext(d, settings)
    expect(churchWords(await db.days.get(SAT))).toBe('the Sabbath, services scheduled at 07:30, 14:30 and 19:30')
    expect(churchWords(await db.days.get(TUE))).toBe('the Third Day, a service scheduled at 19:30')
    expect(churchWords(await db.days.get(WED))).toBeNull()
    expect(churchWords({ churchDay: true })).toBe('a church day')
    const tueSheet = await factSheet(TUE, new Date(2026, 9, 27, 8, 0))
    const today = factById(tueSheet, 'week.today')
    expect(today?.text).toContain('the Third Day, a service scheduled at 19:30')
    expect(today?.text).not.toMatch(/attend|went to church|at church/)
    expect(today?.values).toMatchObject({ church: 1, services: '19:30' })
    const said = 'Your Third Day service is scheduled at 19:30 this evening.'
    expect(validateOutput({ mode: 'strategy', text: said, factIds: ['week.today'], cardIds: [], action: null }, tueSheet, [], 60)).toMatchObject({ ok: true })
    expect(validateAsk({ text: said, factIds: ['week.today'], cardIds: [] }, tueSheet, [], 220)).toMatchObject({ ok: true })
    const wedSheet = await factSheet(WED, new Date(2026, 9, 28, 8, 0))
    expect(factById(wedSheet, 'week.today')?.text).not.toMatch(/Sabbath|Third Day|church/)
    expect(factById(wedSheet, 'week.yesterday')?.text).toContain('Yesterday was the Third Day, a service scheduled at 19:30')
  })

  it('reads the morning after an evening with a service on the schedule, named as the schedule', async () => {
    const settings = await getSettings()
    // Two Tuesdays before, each made under the schedule, and the evenings between; last night this Tuesday's.
    for (const d of ['2026-10-13', '2026-10-20', TUE]) await db.days.put(contextFromWeek(d, settings))
    await db.checkins.bulkAdd(['2026-10-13', '2026-10-14', '2026-10-20', '2026-10-21', TUE].flatMap((d) => [ci(d, 'evening', 3), ci(addDays(d, 1), 'morning', 3)]).filter((c) => c.day !== WED))
    const { briefData } = await import('./forecastFlow')
    const { lastNightWords } = await import('./associationWords')
    const brief = await briefData(WED)
    // The three Tuesday evenings with a service on the schedule, last night's among them; the others without.
    expect(brief.lastNight).toMatchObject({ key: 'churchDay', n: 3 })
    expect(lastNightWords(brief.lastNight!)).toMatch(/^Last night carried a church day on the schedule/)
  })
})

describe('the schedule in the cloud copy', () => {
  const TOKEN = 'test-token-never-real'
  beforeEach(async () => {
    await db.delete()
    await db.open()
    resetCloudForTests()
  })
  afterEach(() => setStoreFactory(null))

  it('keeps both schedules and their times through a fresh install', async () => {
    const store = memoryStore()
    const connect = async () => {
      setStoreFactory(async () => store)
      await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
    }
    await connect()
    await updateSettings((s) => ({ ...s, week: { ...s.week, churchDay: 0 as Weekday, thirdDay: 3 as Weekday, sabbathServices: ['08:00', '18:00'], thirdDayServices: ['20:00'] } }))
    expect(await syncNow()).toBe('done')
    await db.delete()
    await db.open()
    resetCloudForTests()
    await connect()
    expect(await syncNow()).toBe('done')
    expect((await getSettings()).week).toMatchObject({ churchDay: 0, thirdDay: 3, sabbathServices: ['08:00', '18:00'], thirdDayServices: ['20:00'] })
    expect(sabbathOf(contextFromWeek('2026-10-25', await getSettings()))).toBe(true)
  })
})

describe('a day kept by hand', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('never takes church from a change by hand: the office options stay the office’s', async () => {
    const settings = officeTuesday
    await ensureDayContext(TUE, settings)
    await setDayContext(TUE, { atOffice: false })
    const ctx = (await db.days.get(TUE)) as DayContext
    expect(ctx).toMatchObject({ atOffice: false, church: 'third', services: ['19:30'] })
  })

  it('keeps a day changed by hand as it was chosen, with its own stamp, through a schedule edit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 9, 0))
    try {
      await ensureDayContext(TUE, officeTuesday)
      await setDayContext(TUE, { atOffice: false })
      const chosen = (await db.days.get(TUE)) as DayContext
      vi.setSystemTime(new Date(2026, 9, 27, 10, 0))
      await updateSettings((s) => ({ ...s, week: { ...s.week, thirdDayServices: ['18:30'] } }))
      await refreshChurchToday(new Date(2026, 9, 27, 10, 0))
      const after = (await db.days.get(TUE)) as DayContext
      expect(after).toMatchObject({ atOffice: false, changed: true, updatedAt: chosen.updatedAt, church: 'third', services: ['18:30'] })
    } finally {
      vi.useRealTimers()
    }
  })
})

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { hasMove, moveById, moves } from './catalogue'
import { db, ensureDayContext, getSettings, setDayContext, type DayContext, type Offer, type Outcome } from './db'
import { candidatesFor, type Situation } from './offers'
import { todayState } from './offerFlow'
import { blockOfTime, carriedByContext, carriedLine, dayKindOf, inPerson, officeDayAtOffice, orderByEvidence, outAmongPeople, peopleAround, uncoveredContexts } from './people'

// People around (Part 20): today's shape decides whether an in-person rep may be offered; what
// completed reps suggest is evidence, and the draw never reads it.

const ctx = (patch: Partial<DayContext>): Pick<DayContext, 'atOffice' | 'churchDay' | 'pickupTime' | 'withHer' | 'amongPeople' | 'officeDay'> => ({ atOffice: false, churchDay: false, pickupTime: null, withHer: true, ...patch })

describe('tier 1: today’s shape, and nothing else', () => {
  it('puts people around on an office day’s working blocks, the church morning, and a daycare day’s drop-off and pickup blocks', () => {
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ atOffice: true }), b as 'morning'))).toEqual([true, true, false])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ churchDay: true }), b as 'morning'))).toEqual([true, false, false])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ pickupTime: '17:30' }), b as 'morning'))).toEqual([true, false, true])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ pickupTime: '15:00' }), b as 'morning'))).toEqual([true, true, false])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({}), b as 'morning'))).toEqual([false, false, false])
    // Out among people today (stage 3, item 5): around in every block.
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ amongPeople: true }), b as 'morning'))).toEqual([true, true, true])
    expect(peopleAround(null, 'morning')).toBe(false)
    // A day she is away holds no drop-off or pickup (Part 33); the office and the church morning still hold.
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ pickupTime: '17:30', withHer: false }), b as 'morning'))).toEqual([false, false, false])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ pickupTime: '17:30', withHer: false, atOffice: true }), b as 'morning'))).toEqual([true, true, false])
    expect(blockOfTime('17:30')).toBe('evening')
    expect(blockOfTime('12:00')).toBe('afternoon')
  })

  it('reads a scheduled office day at the office as out among people, in every block, without asking (2026-10-19)', () => {
    const blocks = ['morning', 'afternoon', 'evening'] as const
    // Scheduled at the office, and not marked Working from home.
    const office = ctx({ officeDay: true, atOffice: true })
    expect(blocks.map((b) => peopleAround(office, b))).toEqual([true, true, true])
    expect([outAmongPeople(office), officeDayAtOffice(office)]).toEqual([true, true])
    // Marked Working from home: nothing inferred, and the owner's answer stands either way.
    const home = ctx({ officeDay: true, atOffice: false })
    expect(blocks.map((b) => peopleAround(home, b))).toEqual([false, false, false])
    expect([outAmongPeople(home), officeDayAtOffice(home)]).toEqual([false, false])
    expect(blocks.map((b) => peopleAround(ctx({ officeDay: true, atOffice: false, amongPeople: true }), b))).toEqual([true, true, true])
    // A home day marked at the office is no scheduled office day: the question is still asked.
    const marked = ctx({ officeDay: false, atOffice: true })
    expect(blocks.map((b) => peopleAround(marked, b))).toEqual([true, true, false])
    expect([outAmongPeople(marked), officeDayAtOffice(marked)]).toEqual([false, false])
    // A day made before the record kept it reads as before, until the week fills it in.
    expect(officeDayAtOffice(ctx({ atOffice: true }))).toBe(false)
    expect([outAmongPeople(null), officeDayAtOffice(undefined)]).toEqual([false, false])
  })

  it('tags every move that needs another person, and only those: in person, remote, or her', () => {
    for (const m of moves) {
      if (m.needs.includes('anotherPerson')) expect(['adult', 'remote', 'her'], m.id).toContain(m.with)
      else expect(m.with, m.id).toBeUndefined()
    }
    expect(moveById('eye-contact-stranger').with).toBe('adult')
    expect(moveById('call-not-text').with).toBe('remote')
    expect(moveById('time-with-her').with).toBe('her')
  })
})

describe('the draw, in a block where nobody is around', () => {
  const evening: Situation = { block: 'evening', target: 'mood', key: 'evening|mood|gettingBy', band: 'gettingBy', reading: 50, targetPosition: 2 }
  const base = { doneToday: [], offeredToday: [], hiddenFamilies: new Set<string>(), doneRungs: new Map<string, number>(), studyNight: false, withHer: false, churchDay: false, noTimeCeiling: null }

  it('keeps every in-person rep out, says why, and still offers a call', () => {
    const set = candidatesFor(evening, { ...base, peopleAround: { morning: true, afternoon: true, evening: false } })
    const inPersonIds = moves.filter((m) => inPerson(m) && m.when.includes('evening')).map((m) => m.id)
    expect(inPersonIds.length).toBeGreaterThan(0)
    for (const id of inPersonIds) expect(set.candidates.map((c) => c.id), id).not.toContain(id)
    expect(set.excluded.get('eye-contact-stranger')).toBe('people')
    expect(set.excluded.get('call-not-text')).not.toBe('people')
  })
})

describe('tier 1 in today’s state, and history that never touches it', () => {
  const SAT = '2026-09-19'
  const afternoon: Situation = { block: 'afternoon', target: 'mood', key: 'afternoon|mood|gettingBy', band: 'gettingBy', reading: 50, targetPosition: 2 }
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('reads the office chip both ways: an office day worked from home has nobody around, a home day marked at the office has', async () => {
    const settings = await getSettings()
    await ensureDayContext('2026-09-21', { ...settings, week: { ...settings.week, officeDays: { ...settings.week.officeDays, 1: true } } })
    const at = new Date(2026, 8, 21, 9, 0)
    expect((await todayState('2026-09-21', settings, at)).peopleAround?.morning).toBe(true)
    await setDayContext('2026-09-21', { atOffice: false })
    expect((await todayState('2026-09-21', settings, at)).peopleAround?.morning).toBe(false)
    await ensureDayContext('2026-09-22', settings)
    await setDayContext('2026-09-22', { atOffice: true })
    expect((await todayState('2026-09-22', settings, new Date(2026, 8, 22, 9, 0))).peopleAround?.morning).toBe(true)
  })

  it('reads Out among people today: people around in every block, on that day alone (stage 3, item 5)', async () => {
    const settings = await getSettings()
    await ensureDayContext('2026-09-23', settings)
    await ensureDayContext('2026-09-24', settings)
    const at = new Date(2026, 8, 23, 19, 0)
    expect((await todayState('2026-09-23', settings, at)).peopleAround?.evening).toBe(false)
    await setDayContext('2026-09-23', { amongPeople: true })
    expect((await todayState('2026-09-23', settings, at)).peopleAround).toEqual({ morning: true, afternoon: true, evening: true })
    expect((await todayState('2026-09-24', settings, new Date(2026, 8, 24, 19, 0))).peopleAround?.evening).toBe(false)
  })

  it('keeps on the day whether the week scheduled it at the office, and lets the inference follow the office chip both ways (2026-10-19)', async () => {
    const settings = await getSettings()
    const officeWeek = { ...settings, week: { ...settings.week, officeDays: { ...settings.week.officeDays, 1: true } } }
    // A Monday the week holds at the office, in the evening: people are around, inferred.
    await ensureDayContext('2026-09-21', officeWeek)
    expect((await db.days.get('2026-09-21'))?.officeDay).toBe(true)
    const evening = new Date(2026, 8, 21, 19, 0)
    expect((await todayState('2026-09-21', officeWeek, evening)).peopleAround).toEqual({ morning: true, afternoon: true, evening: true })
    // Working from home: the inference is gone, and the owner's own mark is never written by it.
    await setDayContext('2026-09-21', { atOffice: false })
    expect((await todayState('2026-09-21', officeWeek, evening)).peopleAround).toEqual({ morning: false, afternoon: false, evening: false })
    expect((await db.days.get('2026-09-21'))?.amongPeople).toBeUndefined()
    // At the office again: it comes back.
    await setDayContext('2026-09-21', { atOffice: true })
    expect((await todayState('2026-09-21', officeWeek, evening)).peopleAround?.evening).toBe(true)
    expect((await db.days.get('2026-09-21'))?.amongPeople).toBeUndefined()
  })

  it('fills in a day made before it from the week, once, and never touches a choice in it (2026-10-19)', async () => {
    const settings = await getSettings()
    const officeWeek = { ...settings, week: { ...settings.week, officeDays: { ...settings.week.officeDays, 1: true } } }
    // A Monday's record as an older version made it: no officeDay, and marked Working from home by hand.
    await ensureDayContext('2026-09-21', officeWeek)
    const made = (await db.days.get('2026-09-21')) as DayContext
    const { officeDay: _gone, ...older } = made
    await db.days.put({ ...older, atOffice: false, changed: true, updatedAt: '2026-09-21T07:00:00.000Z' })
    expect((await db.days.get('2026-09-21'))?.officeDay).toBeUndefined()
    const read = await ensureDayContext('2026-09-21', officeWeek)
    expect(read.officeDay).toBe(true)
    const kept = (await db.days.get('2026-09-21')) as DayContext
    expect([kept.officeDay, kept.atOffice, kept.changed, kept.updatedAt]).toEqual([true, false, true, '2026-09-21T07:00:00.000Z'])
    // Read again under a week that has since changed: what the day kept stands.
    await ensureDayContext('2026-09-21', settings)
    expect((await db.days.get('2026-09-21'))?.officeDay).toBe(true)
    // A day only made from the week stays one: the fill-in is no change by hand.
    await ensureDayContext('2026-09-22', settings)
    const { officeDay: _none, ...olderTuesday } = (await db.days.get('2026-09-22')) as DayContext
    await db.days.put(olderTuesday)
    await ensureDayContext('2026-09-22', settings)
    const tuesday = (await db.days.get('2026-09-22')) as DayContext
    expect([tuesday.officeDay, tuesday.changed, tuesday.updatedAt]).toEqual([false, false, undefined])
  })

  it('offers the same candidates with and without eight weeks of in-person reps done in that context', async () => {
    const settings = await getSettings()
    await ensureDayContext(SAT, settings)
    const at = new Date(2026, 8, 19, 14, 0)
    const before = candidatesFor(afternoon, await todayState(SAT, settings, at)).candidates.map((c) => c.id)
    // Three Saturday afternoons with an in-person rep marked done.
    for (const day of ['2026-08-29', '2026-09-05', '2026-09-12']) {
      const offer: Offer = { kind: 'block', day, block: 'afternoon', at: `${day}T18:00:00.000Z`, situationKey: 'afternoon|mood|gettingBy', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: 'eye-contact-stranger', label: 'Eye contact with a stranger', minutes: 1, cardId: null, candidates: ['eye-contact-stranger'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null }
      const id = await db.offers.add(offer)
      await db.outcomes.add({ offerId: id, day, block: 'afternoon', moveId: 'eye-contact-stranger', outcome: 'done', at: `${day}T19:00:00.000Z`, why: null, passiveOutcome: null } satisfies Outcome)
    }
    const after = candidatesFor(afternoon, await todayState(SAT, settings, at)).candidates.map((c) => c.id)
    expect(after).toEqual(before)
    expect(after.filter((id) => hasMove(id) && inPerson(moveById(id)))).toEqual([])
    // What the history does produce: a count, the order of a picker, one counted line, and a note to correct the shape.
    const carried = carriedByContext(await db.offers.toArray(), await db.outcomes.toArray(), await db.days.toArray(), SAT)
    expect(carried.get('weekend|afternoon')).toBe(3)
    expect(carriedLine('weekend', 'afternoon', carried)).toBe('Weekend afternoons have carried an in-person rep 3 times.')
    expect(carriedLine('weekday', 'evening', carried)).toBeNull()
    const ordered = orderByEvidence([moveById('call-not-text'), moveById('eye-contact-stranger')], 'weekend', 'afternoon', carried)
    expect(ordered.map((m) => m.id)).toEqual(['eye-contact-stranger', 'call-not-text'])
    expect(orderByEvidence([moveById('call-not-text'), moveById('eye-contact-stranger')], 'weekday', 'evening', carried).map((m) => m.id)).toEqual(['call-not-text', 'eye-contact-stranger'])
    const week = [{ day: SAT, atOffice: false, churchDay: false, pickupTime: null, withHer: true }]
    expect(uncoveredContexts(carried, week)).toEqual([{ kind: 'weekend', block: 'afternoon', n: 3 }])
    expect(uncoveredContexts(new Map(), week)).toEqual([])
  })

  it('names the kind of day for its counts', () => {
    expect(dayKindOf('2026-09-19', null)).toBe('weekend')
    expect(dayKindOf('2026-09-21', { atOffice: true })).toBe('office')
    expect(dayKindOf('2026-09-22', { atOffice: false })).toBe('weekday')
  })
})

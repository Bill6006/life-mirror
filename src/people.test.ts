import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { hasMove, moveById, moves } from './catalogue'
import { db, ensureDayContext, getSettings, setDayContext, type DayContext, type Offer, type Outcome } from './db'
import { candidatesFor, type Situation } from './offers'
import { todayState } from './offerFlow'
import { blockOfTime, carriedByContext, carriedLine, dayKindOf, inPerson, orderByEvidence, peopleAround, uncoveredContexts } from './people'

// People around (Part 20): today's shape decides whether an in-person rep may be offered; what
// completed reps suggest is evidence, and the draw never reads it.

const ctx = (patch: Partial<DayContext>): Pick<DayContext, 'atOffice' | 'churchDay' | 'pickupTime'> => ({ atOffice: false, churchDay: false, pickupTime: null, ...patch })

describe('tier 1: today’s shape, and nothing else', () => {
  it('puts people around on an office day’s working blocks, the church morning, and a daycare day’s drop-off and pickup blocks', () => {
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ atOffice: true }), b as 'morning'))).toEqual([true, true, false])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ churchDay: true }), b as 'morning'))).toEqual([true, false, false])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ pickupTime: '17:30' }), b as 'morning'))).toEqual([true, false, true])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({ pickupTime: '15:00' }), b as 'morning'))).toEqual([true, true, false])
    expect(['morning', 'afternoon', 'evening'].map((b) => peopleAround(ctx({}), b as 'morning'))).toEqual([false, false, false])
    expect(peopleAround(null, 'morning')).toBe(false)
    expect(blockOfTime('17:30')).toBe('evening')
    expect(blockOfTime('12:00')).toBe('afternoon')
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
    const week = [{ day: SAT, atOffice: false, churchDay: false, pickupTime: null }]
    expect(uncoveredContexts(carried, week)).toEqual([{ kind: 'weekend', block: 'afternoon', n: 3 }])
    expect(uncoveredContexts(new Map(), week)).toEqual([])
  })

  it('names the kind of day for its counts', () => {
    expect(dayKindOf('2026-09-19', null)).toBe('weekend')
    expect(dayKindOf('2026-09-21', { atOffice: true })).toBe('office')
    expect(dayKindOf('2026-09-22', { atOffice: false })).toBe('weekday')
  })
})

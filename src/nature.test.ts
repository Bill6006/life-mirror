import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CHIP_IDS } from './audit'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { validateAsk, validateOutput } from './brainShared'
import { moveById } from './catalogue'
import { memoryStore } from './cloudStore'
import { resetCloudForTests, setStoreFactory, syncNow } from './cloudSync'
import { copy } from './copy'
import { db, setExtra, updateSettings, type CheckIn, type Outcome } from './db'
import { factById } from './facts'
import type { FactSheet } from './factTypes'
import { briefData } from './forecastFlow'
import library from './library.json'
import type { ClaimCard } from './libraryTypes'
import { NATURE_EVENT, NATURE_MINUTES, NATURE_MOVES, NATURE_SINCE, natureAnswerWords, natureAssociations, natureDay, natureEvening, natureMoveDays, natureMoveToday } from './nature'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { bestDays } from './weekly'
import { retrieve } from '../worker/src/library'

// Time in nature (item 2 of 4, 2026-10-21), the evening's "20+ min in nature today, in total", defined from the evidence
// review in the plan: 20 minutes or more in nature in the day, separate periods adding up; Walk somewhere green done counts
// the day by itself and no shorter outdoor move does; the older Outside a while today stays as recorded and is never read
// as time in nature. Compared as an association, the evening of and the morning after, never as a cause.

/** A check-in at a level: the readings that read up at p, the ones that read down mirrored, so its reading follows p. */
function ci(day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn {
  const answers: Answers = Object.fromEntries(blockReadings(block).map((id) => [id, 3]))
  for (const id of Object.keys(answers) as ReadingId[]) {
    if (['stress', 'overwhelm', 'irritation'].includes(id)) answers[id] = (6 - p) as Position
    else if (['mood', 'energy', 'focus'].includes(id)) answers[id] = p
  }
  return { day, block, answers, startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000, extras }
}

let next = 1
/** A move answered on a day: done unless said otherwise. */
const answered = (day: string, moveId: string, outcome: Outcome['outcome'] = 'done'): Outcome => ({ id: next, offerId: next++, moveId, day, block: 'afternoon', at: `${day}T15:00:00.000Z`, outcome, why: null, passiveOutcome: null })

/** Six evenings from the definition's start that showed the chip: three tapped, each its evening and next morning high; three left, each low. */
function sixShown(from = '2026-11-02'): CheckIn[] {
  return [0, 2, 4, 6, 8, 10].flatMap((k, n) => {
    const day = addDays(from, k)
    const tapped = n % 2 === 0
    return [ci(day, 'morning', 3), ci(day, 'evening', tapped ? 4 : 2, { chipsShown: { nature: true }, ...(tapped ? { nature: true as const } : {}) }), ci(addDays(day, 1), 'morning', tapped ? 4 : 2)]
  })
}

/** Ten evenings of the older Outside a while today, shown and tapped, every evening and morning after them high. */
function tenOutside(): CheckIn[] {
  return Array.from({ length: 10 }, (_, k) => {
    const day = addDays('2026-10-01', k * 2)
    return [ci(day, 'morning', 3), ci(day, 'evening', 5, { chipsShown: { outside: true }, outside: true }), ci(addDays(day, 1), 'morning', 5)]
  }).flat()
}

describe('time in nature, the definition (item 2 of 4, 2026-10-21)', () => {
  it('is 20 minutes or more in the day, in total: 19 is not, 20 is, and separate periods add up', () => {
    expect(NATURE_MINUTES).toBe(20)
    expect(NATURE_SINCE).toBe('2026-10-21')
    expect(natureDay([19])).toBe(false)
    expect(natureDay([20])).toBe(true)
    expect(natureDay([45])).toBe(true)
    expect(natureDay([10, 10])).toBe(true)
    expect(natureDay([5, 5, 9])).toBe(false)
    expect(natureDay([5, 5, 10])).toBe(true)
    expect(natureDay([])).toBe(false)
    // A period is never negative: one written as such adds nothing and takes nothing away.
    expect(natureDay([25, -10])).toBe(true)
  })

  it('counts Walk somewhere green done as a nature day by itself, and never a ten-minute walk alone', () => {
    expect(NATURE_MOVES).toEqual(['green-walk'])
    expect(moveById('green-walk')).toMatchObject({ name: 'Walk somewhere green', minutes: 30 })
    const day = '2026-11-03'
    expect(natureMoveDays([answered(day, 'green-walk')])).toEqual(new Set([day]))
    // Partly done says nothing of its minutes.
    expect(natureMoveDays([answered(day, 'green-walk', 'partly')]).size).toBe(0)
    // The other outdoor moves count only where the person says the place was natural, and none reaches 20 by itself.
    for (const id of ['walk-ten', 'after-dinner-walk', 'morning-daylight', 'sit-outside-five']) {
      expect(moveById(id)?.needs).toContain('outdoors')
      expect(moveById(id)?.minutes).toBeLessThan(20)
      expect(natureMoveDays([answered(day, id)]).size).toBe(0)
    }
    // Minutes in nature from moves add up across the day as any periods do: two of ten reach the line, one alone does not.
    const ten = () => 10
    expect(natureMoveDays([answered(day, 'a'), answered(day, 'b')], ['a', 'b'], ten)).toEqual(new Set([day]))
    expect(natureMoveDays([answered(day, 'a')], ['a', 'b'], ten).size).toBe(0)
    // Before the definition began, no move makes a nature day.
    expect(natureMoveDays([answered('2026-10-20', 'green-walk')]).size).toBe(0)
    expect(natureMoveToday([answered(day, 'green-walk')], day)).toBe('Walk somewhere green')
    expect(natureMoveToday([answered(day, 'walk-ten')], day)).toBeNull()
  })

  it('never reads Outside a while today as time in nature: each old mark stays as recorded, on neither side', () => {
    expect(natureEvening(ci('2026-10-10', 'evening', 3, { chipsShown: { outside: true }, outside: true }), new Set())).toBe(false)
    expect(natureEvening(ci('2026-10-25', 'evening', 3, { nature: true }), new Set())).toBe(true)
    // A nature tap dated before the definition is no nature day either.
    expect(natureEvening(ci('2026-10-20', 'evening', 3, { nature: true }), new Set())).toBe(false)
    const n = natureAssociations([...tenOutside(), ...sixShown()], [], '2026-11-20')
    expect(n.morning).toMatchObject({ times: 3, without: { n: 3 } })
    expect(n.evening).toMatchObject({ times: 3, without: { n: 3 } })
    // The probe that could have said yes: the same ten evenings as nature taps, dated before the start, still enter neither
    // side; dated after it, they join the side with.
    const asNature = tenOutside().map((c) => (c.block === 'evening' ? { ...c, extras: { chipsShown: { nature: true as const }, nature: true as const } } : c))
    expect(natureAssociations([...asNature, ...sixShown()], [], '2026-11-20').morning).toMatchObject({ times: 3, without: { n: 3 } })
    const later = asNature.map((c) => ({ ...c, day: addDays(c.day, 60) }))
    expect(natureAssociations([...later, ...sixShown()], [], '2027-01-31').morning.times).toBe(13)
  })
})

describe('time in nature’s answer on the check-in', () => {
  it('answers the tap with the evenings of its days, then the mornings after, like for like', () => {
    expect(natureAnswerWords(natureAssociations([], [], '2026-11-20'))).toBe('First time recorded.')
    // The evenings differ here, so the mornings after have nothing matched to set against: the evenings alone.
    expect(natureAnswerWords(natureAssociations(sixShown(), [], '2026-11-20'))).toMatch(/^3 times before\. Those evenings read \d+, against \d+ on days that started the same \(3 and 3\)\.$/)
    // Days whose mornings started apart have nothing matched to set against, whatever their evenings read: said plainly.
    const tapped = new Set(['2026-11-02', '2026-11-06', '2026-11-10'])
    const left = new Set(['2026-11-04', '2026-11-08', '2026-11-12'])
    const apart = sixShown().map((c) => (c.block === 'morning' && tapped.has(c.day) ? ci(c.day, 'morning', 5) : c.block === 'morning' && left.has(c.day) ? ci(c.day, 'morning', 1) : c))
    expect(natureAnswerWords(natureAssociations(apart, [], '2026-11-20'))).toMatch(/^3 times before\. Those evenings read \d+ \(3\); nothing yet to set them against\.$/)
    // Evenings alike and mornings after apart: both said.
    const level = sixShown().map((c) => (c.block === 'evening' ? { ...ci(c.day, 'evening', 3, c.extras) } : c))
    expect(natureAnswerWords(natureAssociations(level, [], '2026-11-20'))).toMatch(/^3 times before\. Those evenings read \d+, against \d+ on days that started the same \(3 and 3\)\. The mornings after read \d+, against \d+ after evenings that started the same \(3 and 3\)\.$/)
  })
})

describe('time in nature on the day’s sheet and in the library', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('compares the evening of and the morning after, like for like, tagged nature, with the minutes a writer may say', async () => {
    await db.checkins.bulkAdd([...tenOutside(), ...sixShown()])
    const sheet = await factSheet('2026-11-20', new Date(2026, 10, 20, 20, 0))
    const evening = factById(sheet, 'assoc.nature')
    const morning = factById(sheet, 'assoc.nature.morning')
    expect(evening?.tags).toEqual(['nature'])
    expect(morning?.tags).toEqual(['nature'])
    expect(evening?.values).toMatchObject({ times: 3, minutes: 20 })
    expect(morning?.values).toMatchObject({ times: 3, minutes: 20 })
    expect(Number(evening?.values.diff)).toBeGreaterThan(0)
    expect(evening?.text).toContain(`Evenings of ${NATURE_EVENT}`)
    // The mornings after are matched on the evening's band, and here the evenings differ: said plainly, nothing compared yet.
    expect(morning?.text).toBe(`${NATURE_EVENT} has 3 days behind it; nothing can be compared yet.`)
    // The older mark has no comparison of its own any longer, and never joins this one.
    expect(factById(sheet, 'assoc.outside')).toBeUndefined()
  })

  it('draws only the library’s nature cards: the daylight card is about hours of daylight and leaves nature', () => {
    const cards = (library as unknown as ClaimCard[]).filter((c) => c.status === 'admitted')
    expect(cards.filter((c) => c.tags.includes('nature')).map((c) => c.id).sort()).toEqual(['green-exercise-dose', 'nature-attention-restoration', 'nature-walk-rumination'])
    expect(cards.find((c) => c.id === 'daylight-and-mood')?.tags).toEqual(['light', 'mood', 'morning'])
    const sheet: FactSheet = { version: 1, day: '2026-11-20', builtAt: '', hour: 20, weeks: 6, days: 40, direction: null, said: [], checkedIn: {}, facts: [{ id: 'assoc.nature', tags: ['nature'], text: '', values: {} }] }
    expect(retrieve(cards, sheet).map((c) => c.id).sort()).toEqual(['green-exercise-dose', 'nature-attention-restoration', 'nature-walk-rumination'])
  })

  it('is said as an association, never a cause, in the Brain’s line and in Ask alike', async () => {
    await db.checkins.bulkAdd(sixShown())
    const sheet = await factSheet('2026-11-20', new Date(2026, 10, 20, 20, 0))
    for (const cause of ['Time in nature lifted your evenings.', 'Being in nature is what made your evenings better.']) {
      expect(validateOutput({ mode: 'strategy', text: cause, factIds: ['assoc.nature'], cardIds: [], action: null }, sheet, [], 60)).toMatchObject({ ok: false, reason: expect.stringMatching(/association in the record/) })
      expect(validateAsk({ text: cause, factIds: ['assoc.nature'], cardIds: [] }, sheet, [], 220)).toMatchObject({ ok: false, reason: expect.stringMatching(/association in the record/) })
    }
    const said = 'Evenings after days with 20+ minutes in nature have read higher so far, like for like.'
    expect(validateOutput({ mode: 'strategy', text: said, factIds: ['assoc.nature'], cardIds: [], action: null }, sheet, [], 60)).toMatchObject({ ok: true })
    expect(validateAsk({ text: said, factIds: ['assoc.nature'], cardIds: [] }, sheet, [], 220)).toMatchObject({ ok: true })
  })

  it('reads last night by the same day mark: a tap, or Walk somewhere green done with the chip left', async () => {
    await db.checkins.bulkAdd([...sixShown(), ci('2026-11-14', 'evening', 3, { chipsShown: { nature: true }, nature: true })])
    expect((await briefData('2026-11-15')).lastNight?.key).toBe('nature')
    await db.delete()
    await db.open()
    await db.checkins.bulkAdd([...sixShown(), ci('2026-11-14', 'evening', 3, { chipsShown: { nature: true } })])
    expect((await briefData('2026-11-15')).lastNight?.key).not.toBe('nature')
    await db.outcomes.add(answered('2026-11-14', 'green-walk'))
    expect((await briefData('2026-11-15')).lastNight?.key).toBe('nature')
  })
})

describe('time in nature among best days', () => {
  it('counts the tap or Walk somewhere green done, only on days from its start that showed the chip', () => {
    const today = '2026-11-30'
    // Thirty days, every third high and the last nine's three highest; the chip shown on the last nine evenings only,
    // tapped on two of their three high days, and the third carried by Walk somewhere green done.
    const checkins: CheckIn[] = []
    const outcomes: Outcome[] = []
    for (let i = 30; i >= 1; i--) {
      const day = addDays(today, -i)
      const p: Position = i % 3 === 0 ? (i <= 9 ? 5 : 4) : 3
      const shown = i <= 9
      checkins.push(ci(day, 'morning', p), ci(day, 'evening', p, shown ? { chipsShown: { nature: true }, ...(i === 3 || i === 6 ? { nature: true as const } : {}) } : undefined))
      if (i === 9) outcomes.push(answered(day, 'green-walk'))
    }
    const b = bestDays(checkins, [], outcomes, [], today)
    expect(b.controlled.find((d) => d.label === '20+ minutes in nature')).toMatchObject({ onBest: 3, ofBest: 3, onOthers: 0, ofOthers: 6 })
    // Days before the definition began count for nothing, whatever they carry.
    const early: CheckIn[] = []
    for (let i = 30; i >= 1; i--) {
      const day = addDays('2026-10-21', -i)
      early.push(ci(day, 'morning', i % 3 === 0 ? 5 : 3), ci(day, 'evening', i % 3 === 0 ? 5 : 3, { chipsShown: { nature: true }, ...(i % 3 === 0 ? { nature: true as const } : {}) }))
    }
    const none = bestDays(early, [], [], [], '2026-10-21').controlled.find((d) => d.label === '20+ minutes in nature')
    expect((none?.ofBest ?? 0) + (none?.ofOthers ?? 0)).toBe(0)
  })
})

describe('time in nature on the check-in', () => {
  it('says the rule in a short label, with what counts one tap away, and never offers the old chip back', () => {
    expect(copy.extras.nature).toBe('20+ min in nature today, in total')
    expect(copy.extras.nature.split(' ').length).toBeLessThanOrEqual(7)
    expect(copy.extras.natureWhat).toBe('What counts')
    expect(copy.extras.natureWhatText).toBe('Time spent in green or natural places, such as a park, garden, woods or by water, walking or sitting. Separate times add up.')
    expect(copy.brief.lastNightEvents.nature).toBe('20+ minutes in nature')
    expect(CHIP_IDS).toContain('nature')
    expect(CHIP_IDS as readonly string[]).not.toContain('outside')
  })
})

describe('time in nature through a reload and the cloud copy', () => {
  const TOKEN = 'test-token-never-real'
  beforeEach(async () => {
    await db.delete()
    await db.open()
    resetCloudForTests()
  })
  afterEach(() => setStoreFactory(null))

  it('keeps the evening’s tap on the phone and brings it back on a fresh install', async () => {
    const store = memoryStore()
    const connect = async () => {
      setStoreFactory(async () => store)
      await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
    }
    await connect()
    await setExtra({ day: '2026-10-22', block: 'evening' }, blockReadings('evening'), 'nature', true)
    expect((await db.checkins.toArray()).find((c) => c.day === '2026-10-22')?.extras?.nature).toBe(true)
    expect(await syncNow()).toBe('done')
    await db.delete()
    await db.open()
    resetCloudForTests()
    await connect()
    expect(await syncNow()).toBe('done')
    expect((await db.checkins.toArray()).find((c) => c.day === '2026-10-22')?.extras).toMatchObject({ nature: true })
  })
})

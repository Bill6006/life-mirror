import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeAims } from './aimFlow'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings, type Outcome } from './db'
import { EXPECTANCY_UNUSED_RETIRES, expectancyCounts, expectancyRetired } from './expectancy'
import { addPathAim, markExpectancyAsked, setExpectancy } from './pathFlow'
import { pathKey, pathToday, type PathEntry } from './pathStage'

// Stage 3, item 5, part 9: after a People rep is marked done, one optional tap, easier than you expected, about as
// expected, or harder. Reflection only (Part 25): it never advances or holds a stage, never changes a draw, and is
// never evidence. It shows as counts under the path's Details, and stops appearing after going unused.

const DAY = '2026-09-18'
const at = (k: number) => `${addDays(DAY, -k)}T19:00:00.000Z`
const out = (k: number, over: Partial<Outcome> = {}): Outcome => ({ offerId: 100 + k, moveId: 'message-a-friend', day: addDays(DAY, -k), block: 'evening', at: at(k), outcome: 'done', why: null, passiveOutcome: null, ...over })
const entry = (offerId: number): PathEntry => ({ offerId, moveId: 'message-a-friend', day: DAY, at: '', setting: 'remote', chosenBy: 'app', rule: 'draw', outcome: 'done', stage: 1, block: 'evening', chances: null })

describe('the expectancy tap stops appearing after going unused (Rule 17)', () => {
  const asked = (n: number) => Array.from({ length: n }, (_, k) => out(k + 1, { expectancyAsked: true }))

  it('stops after a dozen reps running that it was shown after, with no answer', () => {
    expect(EXPECTANCY_UNUSED_RETIRES).toBe(12)
    expect(expectancyRetired(asked(12), null)).toBe(true)
    expect(expectancyRetired(asked(11), null)).toBe(false)
    // One answer among the latest dozen keeps it.
    expect(expectancyRetired(asked(12).map((x, i) => (i === 11 ? { ...x, expectancy: 'harder' as const } : x)), null)).toBe(false)
  })

  it('counts only reps it was shown after and that stayed done: a rep never asked says nothing', () => {
    expect(expectancyRetired(Array.from({ length: 20 }, (_, k) => out(k + 1)), null)).toBe(false)
    expect(expectancyRetired(asked(12).map((x) => ({ ...x, outcome: 'partly' as const })), null)).toBe(false)
  })

  it('comes back with one tap, its count starting again then', () => {
    expect(expectancyRetired(asked(20), at(5))).toBe(false)
    expect(expectancyRetired(asked(20), at(15))).toBe(true)
  })
})

describe('the counts under the path’s Details', () => {
  it('counts this path’s reps done by answer, and says nothing while none is answered', () => {
    const outcomes = [out(1, { expectancy: 'easier' }), out(2, { expectancy: 'easier' }), out(3, { expectancy: 'harder' }), out(4), out(5, { expectancy: 'asExpected', outcome: 'no' }), out(6, { expectancy: 'asExpected', offerId: 999 })]
    const entries = [101, 102, 103, 104, 105].map(entry)
    expect(expectancyCounts(entries, outcomes)).toEqual({ easier: 2, asExpected: 0, harder: 1 })
    expect(expectancyCounts(entries, [out(1), out(2)])).toBeNull()
  })
})

describe('reflection only (Part 25)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  /** Six evenings of People reps on the Social path, done and not, as the phone keeps them. */
  async function seed(): Promise<number[]> {
    await addPathAim('social')
    const ids: number[] = []
    for (let k = 1; k <= 6; k++) {
      const day = addDays(DAY, -k)
      const offerId = await db.offers.add({ kind: 'step', day, block: 'evening', at: `${day}T18:00:00.000Z`, situationKey: pathKey('social'), target: 'mood', stance: '', band: '', reading: 0, moveId: 'message-a-friend', cardId: null, candidates: ['message-a-friend'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: `${day}T19:00:00.000Z`, paths: ['social'], stage: 1, rule: 'draw', setting: 'remote', chosenBy: 'app' } as never)
      await db.outcomes.add({ offerId, moveId: 'message-a-friend', day, block: 'evening', at: `${day}T19:00:00.000Z`, outcome: k % 3 === 0 ? 'no' : 'done', why: null, passiveOutcome: null })
      ids.push(offerId as number)
    }
    return ids
  }

  async function read() {
    const aim = (await activeAims()).find((a) => a.kind === 'path')
    if (!aim) throw new Error('no path')
    const [offers, outcomes] = [await db.offers.toArray(), await db.outcomes.toArray()]
    const view = pathToday({ aim, offers, outcomes, ctx: null, day: DAY, block: 'evening' })
    const sheet = await factSheet(DAY, new Date(2026, 8, 18, 20, 0))
    return { state: view.state, pick: view.pick, entries: view.entries, facts: sheet.facts }
  }

  it('is kept on the rep’s answer, replaced by a second tap and taken back by null, and marked asked once shown', async () => {
    const [first] = await seed()
    await markExpectancyAsked(first)
    await setExpectancy(first, 'harder')
    await setExpectancy(first, 'easier')
    expect(await db.outcomes.where('offerId').equals(first).first()).toMatchObject({ expectancy: 'easier', expectancyAsked: true, outcome: 'done' })
    await setExpectancy(first, null)
    expect((await db.outcomes.where('offerId').equals(first).first())?.expectancy).toBeUndefined()
  })

  it('never moves a stage, never changes a draw, and reaches no fact on the sheet', async () => {
    const ids = await seed()
    const before = await read()
    expect(before.entries).toHaveLength(6)
    // Asked after every rep done, and answered each way, harder among them.
    const done = ids.filter((_, i) => (i + 1) % 3 !== 0)
    expect(done).toHaveLength(4)
    for (const [i, id] of done.entries()) {
      await markExpectancyAsked(id)
      await setExpectancy(id, (['harder', 'easier', 'harder', 'asExpected'] as const)[i])
    }
    const after = await read()
    expect(after.state).toEqual(before.state)
    expect(after.pick).toEqual(before.pick)
    expect(after.facts).toEqual(before.facts)
    expect(JSON.stringify(after.facts)).not.toMatch(/expect/i)
    // The probe that could have said yes: the same reps answered No instead of done change what the sheet says.
    const firstOutcome = await db.outcomes.where('offerId').equals(ids[0]).first()
    await db.outcomes.update(firstOutcome?.id as number, { outcome: 'no' })
    expect((await read()).facts).not.toEqual(before.facts)
  })
})

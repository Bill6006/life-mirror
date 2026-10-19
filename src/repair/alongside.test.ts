import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from '../blocks'
import { RECOVERY_GAP } from '../catalogue'
import { db, getSettings, type Offer, type Outcome } from '../db'
import { EngineB, IN_APP } from './engine'
import { coin, START, walkRecord } from './fixtures'
import { PASSIVE_COIN, PASSIVE_TEST_DAYS, passiveTestReading, passiveTestRuns, passiveTestSince, startPassiveTest, testablePassive } from './passive'
import { alongsideResponseOf, answeredOf, buildEngine, contextOf, responseOf, type RepairRecord } from './record'

// A one-tap test of a passive item (stage R4b): while it runs, a fair coin decides whether the item rides alongside, and
// the repair reads each coin as a randomized decision for the item's own test, exactly as a draw at that chance would be,
// touching no other test.

const GAP_TEST = 'recovery-gap|energy|nextMorning'

interface Run {
  /** Each day's calls. */
  calls: string[]
  /** At the end, every test's decisions, available days and queue entry. */
  tests: Map<string, { decisions: string; eligibleDays: number[]; queuedAt: number | null }>
}

/** The walk's record replayed through an engine; on every evening a coin for the gap, as a coin or as a draw at 0.5. */
function run(r: RepairRecord, days: number, gap: 'coin' | 'draw' | 'none'): Run {
  const e = new EngineB(() => 0.5, IN_APP, new Set(), [], null, () => null, (d) => addDays(START, d))
  const outcomeOf = new Map(r.outcomes.map((o) => [o.offerId, o]))
  const calls: string[] = []
  for (let d = 0; d < days; d++) {
    calls.push(JSON.stringify(e.learn(d)))
    const day = addDays(START, d)
    const ctx = contextOf(day, r.days.find((x) => x.day === day), r.checkins.find((x) => x.day === day && x.block === 'morning'))
    for (const b of BLOCKS) {
      const ci = r.checkins.find((x) => x.day === day && x.block === b)
      if (!ci) continue
      const a = answeredOf(ci)
      e.observe(a, d, ctx)
      const o = r.offers.find((x) => x.day === day && x.block === b) as Offer
      e.respond(e.replayOffer(a, d, ctx, o.target, o.candidates, o.moveId, o.propensities ?? {}, [], false), responseOf(o, outcomeOf.get(o.id as number)))
      if (b !== 'evening' || gap === 'none') continue
      const rode = coin(1000 + d)
      const said = { seen: true, did: rode ? ('done' as const) : null, why: null, answered: true }
      const id = gap === 'coin' ? e.replayAlongside(a, d, ctx, RECOVERY_GAP, rode, PASSIVE_COIN) : e.replayOffer(a, d, ctx, 'energy', [RECOVERY_GAP, 'nothing'], rode ? RECOVERY_GAP : 'nothing', { [RECOVERY_GAP]: PASSIVE_COIN, nothing: 1 - PASSIVE_COIN })
      e.respond(id, said)
    }
  }
  return { calls, tests: new Map([...e.testsNow().values()].map((t) => [t.key, { decisions: JSON.stringify(t.decisions), eligibleDays: [...t.eligibleDays], queuedAt: t.queuedAt }])) }
}

describe('a passive item’s coin in the engine', () => {
  const r = walkRecord(30, true)
  const viaCoin = run(r, 30, 'coin')

  it('enters the item’s test exactly as a draw between it and nothing extra at the same chance would: the same decisions, every call every day the same', () => {
    const viaDraw = run(r, 30, 'draw')
    expect(viaCoin.calls.join('').includes(GAP_TEST)).toBe(true)
    expect(viaCoin.calls).toEqual(viaDraw.calls)
    expect(viaCoin.tests.get(GAP_TEST)?.decisions).toBe(viaDraw.tests.get(GAP_TEST)?.decisions)
  })

  it('takes no place in the queue, which chooses the tests the draw runs: the item is never drawn', () => {
    expect(viaCoin.tests.get(GAP_TEST)?.eligibleDays).toEqual([])
    expect(viaCoin.tests.get(GAP_TEST)?.queuedAt).toBeNull()
  })

  it('touches no other test: every other test’s calls, decisions, available days and queue entry are as without the coins', () => {
    const without = run(r, 30, 'none')
    const others = (calls: string[]) => calls.map((c) => JSON.stringify((JSON.parse(c) as { key: string }[]).filter((x) => !x.key.startsWith(`${RECOVERY_GAP}|`))))
    expect(others(viaCoin.calls)).toEqual(others(without.calls))
    const rest = (x: Run) => JSON.stringify([...x.tests].filter(([k]) => !k.startsWith(`${RECOVERY_GAP}|`)))
    expect(rest(viaCoin)).toBe(rest(without))
  })
})

describe('a passive item’s coin in the record', () => {
  it('each coin kept on an offer is rebuilt as a decision for the item’s own test; an offer without one gives none', () => {
    const base = walkRecord(12, true)
    const withCoins: RepairRecord = { ...base, offers: base.offers.map((o) => (o.block === 'evening' ? { ...o, passiveId: coin(o.id as number) ? RECOVERY_GAP : null, passiveCoin: { moveId: RECOVERY_GAP, rode: coin(o.id as number), chance: PASSIVE_COIN } } : o)) }
    const day = addDays(START, 12)
    const tested = buildEngine(withCoins, day).engine.testsNow().get(GAP_TEST)
    expect(tested?.decisions.length).toBe(12)
    expect(tested?.decisions.every((x) => x.pi === PASSIVE_COIN)).toBe(true)
    expect(buildEngine(base, day).engine.testsNow().get(GAP_TEST)).toBeUndefined()
  })

  it('what became of a coin: seen as its card was; done or not as answered when it rode; nothing to answer when it did not', () => {
    const o = { ...walkRecord(1).offers[2], passiveCoin: { moveId: RECOVERY_GAP, rode: true, chance: 0.5 } } as Offer
    const out = (passiveOutcome: Outcome['passiveOutcome']) => ({ ...walkRecord(1).outcomes[2], passiveOutcome })
    expect(alongsideResponseOf(o, out('done'))).toEqual({ seen: true, did: 'done', why: null, answered: true })
    expect(alongsideResponseOf(o, out(null))).toEqual({ seen: true, did: null, why: null, answered: false })
    const not = { ...o, passiveCoin: { moveId: RECOVERY_GAP, rode: false, chance: 0.5 } }
    expect(alongsideResponseOf(not, out('done'))).toEqual({ seen: true, did: null, why: null, answered: true })
  })
})

describe('which passive items a test can follow, and for how long', () => {
  it('only one the judged design gives a test of a reading out of 100: the recovery gap, on energy the next morning; never a sleep item, never a drawn move', () => {
    expect(testablePassive(RECOVERY_GAP)).toBe(true)
    expect(passiveTestReading(RECOVERY_GAP)).toEqual({ target: 'energy', window: 'nextMorning' })
    for (const id of ['dinner-early-light', 'phone-out-of-bedroom', 'caffeine-cutoff', 'walk-ten']) expect(testablePassive(id)).toBe(false)
  })

  it('runs from the day it is set for forty-five days, and stops once its test is established', () => {
    const settings = { repairPassiveTests: [{ moveId: RECOVERY_GAP, since: START }] }
    expect(passiveTestSince(settings, RECOVERY_GAP, addDays(START, -1))).toBeNull()
    expect(passiveTestSince(settings, RECOVERY_GAP, START)).toBe(START)
    expect(passiveTestSince(settings, RECOVERY_GAP, addDays(START, 44))).toBe(START)
    expect(passiveTestSince(settings, RECOVERY_GAP, addDays(START, PASSIVE_TEST_DAYS))).toBeNull()
    expect(passiveTestSince({}, RECOVERY_GAP, START)).toBeNull()
    expect(passiveTestRuns(settings, RECOVERY_GAP, START, [{ moveId: RECOVERY_GAP, level: 'likely' }])).toBe(true)
    expect(passiveTestRuns(settings, RECOVERY_GAP, START, [{ moveId: RECOVERY_GAP, level: 'established' }])).toBe(false)
  })

  describe('set by one tap', () => {
    beforeEach(async () => {
      await db.delete()
      await db.open()
    })

    it('is kept with the settings, a new one in place of an earlier one of the same item', async () => {
      await startPassiveTest(RECOVERY_GAP, START)
      await startPassiveTest(RECOVERY_GAP, addDays(START, 3))
      expect((await getSettings()).repairPassiveTests).toEqual([{ moveId: RECOVERY_GAP, since: addDays(START, 3) }])
    })
  })
})

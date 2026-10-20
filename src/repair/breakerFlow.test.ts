import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { factSheet } from '../brainFlow'
import { db, ensureDayContext, getSettings, saveAnswer, setDayContext, updateSettings, type Offer } from '../db'
import { NOTHING, RECOVERY_GAP } from '../catalogue'
import { ensureOffer, ensurePickupOffer, redrawForDay, skipOffer, syncRecoveryGap } from '../offerFlow'
import { blockReadings } from '../readings'
import { repairFaults, resetRepairBreaker } from './breaker'
import { engineFailed } from './gate'
import { startPassiveTest } from './passive'

// The owner's requirement of 2026-10-20: the old engine retired, with no fallback. A rebuild that throws on a record no test
// foresaw, stood in here by an engine whose every read throws: no move is offered (not the check-in's, not a replacement
// after a skip, not the pickup-time move, not a draw again when the day changes), nothing else draws in its place, the
// failure is kept, and the Brain's sheet carries no test facts but the failure, for the Worker's report.

vi.mock('./flow', async (original) => ({
  ...(await original<typeof import('./flow')>()),
  repairDraw: async () => {
    throw new TypeError('a record no test foresaw')
  },
  repairAside: async () => {
    throw new TypeError('a record no test foresaw')
  },
  weekState: async () => {
    throw new TypeError('a record no test foresaw')
  },
}))
vi.mock('./evidence', async (original) => ({
  ...(await original<typeof import('./evidence')>()),
  repairEvidence: async () => {
    throw new TypeError('a record no test foresaw')
  },
  repairEvidenceFrom: () => {
    throw new TypeError('a record no test foresaw')
  },
}))

const DAY = '2026-09-18'
const asked = blockReadings('afternoon')

describe('an engine that throws', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    const store = new Map<string, string>([['lm.inStep', '1']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetRepairBreaker()
  })

  it('offers no move at a check-in, writes no offer, and keeps the failure: nothing else draws', async () => {
    expect(engineFailed()).toBe(false)
    await setDayContext(DAY, { unwell: false })
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    expect(await ensureOffer(DAY, 'afternoon', () => 0.3)).toBeNull()
    expect(await db.offers.count()).toBe(0)
    expect(engineFailed()).toBe(true)
    expect(repairFaults()).toEqual({ count: 1, first: DAY, last: DAY, name: 'TypeError' })
  })

  it('offers no replacement after a skip either', async () => {
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    const id = await db.offers.add({ kind: 'block', day: DAY, block: 'afternoon', at: `${DAY}T13:00:00.000Z`, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, [NOTHING]: 0.5 }, skippedAt: null, closedAt: null })
    expect(await skipOffer((await db.offers.get(id)) as Offer)).toBeNull()
    expect(await db.offers.count()).toBe(1)
    expect(engineFailed()).toBe(true)
  })

  it('offers no pickup-time move either', async () => {
    await updateSettings((st) => ({ ...st, week: { ...st.week, pickupTime: '17:00' } }))
    await db.days.clear()
    await ensureDayContext(DAY, await getSettings())
    expect(await ensurePickupOffer(new Date(2026, 8, 18, 16, 0), () => 0.3)).toBeNull()
    expect(await db.offers.count()).toBe(0)
    expect(engineFailed()).toBe(true)
  })

  it('offers no move drawn again when the day changes either', async () => {
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    await db.offers.add({ kind: 'block', day: DAY, block: 'afternoon', at: `${DAY}T13:00:00.000Z`, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, [NOTHING]: 0.5 }, skippedAt: null, closedAt: null })
    await setDayContext(DAY, { atOffice: true })
    expect(await redrawForDay(DAY, 'afternoon', new Date(2026, 8, 18, 14, 0), () => 0.3)).toBeNull()
    expect(await db.offers.count()).toBe(1)
    expect(engineFailed()).toBe(true)
  })

  it('leaves the Brain’s sheet with no test facts, and carries the failure for the Worker’s report', async () => {
    for (let d = 1; d <= 15; d++) {
      const day = `2026-09-${String(d).padStart(2, '0')}`
      await db.checkins.add({ day, block: 'evening', answers: { mood: 3 }, startedAt: `${day}T23:00:00.000Z`, completedAt: `${day}T23:01:00.000Z`, updatedAt: `${day}T23:01:00.000Z`, activeMs: 60_000 })
    }
    const sheet = await factSheet(DAY, new Date(2026, 8, 18, 13, 30))
    expect(sheet.facts.filter((f) => f.id.startsWith('ladder.') || f.id === 'track' || f.id.startsWith('test.') || f.id === 'untested')).toEqual([])
    expect(sheet.engineFault).toEqual({ count: 1, first: DAY, last: DAY, name: 'TypeError' })
  })

  it('lets a passive item ride by its own rule when its test’s read throws at a late mark, with no coin', async () => {
    await startPassiveTest(RECOVERY_GAP, DAY)
    const id = await db.offers.add({ kind: 'block', day: DAY, block: 'evening', at: `${DAY}T23:00:00.000Z`, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId: NOTHING, cardId: null, candidates: [NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { [NOTHING]: 1 }, skippedAt: null, closedAt: null })
    expect(await syncRecoveryGap(DAY, true, () => 0.3)).toBe(true)
    const evening = (await db.offers.get(id)) as Offer
    expect(evening.passiveId).toBe(RECOVERY_GAP)
    expect(evening.passiveCoin).toBeUndefined()
    expect(engineFailed()).toBe(true)
    expect(repairFaults()?.count).toBe(1)
  })
})

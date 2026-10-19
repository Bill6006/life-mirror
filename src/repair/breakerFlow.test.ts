import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { factSheet } from '../brainFlow'
import { db, ensureDayContext, getSettings, saveAnswer, setDayContext, type Offer } from '../db'
import { NOTHING, RECOVERY_GAP } from '../catalogue'
import { ensureOffer, syncRecoveryGap } from '../offerFlow'
import { ENGINE_VERSION } from '../provenance'
import { blockReadings } from '../readings'
import { repairFaults, resetRepairBreaker } from './breaker'
import { repairOn } from './gate'
import { startPassiveTest } from './passive'

// The breaker where it counts (stage R6): a rebuild that throws on a record no test foresaw. Stood in here by a repair whose
// every read throws. The draw still offers a move, by today's engine, as before the switch; the sheet is as it was closed;
// and the trip is kept.

vi.mock('./flow', async (original) => ({
  ...(await original<typeof import('./flow')>()),
  repairDraw: async () => {
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

describe('a rebuild that throws', () => {
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

  it('still offers a move, drawn by today’s engine as before the switch, and closes the repair for the session', async () => {
    expect(repairOn()).toBe(true)
    await setDayContext(DAY, { unwell: false })
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    const offer = (await ensureOffer(DAY, 'afternoon', () => 0.3)) as Offer
    expect(offer).toBeTruthy()
    const stored = (await db.offers.get(offer.id as number)) as Offer
    expect(stored.draw?.engine).toBe(ENGINE_VERSION)
    expect(stored.fits).toBeUndefined()
    expect(stored.week).toBeUndefined()
    expect(stored.propensities).toBeTruthy()
    expect(repairOn()).toBe(false)
    expect(repairFaults()).toEqual({ count: 1, first: DAY, last: DAY, name: 'TypeError' })
  })

  it('leaves the Brain’s sheet as it was with the repair closed: no ladder, no track record, and the tests it may propose', async () => {
    for (let d = 1; d <= 15; d++) {
      const day = `2026-09-${String(d).padStart(2, '0')}`
      await db.checkins.add({ day, block: 'evening', answers: { mood: 3 }, startedAt: `${day}T23:00:00.000Z`, completedAt: `${day}T23:01:00.000Z`, updatedAt: `${day}T23:01:00.000Z`, activeMs: 60_000 })
    }
    const sheet = await factSheet(DAY, new Date(2026, 8, 18, 13, 30))
    expect(sheet.facts.filter((f) => f.id.startsWith('ladder.') || f.id === 'track')).toEqual([])
    expect(sheet.facts.some((f) => f.id === 'untested')).toBe(true)
    expect(repairOn()).toBe(false)
    expect(repairFaults()?.count).toBe(1)
  })

  it('lets a passive item ride by its own rule when its test’s read throws at a late mark, with no coin', async () => {
    await startPassiveTest(RECOVERY_GAP, DAY)
    const id = await db.offers.add({ kind: 'block', day: DAY, block: 'evening', at: `${DAY}T23:00:00.000Z`, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId: NOTHING, cardId: null, candidates: [NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { [NOTHING]: 1 }, skippedAt: null, closedAt: null })
    expect(await syncRecoveryGap(DAY, true, () => 0.3)).toBe(true)
    const evening = (await db.offers.get(id)) as Offer
    expect(evening.passiveId).toBe(RECOVERY_GAP)
    expect(evening.passiveCoin).toBeUndefined()
    expect(repairOn()).toBe(false)
    expect(repairFaults()?.count).toBe(1)
  })
})

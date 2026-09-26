import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { moveById, PASSIVE, RECOVERY_GAP } from './catalogue'
import { db, ensureDayContext, getSettings, saveAnswer, setExtra, type Offer } from './db'
import { ensureOffer, recordOutcome, syncRecoveryGap } from './offerFlow'
import { pickPassive, type TodayState } from './offers'
import { blockReadings } from './readings'

// "Keep the evening after a big social day empty?" states a premise. It is asked only where
// today's own record makes it true: today's evening marked a big social day. Never by rotation,
// never from another day's mark, and never from a church day taken for one; a church day is
// asked about at the evening's chips instead (the final checklist, item 1, 2026-09-25).

const quiet: TodayState = { doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs: new Map(), studyNight: false, withHer: true, churchDay: false, noTimeCeiling: null }
const DAY = '2026-09-18'
const YESTERDAY = '2026-09-17'
const EVENING = { day: DAY, block: 'evening' as const }

describe('the recovery gap states its premise only where today’s record makes it true (the final checklist, item 1)', () => {
  it('never rides along by rotation, however seldom it was offered', () => {
    // Every other passive item offered once and the gap never: by count alone, the rotation would pick it.
    const history = [...PASSIVE].filter((id) => id !== RECOVERY_GAP).map((moveId) => ({ moveId, at: '2026-09-01T12:00:00.000Z' }))
    for (const block of ['afternoon', 'evening'] as const) {
      const p = pickPassive(block, quiet, history)
      expect(p, block).not.toBeNull()
      expect(p?.id, block).not.toBe(RECOVERY_GAP)
    }
  })

  describe('at the evening check-in', () => {
    beforeEach(async () => {
      await db.delete()
      await db.open()
      await ensureDayContext(DAY, await getSettings())
    })
    const asked = blockReadings('evening')
    const eveningMove = async (): Promise<Offer> => {
      for (const id of asked) await saveAnswer(EVENING, asked, id, 3, 500)
      return (await ensureOffer(DAY, 'evening', () => 0.3)) as Offer
    }

    it('carries neither yesterday’s mark nor a church day into today', async () => {
      await setExtra({ day: YESTERDAY, block: 'evening' }, asked, 'bigSocial', true)
      await db.days.update(DAY, { churchDay: true })
      const o = await eveningMove()
      expect(o).not.toBeNull()
      expect(o.passiveId).not.toBe(RECOVERY_GAP)
    })

    it('rides alongside this evening’s move from the moment today is marked, and comes off when the mark is taken back', async () => {
      const o = await eveningMove()
      await setExtra(EVENING, asked, 'bigSocial', true)
      expect(await syncRecoveryGap(DAY, true)).toBe(true)
      expect((await db.offers.get(o.id as number))?.passiveId).toBe(RECOVERY_GAP)
      expect(await db.cards.where('situationKey').equals('passive:evening').filter((c) => c.moveId === RECOVERY_GAP).count()).toBe(1)
      await setExtra(EVENING, asked, 'bigSocial', false)
      expect(await syncRecoveryGap(DAY, false)).toBe(false)
      expect((await db.offers.get(o.id as number))?.passiveId).toBeNull()
    })

    it('keeps what rode alongside as it was answered, and never joins a move it conflicts with', async () => {
      const o = await eveningMove()
      await syncRecoveryGap(DAY, true)
      await recordOutcome({ ...o, passiveId: RECOVERY_GAP }, 'done', null, 'done', EVENING)
      expect(await syncRecoveryGap(DAY, false)).toBe(true)
      expect((await db.offers.get(o.id as number))?.passiveId).toBe(RECOVERY_GAP)
      // A move the gap conflicts with ("see no one" against inviting someone) never carries it.
      const conflict = moveById(RECOVERY_GAP).conflicts[0]
      await db.offers.update(o.id as number, { moveId: conflict, passiveId: null })
      await db.outcomes.clear()
      expect(await syncRecoveryGap(DAY, true)).toBe(false)
      expect((await db.offers.get(o.id as number))?.passiveId).toBeNull()
    })
  })
})

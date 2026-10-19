import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The repair's switch opened for these tests alone: in the app it stays gated until stage R6.
vi.mock('../brainShared', async (importOriginal) => ({ ...(await importOriginal<typeof import('../brainShared')>()), LEARNING_REPAIR: 'open' }))

import { addDays, type Block } from '../blocks'
import { db, ensureDayContext, getSettings, saveAnswer, type Offer } from '../db'
import { ensureOffer, recordOutcome, skipOffer } from '../offerFlow'
import { NOTHING } from '../offers'
import { ENGINE_VERSION } from '../provenance'
import { blockReadings, type Position } from '../readings'
import { answerWeek, repairRecord } from './flow'
import { buildEngine, isDraw, REPAIR_ENGINE } from './record'

// The learning repair's draw in the app (stage R2): its engine, rebuilt from the record, draws at a check-in from the
// day's own candidates, keeps every chance and its engine's version, and its draws replay from the record.

const START = '2026-09-14'

async function answer(day: string, block: Block, value: number): Promise<void> {
  const asked = blockReadings(block)
  for (const id of asked) await saveAnswer({ day, block }, asked, id, value as Position, 500)
}

let seed = 1
const rng = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

describe('the repair draws at a check-in', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    seed = 1
  })

  it('from the day’s candidates, nothing extra always among them, every chance kept, each between 0 and 1, summing to one', async () => {
    const settings = await getSettings()
    const draws: Offer[] = []
    for (let d = 0; d < 6; d++) {
      const day = addDays(START, d)
      await ensureDayContext(day, settings)
      for (const block of ['morning', 'afternoon', 'evening'] as const) {
        await answer(day, block, 1 + ((d + block.length) % 5))
        const offer = await ensureOffer(day, block, rng)
        if (!offer) continue
        draws.push(offer)
        if (offer.moveId !== NOTHING) await recordOutcome(offer, d % 2 ? 'done' : 'no', null, null, { day, block })
      }
    }
    expect(draws.length).toBeGreaterThan(10)
    for (const o of draws) {
      expect(o.draw?.engine).toBe(REPAIR_ENGINE)
      expect(o.candidates).toContain(NOTHING)
      expect(o.candidates).toContain(o.moveId)
      const chances = o.propensities as Record<string, number>
      expect(Object.keys(chances).sort()).toEqual([...o.candidates].sort())
      expect(Object.values(chances).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
      // Nothing extra's floor (0.35) is scaled with every other only when the floors together would pass 0.9.
      for (const p of Object.values(chances)) expect(p > 0 && p < 1).toBe(true)
      expect(chances[NOTHING]).toBeGreaterThan(0.1)
      expect(o.propensity).toBe(chances[o.moveId])
      expect(Object.keys(o.draw?.beliefs ?? {}).sort()).toEqual([...o.candidates].sort())
    }
    // Every one of them replays from the record.
    const built = buildEngine(await repairRecord(), addDays(START, 5))
    expect(built.ids.size).toBe(draws.filter(isDraw).length)
    expect(built.ids.size).toBe(draws.length)
  })

  it('the same moment and the same chance give the same draw', async () => {
    const settings = await getSettings()
    await ensureDayContext(START, settings)
    await answer(START, 'morning', 2)
    seed = 7
    const a = (await ensureOffer(START, 'morning', rng)) as Offer
    await db.offers.clear()
    seed = 7
    const b = (await ensureOffer(START, 'morning', rng)) as Offer
    expect(b.moveId).toBe(a.moveId)
    expect(b.propensities).toEqual(a.propensities)
  })

  it('a replacement after a skip stays today’s, drawn among real moves alone, and is never read as a comparison', async () => {
    const settings = await getSettings()
    await ensureDayContext(START, settings)
    await answer(START, 'morning', 2)
    let first = (await ensureOffer(START, 'morning', rng)) as Offer
    // Draw until a real move comes, so there is something to skip.
    for (let i = 0; first.moveId === NOTHING && i < 20; i++) {
      await db.offers.clear()
      first = (await ensureOffer(START, 'morning', rng)) as Offer
    }
    expect(first.moveId).not.toBe(NOTHING)
    const replacement = (await skipOffer(first)) as Offer
    expect(replacement).not.toBeNull()
    expect(replacement.draw?.engine).toBe(ENGINE_VERSION)
    expect(replacement.candidates).not.toContain(NOTHING)
    expect(isDraw(replacement)).toBe(false)
  })
})

describe('an answer to a learning week', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('lands on the day’s record, even one that did not exist yet, and is read back', async () => {
    expect(await db.days.get(START)).toBeUndefined()
    await answerWeek(START, true)
    expect((await db.days.get(START))?.weekAnswer).toBe('yes')
    await answerWeek(addDays(START, 1), false)
    expect((await repairRecord()).weekAnswers).toEqual(new Map([[START, true], [addDays(START, 1), false]]))
  })

  it('keeps everything else the day’s record held', async () => {
    await ensureDayContext(START, await getSettings())
    await db.days.update(START, { withHer: true, churchDay: true })
    await answerWeek(START, false)
    const day = await db.days.get(START)
    expect(day?.weekAnswer).toBe('notNow')
    expect(day?.withHer).toBe(true)
    expect(day?.churchDay).toBe(true)
  })
})

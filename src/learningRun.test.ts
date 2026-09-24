import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type CheckIn, type Offer } from './db'
import { beliefsFor, evidence, recoveryGapDue, runLearning, tierOfCard } from './learningFlow'
import { NOTHING } from './offers'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// The daily run on the phone: the null offer earns a belief in its situation once it was kept
// to, so the draw can learn to pick it; and the recovery gap is due after a marked big social
// evening or after the church day, from the day's own context.

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], p: Position, over: Partial<Answers> = {}): CheckIn => ({ day, block, answers: { ...allAt(blockReadings(block), p), ...over }, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })

describe('the daily run and the null offer', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('gives the null offer a belief in its situation once it was kept to, and counts it on the Evidence screen', async () => {
    // Three earlier mornings at the middle, so the morning forecast for mood is 3; kept to on the 10th, the morning after reads 4.
    await db.checkins.bulkAdd([ci('2026-09-07', 'morning', 3), ci('2026-09-08', 'morning', 3), ci('2026-09-09', 'morning', 3), ci('2026-09-11', 'morning', 3, { mood: 4 })])
    const offer: Offer = { kind: 'block', day: '2026-09-10', block: 'evening', at: '2026-09-10T20:00:00.000Z', situationKey: 'evening:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: NOTHING, cardId: null, candidates: [NOTHING], coinFlip: true, passiveId: null, whyNot: null, skippedAt: null, closedAt: null }
    const id = await db.offers.add(offer)
    await db.outcomes.add({ offerId: id, moveId: NOTHING, day: '2026-09-11', block: 'morning', at: '', outcome: 'done', why: null, passiveOutcome: null })
    await runLearning('2026-09-11', true)
    const row = await db.beliefs.get(['evening:mood', NOTHING])
    expect(row?.recordN).toBeGreaterThan(0)
    expect(row?.mean).toBeGreaterThan(0)
    const beliefs = await beliefsFor('evening:mood', [NOTHING])
    expect(beliefs(NOTHING).n).toBeGreaterThan(0)
    const ev = await evidence('2026-09-11')
    expect(ev.nothing).toEqual({ offered: 1, done: 1, skipped: 0 })
  })

  it('reads a card’s tier as Evidence shows it, never a fixed word, and nothing for a card that is gone (Part 33)', async () => {
    const id = (await db.cards.add({ createdAt: '2026-09-10T20:00:00.000Z', situationKey: 'evening:mood', block: 'evening', target: 'mood', moveId: 'walk-ten', alternativeId: NOTHING, window: 'nextBlock', worthwhile: 1, origin: 'app' })) as number
    const shown = (await evidence('2026-09-11')).cards.find((c) => c.card.id === id)?.stats.tier
    expect(await tierOfCard(id, '2026-09-11')).toBe(shown)
    expect(shown).toBe('little')
    expect(await tierOfCard(id + 99, '2026-09-11')).toBeNull()
  })

  it('assigns the recovery gap the evening after a marked big social day, and after the church day', async () => {
    expect(await recoveryGapDue('2026-09-12')).toBe(false)
    await db.days.put({ day: '2026-09-11', weekday: 5, withHer: true, studyNight: false, churchDay: true, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '' })
    expect(await recoveryGapDue('2026-09-12')).toBe(true)
    await db.checkins.add({ ...ci('2026-09-13', 'evening', 3), extras: { bigSocial: true } })
    expect(await recoveryGapDue('2026-09-14')).toBe(true)
    expect(await recoveryGapDue('2026-09-15')).toBe(false)
  })
})

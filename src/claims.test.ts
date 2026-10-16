import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { claimsDue, type CardLevel } from './claims'
import { db, wipeEverything, type Card, type Claim } from './db'
import { runLearning } from './learningFlow'
import { ENGINE_VERSION } from './provenance'
import type { CardStats } from './tiers'

// Requirement 15 of the learning design, its record begun with the foundations: every call kept with
// its day and level, to be resolved later; and the wipe, which leaves nothing behind.

const card = (id: number): Card => ({ id, createdAt: '2026-09-01T12:00:00.000Z', situationKey: 'afternoon:stress', block: 'afternoon', target: 'stress', moveId: 'walk-ten', alternativeId: 'nothing', window: 'nextBlock', worthwhile: 1 })
const stats = (cardId: number, tier: CardStats['tier']): CardStats => ({ cardId, window: 'nextBlock', n: { done: 9, alternative: 8, partly: 1, doneAll: 10, alternativeAll: 8 }, interval: { diff: 0.6, lo: 0.1, hi: 1.1, p: 0.02, level: 0.95 } as CardStats['interval'], estimator: 'adaptive' as CardStats['estimator'], slice: null, partlyMean: null, tier, declared: null, replication: null })

describe('the claims log', () => {
  it('keeps a call when a card’s level changes to one, never Little evidence or Unclear alone, and a step back as the call withdrawn', () => {
    const cards = [card(1), card(2)]
    const at = (d: string) => `${d}T23:00:00.000Z`
    const levels = (a: CardStats['tier'], b: CardStats['tier']) => new Map<number, CardLevel>([[1, { tier: a, stats: stats(1, a) }], [2, { tier: b }]])
    let kept: Claim[] = []
    // Day one: little evidence, then unclear: no call.
    expect(claimsDue(cards, levels('little', 'little'), kept, '2026-10-01', at('2026-10-01'))).toEqual([])
    expect(claimsDue(cards, levels('unclear', 'little'), kept, '2026-10-02', at('2026-10-02'))).toEqual([])
    // Day three: the first an early sign; the second, a passive card, unhelpful.
    const three = claimsDue(cards, levels('promising', 'unhelpful'), kept, '2026-10-03', at('2026-10-03'))
    expect(three).toEqual([
      { cardId: 1, moveId: 'walk-ten', situationKey: 'afternoon:stress', target: 'stress', day: '2026-10-03', at: at('2026-10-03'), level: 'promising', interval: { diff: 0.6, lo: 0.1, hi: 1.1, p: 0.02 }, estimator: 'adaptive', n: { done: 9, alternative: 8 }, engine: ENGINE_VERSION },
      { cardId: 2, moveId: 'walk-ten', situationKey: 'afternoon:stress', target: 'stress', day: '2026-10-03', at: at('2026-10-03'), level: 'unhelpful', interval: null, estimator: null, n: { done: 0, alternative: 0 }, engine: ENGINE_VERSION },
    ])
    kept = three.map((c, i) => ({ ...c, id: i + 1 }))
    // Day four: the same levels make no new call.
    expect(claimsDue(cards, levels('promising', 'unhelpful'), kept, '2026-10-04', at('2026-10-04'))).toEqual([])
    // Day five: the early sign holds up; the passive card steps back to little evidence, kept as withdrawn.
    expect(claimsDue(cards, levels('holdsUp', 'little'), kept, '2026-10-05', at('2026-10-05')).map((c) => [c.cardId, c.level])).toEqual([
      [1, 'holdsUp'],
      [2, 'little'],
    ])
  })

  it('keeps nothing from a learning run on an empty record', async () => {
    await db.delete()
    await db.open()
    await runLearning('2026-10-16', true)
    expect(await db.claims.count()).toBe(0)
  })
})

describe('the wipe', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('leaves every table empty, those added since the wipe was written among them', async () => {
    await db.coachAsks.add({ aimId: 1, kind: 'skill', day: '2026-10-16', at: '2026-10-16T12:00:00.000Z', claude: false } as never)
    await db.claims.add({ cardId: 1, moveId: 'walk-ten', situationKey: 'afternoon:stress', target: 'stress', day: '2026-10-16', at: '2026-10-16T23:00:00.000Z', level: 'promising', interval: null, estimator: null, n: { done: 0, alternative: 0 }, engine: ENGINE_VERSION })
    await db.journal.add({ day: '2026-10-16', text: 'Words of the night.', writtenAt: '2026-10-16T23:00:00.000Z', editedAt: null, updatedAt: '2026-10-16T23:00:00.000Z' })
    await wipeEverything()
    for (const t of db.tables) expect(await t.count(), t.name).toBe(0)
  })
})

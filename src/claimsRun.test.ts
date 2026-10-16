import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The claims log's place in the daily learning run (requirement 15): the run's own levels, kept as calls.
// The card evaluation is stood in for, so the run sees an early sign without a long record behind it.
vi.mock('./tiers', async (original) => {
  const real = await original<typeof import('./tiers')>()
  return {
    ...real,
    evaluateCards: (cards: readonly { id?: number; window: string }[]) =>
      cards.map((c) => ({ cardId: c.id as number, window: c.window, n: { done: 9, alternative: 8, partly: 0, doneAll: 9, alternativeAll: 8 }, interval: { diff: 0.7, lo: 0.2, hi: 1.2, p: 0.01, level: 0.95 }, estimator: 'adaptive', slice: null, partlyMean: null, tier: 'promising', declared: null, replication: null })),
  }
})

const { db } = await import('./db')
const { runLearning } = await import('./learningFlow')
const { ENGINE_VERSION } = await import('./provenance')

describe('the daily learning run keeps its calls', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('keeps an early sign once, with its day, interval and engine, and not again while it stands', async () => {
    const id = await db.cards.add({ createdAt: '2026-09-01T12:00:00.000Z', situationKey: 'afternoon:stress', block: 'afternoon', target: 'stress', moveId: 'walk-ten', alternativeId: 'nothing', window: 'nextBlock', worthwhile: 1 })
    await runLearning('2026-10-16', true)
    expect(await db.claims.toArray()).toMatchObject([{ cardId: id, moveId: 'walk-ten', day: '2026-10-16', level: 'promising', interval: { diff: 0.7, lo: 0.2, hi: 1.2, p: 0.01 }, estimator: 'adaptive', n: { done: 9, alternative: 8 }, engine: ENGINE_VERSION }])
    await runLearning('2026-10-17', true)
    expect(await db.claims.count()).toBe(1)
  })
})

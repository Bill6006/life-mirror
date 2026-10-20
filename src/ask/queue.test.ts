import { describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from '../blocks'
import { moveById, NOTHING } from '../catalogue'
import { SYNCED_STORES } from '../cloudOutbox'
import type { CheckIn, DayContext, Offer, Outcome } from '../db'
import { evidenceOf } from '../repair/evidence'
import { coin, START } from '../repair/fixtures'
import { builtThrough, type RepairRecord } from '../repair/record'
import { INGREDIENT_IDS } from '../score'

// "What should we test next?" reads the queue (Ask Life Mirror, stage A1, 2026-10-19): the next tests it would take as
// places free, by its own score and rule, one per move, read without changing it. And Ask's two stores are synced.

/**
 * Three moves fitting every check-in, a fair draw each time between the walk and nothing extra: the queue's two places
 * fill, and a third move's tests wait. `every` adds moves fitting every check-in; `late` adds moves fitting only the last
 * days of the record.
 */
function threeMoves(days: number, every: readonly string[] = [], late: { moves: readonly string[]; days: number } = { moves: [], days: 0 }): RepairRecord {
  const base = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock', 'nap-ten|energy|nextBlock', 'nap-ten|focus|nextBlock', 'message-a-friend|loneliness|nextBlock', 'message-a-friend|mood|nextBlock']
  const keysOf = (ids: readonly string[]) => ids.flatMap((id) => moveById(id).targets.map((t) => `${id}|${t.reading}|${t.window}`))
  const checkins: CheckIn[] = []
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  const dayRecs: DayContext[] = []
  for (let d = 0; d < days; d++) {
    const day = addDays(START, d)
    const extra = [...every, ...(d >= days - late.days ? late.moves : [])]
    const candidates = ['walk-ten', 'nap-ten', 'message-a-friend', ...extra, NOTHING]
    const share = 1 / candidates.length
    const fits = [...base, ...keysOf(extra)]
    dayRecs.push({ day, weekday: 1, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '', changed: false, createdAt: '' } as DayContext)
    BLOCKS.forEach((block, b) => {
      const a = Object.fromEntries(INGREDIENT_IDS.map((r, i) => [r, 1 + ((d * 3 + b + i) % 5)])) as CheckIn['answers']
      checkins.push({ day, block, asked: Object.keys(a) as never, startedAt: 'x', completedAt: 'x', updatedAt: 'x', answers: a, activeMs: 0 })
      const id = offers.length + 1
      const moveId = coin(d * 3 + b) ? 'walk-ten' : NOTHING
      offers.push({ id, kind: 'block', day, block, at: 'x', situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates, coinFlip: false, passiveId: null, whyNot: null, propensity: share, propensities: Object.fromEntries(candidates.map((c) => [c, share])), skippedAt: null, closedAt: null, seenAt: 'x', fits })
      outcomes.push({ offerId: id, moveId, day, block, at: 'x', outcome: 'done', why: null, passiveOutcome: null })
    })
  }
  return { checkins, offers, outcomes, days: dayRecs, weekAnswers: new Map() }
}

describe('the next tests the queue would take', () => {
  it('names a waiting test whose move is not being run, one per move, and changes nothing by reading', () => {
    const built = builtThrough(threeMoves(20), addDays(START, 20))
    const running = built.engine.runningKeys()
    expect(running).toHaveLength(2)
    const busy = new Set(running.map((k) => k.split('|')[0]))
    const next = built.engine.queueNext(2)
    expect(next.length).toBeGreaterThan(0)
    for (const t of next) expect(busy.has(t.moveId), t.key).toBe(false)
    expect(new Set(next.map((t) => t.moveId)).size).toBe(next.length)
    // Read again, the same; and the queue is as it was.
    expect(built.engine.queueNext(2).map((t) => t.key)).toEqual(next.map((t) => t.key))
    expect(built.engine.runningKeys()).toEqual(running)
    expect(next.every((t) => t.queuedAt === null)).toBe(true)
    // The repair's read carries them, as "What should we test next?" lays them out.
    expect(evidenceOf(built.engine).waiting.map((w) => w.key)).toEqual(next.map((t) => t.key))
  })

  it('names one test per move, and never one whose move fitted on fewer than four of the last 28 days, as the queue takes them', () => {
    // A fourth move fitting every check-in, on two readings, so one waiting move has two tests that could enter; and a fifth
    // fitting only the last three days, whose tests wait but may not enter.
    const built = builtThrough(threeMoves(20, ['stretch-five'], { moves: ['name-it'], days: 3 }), addDays(START, 20))
    const tests = [...built.engine.testsNow().values()]
    const all = built.engine.queueNext(10)
    const stretch = tests.filter((t) => t.moveId === 'stretch-five' && t.queuedAt === null && t.eligibleDays.length >= 4)
    expect(stretch.length).toBeGreaterThanOrEqual(2)
    expect(all.filter((t) => t.moveId === 'stretch-five')).toHaveLength(1)
    expect(new Set(all.map((t) => t.moveId)).size).toBe(all.length)
    const rare = tests.filter((t) => t.moveId === 'name-it' && t.queuedAt === null)
    expect(rare.length).toBeGreaterThan(0)
    expect(rare.every((t) => t.eligibleDays.length < 4)).toBe(true)
    expect(all.map((t) => t.moveId)).not.toContain('name-it')
  })
})

describe('Ask’s record', () => {
  it('is synced: its threads and their questions go to the owner’s own cloud copy, like the rest of the record', () => {
    expect(SYNCED_STORES).toEqual(expect.arrayContaining(['askThreads', 'askTurns']))
    // And the notes kept from it (stage A3).
    expect(SYNCED_STORES).toContain('notes')
  })
})

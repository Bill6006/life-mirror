import { describe, expect, it } from 'vitest'
import { skillSessions } from './coachShared'
import type { CheckIn, DayContext, Offer, Outcome } from './db'
import { observations } from './learning'
import { peopleRepToday } from './pathStage'
import { carriedByContext } from './people'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// When a move happened is the offer's: its day, and the block it was offered for ("Before
// pickup" is drawn inside the ninety minutes before pickup). When the owner reported it is the
// outcome's: the check-in it was answered at, and the moment of the tap. "Before pickup · Done ·
// 9:43 PM" shows the report; nothing that reasons about when a move happened reads it (the final
// checklist, item 7, 2026-09-25).

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], answers: Answers): CheckIn => ({ day, block, answers, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })
const offer = (id: number, kind: Offer['kind'], day: string, block: Offer['block'], moveId: string, target: ReadingId, extra: Partial<Offer> = {}): Offer => ({ id, kind, day, block, at: `${day}T20:05:00.000Z`, situationKey: kind === 'pickup' ? 'pickup:energy' : `${block}:${target}`, target, stance: '', band: '', reading: 0, moveId, cardId: null, candidates: [moveId], coinFlip: true, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, ...extra })
/** Reported late: at the evening check-in at 9:43 PM, or the next morning. */
const reported = (offerId: number, moveId: string, day: string, block: Outcome['block'], at: string): Outcome => ({ offerId, moveId, day, block, at, outcome: 'done', why: null, passiveOutcome: null })

const DAY = '2026-09-25'
const NEXT = '2026-09-26'
const LATE = '2026-09-26T01:43:00.000Z' // 9:43 PM on the 25th, New York time

describe('reporting time is never read as the time a move happened (the final checklist, item 7)', () => {
  it('reads a move before pickup over the block after it was offered, however late it was reported', () => {
    const pickup = offer(1, 'pickup', DAY, 'afternoon', 'walk-ten', 'energy')
    const priorEvenings = ['2026-09-22', '2026-09-23', '2026-09-24'].map((d) => ci(d, 'evening', allAt(blockReadings('evening'), 3)))
    const evening = ci(DAY, 'evening', { ...allAt(blockReadings('evening'), 3), energy: 4 })
    // Reported at the evening check-in, 9:43 PM, and the same move reported the next morning instead.
    for (const answer of [reported(1, 'walk-ten', DAY, 'evening', LATE), reported(1, 'walk-ten', NEXT, 'morning', '2026-09-26T13:05:00.000Z')]) {
      const [o] = observations([...priorEvenings, evening], [pickup], [answer])
      expect(o, `reported ${answer.day} ${answer.block}`).toMatchObject({ day: DAY, block: 'afternoon', window: 'nextBlock', arm: 'done' })
      expect(o.effect).toBeCloseTo(1, 10)
    }
  })

  it('counts an in-person rep in the block it was offered for, not the block it was reported in', () => {
    const rep = offer(2, 'block', DAY, 'afternoon', 'greet-by-name', 'mood')
    const ctx: DayContext = { day: DAY } as DayContext
    const carried = carriedByContext([rep], [reported(2, 'greet-by-name', DAY, 'evening', LATE)], [ctx], NEXT)
    expect([...carried.keys()].every((k) => k.endsWith('|afternoon'))).toBe(true)
    expect([...carried.keys()].some((k) => k.endsWith('|evening'))).toBe(false)
  })

  it('makes a People rep the day it was started, whichever day it was answered', () => {
    const rep = offer(3, 'step', DAY, 'afternoon', 'greet-by-name', 'mood', { paths: ['social'], situationKey: 'aim:path:social' })
    const answer = reported(3, 'greet-by-name', NEXT, 'morning', '2026-09-26T13:05:00.000Z')
    expect(peopleRepToday([rep], [answer], DAY).done?.moveId).toBe('greet-by-name')
    expect(peopleRepToday([rep], [answer], NEXT).done).toBeNull()
  })

  it('dates a practice session by the day it began, not the day it was marked', () => {
    const session = offer(4, 'study', DAY, 'evening', 'skill:7', 'focus')
    const [s] = skillSessions(7, null, [session], [reported(4, 'skill:7', NEXT, 'morning', '2026-09-26T13:05:00.000Z')])
    expect(s.day).toBe(DAY)
  })
})

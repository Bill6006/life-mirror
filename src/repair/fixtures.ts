import { addDays, BLOCKS } from '../blocks'
import { NOTHING } from '../catalogue'
import type { CheckIn, DayContext, Offer, Outcome } from '../db'
import { INGREDIENT_IDS } from '../score'
import type { RepairRecord } from './record'

// Stand-in records for the learning repair's tests (stage R4): days of check-ins, each with a draw between the walk and
// nothing extra at even chances. Invented data only, never the owner's.

export const START = '2026-09-01'
/** A fair coin for a slot, the same every run: the slot's number mixed (mulberry32's step), so no pattern runs through it. */
export function coin(slot: number): boolean {
  let a = (slot * 7919 + 13) | 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296 < 0.5
}
export const FITS = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']

/**
 * Days of check-ins, each with a draw between the walk and nothing extra at even chances, done when it was the walk. With
 * `effect`, stress reads lowest at the check-in after a walk and highest after nothing extra; from `flipAt` on, the other
 * way round.
 */
export function walkRecord(days: number, effect = false, flipAt = Infinity): RepairRecord {
  const checkins: CheckIn[] = []
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  const dayRecs: DayContext[] = []
  let last: string | null = null
  for (let d = 0; d < days; d++) {
    const day = addDays(START, d)
    dayRecs.push({ day, weekday: 1, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '', changed: false, createdAt: '' } as DayContext)
    BLOCKS.forEach((block, b) => {
      const a = Object.fromEntries(INGREDIENT_IDS.map((r, i) => [r, 1 + ((d * 3 + b + i) % 5)])) as CheckIn['answers']
      if (effect && last !== null) a.stress = ((last === 'walk-ten') === d < flipAt ? 1 : 5) as never
      checkins.push({ day, block, asked: Object.keys(a) as never, startedAt: 'x', completedAt: 'x', updatedAt: 'x', answers: a, activeMs: 0 })
      const id = offers.length + 1
      // A fair coin per check-in, fixed by its slot: the move is never foretold by the readings before it.
      const moveId = coin(d * 3 + b) ? 'walk-ten' : NOTHING
      offers.push({ id, kind: 'block', day, block, at: 'x', situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, [NOTHING]: 0.5 }, skippedAt: null, closedAt: null, seenAt: 'x', fits: FITS })
      outcomes.push({ offerId: id, moveId, day, block, at: 'x', outcome: 'done', why: null, passiveOutcome: null })
      last = moveId
    })
  }
  return { checkins, offers, outcomes, days: dayRecs, weekAnswers: new Map() }
}

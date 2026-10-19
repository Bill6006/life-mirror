import { db, isComplete, type CheckIn } from '../db'
import type { Belief } from '../learning'
import { NOTHING, type Situation, type TodayState } from '../offers'
import { pMean, type OfferMadeB } from './engine'
import { answeredOf, buildEngine, contextOf, type RepairRecord } from './record'
import type { Rng } from './stats'
import { windowOfMove } from './world'

// The learning repair in the app (stage R2): the record read whole, the engine rebuilt from it, and a draw made at a
// check-in from the day's own candidates. Behind LEARNING_REPAIR (brainShared.ts) until stage R6 opens it.

/** The app's whole record as the repair reads it. The owner's answers to a learning week come with stage R3. */
export async function repairRecord(): Promise<RepairRecord> {
  const [checkins, offers, outcomes, days] = await Promise.all([db.checkins.toArray(), db.offers.toArray(), db.outcomes.toArray(), db.days.toArray()])
  return { checkins, offers, outcomes, days, weekAnswers: new Map() }
}

export interface RepairDraw {
  offer: OfferMadeB
  /** Each candidate's belief at the draw, as the draw record keeps it (requirement 2): the test's on the moment's reading. */
  belief: (id: string) => Belief
}

/**
 * The repair's draw at a complete check-in: the engine rebuilt through the moment before it, drawing from the
 * candidates the app's own screens allow, with every chance kept.
 */
export function repairDrawFrom(r: RepairRecord, checkin: CheckIn, situation: Situation, t: TodayState, candidates: readonly string[], rng: Rng): RepairDraw {
  const built = buildEngine(r, checkin.day, checkin.block, rng)
  const morning = r.checkins.find((c) => c.day === checkin.day && c.block === 'morning' && isComplete(c))
  const context = contextOf(checkin.day, r.days.find((x) => x.day === checkin.day), morning)
  const offer = built.engine.drawAt(answeredOf(checkin), built.index(checkin.day), context, situation, t, candidates)
  const tests = built.engine.testsNow()
  const belief = (id: string): Belief => {
    if (id === NOTHING) return { mean: 0, sd: 0, n: 0 }
    const test = tests.get(`${id}|${situation.target}|${windowOfMove(id, situation.target)}`)
    if (!test) return { mean: 0, sd: 1, n: 0 }
    const m = pMean(test.post)
    const v = test.post.w.reduce((a, w, k) => a + w * (test.post.s[k] ** 2 + test.post.m[k] ** 2), 0) - m * m
    return { mean: m, sd: Math.sqrt(Math.max(0, v)), n: test.n1 + test.n0 }
  }
  return { offer, belief }
}

/** The repair's draw from the record as it stands. */
export async function repairDraw(checkin: CheckIn, situation: Situation, t: TodayState, candidates: readonly string[], rng: Rng): Promise<RepairDraw> {
  return repairDrawFrom(await repairRecord(), checkin, situation, t, candidates, rng)
}

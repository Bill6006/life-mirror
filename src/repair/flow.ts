import { db, ensureDayContext, getSettings, isComplete, type CheckIn } from '../db'
import type { Belief } from '../learning'
import { NOTHING, type Situation, type TodayState } from '../offers'
import { pMean, REPAIR, type OfferMadeB } from './engine'
import { answeredOf, buildEngine, builtThrough, contextOf, type RepairRecord } from './record'
import type { Rng } from './stats'
import { windowOfMove } from './world'

// The learning repair in the app (stage R2): the record read whole, the engine rebuilt from it, and a draw made at a
// check-in from the day's own candidates. Behind LEARNING_REPAIR (brainShared.ts) until stage R6 opens it.

/** The app's whole record as the repair reads it, the owner's answers to a learning week among it (stage R3). */
export async function repairRecord(): Promise<RepairRecord> {
  const [checkins, offers, outcomes, days] = await Promise.all([db.checkins.toArray(), db.offers.toArray(), db.outcomes.toArray(), db.days.toArray()])
  return { checkins, offers, outcomes, days, weekAnswers: new Map(days.filter((d) => d.weekAnswer).map((d) => [d.day, d.weekAnswer === 'yes'])) }
}

/** Where the learning week stands today (stage R3). */
export interface WeekState {
  /** An invitation to a learning week stands today, unanswered. */
  invitation: boolean
  /** The running week's day, 1 to 7, or null while none runs. */
  weekDay: number | null
}

export function weekStateFrom(r: RepairRecord, today: string): WeekState {
  const built = builtThrough(r, today)
  const d = built.index(today)
  const until = built.engine.weekUntil
  const length = REPAIR.lw?.length ?? 7
  return { invitation: built.engine.invitationDue === d, weekDay: d < until ? d - (until - length) + 1 : null }
}

export async function weekState(today: string): Promise<WeekState> {
  return weekStateFrom(await repairRecord(), today)
}

/** The owner's answer to today's invitation, kept on the day's own record and synced with it; the record is made first if the day has none yet, so a tap is never lost. */
export async function answerWeek(today: string, yes: boolean): Promise<void> {
  await ensureDayContext(today, await getSettings())
  await db.transaction('rw', db.days, async () => {
    const existing = await db.days.get(today)
    if (!existing) return
    await db.days.put({ ...existing, weekAnswer: yes ? 'yes' : 'notNow', updatedAt: new Date().toISOString() })
  })
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

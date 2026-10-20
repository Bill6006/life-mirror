import { db, ensureDayContext, getSettings, isComplete, type CheckIn } from '../db'
import { NOTHING, type Situation, type TodayState } from '../offers'
import type { DrawBelief } from '../provenance'
import type { ReadingId } from '../readings'
import { pMean, REPAIR, type OfferMadeB, type Test } from './engine'
import { answeredOf, buildEngine, builtThrough, contextOf, type RepairRecord } from './record'
import type { Rng } from './stats'
import { windowOfMove } from './world'

// The learning repair in the app (stage R2): the record read whole, the engine rebuilt from it, and a draw made at a
// check-in from the day's own candidates; and since the old engine was retired (2026-10-20), the replacement after a skip
// and the pickup-time move, drawn aside.

/** The app's whole record as the repair reads it, the owner's answers to a learning week among it (stage R3). */
export async function repairRecord(): Promise<RepairRecord> {
  const [checkins, offers, outcomes, days, turns] = await Promise.all([db.checkins.toArray(), db.offers.toArray(), db.outcomes.toArray(), db.days.toArray(), db.askTurns.toArray()])
  // Ask Life Mirror's asked marks (stage A3): keys and days alone; nothing else of a question reaches the engine.
  const asked = turns.flatMap((t) => (t.asked ?? []).map((m) => ({ key: m.key, day: m.day })))
  return { checkins, offers, outcomes, days, weekAnswers: new Map(days.filter((d) => d.weekAnswer).map((d) => [d.day, d.weekAnswer === 'yes'])), ...(asked.length ? { asked } : {}) }
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
  belief: (id: string) => DrawBelief
}

/** Each candidate's belief on a reading, as a draw record keeps it: its test's, at that reading's own window. */
function beliefOn(tests: ReadonlyMap<string, Test>, target: ReadingId): (id: string) => DrawBelief {
  return (id) => {
    if (id === NOTHING) return { mean: 0, sd: 0, n: 0 }
    const test = tests.get(`${id}|${target}|${windowOfMove(id, target)}`)
    if (!test) return { mean: 0, sd: 1, n: 0 }
    const m = pMean(test.post)
    const v = test.post.w.reduce((a, w, k) => a + w * (test.post.s[k] ** 2 + test.post.m[k] ** 2), 0) - m * m
    return { mean: m, sd: Math.sqrt(Math.max(0, v)), n: test.n1 + test.n0 }
  }
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
  return { offer, belief: beliefOn(built.engine.testsNow(), situation.target) }
}

/** A move the new engine drew outside the comparisons, with what it knew: the record keeps both (requirement 2). */
export interface RepairAside {
  moveId: string
  chances: Record<string, number>
  /** The candidates it drew among, after its day rule. */
  candidates: string[]
  belief: (id: string) => DrawBelief
}

/**
 * A draw outside the comparisons (the owner's requirement of 2026-10-20): a replacement after a skip, or the pickup-time
 * move. The engine is rebuilt through the whole day so far, the moment's own draw included, so its day rule sees every
 * move offered today. Null when no candidate is left.
 */
export function repairAsideFrom(r: RepairRecord, day: string, target: ReadingId, candidates: readonly string[], rng: Rng): RepairAside | null {
  const built = buildEngine(r, day, null, rng)
  const made = built.engine.drawAside(built.index(day), target, candidates)
  if (!made) return null
  return { moveId: made.moveId, chances: made.chances, candidates: Object.keys(made.chances), belief: beliefOn(built.engine.testsNow(), target) }
}

/** The same, from the record as it stands. */
export async function repairAside(day: string, target: ReadingId, candidates: readonly string[], rng: Rng): Promise<RepairAside | null> {
  return repairAsideFrom(await repairRecord(), day, target, candidates, rng)
}

/** The repair's draw from the record as it stands. */
export async function repairDraw(checkin: CheckIn, situation: Situation, t: TodayState, candidates: readonly string[], rng: Rng): Promise<RepairDraw> {
  return repairDrawFrom(await repairRecord(), checkin, situation, t, candidates, rng)
}

import { addDays, BLOCKS, daysBetween, parseDay, type Block } from '../blocks'
import { NOTHING, type Window } from '../catalogue'
import { isComplete, setAside, type CheckIn, type DayContext as AppDay, type Offer, type Outcome } from '../db'
import { faultForTests } from './breaker'
import { EngineB, IN_APP, type BConfig, type CallB } from './engine'
import type { ReadingId } from '../readings'
import type { Rng } from './stats'
import type { Answered, DayContext, Response } from './world'

// The learning repair, read from the app's own record (stage R2): every complete check-in observed in order, every draw
// replayed with the chances it was made with, every answer given to it. The engine's state is a function of the record
// alone, so rebuilding it gives the same beliefs, calls and queue every time.

/** The version every value the repair derives carries (requirement 2). */
export const REPAIR_ENGINE = 'repair-1'

/** Short sleep, as the draw's record reads it (facts.ts's SHORT_SLEEP): the morning's sleep anchor at 2 or below. */
export const SHORT_SLEEP_ANCHOR = 2

export interface RepairRecord {
  checkins: readonly CheckIn[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  days: readonly AppDay[]
  /** The owner's answers to the learning week's invitations, by day: true for Yes, false for Not now. */
  weekAnswers: ReadonlyMap<string, boolean>
  /** Ask Life Mirror's asked marks (stage A3): a test's key and the day it was asked about, and nothing else of a question. */
  asked?: readonly { key: string; day: string }[]
}

export interface Built {
  engine: EngineB
  /** The record's first day, the engine's day 0. */
  epoch: string
  /** The engine's day index of a day. */
  index: (day: string) => number
  /** Each replayed draw's id in the engine, by the app's offer id. */
  ids: Map<number, number>
}

/**
 * An offer the engine reads as a randomized decision: a check-in's own draw, every candidate's chance recorded, nothing
 * extra among the candidates. A move set aside when the day changed was never offered; a replacement after a skip is
 * drawn among real moves alone, so it compares nothing.
 */
export function isDraw(o: Offer): boolean {
  return o.kind === 'block' && o.id !== undefined && !!o.propensities && o.candidates.includes(NOTHING) && !setAside(o)
}

/** A complete check-in as the engine reads it. */
export function answeredOf(c: CheckIn): Answered {
  return { day: c.day, block: c.block, answers: c.answers }
}

/** The day's context as the engine reads it: the draw record's own (provenance.ts), with the stress world's names. */
export function contextOf(day: string, rec: AppDay | undefined, morning: CheckIn | undefined): DayContext {
  const weekday = parseDay(day).getDay()
  const slept = morning?.answers.sleepHours
  return {
    day,
    weekday,
    weekend: weekday === 0 || weekday === 6,
    office: Boolean(rec?.atOffice),
    church: Boolean(rec?.churchDay),
    studyNight: Boolean(rec?.studyNight),
    withHer: Boolean(rec?.withHer),
    daycare: rec?.pickupTime !== null && rec?.pickupTime !== undefined,
    shortSleep: slept !== undefined && slept <= SHORT_SLEEP_ANCHOR,
    away: Boolean(rec?.awayFromHome),
  }
}

/**
 * What became of a draw, as far as the record knows: seen when its card was on screen long enough to read, or when an
 * answer says so (answers from before the seen mark count as seen once given); a skip is a seen No, except "Not home",
 * which was never applicable and stays out of the comparison (requirement 13).
 */
export function responseOf(o: Offer, outcome: Outcome | undefined): Response {
  if (o.skippedAt !== null) {
    if (o.skipReason === 'notHome') return { seen: false, did: null, why: null, answered: false }
    return { seen: true, did: 'no', why: null, answered: true }
  }
  const answered = outcome !== undefined && outcome.outcome !== null
  const seen = o.seenAt !== undefined || outcome?.seen === true || (answered && outcome?.seen === undefined)
  if (!seen) return { seen: false, did: null, why: null, answered }
  return { seen: true, did: answered ? (outcome?.outcome ?? null) : null, why: outcome?.why ?? null, answered }
}

/**
 * What became of a passive item's coin (stage R4b): seen as the card it rode on was seen; when it rode alongside, done or not
 * as the answer about it says; when it did not, nothing to answer.
 */
export function alongsideResponseOf(o: Offer, outcome: Outcome | undefined): Response {
  const card = responseOf(o, outcome)
  if (!o.passiveCoin?.rode) return { seen: card.seen, did: null, why: null, answered: card.seen }
  const did = outcome?.passiveOutcome ?? null
  return { seen: card.seen, did, why: null, answered: did !== null }
}

const slotKey = (day: string, block: Block) => `${day}|${block}`

/**
 * The engine rebuilt from the record, through a moment: every day's learning run, then each complete check-in observed
 * in its order and each draw made at it replayed and answered. With `stopBefore`, the check-in at that slot is observed
 * and its draw, if any, is left out: the state a new draw at that slot is made from.
 */
export function buildEngine(r: RepairRecord, through: string, stopBefore: Block | null = null, rng: Rng = Math.random, cfg: BConfig = IN_APP, onLearn: ((d: number, calls: CallB[]) => void) | null = null, epochIn: string | null = null, declared: { moveId: string; target: ReadingId; window: Window }[] = []): Built {
  if (faultForTests()) throw new TypeError('a stand-in for a record no test foresaw')
  const complete = r.checkins.filter((c) => isComplete(c) && c.day <= through).sort((a, b) => (a.day === b.day ? BLOCKS.indexOf(a.block) - BLOCKS.indexOf(b.block) : a.day < b.day ? -1 : 1))
  const epoch = epochIn ?? complete[0]?.day ?? through
  const index = (day: string) => daysBetween(epoch, day)
  const dayRec = new Map(r.days.map((d) => [d.day, d]))
  const away = new Set(r.days.filter((d) => d.awayFromHome && d.day >= epoch).map((d) => index(d.day)))
  // Every mark as it is: the engine counts one only from its own day on (askedLift).
  const asked = (r.asked ?? []).map((m) => ({ key: m.key, d: index(m.day) }))
  const engine = new EngineB(rng, cfg, away, declared, null, (d) => r.weekAnswers.get(addDays(epoch, d)) ?? null, (d) => addDays(epoch, d), asked)
  // Moves offered outside the comparisons (a replacement after a skip, the pickup-time move): noted for their day's rule
  // alone, never read as a decision.
  for (const o of r.offers) if ((o.kind === 'block' || o.kind === 'pickup') && !isDraw(o) && !setAside(o) && o.moveId !== NOTHING && o.day >= epoch && o.day <= through) engine.noteAside(index(o.day), o.moveId)
  const checkinAt = new Map(complete.map((c) => [slotKey(c.day, c.block), c]))
  const drawAt = new Map<string, Offer>()
  for (const o of [...r.offers].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) if (isDraw(o) && !drawAt.has(slotKey(o.day, o.block))) drawAt.set(slotKey(o.day, o.block), o)
  const outcomeOf = new Map(r.outcomes.map((o) => [o.offerId, o]))
  const ids = new Map<number, number>()
  const last = index(through)
  for (let d = 0; d <= last; d++) {
    const calls = engine.learn(d)
    if (onLearn) onLearn(d, calls)
    const day = addDays(epoch, d)
    const context = contextOf(day, dayRec.get(day), checkinAt.get(slotKey(day, 'morning')))
    for (const b of BLOCKS) {
      const c = checkinAt.get(slotKey(day, b))
      if (!c) continue
      const a = answeredOf(c)
      engine.observe(a, d, context)
      if (d === last && b === stopBefore) return { engine, epoch, index, ids }
      const o = drawAt.get(slotKey(day, b))
      if (!o) continue
      const id = engine.replayOffer(a, d, context, o.target, o.candidates, o.moveId, o.propensities ?? {}, o.fits ?? [], o.week ?? false)
      ids.set(o.id as number, id)
      engine.respond(id, responseOf(o, outcomeOf.get(o.id as number)))
      // Stage R4b: a passive item's fair coin at the same moment, read as a randomized decision for the item's own test.
      if (o.passiveCoin) {
        const coin = engine.replayAlongside(a, d, context, o.passiveCoin.moveId, o.passiveCoin.rode, o.passiveCoin.chance)
        engine.respond(coin, alongsideResponseOf(o, outcomeOf.get(o.id as number)))
      }
    }
  }
  return { engine, epoch, index, ids }
}

/** Two 32-bit FNV-1a hashes of a string and its length, joined: a record's fingerprint, and Ask's evidence version. The same text, the same digest. */
export function fingerprint(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15)
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}.${text.length}`
}

let cached: { key: string; built: Built } | null = null

/**
 * The engine rebuilt through a day, for reading only (the week's line, Evidence, the move card): kept while the record
 * and the day stand still, so the screens that read it at once rebuild it once. Never drawn from, since a draw changes
 * the engine: a draw rebuilds its own (`buildEngine` with the slot to stop before).
 */
export function builtThrough(r: RepairRecord, through: string): Built {
  if (faultForTests()) throw new TypeError('a stand-in for a record no test foresaw')
  const key = `${through}|${fingerprint(JSON.stringify([r.checkins, r.offers, r.outcomes, r.days, [...r.weekAnswers], r.asked ?? []]))}`
  if (cached?.key === key) return cached.built
  const built = buildEngine(r, through)
  cached = { key, built }
  return built
}

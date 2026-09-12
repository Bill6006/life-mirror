import { hasMove, isParked, isProposed, moveById, movesInFamily, OBSERVED_ONLY, PASSIVE, type Counter, type Move } from './catalogue'
import type { Aim, AimKind, Offer, Outcome, OutcomeWhy, RungMark, Skill, StudyNight, StudyReason, Win } from './db'
import { nextStep, parseRungId, rungStep, sittingOf, type Sitting } from './ladder'
import { NOTHING } from './offers'

// Aims, the pure part: which step protects each commitment, what blocks it and what unblocks it,
// follow-through as counts, and the dated counts under your direction sentence. Nothing here
// grades, ranks or streaks.

export const AIM_KINDS: readonly AimKind[] = ['certification', 'person', 'practice']

/** Where a person's or a practice's step is picked from. The certification's comes from the ladder. */
export const STEP_FAMILIES: Record<AimKind, readonly string[]> = {
  certification: ['study'],
  person: ['people'],
  practice: ['faith', 'movement', 'steadying'],
}

/** With an empty ladder, the certification's step is the catalogue's own "write the exact next study step". */
export const EMPTY_LADDER_STEP = 'study-plan-next'

export function aimKey(kind: AimKind): string {
  return `aim:${kind}`
}

export function unblockKey(kind: AimKind): string {
  return `aim:${kind}:unblock`
}

/** The moves a person or a practice can take as its step: the family's active moves, never bedtime, never a passive item. */
export function stepChoices(kind: AimKind): Move[] {
  return STEP_FAMILIES[kind].flatMap((f) => movesInFamily(f)).filter((m) => !isProposed(m) && !isParked(m) && !OBSERVED_ONLY.has(m.id) && !PASSIVE.has(m.id))
}

/** The protected next step of a commitment, one line sized to one sitting. */
export function stepFor(aim: Aim, skills: readonly Skill[], marks: readonly RungMark[]): Sitting {
  if (aim.kind === 'certification') {
    const next = nextStep(skills, marks)
    return next ? rungStep(next.skill, next.rung) : sittingOf(moveById(EMPTY_LADDER_STEP))
  }
  const id = aim.stepMoveId && hasMove(aim.stepMoveId) ? aim.stepMoveId : stepChoices(aim.kind)[0].id
  return sittingOf(moveById(id))
}

export type BlockReason = OutcomeWhy | StudyReason | 'unsaid'

/**
 * What blocked a commitment last time, if its most recent step ended in No or Not now. A
 * later start clears it. Unblock offers themselves are not steps and do not count here.
 */
export function blockedBy(aim: Aim, offers: readonly Offer[], outcomes: readonly Outcome[], nights: readonly StudyNight[]): BlockReason | null {
  const key = aimKey(aim.kind)
  const own = offers.filter((o) => o.situationKey === key || (aim.kind === 'certification' && o.kind === 'study'))
  if (!own.length) return null
  const latest = own.reduce((a, b) => (a.at > b.at ? a : b))
  if (latest.kind === 'study' && latest.skippedAt) {
    const night = nights.find((n) => n.offerId === latest.id)
    return night?.reason ?? 'unsaid'
  }
  if (latest.skippedAt) return 'unsaid'
  const outcome = outcomes.find((x) => x.offerId === latest.id)
  if (outcome?.outcome === 'no') return outcome.why ?? 'unsaid'
  return null
}

/** Unblock, don't downgrade: the finishing move that removes the obstacle, never an easier aim. */
export function unblockFor(why: BlockReason): Move {
  switch (why) {
    case 'noTime':
      return moveById('two-minute-rule')
    case 'tooMuch':
      return moveById('finish-one-thing')
    default:
      return moveById('smallest-next-step')
  }
}

export interface Tally {
  started: number
  finished: number
}

export interface FollowThrough {
  moves: Tally
  steps: Tally
  wins: Tally
  all: Tally
}

function tally(): Tally {
  return { started: 0, finished: 0 }
}

/**
 * Follow-through as counts only: started and finished, across moves (done or partly is a
 * start; done is a finish), steps (a Resume or Start it is a start; done is a finish) and
 * minimum wins (written is a start; done is a finish). "Nothing today" is not a start.
 */
export function followThrough(offers: readonly Offer[], outcomes: readonly Outcome[], wins: readonly Win[]): FollowThrough {
  const byOffer = new Map(outcomes.map((x) => [x.offerId, x]))
  const moves = tally()
  const steps = tally()
  for (const o of offers) {
    if (o.skippedAt || o.moveId === NOTHING) continue
    const x = o.id === undefined ? undefined : byOffer.get(o.id)
    if (o.kind === 'step' || o.kind === 'study') {
      steps.started++
      if (x?.outcome === 'done') steps.finished++
    } else {
      if (x?.outcome === 'done' || x?.outcome === 'partly') moves.started++
      if (x?.outcome === 'done') moves.finished++
    }
  }
  const w: Tally = { started: wins.length, finished: wins.filter((x) => x.outcome === 'done').length }
  const all: Tally = { started: moves.started + steps.started + w.started, finished: moves.finished + steps.finished + w.finished }
  return { moves, steps, wins: w, all }
}

export type BecomingKey = 'study' | 'conversations' | 'timeWithHer' | 'faith'
export const BECOMING_KEYS: readonly BecomingKey[] = ['study', 'conversations', 'timeWithHer', 'faith']

export interface DatedCount {
  n: number
  /** The day of the latest one, or null when none. */
  last: string | null
}

function countersOf(moveId: string): readonly Counter[] {
  if (parseRungId(moveId)) return ['study']
  return hasMove(moveId) ? moveById(moveId).countsToward : []
}

/** Dated counts from what was marked done, under your direction sentence. Done means done; partly and no count nothing here. */
export function becoming(offers: readonly Offer[], outcomes: readonly Outcome[]): Record<BecomingKey, DatedCount> {
  const byId = new Map(offers.map((o) => [o.id as number, o]))
  const result = Object.fromEntries(BECOMING_KEYS.map((k) => [k, { n: 0, last: null }])) as Record<BecomingKey, DatedCount>
  for (const x of outcomes) {
    if (x.outcome !== 'done') continue
    const offer = byId.get(x.offerId)
    if (!offer) continue
    for (const k of countersOf(offer.moveId)) {
      if (!(BECOMING_KEYS as readonly string[]).includes(k)) continue
      const r = result[k as BecomingKey]
      r.n++
      if (r.last === null || offer.day > r.last) r.last = offer.day
    }
  }
  return result
}

import { hasMove, isParked, isProposed, moveById, movesInFamily, OBSERVED_ONLY, PASSIVE, type Counter, type Move } from './catalogue'
import { blockAt, blockStart, dayKey, daysBetween } from './blocks'
import { copy } from './copy'
import type { Aim, AimKind, Cue, DayContext, Intention, Offer, Outcome, OutcomeWhy, RungMark, Skill, StudyNight, StudyReason, Win } from './db'
import { fill } from './format'
import { firstStudyId, ladderOf, lastMarkDay, nextStep, parseRungId, rungName, rungStep, sittingOf, skillsOf, type RungMove, type Sitting } from './ladder'
import { NOTHING } from './offers'
import { minutesOf } from './settings'

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

/** The key a commitment's step offers carry: study by its id, so several subjects stay apart; a person and a practice by kind. */
export function keyFor(aim: Aim): string {
  return aim.kind === 'certification' ? `aim:certification:${aim.id}` : aimKey(aim.kind)
}

export function unblockKeyFor(aim: Aim): string {
  return aim.kind === 'certification' ? `aim:certification:${aim.id}:unblock` : unblockKey(aim.kind)
}

/** Every key that names this commitment's offers; the first study commitment also answers to the older keys by kind alone. */
export function keysOf(aim: Aim, studyAims: readonly Aim[]): string[] {
  const keys = [keyFor(aim), unblockKeyFor(aim)]
  if (aim.kind === 'certification' && (aim.id === undefined || aim.id === firstStudyId(studyAims))) keys.push(aimKey('certification'), unblockKey('certification'))
  return keys
}

/** The step keys alone: an unblock offer is not a step and never counts as a block. */
export function stepKeysOf(aim: Aim, studyAims: readonly Aim[]): string[] {
  return keysOf(aim, studyAims).filter((k) => !k.endsWith(':unblock'))
}

/** Whether a study-night offer belongs to this study commitment: by the rung's skill, or to the first commitment when the offer carried a catalogue version. */
export function studyOfferBelongs(offer: Offer, aim: Aim, skills: readonly Skill[], studyAims: readonly Aim[]): boolean {
  if (offer.kind !== 'study' || aim.kind !== 'certification') return false
  const first = aim.id === undefined || aim.id === firstStudyId(studyAims)
  const rung = parseRungId(offer.moveId)
  if (!rung) return first
  const skill = skills.find((s) => s.id === rung.skillId)
  if (!skill) return first
  return skillsOf(aim, skills, studyAims).some((s) => s.id === skill.id)
}

/** The moves a person or a practice can take as its step: the family's active moves, never bedtime, never a passive item. */
export function stepChoices(kind: AimKind): Move[] {
  return STEP_FAMILIES[kind].flatMap((f) => movesInFamily(f)).filter((m) => !isProposed(m) && !isParked(m) && !OBSERVED_ONLY.has(m.id) && !PASSIVE.has(m.id))
}

/** The protected next step of a commitment, one line sized to one sitting. */
export function stepFor(aim: Aim, skills: readonly Skill[], marks: readonly RungMark[], studyAims: readonly Aim[] = [aim]): Sitting {
  if (aim.kind === 'certification') {
    const next = nextStep(skillsOf(aim, skills, studyAims), marks)
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
export function blockedBy(aim: Aim, offers: readonly Offer[], outcomes: readonly Outcome[], nights: readonly StudyNight[], skills: readonly Skill[] = [], studyAims: readonly Aim[] = [aim]): BlockReason | null {
  const keys = stepKeysOf(aim, studyAims)
  const own = offers.filter((o) => keys.includes(o.situationKey) || studyOfferBelongs(o, aim, skills, studyAims))
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

export const CUES: readonly Cue[] = ['afterPickup', 'afterBedtime', 'nextCheckIn']

export interface CueOffer {
  cue: Cue
  /** The clock time the cue names today, HH:MM. */
  time: string
}

/**
 * One tap says when. The cues on offer at this moment, each with the time it names today: after
 * pickup on a daycare day, after her bedtime, at the next check-in. A cue whose moment has passed
 * is not offered, and none are in the small hours; then the step is for now.
 */
export function cuesFor(ctx: Pick<DayContext, 'pickupTime' | 'soloUntil'> | null, now: Date): CueOffer[] {
  if (blockAt(now).day !== dayKey(now)) return []
  const minute = now.getHours() * 60 + now.getMinutes()
  const ahead = (time: string | null | undefined): time is string => typeof time === 'string' && minutesOf(time) > minute
  const out: CueOffer[] = []
  if (ctx && ahead(ctx.pickupTime)) out.push({ cue: 'afterPickup', time: ctx.pickupTime })
  if (ctx && ahead(ctx.soloUntil)) out.push({ cue: 'afterBedtime', time: ctx.soloUntil })
  const block = blockAt(now).block
  const next = block === 'morning' ? 'afternoon' : block === 'afternoon' ? 'evening' : null
  if (next && ahead(blockStart[next])) out.push({ cue: 'nextCheckIn', time: blockStart[next] })
  return out
}

/** Today's plan for a commitment: the latest cue tapped that day, or null. */
export function planFor(intentions: readonly Intention[], aimId: number, day: string): Intention | null {
  let plan: Intention | null = null
  for (const i of intentions) {
    if (i.aimId !== aimId || i.day !== day) continue
    if (!plan || i.setAt > plan.setAt || (i.setAt === plan.setAt && (i.id ?? 0) > (plan.id ?? 0))) plan = i
  }
  return plan
}

export interface CueCount {
  cue: Cue
  n: number
  started: number
}

/** Per cue, how many days were planned under it and how many of those steps were started. Counts only; the latest plan of each day counts. */
export function cueCounts(intentions: readonly Intention[], aimId: number): CueCount[] {
  const days = new Set(intentions.filter((i) => i.aimId === aimId).map((i) => i.day))
  const counts = new Map<Cue, CueCount>()
  for (const day of days) {
    const plan = planFor(intentions, aimId, day)
    if (!plan) continue
    const c = counts.get(plan.cue) ?? { cue: plan.cue, n: 0, started: 0 }
    c.n++
    if (plan.offerId !== null) c.started++
    counts.set(plan.cue, c)
  }
  return CUES.map((cue) => counts.get(cue)).filter((c): c is CueCount => c !== undefined)
}

/** The day a study commitment's ladder last moved, or null before any mark. */
export function lastMovedDay(aim: Aim, skills: readonly Skill[], marks: readonly RungMark[], studyAims: readonly Aim[] = [aim]): string | null {
  return lastMarkDay(skillsOf(aim, skills, studyAims), marks)
}

/** The day a person's or a practice's step was last marked done, by the day it was started, or null before any. */
export function lastDoneDay(aim: Aim, offers: readonly Offer[], outcomes: readonly Outcome[], studyAims: readonly Aim[] = [aim]): string | null {
  const keys = stepKeysOf(aim, studyAims)
  const own = new Map(offers.filter((o) => keys.includes(o.situationKey)).map((o) => [o.id as number, o.day]))
  let last: string | null = null
  for (const x of outcomes) {
    const day = x.outcome === 'done' ? own.get(x.offerId) : undefined
    if (day !== undefined && (last === null || day > last)) last = day
  }
  return last
}

/** One plain fact for the row: when the ladder last moved, or the step was last done, in days. A fact, never a streak. */
export function lastLine(kind: 'moved' | 'done', day: string | null, today: string): string {
  const words = kind === 'moved' ? copy.aims.lastMoved : copy.aims.lastDone
  if (day === null) return words.never
  const n = daysBetween(day, today)
  return n <= 0 ? words.today : n === 1 ? words.yesterday : fill(words.days, { n: String(n) })
}

/** What Done did, in one line where you tapped: the skill and the rung it now stands on. */
export function movedLine(m: RungMove | null): string | null {
  if (!m) return null
  const rung = rungName(m.to, ladderOf(m.skill))
  return fill(m.to > m.from ? copy.aims.moved : copy.aims.stayed, { skill: m.skill.name, rung })
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

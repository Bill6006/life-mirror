import { hasMove, isParked, isPathOnly, isProposed, moveById, movesInFamily, OBSERVED_ONLY, PASSIVE, type Counter, type Move, type PathId } from './catalogue'
import { pathById, pathKey, pathName } from './pathStage'
import { blockAt, blockStart, dayKey, daysBetween } from './blocks'
import { copy } from './copy'
import type { Aim, AimKind, Cue, DayContext, Ease, Intention, Offer, Outcome, OutcomeWhy, RungMark, Skill, StudyNight, StudyReason, Win } from './db'
import { heldBedtime, heldPickup } from './dayShape'
import { fill } from './format'
import { firstStudyId, nextStep, parseRungId, parseSkillSessionId, skillSessionId, skillStep, sittingOf, skillsOf, type Sitting } from './ladder'
import { NOTHING } from './offers'
import { minutesOf } from './settings'

// Aims, the pure part: which step protects each commitment, what blocks it and what unblocks it,
// follow-through as counts, and the dated counts under your direction sentence. Nothing here
// grades, ranks or streaks.

export const AIM_KINDS: readonly AimKind[] = ['certification', 'person', 'path', 'practice']

/** Where a person's or a practice's step is picked from. The certification's comes from the ladder, a path's from its stage (Part 24). */
export const STEP_FAMILIES: Record<AimKind, readonly string[]> = {
  certification: ['study'],
  person: ['people'],
  path: [],
  practice: ['faith', 'movement', 'steadying'],
}

/** A learning commitment with no current skill named yet has no session to start: its card asks for the one thing to work on now (Workstream 6). */
export const NO_SKILL = 'skill:none'

export function noSkillStep(): Sitting {
  return { id: NO_SKILL, name: copy.aims.noSkill, title: copy.aims.noSkill, what: '', minutes: 0, effort: 'low', kind: 'skill' }
}

/**
 * A learning commitment's current skill (Workstream 6): the one it names, or none. Before it is
 * adopted at open, the skill the retired ladder's step named, so nothing changes under your feet.
 */
export function currentSkillOf(aim: Aim, skills: readonly Skill[], marks: readonly RungMark[], studyAims: readonly Aim[] = [aim]): Skill | null {
  if (aim.kind !== 'certification') return null
  if (aim.currentSkillId !== undefined) return skills.find((s) => s.id === aim.currentSkillId && s.archivedAt === null) ?? null
  return nextStep(skillsOf(aim, skills, studyAims), marks)?.skill ?? null
}

/** A learning commitment's skills, the current one and the earlier ones: those filed under it, else, before adoption, those under its subject. */
export function skillsOfAim(aim: Aim, skills: readonly Skill[], studyAims: readonly Aim[] = [aim]): Skill[] {
  const own = skills.filter((s) => s.aimId === aim.id && s.archivedAt === null)
  return own.length || aim.currentSkillId !== undefined ? own.sort((a, b) => a.order - b.order) : skillsOf(aim, skills, studyAims)
}

export function aimKey(kind: AimKind): string {
  return `aim:${kind}`
}

export function unblockKey(kind: AimKind): string {
  return `aim:${kind}:unblock`
}

/** The key a commitment's step offers carry: study by its id, so several subjects stay apart; a path by its path; a person and a practice by kind. */
export function keyFor(aim: Aim): string {
  if (aim.kind === 'path') return pathKey(aim.path as PathId)
  return aim.kind === 'certification' ? `aim:certification:${aim.id}` : aimKey(aim.kind)
}

export function unblockKeyFor(aim: Aim): string {
  if (aim.kind === 'path') return `${pathKey(aim.path as PathId)}:unblock`
  return aim.kind === 'certification' ? `aim:certification:${aim.id}:unblock` : unblockKey(aim.kind)
}

/** Every key that names this commitment's offers; the first study commitment also answers to the older keys by kind alone, and a Social path converted from A person to that commitment's. */
export function keysOf(aim: Aim, studyAims: readonly Aim[]): string[] {
  const keys = [keyFor(aim), unblockKeyFor(aim)]
  if (aim.kind === 'certification' && (aim.id === undefined || aim.id === firstStudyId(studyAims))) keys.push(aimKey('certification'), unblockKey('certification'))
  if (aim.kind === 'path' && aim.convertedFrom === 'person') keys.push(aimKey('person'), unblockKey('person'))
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
  return STEP_FAMILIES[kind].flatMap((f) => movesInFamily(f)).filter((m) => !isProposed(m) && !isParked(m) && !isPathOnly(m) && !OBSERVED_ONLY.has(m.id) && !PASSIVE.has(m.id))
}

/** The protected next step of a commitment, one line sized to one sitting. */
export function stepFor(aim: Aim, skills: readonly Skill[], marks: readonly RungMark[], studyAims: readonly Aim[] = [aim]): Sitting {
  // A path's rep is picked each block for who is around (pathStage.pathToday); by name alone, the step is the path.
  if (aim.kind === 'path') {
    const path = pathById(aim.path as PathId)
    return { id: pathKey(path.id), name: pathName(path), title: pathName(path), what: path.what, minutes: 0, effort: 'low', kind: 'move' }
  }
  // A learning commitment's session is its current skill's; the retired ladder sets nothing (D2).
  if (aim.kind === 'certification') {
    const current = currentSkillOf(aim, skills, marks, studyAims)
    return current ? skillStep(current) : noSkillStep()
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
  // A path answers refusals itself, with the smallest version of its stage (Part 24), never an unblock offer.
  if (aim.kind === 'path') return null
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

/** Whether a clock time is still ahead of now today; never in the small hours, when the day being logged is yesterday's. */
export function aheadToday(time: string | null | undefined, now: Date): time is string {
  return typeof time === 'string' && blockAt(now).day === dayKey(now) && minutesOf(time) > now.getHours() * 60 + now.getMinutes()
}

/**
 * One tap says when. The cues on offer at this moment, each with the time it names today: after
 * pickup on a daycare day and after her bedtime, both only while she is with you, and at the next check-in. A cue whose moment has passed
 * is not offered, and none are in the small hours; then the step is for now.
 */
export function cuesFor(ctx: Pick<DayContext, 'withHer' | 'pickupTime' | 'soloUntil'> | null, now: Date): CueOffer[] {
  if (blockAt(now).day !== dayKey(now)) return []
  const out: CueOffer[] = []
  const pickup = heldPickup(ctx)
  const bedtime = heldBedtime(ctx)
  if (aheadToday(pickup, now)) out.push({ cue: 'afterPickup', time: pickup })
  if (aheadToday(bedtime, now)) out.push({ cue: 'afterBedtime', time: bedtime })
  const block = blockAt(now).block
  const next = block === 'morning' ? 'afternoon' : block === 'afternoon' ? 'evening' : null
  if (next && aheadToday(blockStart[next], now)) out.push({ cue: 'nextCheckIn', time: blockStart[next] })
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

/**
 * The last day a learning commitment was practised: the day a session of it began that you marked
 * done or partly (Workstream 6), or null before any. Silence is not a gap in practice (Rule 2): an
 * unlogged day is only unlogged.
 */
export function lastPracticeDay(aim: Aim, offers: readonly Offer[], outcomes: readonly Outcome[], skills: readonly Skill[] = [], studyAims: readonly Aim[] = [aim]): string | null {
  return practiceDaysOf(aim, offers, outcomes, skills, studyAims).pop() ?? null
}

/** The different days a commitment was practised, oldest first: the day each session began that you marked done or partly. A rhythm counts these (Part 39). */
export function practiceDaysOf(aim: Aim, offers: readonly Offer[], outcomes: readonly Outcome[], skills: readonly Skill[] = [], studyAims: readonly Aim[] = [aim]): string[] {
  const keys = stepKeysOf(aim, studyAims)
  const own = new Map(offers.filter((o) => (o.kind === 'step' || o.kind === 'study') && o.skippedAt === null && (keys.includes(o.situationKey) || studyOfferBelongs(o, aim, skills, studyAims))).map((o) => [o.id as number, o.day]))
  const days = new Set<string>()
  for (const x of outcomes) {
    const day = x.outcome === 'done' || x.outcome === 'partly' ? own.get(x.offerId) : undefined
    if (day !== undefined) days.add(day)
  }
  return [...days].sort()
}

/** A skill's practice since it became current: its sessions and the different days they fell on, done or partly, and how they went where you said. */
export interface Practice {
  sessions: number
  /** Different days with a session: six of them is the earliest a review is considered (D1, amended), never a promotion. */
  days: number
  /** The day the skill became current, when known. */
  since: string | null
  ease: Record<Ease, number>
}

/** The sessions of one skill since it became current, counted by the day each began; a second session the same day adds a session, never a day. */
export function practiceOn(skill: Skill, offers: readonly Offer[], outcomes: readonly Outcome[]): Practice {
  const since = skill.startedAt ? dayKey(new Date(skill.startedAt)) : null
  const id = skill.id as number
  const mine = new Map(offers.filter((o) => o.skippedAt === null && (o.moveId === skillSessionId(id) || parseRungId(o.moveId)?.skillId === id) && (since === null || o.day >= since)).map((o) => [o.id as number, o.day]))
  const days = new Set<string>()
  const ease: Record<Ease, number> = { hard: 0, right: 0, easy: 0 }
  let sessions = 0
  for (const x of outcomes) {
    const day = mine.get(x.offerId)
    if (day === undefined || (x.outcome !== 'done' && x.outcome !== 'partly')) continue
    sessions++
    days.add(day)
    if (x.ease) ease[x.ease]++
  }
  return { sessions, days: days.size, since, ease }
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

export interface TodaySessions {
  /** The latest session started today and marked done. */
  done: Outcome | null
  /** A session started today was answered Partly and none is done since: the one case Resume names. */
  partly: boolean
}

/**
 * A commitment's sessions today, by the day each was started, never the day it was answered: the
 * latest one done, or a Partly with none done. An unblock move is not the commitment's session.
 */
export function sessionsToday(aim: Aim, offers: readonly Offer[], outcomes: readonly Outcome[], day: string, skills: readonly Skill[] = [], studyAims: readonly Aim[] = [aim]): TodaySessions {
  const keys = stepKeysOf(aim, studyAims)
  const byOffer = new Map(outcomes.map((x) => [x.offerId, x]))
  let done: Outcome | null = null
  let partly = false
  for (const o of offers) {
    if (o.day !== day || o.skippedAt !== null || (o.kind !== 'step' && o.kind !== 'study')) continue
    if (!keys.includes(o.situationKey) && !studyOfferBelongs(o, aim, skills, studyAims)) continue
    const x = byOffer.get(o.id as number)
    if (x?.outcome === 'done' && (!done || x.at > done.at)) done = x
    if (x?.outcome === 'partly') partly = true
  }
  return { done, partly: partly && done === null }
}

/** One plain fact for the row: when the ladder last moved, or the step was last done, in days. A fact, never a streak. */
export function lastLine(kind: 'practised' | 'done', day: string | null, today: string): string {
  const words = kind === 'practised' ? copy.aims.lastPractised : copy.aims.lastDone
  if (day === null) return words.never
  const n = daysBetween(day, today)
  return n <= 0 ? words.today : n === 1 ? words.yesterday : fill(words.days, { n: String(n) })
}

/** The question on how a learning session went began with Workstream 6; sessions before it were never asked. */
export const EASE_ASKED_FROM = '2026-09-24T00:00:00.000Z'
/** Optional taps earn their place (Rule 17): after this many learning sessions running with no answer, the question stops appearing. */
export const EASE_UNUSED_RETIRES = 12

/** Whether the question on how a session went has retired: the last dozen learning sessions since it began (or since you brought it back) all went unanswered. */
export function easeRetired(offers: readonly Offer[], outcomes: readonly Outcome[], broughtBack: string | null): boolean {
  const learning = new Set(offers.filter((o) => parseSkillSessionId(o.moveId) !== null).map((o) => o.id as number))
  const from = broughtBack && broughtBack > EASE_ASKED_FROM ? broughtBack : EASE_ASKED_FROM
  const answered = outcomes.filter((x) => learning.has(x.offerId) && (x.outcome === 'done' || x.outcome === 'partly') && x.at >= from).sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, EASE_UNUSED_RETIRES)
  return answered.length >= EASE_UNUSED_RETIRES && answered.every((x) => !x.ease)
}

export type BecomingKey = 'study' | 'conversations' | 'timeWithHer' | 'faith'
export const BECOMING_KEYS: readonly BecomingKey[] = ['study', 'conversations', 'timeWithHer', 'faith']

export interface DatedCount {
  n: number
  /** The day of the latest one, or null when none. */
  last: string | null
}

function countersOf(moveId: string): readonly Counter[] {
  if (parseRungId(moveId) || parseSkillSessionId(moveId) !== null) return ['study']
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

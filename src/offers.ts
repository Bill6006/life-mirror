import type { Block } from './blocks'
import { hasMove, isProposed, liveMoves, moveById, OBSERVED_ONLY, PASSIVE, rungOf, type Move, type Window } from './catalogue'
import { askedOf, type CheckIn } from './db'
import type { Position, ReadingId } from './readings'
import { bandOf, INGREDIENT_IDS, INGREDIENTS, pointsFor, readingOf, type Band, type Stance } from './score'
import { choose, type Belief, type Candidate, type Choice, type Rng } from './bandit'

// The situation and the candidate set, as the plan's bar states them. A situation is a block
// plus the target reading: the lowest ingredient with a clear direction right now. The band
// filters what is feasible but does not split the comparison. Every filter here is a filter
// tag; none of them is ever learned.

/** "Nothing today" is a candidate the bandit can learn to pick. */
export const NOTHING = 'nothing'

export interface Situation {
  block: Block
  target: ReadingId
  stance: Stance
  band: Band
  /** block:target, the key comparable opportunities share. */
  key: string
  reading: number
  targetPosition: Position
}

/** The situation a completed check-in puts you in, or null while the reading is incomplete. */
export function situationOf(checkin: CheckIn): Situation | null {
  const r = readingOf(checkin)
  if (!r) return null
  const asked = askedOf(checkin)
  let target: ReadingId | null = null
  let lowest = Infinity
  for (const id of INGREDIENT_IDS) {
    if (!asked.includes(id)) continue
    const p = checkin.answers[id]
    if (p === undefined) continue
    const pts = pointsFor(id, p)
    if (pts < lowest) {
      lowest = pts
      target = id
    }
  }
  if (!target) return null
  return {
    block: checkin.block,
    target,
    stance: r.stance,
    band: bandOf(r.value),
    key: `${checkin.block}:${target}`,
    reading: r.value,
    targetPosition: checkin.answers[target] as Position,
  }
}

const EMPTY_FAMILIES: ReadonlySet<string> = new Set(['rest', 'steadying', 'ending'])

export interface TodayState {
  /** Moves marked done or partly today. */
  doneToday: readonly string[]
  /** Every move offered today, skipped or not, active or passive. */
  offeredToday: readonly string[]
  hiddenFamilies: ReadonlySet<string>
  /** Highest rung done on each ladder in the last fortnight, keyed by the ladder's first rung; absent means none. */
  doneRungs: ReadonlyMap<string, number>
  /** Today's context: whether study, time with her and church are on today is yours, never a draw. */
  studyNight: boolean
  withHer: boolean
  churchDay: boolean
}

export type Exclusion = 'proposed' | 'observed' | 'passive' | 'study' | 'schedule' | 'block' | 'hidden' | 'target' | 'band' | 'offeredToday' | 'conflict' | 'rung'

export function conflictsWithToday(move: Move, t: TodayState): boolean {
  const blocked = new Set([...t.doneToday, ...t.offeredToday])
  if (move.conflicts.some((c) => blocked.has(c))) return true
  for (const id of blocked) {
    // "Nothing today" and a rung of the proof ladder are not catalogue moves and conflict with nothing.
    if (id === NOTHING || !hasMove(id)) continue
    if (moveById(id).conflicts.includes(move.id)) return true
  }
  return false
}

function harderRungAllowed(band: Band): boolean {
  return band === 'solid' || band === 'firing'
}

/** Why a move is out right now, or null when it is a candidate. Block and needs first, then band, then today. */
export function screen(move: Move, s: Situation, t: TodayState): Exclusion | null {
  // Phase 9 proposals are read and vetoed; nothing proposed is offered until Green wires it.
  if (isProposed(move)) return 'proposed'
  if (OBSERVED_ONLY.has(move.id)) return 'observed'
  if (PASSIVE.has(move.id)) return 'passive'
  // Study has its own step at the evening check-in on study nights (Rule 20); the day's draw never offers it.
  if (move.family === 'study') return 'study'
  if (move.id === 'time-with-her' && !t.withHer) return 'schedule'
  if (move.id === 'church-early' && !t.churchDay) return 'schedule'
  if (!move.when.includes(s.block)) return 'block'
  if (t.hiddenFamilies.has(move.family)) return 'hidden'
  if (!move.targets.some((x) => x.reading === s.target && x.direction === INGREDIENTS[s.target])) return 'target'
  if (s.band === 'empty' && !(EMPTY_FAMILIES.has(move.family) && move.effort === 'low')) return 'band'
  if (s.band === 'wornDown' && move.effort === 'high') return 'band'
  if (t.offeredToday.includes(move.id)) return 'offeredToday'
  if (conflictsWithToday(move, t)) return 'conflict'
  const rung = rungOf(move.id)
  if (rung) {
    const top = t.doneRungs.get(rung.ladder[0]) ?? -1
    const allowed = harderRungAllowed(s.band) ? top + 1 : Math.max(top, 0)
    if (rung.index > allowed) return 'rung'
  }
  return null
}

export interface CandidateSet {
  candidates: Candidate[]
  excluded: Map<string, Exclusion>
}

/** Every move that fits the moment, plus "nothing today", with the reason for every move that is out. */
export function candidatesFor(s: Situation, t: TodayState): CandidateSet {
  const candidates: Candidate[] = []
  const excluded = new Map<string, Exclusion>()
  for (const m of liveMoves) {
    const why = screen(m, s, t)
    if (why) {
      excluded.set(m.id, why)
      continue
    }
    const rung = rungOf(m.id)
    const top = rung ? (t.doneRungs.get(rung.ladder[0]) ?? -1) : -1
    const bonus = rung && harderRungAllowed(s.band) && rung.index === top + 1 ? 0.5 : 0
    candidates.push({ id: m.id, effort: m.effort, bonus })
  }
  if (!t.offeredToday.includes(NOTHING)) candidates.push({ id: NOTHING, effort: 'low' })
  return { candidates, excluded }
}

export function chooseFor(set: CandidateSet, beliefs: (id: string) => Belief, rng?: Rng): Choice | null {
  return choose(set.candidates, beliefs, rng)
}

export interface OfferLike {
  moveId: string
  at: string
}

/** The alternative a card compares against: the least-offered other real candidate. */
export function alternativeFor(chosenId: string, set: CandidateSet, history: readonly OfferLike[]): string | null {
  const others = set.candidates.filter((c) => c.id !== chosenId && c.id !== NOTHING)
  let best: string | null = null
  let bestCount = Infinity
  for (const c of others) {
    const count = history.filter((o) => o.moveId === c.id).length
    if (count < bestCount) {
      best = c.id
      bestCount = count
    }
  }
  return best
}

export function windowFor(moveId: string, target: ReadingId): Window {
  if (moveId === NOTHING) return 'nextBlock'
  return moveById(moveId).targets.find((t) => t.reading === target)?.window ?? 'nextBlock'
}

export type WhyNotReason = Exclusion | 'draw' | 'coinFlip'

export interface WhyNot {
  moveId: string
  reason: WhyNotReason
}

/**
 * Why not that: the move you might have expected, the one done most recently in this situation
 * if any, else the runner-up of the draw, and the first reason it was not offered.
 */
export function whyNotThat(expected: string | null, choice: Choice, set: CandidateSet): WhyNot | null {
  const moveId = expected && expected !== choice.id ? expected : choice.runnerUp
  if (!moveId || moveId === choice.id || moveId === NOTHING) return null
  const excluded = set.excluded.get(moveId)
  if (excluded) return { moveId, reason: excluded }
  return { moveId, reason: choice.coinFlip ? 'coinFlip' : 'draw' }
}

/** A passive item to ride alongside: fits the block, not offered or done today, least offered so far. */
export function pickPassive(block: Block, t: TodayState, history: readonly OfferLike[]): Move | null {
  let best: Move | null = null
  let bestCount = Infinity
  for (const id of PASSIVE) {
    const m = moveById(id)
    if (!m.when.includes(block) || t.hiddenFamilies.has(m.family)) continue
    if (t.offeredToday.includes(id) || t.doneToday.includes(id)) continue
    if (m.conflicts.some((c) => t.doneToday.includes(c) || t.offeredToday.includes(c))) continue
    const count = history.filter((o) => o.moveId === id).length
    if (count < bestCount) {
      best = m
      bestCount = count
    }
  }
  return best
}

/** Candidates for the slot before pickup: short, low-effort rest and steadying, and water. Their job is arriving with something left. */
export function pickupCandidates(block: Block, t: TodayState): CandidateSet {
  const candidates: Candidate[] = []
  const excluded = new Map<string, Exclusion>()
  for (const m of liveMoves) {
    const fits = (m.family === 'rest' || m.family === 'steadying' || m.id === 'glass-of-water') && m.minutes <= 10 && m.effort === 'low'
    if (!fits || OBSERVED_ONLY.has(m.id) || PASSIVE.has(m.id)) continue
    if (!m.when.includes(block)) {
      excluded.set(m.id, 'block')
      continue
    }
    if (t.hiddenFamilies.has(m.family)) {
      excluded.set(m.id, 'hidden')
      continue
    }
    if (t.offeredToday.includes(m.id)) {
      excluded.set(m.id, 'offeredToday')
      continue
    }
    if (conflictsWithToday(m, t)) {
      excluded.set(m.id, 'conflict')
      continue
    }
    candidates.push({ id: m.id, effort: m.effort })
  }
  return { candidates, excluded }
}

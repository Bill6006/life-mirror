import { BLOCKS, blockStart, type Block } from './blocks'
import { hasMove, isParked, isPathOnly, isProposed, liveMoves, moveById, NOTHING, OBSERVED_ONLY, PASSIVE, rungOf, type Move, type Window } from './catalogue'
import { askedOf, type CheckIn } from './db'
import { inPerson } from './people'
import type { Position, ReadingId } from './readings'
import { bandOf, INGREDIENT_IDS, INGREDIENTS, pointsFor, readingOf, type Band } from './score'
import { choose, type Belief, type Candidate, type Choice, type Rng } from './bandit'
import { minutesOf } from './settings'

// The situation and the candidate set, as the plan's bar states them. A situation is a block
// plus the target reading: the lowest ingredient with a clear direction right now. The band
// filters what is feasible but does not split the comparison. Every filter here is a filter
// tag; none of them is ever learned.

/** "Nothing today" is a candidate the bandit can learn to pick. Its id lives with the catalogue so the learning engine can name it too. */
export { NOTHING }

export interface Situation {
  block: Block
  target: ReadingId
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
  /** Phase 10: moves at least this long stay out of the block after a "no time"; null when none. */
  noTimeCeiling: number | null
  /** One-time setups already made (a done outcome, not since undone): offered no more. Absent means none. */
  standing?: readonly string[]
  /** At the office today: quiet is not to be had in the working blocks. Absent means at home. */
  atOffice?: boolean
  /** Whether the draw is being made in daylight hours. Absent means it is. */
  daylight?: boolean
  /** Daycare pickup on this day, HH:MM, or null: she is away from the drop-off until then. Absent means no daycare. */
  pickupTime?: string | null
  /** Past her bedtime on a day she is with you: her moves wait for a day she is awake for. Absent means she is up. */
  asleep?: boolean
  /** Part 20's tier 1: whether today's shape puts other adults around in each block. Absent means the draw is not told, as in the permissive states. */
  peopleAround?: Readonly<Record<Block, boolean>>
  /** Part 24: a path is on, so its row is the day's one people rep and the draw offers no in-person people or charisma rep. Absent means none is. */
  pathOn?: boolean
}

export type Exclusion = 'proposed' | 'parked' | 'pathOnly' | 'path' | 'noTime' | 'observed' | 'passive' | 'study' | 'schedule' | 'block' | 'hidden' | 'target' | 'band' | 'offeredToday' | 'conflict' | 'rung' | 'standing' | 'daylight' | 'quiet' | 'daycare' | 'asleep' | 'people'

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
  if (isParked(move)) return 'parked'
  // A path's own reps are offered through its row alone (Part 24).
  if (isPathOnly(move)) return 'pathOnly'
  if (OBSERVED_ONLY.has(move.id)) return 'observed'
  if (PASSIVE.has(move.id)) return 'passive'
  // Study belongs to your commitments, their rhythm and your fixed days (Workstream 6); the day's draw never offers it (Rule 16).
  if (move.family === 'study') return 'study'
  // A one-time setup already made stays made; if it came undone, its catalogue entry says so and it returns (Rule 13).
  if (t.standing?.includes(move.id)) return 'standing'
  if (move.id === 'time-with-her' && !t.withHer) return 'schedule'
  // Phase F: practising a skill together needs her here; the day's context says so, never a draw.
  if (move.family === 'fatherhood' && !t.withHer) return 'schedule'
  // Past her bedtime she is asleep: her moves wait.
  if ((move.family === 'fatherhood' || move.id === 'time-with-her') && t.asleep) return 'asleep'
  // On a daycare day she is there only after pickup: her moves fit the evening, and the afternoon only when pickup falls inside it.
  if ((move.family === 'fatherhood' || move.id === 'time-with-her') && t.pickupTime && (s.block === 'morning' || (s.block === 'afternoon' && minutesOf(t.pickupTime) >= minutesOf(blockStart.evening)))) return 'daycare'
  if (move.id === 'church-early' && !t.churchDay) return 'schedule'
  if (!move.when.includes(s.block)) return 'block'
  // The two needs the app can know: daylight from your daylight hours, quiet from your office days.
  if (move.needs.includes('daylight') && t.daylight === false) return 'daylight'
  if (move.needs.includes('quiet') && t.atOffice === true && s.block !== 'evening') return 'quiet'
  // The third: an adult there in person, from today's shape alone (Part 20's tier 1). Past reps elsewhere never enter here.
  if (inPerson(move) && t.peopleAround && !t.peopleAround[s.block]) return 'people'
  // One people rep a day across the app: while a path is on, its row is it.
  if (t.pathOn && inPerson(move) && (move.family === 'people' || move.family === 'charisma')) return 'path'
  if (t.hiddenFamilies.has(move.family)) return 'hidden'
  if (!move.targets.some((x) => x.reading === s.target && x.direction === INGREDIENTS[s.target])) return 'target'
  if (s.band === 'empty' && !(EMPTY_FAMILIES.has(move.family) && move.effort === 'low')) return 'band'
  if (s.band === 'wornDown' && move.effort === 'high') return 'band'
  if (t.offeredToday.includes(move.id)) return 'offeredToday'
  // Phase 10: "no time" narrows the feasibility filter for a week in that block.
  if (t.noTimeCeiling !== null && move.minutes >= t.noTimeCeiling) return 'noTime'
  if (conflictsWithToday(move, t)) return 'conflict'
  const rung = rungOf(move.id)
  if (rung) {
    const top = t.doneRungs.get(rung.ladder[0]) ?? -1
    const allowed = harderRungAllowed(s.band) ? top + 1 : Math.max(top, 0)
    if (rung.index > allowed) return 'rung'
  }
  return null
}

/** One-time setups already made: a done outcome on an entry of the setup family, unless you said it came undone since. */
export function standingSetups(done: readonly { moveId: string; day: string }[], undone: Readonly<Record<string, string>>): string[] {
  const out = new Set<string>()
  for (const x of done) {
    if (!hasMove(x.moveId) || !moveById(x.moveId).setup) continue
    const since = undone[x.moveId]
    if (since && since >= x.day) continue
    out.add(x.moveId)
  }
  return [...out]
}

const ALL_BANDS: readonly Band[] = ['empty', 'wornDown', 'gettingBy', 'solid', 'firing']

/** The most permissive state a move can be screened in: nothing done or offered today, every schedule on, and for a rung the one below it done. */
export function permissiveState(move: Move): TodayState {
  const rung = rungOf(move.id)
  const doneRungs = new Map<string, number>()
  if (rung && rung.index > 0) doneRungs.set(rung.ladder[0], rung.index - 1)
  return { doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs, studyNight: true, withHer: true, churchDay: true, noTimeCeiling: null }
}

/** Every situation there is: each block, each ingredient as the target, each band. */
export function everySituation(): Situation[] {
  const out: Situation[] = []
  for (const block of BLOCKS) for (const target of INGREDIENT_IDS) for (const band of ALL_BANDS) out.push({ block, target, band, key: `${block}:${target}`, reading: 50, targetPosition: 1 })
  return out
}

/**
 * Whether a move can be a candidate anywhere at all, and when it cannot, the filter that keeps
 * it out most. Passive, observed-only and study entries are offered by their own paths and
 * come back as such; the catalogue check leaves them out.
 */
export function reachableAnywhere(move: Move): { reachable: boolean; blocker: Exclusion | null } {
  const t = permissiveState(move)
  const reasons = new Map<Exclusion, number>()
  for (const s of everySituation()) {
    const why = screen(move, s, t)
    if (why === null) return { reachable: true, blocker: null }
    reasons.set(why, (reasons.get(why) ?? 0) + 1)
  }
  const blocker = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { reachable: false, blocker }
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
    if (isParked(m) || !m.when.includes(block) || t.hiddenFamilies.has(m.family)) continue
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

import { parseDay, type Block } from './blocks'
import type { Window } from './catalogue'
import type { CheckIn, DayContext } from './db'
import { SHORT_SLEEP } from './facts'
import { forecast, indexCheckIns, windowSlots } from './observe'
import type { Exclusion } from './offers'
import type { ReadingId } from './readings'
import { INGREDIENTS } from './score'

// Requirement 2 of the learning design agreed 2026-10-10, the foundations: each decision point is
// recorded at the time, since history recorded without them cannot be rebuilt later: the learning
// engine (stage 2) and the stress test read them. Nothing here changes what is drawn, offered or said.

/** A candidate's belief at a draw, as the draw record keeps it: the effect when done, its spread, and the record behind it. */
export interface DrawBelief {
  mean: number
  sd: number
  n: number
}

/** The day's context at a draw: the learning's pre-declared contexts, as they stood then. */
export interface DrawContext {
  weekday: number
  weekend: boolean
  withHer: boolean
  office: boolean
  church: boolean
  /** Away from home on a trip. */
  away: boolean
  /** Unwell today, as marked by then. */
  unwell: boolean
  /** Last night under six hours, as the morning's answer said; null when it was not answered by then. */
  shortSleep: boolean | null
}

/** What a draw knew when it was made. */
export interface DrawRecord {
  engine: string
  /** Why each catalogue move was out of the draw, by reason. */
  excluded: Partial<Record<Exclusion, string[]>>
  /** Each candidate's belief at the draw: the effect expected on the target in anchor steps, its spread, and the opportunities behind it. */
  beliefs: Record<string, { mean: number; sd: number; n: number }>
  /** What the move drawn was meant to change: the reading, the way that is good for it, and the window it is read over. Null for Nothing extra. */
  intended: { target: ReadingId; direction: 'up' | 'down'; window: Window } | null
  context: DrawContext
  /** The target's expected value where the outcome is read, before any outcome: today's prediction, the recent mean of that slot. */
  prediction: { day: string; block: Block; expected: number | null; basis: 'slotMean' } | null
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places

/** The context a draw records, from the day's record and the day's check-ins as they stand at the draw. */
export function drawContextOf(ctx: DayContext | null | undefined, checkins: readonly CheckIn[], day: string): DrawContext {
  const weekday = parseDay(day).getDay()
  const slept = checkins.find((c) => c.day === day && c.block === 'morning')?.answers.sleepHours
  return {
    weekday,
    weekend: weekday === 0 || weekday === 6,
    withHer: Boolean(ctx?.withHer),
    office: Boolean(ctx?.atOffice),
    church: Boolean(ctx?.churchDay),
    away: Boolean(ctx?.awayFromHome),
    unwell: Boolean(ctx?.unwell),
    shortSleep: slept === undefined ? null : slept <= SHORT_SLEEP,
  }
}

/** The record of one draw, made at the draw. */
export function drawRecordOf(i: {
  excluded: ReadonlyMap<string, Exclusion>
  candidates: readonly string[]
  belief: (id: string) => DrawBelief
  target: ReadingId
  /** The drawn move's window; null for Nothing extra. */
  window: Window | null
  context: DrawContext
  checkins: readonly CheckIn[]
  day: string
  block: Block
  /** The engine that drew. */
  engine: string
}): DrawRecord {
  const excluded: Partial<Record<Exclusion, string[]>> = {}
  for (const [id, why] of i.excluded) (excluded[why] ??= []).push(id)
  const beliefs = Object.fromEntries(
    i.candidates.map((id) => {
      const b = i.belief(id)
      return [id, { mean: round(b.mean, 3), sd: round(b.sd, 3), n: b.n }]
    }),
  )
  // Nothing extra is read where the next check-in reads, as the comparison it stands in for is.
  const slot = windowSlots(i.day, i.block, i.window ?? 'nextBlock')[0]
  const expected = slot ? forecast(indexCheckIns(i.checkins), slot.day, slot.block, i.target) : null
  return {
    engine: i.engine,
    excluded,
    beliefs,
    intended: i.window ? { target: i.target, direction: INGREDIENTS[i.target] === 'down' ? 'down' : 'up', window: i.window } : null,
    context: i.context,
    prediction: slot ? { day: slot.day, block: slot.block, expected: expected === null ? null : round(expected, 2), basis: 'slotMean' } : null,
  }
}

/** A reason that never collapses (requirement 2): how an offer's question was answered, or that it was left. */
export type OutcomeReason = 'done' | 'partly' | 'noTime' | 'didntWant' | 'no' | 'unanswered'

export function outcomeReasonOf(outcome: 'done' | 'partly' | 'no' | null, why: 'noTime' | 'didntWant' | null): OutcomeReason {
  if (outcome === null) return 'unanswered'
  if (outcome === 'no') return why ?? 'no'
  return outcome
}

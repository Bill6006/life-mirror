import { addDays, BLOCKS, type Block } from '../blocks'
import { isComplete, type CheckIn, type DayContext } from '../db'
import type { Frequency } from '../settings'
import { activeBlocks } from '../reminderRules'
import { readingOf } from '../score'
import { contextFlags, HONESTY_CONTEXTS, type HonestyContext } from './contexts'
import { fisherTwoSided, holmAdjusted } from './exact'

// Requirement 13 (stage R7), in its words: "Life Mirror's own record is checked for whether the owner's missed check-ins
// and unanswered readings relate to state or context: the reading before, the block, the day's context. Until the record
// shows such a relation, missing stays missing and uncertainty widens. If it does, the affected estimates say so and
// their treatment is revisited." Two kinds of missing are read: a check-in the owner's frequency asks for and never
// started, and a check-in started with a reading left unanswered. Each is compared by the reading before, the block and
// each context of the day; a relation shows only when Fisher's exact test clears Holm's correction across every
// comparison of both kinds and the rates stand at least fifteen points apart.

/** The days read, ending yesterday. */
export const MISSING_DAYS = 56
/** How far apart, in points out of 100, two rates must stand for a relation. */
export const MISSING_GAP = 0.15
/** The error rate across every comparison, after Holm's correction. */
export const MISSING_ALPHA = 0.05

/** A short night is known only from the morning's own answer, so a missed morning cannot be compared by it: left out here. */
const CONTEXTS = HONESTY_CONTEXTS.filter((c) => c !== 'shortNight')

export type MissingKind = 'missed' | 'unanswered'
export type MissingBy = { by: 'before'; low: true } | { by: 'block'; block: Block } | { by: 'context'; context: Exclude<HonestyContext, 'shortNight'> }

export interface MissingComparison {
  kind: MissingKind
  split: MissingBy
  missingIn: number
  slotsIn: number
  missingOut: number
  slotsOut: number
  p: number
  adjusted: number
  relation: boolean
}

export interface MissingReading {
  /** Slots the frequency asked for, and how many were never started. */
  slots: number
  missed: number
  /** Check-ins started, and how many were left with a reading unanswered. */
  started: number
  unanswered: number
  comparisons: MissingComparison[]
  /** The relations, strongest first: until one shows, missing stays missing. */
  relations: MissingComparison[]
}

interface Slot {
  day: string
  block: Block
  checkin: CheckIn | undefined
  /** The reading out of 100 at the last complete check-in before the slot, if any. */
  before: number | null
}

const slotOrder = (day: string, block: Block) => `${day}|${BLOCKS.indexOf(block)}`

/** Whether a comparison shows a relation: clear after Holm, and the two rates at least fifteen points apart. */
export function relationShows(c: Pick<MissingComparison, 'missingIn' | 'slotsIn' | 'missingOut' | 'slotsOut'>, adjusted: number): boolean {
  return adjusted < MISSING_ALPHA && Math.abs(c.missingIn / c.slotsIn - c.missingOut / c.slotsOut) >= MISSING_GAP
}

export function readMissing(r: { checkins: readonly CheckIn[]; contexts: readonly DayContext[]; frequency: Frequency }, today: string): MissingReading {
  const since = addDays(today, -MISSING_DAYS)
  const ctxOf = new Map(r.contexts.map((c) => [c.day, c]))
  const at = new Map(r.checkins.map((c) => [`${c.day}|${c.block}`, c]))
  const complete = r.checkins.filter((c) => isComplete(c)).sort((a, b) => (slotOrder(a.day, a.block) < slotOrder(b.day, b.block) ? -1 : 1))
  // Each block the frequency asks for counts from the first day in the window a check-in was started in it, so a block
  // asked only since a later change of frequency is not read as missed before it was asked.
  const slots: Slot[] = []
  for (const block of activeBlocks(r.frequency)) {
    const first = r.checkins
      .filter((c) => c.block === block && c.day >= since && c.day < today)
      .map((c) => c.day)
      .sort()[0]
    if (!first) continue
    for (let day = first; day < today; day = addDays(day, 1)) {
      const key = slotOrder(day, block)
      const last = [...complete].reverse().find((c) => slotOrder(c.day, c.block) < key)
      slots.push({ day, block, checkin: at.get(`${day}|${block}`), before: last ? (readingOf(last)?.value ?? null) : null })
    }
  }
  const started = slots.filter((s) => s.checkin !== undefined)
  // "The reading before": below the owner's own median of those readings over the window, or not.
  const befores = slots
    .map((s) => s.before)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  const median = befores.length ? (befores[Math.floor((befores.length - 1) / 2)] + befores[Math.ceil((befores.length - 1) / 2)]) / 2 : null

  const splits: { split: MissingBy; holds: (s: Slot) => boolean | null }[] = [{ split: { by: 'before', low: true }, holds: (s) => (s.before === null || median === null ? null : s.before < median) }]
  const blocks = activeBlocks(r.frequency)
  if (blocks.length > 1) for (const block of blocks) splits.push({ split: { by: 'block', block }, holds: (s) => s.block === block })
  for (const context of CONTEXTS) splits.push({ split: { by: 'context', context: context as Exclude<HonestyContext, 'shortNight'> }, holds: (s) => contextFlags(s.day, ctxOf.get(s.day), undefined)[context] })

  const kinds: { kind: MissingKind; pool: Slot[]; missing: (s: Slot) => boolean }[] = [
    { kind: 'missed', pool: slots, missing: (s) => s.checkin === undefined },
    { kind: 'unanswered', pool: started, missing: (s) => !isComplete(s.checkin as CheckIn) },
  ]
  const read = kinds.flatMap(({ kind, pool, missing }) =>
    splits
      .map(({ split, holds }) => {
        const known = pool.map((s) => ({ s, h: holds(s) })).filter((x) => x.h !== null)
        const inside = known.filter((x) => x.h)
        const outside = known.filter((x) => !x.h)
        return { kind, split, missingIn: inside.filter((x) => missing(x.s)).length, slotsIn: inside.length, missingOut: outside.filter((x) => missing(x.s)).length, slotsOut: outside.length }
      })
      .filter((c) => c.slotsIn > 0 && c.slotsOut > 0)
      .map((c) => ({ ...c, p: fisherTwoSided(c.missingIn, c.slotsIn - c.missingIn, c.missingOut, c.slotsOut - c.missingOut) })),
  )
  const adjusted = holmAdjusted(read.map((c) => c.p))
  const comparisons: MissingComparison[] = read.map((c, i) => ({ ...c, adjusted: adjusted[i], relation: relationShows(c, adjusted[i]) }))
  return {
    slots: slots.length,
    missed: slots.filter((s) => s.checkin === undefined).length,
    started: started.length,
    unanswered: started.filter((s) => !isComplete(s.checkin as CheckIn)).length,
    comparisons,
    relations: comparisons.filter((c) => c.relation).sort((a, b) => a.adjusted - b.adjusted),
  }
}

import { associationFor, dayAssociation, type Association } from './associations'
import { moveById } from './catalogue'
import { chipShownAt } from './chips'
import type { CheckIn, Outcome } from './db'

// Time in nature (item 2 of 4, 2026-10-21): the evening's one tap, "20+ min in nature today, in total", defined from an
// evidence review recorded in the plan. Nature, not generic time outdoors and not daylight: time spent in a natural place,
// walking, sitting or active there, green or blue places in a town among them; separate periods add up. Twenty minutes is
// where stress recovery in daily life is most efficient (20 to 30 minutes) and the daily share of the weekly dose well-being
// follows (120 minutes a week). The older "Outside a while today" (extras.outside, until this definition) had no length or
// place: it stays exactly as recorded and is never read as time in nature.

/** Minutes in nature in the day, in total, that make a nature day. */
export const NATURE_MINUTES = 20
/** The day the definition began: no day before it is a nature day, and none enters either side of its comparisons. */
export const NATURE_SINCE = '2026-10-21'
/** Moves whose own instruction puts them in nature: done, their minutes are minutes in nature. The other outdoor moves count only where the person says the place was natural. */
export const NATURE_MOVES: readonly string[] = ['green-walk']
/** The day mark in words, for the sheet's facts and the morning's last-night line. */
export const NATURE_EVENT = 'a day with 20+ minutes in nature'

/** Whether a day's periods in nature, in minutes, make a nature day: their total reaches the line; separate periods add up. */
export function natureDay(periods: readonly number[]): boolean {
  return periods.reduce((sum, m) => sum + Math.max(0, m), 0) >= NATURE_MINUTES
}

/**
 * The days a move in nature, done, makes a nature day by itself: its minutes, added across the day, reach the line. Only
 * a move marked done counts: partly done says nothing of its minutes.
 */
export function natureMoveDays(outcomes: readonly Outcome[], moves: readonly string[] = NATURE_MOVES, minutesOf: (moveId: string) => number = (id) => moveById(id)?.minutes ?? 0): Set<string> {
  const byDay = new Map<string, number[]>()
  for (const x of outcomes) {
    if (x.outcome !== 'done' || !moves.includes(x.moveId) || x.day < NATURE_SINCE) continue
    byDay.set(x.day, [...(byDay.get(x.day) ?? []), minutesOf(x.moveId)])
  }
  return new Set([...byDay].filter(([, periods]) => natureDay(periods)).map(([day]) => day))
}

/** Whether an evening's day was a nature day: its tap, or a move in nature done that day that reaches the line. */
export function natureEvening(c: CheckIn, moveDays: ReadonlySet<string>): boolean {
  return c.day >= NATURE_SINCE && (Boolean(c.extras?.nature) || moveDays.has(c.day))
}

/** Whether the record knows an evening's day either way: from the definition's start, the chip shown there, or a move in nature saying it (Rule 2). */
export function natureKnown(c: CheckIn, moveDays: ReadonlySet<string>): boolean {
  return c.day >= NATURE_SINCE && (chipShownAt('nature', c) || moveDays.has(c.day))
}

export interface NatureAssociations {
  /** The evening of a nature day, like for like on the morning's band: the evidence's same-day outcomes. */
  evening: Association
  /** The morning after, like for like on the evening's band. */
  morning: Association
}

/** A nature day's two comparisons, one rule for the sheet and the chip's answer: associations, never a cause. */
export function natureAssociations(checkins: readonly CheckIn[], outcomes: readonly Outcome[], today: string, worth?: number): NatureAssociations {
  const moves = natureMoveDays(outcomes)
  const evenings = new Map(checkins.filter((c) => c.block === 'evening').map((c) => [c.day, c]))
  const isDay = (day: string) => {
    const e = evenings.get(day)
    return e ? natureEvening(e, moves) : day >= NATURE_SINCE && moves.has(day)
  }
  const knownDay = (day: string) => {
    const e = evenings.get(day)
    return e ? natureKnown(e, moves) : day >= NATURE_SINCE && moves.has(day)
  }
  return {
    evening: dayAssociation(checkins, today, isDay, knownDay, worth === undefined ? undefined : { id: 'assoc.nature', worth }),
    morning: associationFor(checkins, today, (c) => natureEvening(c, moves), (c) => natureKnown(c, moves), worth === undefined ? undefined : { id: 'assoc.nature.morning', worth }),
  }
}

/** The name of the move in nature that makes today a nature day by itself, or null. */
export function natureMoveToday(outcomes: readonly Outcome[], day: string): string | null {
  if (!natureMoveDays(outcomes).has(day)) return null
  const x = outcomes.find((o) => o.day === day && o.outcome === 'done' && NATURE_MOVES.includes(o.moveId))
  return x ? (moveById(x.moveId)?.name ?? null) : null
}

import { addDays, blockStart, parseDay, type Block } from './blocks'
import { hasMove, moveById, type Move } from './catalogue'
import { copy } from './copy'
import type { DayContext, Offer, Outcome } from './db'
import { fill } from './format'
import { minutesOf } from './settings'

// People around (Part 20). Two tiers that never merge.
//
// Tier 1 is the only authority over whether a rep that needs another adult in person may be
// offered: today's own day record, exceptions included. The three chips on every summary rewrite
// today alone, both ways, so an office day worked from home has nobody around and a home day
// marked at the office has. A rep the owner picks himself outranks all of it.
//
// Tier 2 is evidence and never authority: how many in-person reps were marked Done in each kind
// of day and block over the last eight weeks. It may order a picker, say one counted line, ride
// the fact sheet as an observation and send the owner to correct tier 1. The draw never reads it,
// so history can neither widen nor narrow what is offered.

type Shape = Pick<DayContext, 'atOffice' | 'churchDay' | 'pickupTime'>

/** The block a time of day falls in. */
export function blockOfTime(hhmm: string): Block {
  const m = minutesOf(hhmm)
  if (m >= minutesOf(blockStart.evening)) return 'evening'
  if (m >= minutesOf(blockStart.afternoon)) return 'afternoon'
  return 'morning'
}

/** Tier 1: whether today's shape puts other adults around in a block. Anything the record does not say is not around. */
export function peopleAround(ctx: Shape | null | undefined, block: Block): boolean {
  if (!ctx) return false
  if (ctx.atOffice && (block === 'morning' || block === 'afternoon')) return true
  if (ctx.churchDay && block === 'morning') return true
  if (ctx.pickupTime) {
    // A daycare day: the drop-off in the morning, and the block that holds the pickup.
    if (block === 'morning' || block === blockOfTime(ctx.pickupTime)) return true
  }
  return false
}

export function peopleAroundByBlock(ctx: Shape | null | undefined): Record<Block, boolean> {
  return { morning: peopleAround(ctx, 'morning'), afternoon: peopleAround(ctx, 'afternoon'), evening: peopleAround(ctx, 'evening') }
}

/** Whether a move needs another adult there in person. */
export function inPerson(move: Pick<Move, 'with'>): boolean {
  return move.with === 'adult'
}

export type DayKind = 'weekday' | 'office' | 'weekend'

/** The kind of day, for tier 2's counts: the weekend, an office day, or a weekday at home. */
export function dayKindOf(day: string, ctx: Pick<DayContext, 'atOffice'> | null | undefined): DayKind {
  const w = parseDay(day).getDay()
  if (w === 0 || w === 6) return 'weekend'
  return ctx?.atOffice ? 'office' : 'weekday'
}

export const TIER2_WEEKS = 8

/** Tier 2: in-person reps marked Done per kind of day and block over the last eight weeks. Keyed `${kind}|${block}`. */
export function carriedByContext(offers: readonly Offer[], outcomes: readonly Outcome[], contexts: readonly DayContext[], today: string, weeks = TIER2_WEEKS): Map<string, number> {
  const since = addDays(today, -7 * weeks)
  const byId = new Map(offers.map((o) => [o.id as number, o]))
  const ctxByDay = new Map(contexts.map((c) => [c.day, c]))
  const out = new Map<string, number>()
  for (const x of outcomes) {
    if (x.outcome !== 'done' || x.day < since || x.day > today) continue
    const offer = byId.get(x.offerId)
    if (!offer || !hasMove(offer.moveId) || !inPerson(moveById(offer.moveId))) continue
    const key = `${dayKindOf(offer.day, ctxByDay.get(offer.day))}|${offer.block}`
    out.set(key, (out.get(key) ?? 0) + 1)
  }
  return out
}

/** Tier 2, use one: in a picker, in-person reps first in a context the record shows has carried one. The set is untouched; only the order moves. */
export function orderByEvidence<T extends Pick<Move, 'with'>>(reps: readonly T[], kind: DayKind, block: Block, carried: ReadonlyMap<string, number>): T[] {
  if (!(carried.get(`${kind}|${block}`) ?? 0)) return [...reps]
  return [...reps.filter((r) => inPerson(r)), ...reps.filter((r) => !inPerson(r))]
}

/** The words for a context: "Weekend afternoons", "Office-day mornings", "Weekday evenings at home". */
export function contextWords(kind: DayKind, block: Block): string {
  const c = copy.people
  return fill(c.contexts[kind], { blocks: c.blocks[block] })
}

/** Tier 2, use two: one counted line, a fact and never a claim. Null when the context has carried none. */
export function carriedLine(kind: DayKind, block: Block, carried: ReadonlyMap<string, number>): string | null {
  const n = carried.get(`${kind}|${block}`) ?? 0
  if (!n) return null
  return fill(copy.people.carried, { context: contextWords(kind, block), times: n === 1 ? copy.people.once : fill(copy.people.times, { n: String(n) }) })
}

/**
 * Tier 2, use four: contexts the record shows carrying in-person reps that the week's shape never
 * counts as people around, so the owner can correct tier 1 (a Settings constant, a chip, or a
 * pick by hand). The week's shape is read for each of the next seven days.
 */
export function uncoveredContexts(carried: ReadonlyMap<string, number>, week: readonly (Shape & { day: string })[]): { kind: DayKind; block: Block; n: number }[] {
  const covered = new Set<string>()
  for (const d of week) for (const block of ['morning', 'afternoon', 'evening'] as const) if (peopleAround(d, block)) covered.add(`${dayKindOf(d.day, d)}|${block}`)
  return [...carried.entries()]
    .filter(([key, n]) => n > 0 && !covered.has(key))
    .map(([key, n]) => {
      const [kind, block] = key.split('|') as [DayKind, Block]
      return { kind, block, n }
    })
    .sort((a, b) => b.n - a.n)
}

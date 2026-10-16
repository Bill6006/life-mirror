import type { Card, Claim } from './db'
import { ENGINE_VERSION } from './provenance'
import type { CardStats, Tier } from './tiers'

// Requirement 15 of the learning design agreed 2026-10-10, its record begun with the foundations: every
// call the engine makes about a test is kept with its day and level, so it can be resolved later and the
// engine's own track record counted ("of N early signs, M held"). A call is Promising, Holds up or
// Unhelpful; Little evidence and Unclear are no call. A step back from a call to either is kept too, as
// the call withdrawn. Kept only: nothing reads it to decide yet.

/** The levels that are calls: an early sign, an established finding, or one that hurts. */
export const CALLS: ReadonlySet<Tier> = new Set<Tier>(['promising', 'holdsUp', 'unhelpful'])

/** A card's level as Evidence shows it, with the statistics behind it when it has them. */
export interface CardLevel {
  tier: Tier
  stats?: CardStats
}

/** The calls a learning run makes: one for each card whose level differs from the last kept for it. */
export function claimsDue(cards: readonly Card[], levels: ReadonlyMap<number, CardLevel>, kept: readonly Claim[], day: string, at: string): Claim[] {
  const last = new Map<number, Tier>()
  for (const c of [...kept].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id ?? 0) - (b.id ?? 0)))) last.set(c.cardId, c.level)
  const out: Claim[] = []
  for (const card of cards) {
    const id = card.id
    if (id === undefined) continue
    const now = levels.get(id)
    if (!now) continue
    const before = last.get(id)
    // No call, and none to withdraw: nothing kept.
    if (before === now.tier || (!CALLS.has(now.tier) && (before === undefined || !CALLS.has(before)))) continue
    const s = now.stats
    out.push({
      cardId: id,
      moveId: card.moveId,
      situationKey: card.situationKey,
      target: card.target,
      day,
      at,
      level: now.tier,
      interval: s?.interval ? { diff: s.interval.diff, lo: s.interval.lo, hi: s.interval.hi, p: s.interval.p } : null,
      estimator: s?.estimator ?? null,
      n: { done: s?.n.done ?? 0, alternative: s?.n.alternative ?? 0 },
      engine: ENGINE_VERSION,
    })
  }
  return out
}

import { compare, difference, MIN_SIDE, standings, type Compared, type Point } from './compare'

// A named comparison, as every surface of the app asks the core for one (2026-11-12). The occasions are laid out as
// the core takes them, each with the band it started in. Only occasions in a band both sides share count toward the
// minimum: eight of them a side, or nothing is tested, however many unmatched occasions there are. The chance is kept
// by exactly what it was computed from, so a family that two screens gather pays for its shuffles once.

/** A comparison's own id in its family, and the size worth saying on its outcome's scale. */
export interface Named {
  id: string
  worth: number
}

/** One entry for each id; an entry is used only when every occasion matches. */
const keptChance = new Map<string, { from: string; compared: Compared }>()
const KEPT_MOST = 400

/** The core's comparison, worked out once for the same occasions, id and size. */
export function comparedOnce(occasions: readonly Point[], named: Named): Compared {
  const from = `${named.worth}|${occasions.map((p) => `${p.day}${p.event ? '+' : '-'}${p.band ?? ''}:${p.outcome}`).join(';')}`
  const kept = keptChance.get(named.id)
  if (kept && kept.from === from) return kept.compared
  const compared = compare(occasions, named)
  if (keptChance.size >= KEPT_MOST) keptChance.clear()
  keptChance.set(named.id, { from, compared })
  return compared
}

/**
 * The comparison as its family reads it. `floor` is a stricter minimum of the caller's own (the caffeine comparisons
 * ask fifteen in each group across six weeks): where it is not met, nothing is tested and the comparison is too few.
 */
export function namedComparison(occasions: readonly Point[], named: Named, floor = true): Compared {
  const withIt = new Set(occasions.filter((p) => p.event).map((p) => p.band ?? ''))
  const without = new Set(occasions.filter((p) => !p.event).map((p) => p.band ?? ''))
  const shared = occasions.filter((p) => withIt.has(p.band ?? '') && without.has(p.band ?? ''))
  const n = shared.filter((p) => p.event).length
  const m = shared.length - n
  const tested = floor && n >= MIN_SIDE && m >= MIN_SIDE ? comparedOnce(occasions, named) : null
  return { id: named.id, n, m, diff: shared.length ? difference(occasions) : null, enough: tested !== null && tested.enough, p: tested?.p ?? null, worth: named.worth }
}

/**
 * Where a comparison stands on its own, before any family's correction: too few, no clear pattern, or at least a
 * lead. Whether it is a lead or a steady pattern is the family's to say; the old three-valued word needs only this.
 */
export function standsAlone(c: Compared): 'tooFew' | 'noPattern' | 'lead' {
  const own = standings([c])[0].standing
  return own === 'pattern' ? 'lead' : own
}

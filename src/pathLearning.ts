import { seeded as seededRng } from './bandit'
import type { Block } from './blocks'
import type { CheckIn } from './db'
import { indexCheckIns, slotKey, windowSlots } from './learning'
import type { PathEntry } from './pathStage'
import { readingOf } from './score'
import { bootstrapDiff, type Arm } from './tiers'

// Honest learning on the path (Part 25): the reps keep teaching the app without pretending a
// judged pick is a fair comparison. Only steps the app drew between two or more reps, with every
// chance kept, are compared; a rep picked by you, or chosen by a rule, is counted and never
// compared. A difference is said only once each side has five, and never above Promising: it is
// one person's small numbers.

/** Next-block readings each side needs before a difference is said. */
export const PATH_MIN_PER_ARM = 5

/** The tiers a path comparison can reach: never Holds up. */
export type PathTier = 'little' | 'unclear' | 'promising' | 'unhelpful'

export interface RepComparison {
  moveId: string
  /** Drawn and the next block logged: after this rep, and after another rep drawn where this one could have been. */
  n: number
  m: number
  /** The weighted mean next-block reading after this rep minus after the others, out of 100; null below five a side. */
  diff: number | null
  tier: PathTier
}

/** A draw the comparisons may read: the app drew it between two or more reps and kept every chance. */
export function isComparable(e: Pick<PathEntry, 'rule' | 'chosenBy' | 'chances'>): boolean {
  if (e.rule !== 'draw' || e.chosenBy !== 'app' || !e.chances) return false
  const ps = Object.values(e.chances)
  return ps.length >= 2 && ps.every((p) => p > 0 && p < 1)
}

/** The reading out of 100 of the block after a step, when that block was logged. */
function nextBlockReading(byKey: ReadonlyMap<string, CheckIn>, day: string, block: Block): number | null {
  const [slot] = windowSlots(day, block, 'nextBlock')
  const c = slot ? byKey.get(slotKey(slot.day, slot.block)) : undefined
  return c ? (readingOf(c)?.value ?? null) : null
}

/**
 * For each rep drawn: the next block after it, against the next block after another rep drawn in a
 * draw it was part of. Each side is weighted by the inverse of the chance that put it there, this
 * rep's chance or the chance of not drawing it, so chance alone decides the comparison.
 */
export function repComparisons(entries: readonly PathEntry[], checkins: readonly CheckIn[], seed = 7): RepComparison[] {
  const byKey = indexCheckIns(checkins)
  const draws = entries
    .filter(isComparable)
    .map((e) => ({ e, chances: e.chances as Record<string, number>, y: nextBlockReading(byKey, e.day, e.block) }))
    .filter((d): d is { e: PathEntry; chances: Record<string, number>; y: number } => d.y !== null)
  const ids = [...new Set(entries.filter(isComparable).map((e) => e.moveId))]
  const rng = seededRng(seed)
  return ids.map((id) => {
    const mine: Arm[] = []
    const others: Arm[] = []
    for (const d of draws) {
      const p = d.chances[id]
      if (p === undefined) continue
      if (d.e.moveId === id) mine.push({ value: d.y, weight: 1 / p })
      else others.push({ value: d.y, weight: 1 / (1 - p) })
    }
    if (mine.length < PATH_MIN_PER_ARM || others.length < PATH_MIN_PER_ARM) return { moveId: id, n: mine.length, m: others.length, diff: null, tier: 'little' as const }
    const iv = bootstrapDiff(mine, others, 0.95, rng)
    const tier: PathTier = iv.hi < 0 ? 'unhelpful' : iv.lo > 0 ? 'promising' : 'unclear'
    return { moveId: id, n: mine.length, m: others.length, diff: Math.round(iv.diff), tier }
  })
}

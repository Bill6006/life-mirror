import type { Extras, NecessityKey } from './db'

// The necessities on the evening extras (Phase 11): a shower and a proper meal, each a tap marking a
// miss; and, since 2026-10-02, teeth brushed today as a count, 0, 1 or 2 (twice or more), tapped
// explicitly. Silence is never evidence. An older record's teeth miss (necessities.teeth) is read as
// what it said, not brushed, and never as a count of how often.

export type TeethBrushed = 0 | 1 | 2
export const TEETH_COUNTS: readonly TeethBrushed[] = [0, 1, 2]
/** The first evening the count was asked: a chip's thirty untapped evenings start here for it, never from the miss it replaced. */
export const TEETH_COUNT_SINCE = '2026-10-02'

/** Teeth brushed today as the record holds it: the count tapped, or 0 for a miss tapped before the count existed; null when unknown. */
export function teethOf(ex: Pick<Extras, 'teethBrushed' | 'necessities'> | undefined): TeethBrushed | null {
  if (ex?.teethBrushed !== undefined) return ex.teethBrushed
  return ex?.necessities?.teeth ? 0 : null
}

/** The necessities missed that day: a shower or a meal tapped as missed, teeth brushed none. Unknown is never a miss. */
export function necessitiesMissed(ex: Pick<Extras, 'teethBrushed' | 'necessities'> | undefined): NecessityKey[] {
  const out: NecessityKey[] = []
  if (ex?.necessities?.shower) out.push('shower')
  if (teethOf(ex) === 0) out.push('teeth')
  if (ex?.necessities?.food) out.push('food')
  return out
}

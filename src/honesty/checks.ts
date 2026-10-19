import { hasMove, moveById } from '../catalogue'
import type { AnchorSwap, CheckIn, DayContext, ForecastScore, Offer, Outcome } from '../db'
import type { Frequency, Settings } from '../settings'
import { readMisses, type MissReading } from './misses'
import { readMissing, type MissingReading } from './missing'
import { togetherFlags, togetherRequests, type TogetherFlag } from './together'

// The honesty checks the record runs on itself (stage R7): requirement 3's readings that move together, requirement
// 12's misses read for where they cluster, and requirement 13's check of whether missing relates to state. Read together
// from one record, so the weekly view and the Sunday review's facts say the same.

export interface HonestyRecords {
  checkins: readonly CheckIn[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  contexts: readonly DayContext[]
  scores: readonly ForecastScore[]
  swaps: readonly AnchorSwap[]
  frequency: Frequency
  togetherAnswers: Settings['togetherAnswers']
}

export interface HonestyChecks {
  /** The pairs put to the owner this month, unanswered. */
  together: TogetherFlag[]
  /** The owner's standing requests to reword or merge a pair. */
  requests: ReturnType<typeof togetherRequests>
  misses: MissReading
  missing: MissingReading
}

/** The checks as the weekly view shows them: a cluster after a faith practice is left out while faith is hidden, as the view's other analyses leave it. */
export function checksAsShown(c: HonestyChecks, hideFaith: boolean): HonestyChecks {
  if (!hideFaith) return c
  const faith = (id: string) => hasMove(id) && (moveById(id).family === 'faith' || moveById(id).hiddenWith === 'faith')
  return { ...c, misses: { ...c.misses, clusters: c.misses.clusters.filter((x) => !(x.cause.kind === 'move' && faith(x.cause.moveId))) } }
}

export function honestyChecks(r: HonestyRecords, today: string): HonestyChecks {
  return {
    together: togetherFlags(r.checkins, today, r.togetherAnswers),
    requests: togetherRequests(r.togetherAnswers),
    misses: readMisses(r, today),
    missing: readMissing(r, today),
  }
}

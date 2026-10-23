import { addDays } from './time'
import type { Store } from './turso'

// The learning engine's failures on the phone, as its newest facts row of the day and the day before keeps them (the
// owner's requirement of 2026-10-20: no fallback; the failure shown). Counts, days and the error's name alone. Since
// 2026-10-23 (the blank Now) the phone's storage interrupted under the app the same way: counts, minutes, the error's
// name, and how often Now waited past its limit with the reads that had not answered.

export interface EngineReport {
  day: string
  /** When the newest facts row was built, or null with none. */
  builtAt: string | null
  fault: { count: number; first: string; last: string; name: string } | null
  storage: { count: number; first: string; last: string; name: string; waits?: number; waited?: string[] } | null
}

export async function engineReport(store: Pick<Store, 'readFacts'>, day: string): Promise<EngineReport> {
  const found = (await Promise.all([addDays(day, -1), day].map((d) => store.readFacts(d)))).filter((f): f is NonNullable<typeof f> => f !== null)
  const newest = found.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
  return { day, builtAt: newest ? newest.sheet.builtAt : null, fault: newest?.sheet.engineFault ?? null, storage: newest?.sheet.storageFault ?? null }
}

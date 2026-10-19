// The learning repair's safety net (stage R6). The rebuild has only met stand-in records, so a record of a shape no test
// foresaw must never stop the owner's suggestions. If a rebuild throws, the repair closes on this phone for the rest of
// the session: the draw and every screen run exactly as before the switch, and the next start of the app tries again.
// Each trip is kept on this phone, a count, its first and last day and the error's name, never anything of the record,
// and Evidence says it happened. It stays out of the use log, which records the owner's use, never the app's faults.

/** Where the trips are kept: this phone's own storage, never synced. */
export const FAULT_KEY = 'life-mirror.repair.faults'

/** How long Evidence keeps saying it: four weeks after the last trip. */
export const FAULT_SHOWN_DAYS = 28

/** The browser tests' stand-in for a record no test foresaw: a key only an automated test browser can set, as with the preview's. */
const FAULT_TEST_KEY = 'life-mirror.test.repairFault'

/** The page's storage and automation flag, where there are any (the service worker has neither storage nor the flag). */
function page(): { navigator?: { webdriver?: boolean }; localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } } {
  return globalThis as never
}

/** Whether an automated test browser asked every rebuild to throw, so the breaker can be checked in the built app. */
export function faultForTests(): boolean {
  try {
    const g = page()
    return g.navigator?.webdriver === true && g.localStorage?.getItem(FAULT_TEST_KEY) === '1'
  } catch {
    return false
  }
}

export interface RepairFaults {
  count: number
  first: string
  last: string
  /** The error's name (TypeError, RangeError), never its message, which could carry what it was reading. */
  name: string
}

let tripped = false
const listeners = new Set<() => void>()

/** Whether a rebuild has thrown since the app started. */
export function repairTripped(): boolean {
  return tripped
}

/** The trips kept on this phone, or null when there are none or the storage cannot be read. */
export function repairFaults(): RepairFaults | null {
  try {
    const raw = page().localStorage?.getItem(FAULT_KEY) ?? null
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<RepairFaults>
    return typeof v.count === 'number' && typeof v.first === 'string' && typeof v.last === 'string' ? { count: v.count, first: v.first, last: v.last, name: typeof v.name === 'string' ? v.name : 'Error' } : null
  } catch {
    return null
  }
}

/**
 * Closes the repair for the rest of the session and keeps the trip, once a session: reads already under way when it trips
 * may throw too, and they are the same trip. Never throws.
 */
export function tripRepair(e: unknown, day: string): void {
  if (tripped) return
  tripped = true
  try {
    const prev = repairFaults()
    const name = e instanceof Error ? e.name : typeof e
    page().localStorage?.setItem(FAULT_KEY, JSON.stringify({ count: (prev?.count ?? 0) + 1, first: prev?.first ?? day, last: day, name }))
  } catch {
    // The record of a trip is an instrument; the app never fails for it.
  }
  for (const l of [...listeners]) l()
}

/** Called once when the repair trips, so a screen drawn with it open can redraw closed. Returns the unsubscribe. */
export function onRepairTrip(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Runs one read of the repair; if it throws, trips the breaker and gives the fallback. */
export async function guardRepair<T>(day: string, read: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (e) {
    console.error(e)
    tripRepair(e, day)
    return fallback
  }
}

/** The same for a read that does not wait, so a caller that reads the database after it keeps every read in one stretch. */
export function guardRepairNow<T>(day: string, read: () => T, fallback: T): T {
  try {
    return read()
  } catch (e) {
    console.error(e)
    tripRepair(e, day)
    return fallback
  }
}

/** For tests: the breaker as a new start of the app finds it. */
export function resetRepairBreaker(): void {
  tripped = false
}

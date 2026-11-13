// The comparisons' own failures on this phone (2026-11-12). The chance behind a standing is new math, so every place
// the app asks the core for it runs under this guard, as the learning engine's rebuild runs under its own: the
// evidence's arithmetic, the sheet's family, best days, "What comes before your days" and your own chips. If a read
// throws, its caller goes on without the comparisons and says so, and the failure is kept here for the Worker's
// report: how many, the first and last day, and the error's name, never its message.

export interface ComparisonFault {
  count: number
  first: string
  last: string
  name: string
}

let fault: ComparisonFault | null = null

/** One read of the comparisons: its result, or null when it threw, with the failure kept. */
export function guardComparisons<T>(day: string, read: () => T): T | null {
  try {
    return read()
  } catch (e) {
    noteComparisonFault(day, e)
    return null
  }
}

/** A failure of the comparisons kept for the Worker's report: by a read under the guard, or by the pattern table's build (2026-11-13). */
export function noteComparisonFault(day: string, e: unknown): void {
  console.error(e)
  const name = e instanceof Error && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'Error'
  fault = { count: (fault?.count ?? 0) + 1, first: fault?.first ?? day, last: day, name }
}

/** The failures since the app started, or null. */
export function comparisonFaults(): ComparisonFault | null {
  return fault
}

/** For tests: the failures as a new start of the app finds them. */
export function resetComparisonFaults(): void {
  fault = null
}

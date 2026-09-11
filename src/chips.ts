import { addDays } from './blocks'
import type { CheckIn } from './db'
import { readingOf } from './score'

// The two evening chips are answered at once from your own record: how many evenings before
// carried the same chip, and what the following days' readings averaged. A calculation,
// shown in its register; "first time recorded" until there is one.

export type ChipKey = 'nothingLanded' | 'hardToSeePoint'

export interface ChipAnswer {
  /** Evenings before today that carried this chip. */
  times: number
  /** Mean reading out of 100 across the check-ins of the days that followed, or null when none. */
  nextDayMean: number | null
  /** How many check-ins that mean rests on. */
  nextDays: number
}

export function chipAnswer(all: readonly CheckIn[], key: ChipKey, today: string): ChipAnswer {
  const days = [...new Set(all.filter((c) => c.day < today && c.extras?.[key]).map((c) => c.day))]
  const values: number[] = []
  for (const d of days) {
    const next = addDays(d, 1)
    for (const c of all) {
      if (c.day !== next) continue
      const r = readingOf(c)
      if (r) values.push(r.value)
    }
  }
  const nextDayMean = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null
  return { times: days.length, nextDayMean, nextDays: values.length }
}

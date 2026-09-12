import { addDays, daysBetween } from './blocks'

// Change detection for sharp breaks: over the last four weeks of day readings, the split that
// separates the two halves most cleanly; when the halves differ by more than three standard
// errors, the baseline has shifted, and the notice says since when and what it rests on.

export const SHIFT_WINDOW_DAYS = 28
export const SHIFT_MIN_EACH = 5
export const SHIFT_THRESHOLD = 3

export interface Shift {
  since: string
  before: { mean: number; n: number }
  after: { mean: number; n: number }
  diff: number
  t: number
  shifted: boolean
  days: number
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length
}

function variance(xs: readonly number[], m: number): number {
  return xs.length > 1 ? xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1) : 0
}

/** The best split of the window's day readings into before and after, and whether it clears the bar. Null with too few days. */
export function baselineShift(readings: readonly { day: string; value: number }[], today: string, window = SHIFT_WINDOW_DAYS, minEach = SHIFT_MIN_EACH, threshold = SHIFT_THRESHOLD): Shift | null {
  const start = addDays(today, -window)
  const inWindow = readings.filter((r) => r.day >= start && r.day < today).sort((a, b) => (a.day < b.day ? -1 : 1))
  if (inWindow.length < 2 * minEach) return null
  let best: Shift | null = null
  for (let i = minEach; i <= inWindow.length - minEach; i++) {
    const before = inWindow.slice(0, i).map((r) => r.value)
    const after = inWindow.slice(i).map((r) => r.value)
    const mb = mean(before)
    const ma = mean(after)
    const pooled = ((before.length - 1) * variance(before, mb) + (after.length - 1) * variance(after, ma)) / (before.length + after.length - 2)
    const se = Math.sqrt(Math.max(pooled, 1) * (1 / before.length + 1 / after.length))
    const t = (ma - mb) / se
    if (!best || Math.abs(t) > Math.abs(best.t)) {
      best = { since: inWindow[i].day, before: { mean: Math.round(mb), n: before.length }, after: { mean: Math.round(ma), n: after.length }, diff: Math.round(ma - mb), t: Math.round(t * 10) / 10, shifted: Math.abs(t) >= threshold, days: inWindow.length }
    }
  }
  return best
}

export function daysSince(day: string, today: string): number {
  return daysBetween(day, today)
}

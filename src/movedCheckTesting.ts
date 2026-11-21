import { addDays, type Block } from './blocks'
import type { Forecast, ForecastScore } from './db'

// Stand-in rows for the moved forecasts' check (Batch 3, 2026-11-21), for tests alone: moved forecasts carrying their
// plain forecast, each with its score, built so each one's gain (the plain miss less its own) is exactly what is asked.

/** The slots a day's stand-in rows take, in turn: the three check-ins forecast that morning, then the three a day ahead. */
export const CHECK_SLOTS: readonly [Block, number][] = [
  ['morning', 0],
  ['afternoon', 0],
  ['evening', 0],
  ['morning', 1],
  ['afternoon', 1],
  ['evening', 1],
]

/**
 * One moved forecast and its score, its gain exactly `gain`: where it came closer, it missed by 1 and the plain one by
 * 1 + gain; where it did not, it missed by 1 − gain and the plain one by 1. Each range runs `width` either side of its
 * point, so a range holds where its point missed by no more than that.
 */
export function checkPair(day: string, slot: number, gain: number, opts: { scoredOn?: string; actual?: number; width?: number } = {}): { forecast: Forecast; score: ForecastScore } {
  const [block, horizon] = CHECK_SLOTS[slot]
  const actual = opts.actual ?? 50
  const width = opts.width ?? 5
  const moved = gain >= 0 ? actual + 1 : actual + 1 - gain
  const plain = gain >= 0 ? actual - 1 - gain : actual - 1
  const forecast: Forecast = { day, block, horizon, madeOn: addDays(day, -horizon), model: 'sameBlock', point: moved, lo: moved - width, hi: moved + width, whatIf: null, adj: moved - plain, adjBy: ['sleep.short'], plain: { point: plain, lo: plain - width, hi: plain + width } }
  const score: ForecastScore = { day, block, horizon, model: 'sameBlock', point: moved, lo: moved - width, hi: moved + width, actual, error: actual - moved, hit: moved - width <= actual && actual <= moved + width, scoredOn: opts.scoredOn ?? day }
  return { forecast, score }
}

/**
 * Days of stand-in rows from `start`, one day for each gain given: that day's first row carries the day's whole gain and
 * the rest carry none, `perDay` rows a day, each scored on its own day.
 */
export function checkDays(gains: readonly number[], start: string, perDay = 4): { forecasts: Forecast[]; scores: ForecastScore[] } {
  const forecasts: Forecast[] = []
  const scores: ForecastScore[] = []
  gains.forEach((g, i) => {
    const day = addDays(start, i)
    for (let slot = 0; slot < perDay; slot++) {
      const p = checkPair(day, slot, slot === 0 ? g : 0)
      forecasts.push(p.forecast)
      scores.push(p.score)
    }
  })
  return { forecasts, scores }
}

/** Day gains that alternate `a + d` and `a − d`, `days` of them: over ten days their clearance is exactly 3a / d. */
export const alternating = (a: number, days: number, d = 3): number[] => Array.from({ length: days }, (_, i) => (i % 2 === 0 ? a + d : a - d))

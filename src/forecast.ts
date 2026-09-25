import { addDays, BLOCKS, daysBetween, type Block } from './blocks'
import type { CheckIn, Forecast, ForecastScore } from './db'
import { slotKey } from './learning'
import { readingOf } from './score'

// Forecasts are ranges, not claims. "As you usually are" is chosen daily from a few candidate
// models fitted to the record: the one that would have scored best on past days is used and
// named. The range is the 20th to 80th band of that model's past errors. A forecast is saved
// before the outcome and never rewritten; scored in a separate record; days with no check-in
// are not scored. "If you did nothing extra" is a separate line, an assumption never verified.

export type ModelId = 'sameBlock' | 'weekdayBlock' | 'lastValue' | 'blend'
export const MODELS: readonly ModelId[] = ['sameBlock', 'weekdayBlock', 'lastValue', 'blend']

export const MIN_DAYS_TODAY = 7
export const MIN_DAYS_WEEK = 14
export const BACKTEST_DAYS = 28
export const LOOKBACK_DAYS = 28
export const HALF_LIFE_DAYS = 7
export const RANGE_LOW = 0.2
export const RANGE_HIGH = 0.8
export const HORIZON = 7
export const TARGET_HIT_RATE = 0.6
export const WARNING_WINDOW = 6
export const WARNING_UNDER = 4

/** The reading out of 100 per fully logged slot. */
export function valuesByKey(checkins: readonly CheckIn[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of checkins) {
    const r = readingOf(c)
    if (r) out.set(slotKey(c.day, c.block), r.value)
  }
  return out
}

/** Days with at least one fully logged block. */
export function loggedDays(values: ReadonlyMap<string, number>): number {
  return new Set([...values.keys()].map((k) => k.split('|')[0])).size
}

function sameBlock(values: ReadonlyMap<string, number>, day: string, block: Block): number | null {
  let sum = 0
  let weight = 0
  let n = 0
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const v = values.get(slotKey(addDays(day, -back), block))
    if (v === undefined) continue
    const w = 0.5 ** (back / HALF_LIFE_DAYS)
    sum += w * v
    weight += w
    n++
  }
  return n >= 3 ? sum / weight : null
}

function weekdayBlock(values: ReadonlyMap<string, number>, day: string, block: Block): number | null {
  let sum = 0
  let n = 0
  for (let back = 7; back <= 56; back += 7) {
    const v = values.get(slotKey(addDays(day, -back), block))
    if (v === undefined) continue
    sum += v
    n++
  }
  return n >= 2 ? sum / n : null
}

function lastValue(values: ReadonlyMap<string, number>, day: string, block: Block): number | null {
  for (let back = 1; back <= 14; back++) {
    const v = values.get(slotKey(addDays(day, -back), block))
    if (v !== undefined) return v
  }
  return null
}

/** One model's point forecast for a slot, from the record strictly before that day. */
export function predict(model: ModelId, values: ReadonlyMap<string, number>, day: string, block: Block): number | null {
  switch (model) {
    case 'sameBlock':
      return sameBlock(values, day, block)
    case 'weekdayBlock':
      return weekdayBlock(values, day, block) ?? sameBlock(values, day, block)
    case 'lastValue':
      return lastValue(values, day, block)
    case 'blend': {
      const a = sameBlock(values, day, block)
      const b = weekdayBlock(values, day, block)
      if (a === null) return b
      if (b === null) return a
      return (a + b) / 2
    }
  }
}

export interface Backtest {
  model: ModelId
  /** Days ahead the forecasts were made, 1 by default. */
  horizon: number
  /** Mean absolute error over the past days it could forecast. */
  mae: number | null
  n: number
  /** Actual minus forecast, in points, for the range. */
  errors: number[]
}

/** The record as it stood at the end of a day: every slot on or before it. */
export function visibleBefore(values: ReadonlyMap<string, number>, lastDay: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [key, v] of values) if (key.slice(0, 10) <= lastDay) out.set(key, v)
  return out
}

/**
 * How a model would have done on the past days: each slot forecast from the record as it stood
 * that many days before, so a range for a day seven out rests on errors made seven days out.
 */
export function backtest(model: ModelId, values: ReadonlyMap<string, number>, today: string, days = BACKTEST_DAYS, horizon = 1): Backtest {
  const errors: number[] = []
  for (let back = 1; back <= days; back++) {
    const day = addDays(today, -back)
    const seen = horizon <= 1 ? values : visibleBefore(values, addDays(day, -horizon))
    for (const block of BLOCKS) {
      const actual = values.get(slotKey(day, block))
      if (actual === undefined) continue
      const p = predict(model, seen, day, block)
      if (p === null) continue
      errors.push(actual - p)
    }
  }
  const mae = errors.length ? errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length : null
  return { model, horizon, mae, n: errors.length, errors }
}

export interface Chosen {
  model: ModelId
  backtests: Backtest[]
}

/** The model that would have scored best on the past days, named. Null while no model has five scored slots. */
export function chooseModel(values: ReadonlyMap<string, number>, today: string): Chosen | null {
  const backtests = MODELS.map((m) => backtest(m, values, today))
  const able = backtests.filter((b) => b.mae !== null && b.n >= 5)
  if (!able.length) return null
  const best = able.reduce((a, b) => ((b.mae as number) < (a.mae as number) ? b : a))
  return { model: best.model, backtests }
}

function percentile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))
  return sorted[i]
}

/** The range: the 20th to 80th band of the model's past errors, around the point. */
export function errorBand(errors: readonly number[]): { lo: number; hi: number } {
  const sorted = [...errors].sort((a, b) => a - b)
  return { lo: percentile(sorted, RANGE_LOW), hi: percentile(sorted, RANGE_HIGH) }
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

export interface SlotForecast {
  point: number
  lo: number
  hi: number
}

/** The one-step range of the chosen model: the band of its past errors a day out. */
function oneStepBand(chosen: Chosen): { lo: number; hi: number } {
  return errorBand(chosen.backtests.find((b) => b.model === chosen.model)?.errors ?? [])
}

/**
 * The range for a horizon: the band of the chosen model's past errors made that many days out,
 * or its one-step band while fewer than five past slots could be forecast that far ahead.
 */
export function horizonBand(chosen: Chosen, values: ReadonlyMap<string, number>, today: string, horizon: number): { lo: number; hi: number } {
  if (horizon <= 1) return oneStepBand(chosen)
  const far = backtest(chosen.model, values, today, BACKTEST_DAYS, horizon)
  return far.n >= 5 ? errorBand(far.errors) : oneStepBand(chosen)
}

export function forecastSlot(chosen: Chosen, values: ReadonlyMap<string, number>, day: string, block: Block, band: { lo: number; hi: number } = oneStepBand(chosen)): SlotForecast | null {
  const p = predict(chosen.model, values, day, block)
  if (p === null) return null
  return { point: clamp(p), lo: clamp(p + band.lo), hi: clamp(p + band.hi) }
}

/** "If you did nothing extra": the same-block mean over the days no move was marked done in that block. An assumption, never verified. */
export function whatIf(values: ReadonlyMap<string, number>, doneSlots: ReadonlySet<string>, day: string, block: Block): number | null {
  let sum = 0
  let weight = 0
  let n = 0
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const past = addDays(day, -back)
    const v = values.get(slotKey(past, block))
    if (v === undefined || doneSlots.has(slotKey(past, block))) continue
    const w = 0.5 ** (back / HALF_LIFE_DAYS)
    sum += w * v
    weight += w
    n++
  }
  return n >= 3 ? clamp(sum / weight) : null
}

/** The forecasts to write now: every slot from today out to the horizon that has no forecast yet at that horizon and no reading yet. Never a rewrite. */
export function forecastsDue(chosen: Chosen, values: ReadonlyMap<string, number>, existing: readonly Forecast[], today: string, doneSlots: ReadonlySet<string>): Forecast[] {
  const days = loggedDays(values)
  const have = new Set(existing.map((f) => `${f.day}|${f.block}|${f.horizon}`))
  const out: Forecast[] = []
  const maxHorizon = days >= MIN_DAYS_WEEK ? HORIZON : days >= MIN_DAYS_TODAY ? 0 : -1
  for (let h = 0; h <= maxHorizon; h++) {
    const day = addDays(today, h)
    // Today's shape and tomorrow rest on the one-step band; each day further out on the errors made that far out.
    const band = horizonBand(chosen, values, today, Math.max(1, h))
    for (const block of BLOCKS) {
      if (have.has(`${day}|${block}|${h}`)) continue
      if (values.has(slotKey(day, block))) continue
      const f = forecastSlot(chosen, values, day, block, band)
      if (!f) continue
      out.push({ day, block, horizon: h, madeOn: today, model: chosen.model, point: f.point, lo: f.lo, hi: f.hi, whatIf: whatIf(values, doneSlots, day, block) })
    }
  }
  return out
}

export interface AheadRow {
  day: string
  expected: number | null
  lo: number | null
  hi: number | null
}

/**
 * The seven days ahead from the forecasts on record: each day's expected value and range as the
 * mean of its blocks' forecasts made at that horizon; a day with none is a gap, not a guess.
 */
export function weekAheadRows(forecasts: readonly Forecast[], today: string): AheadRow[] {
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null)
  return Array.from({ length: HORIZON }, (_, i) => {
    const day = addDays(today, i + 1)
    const rows = forecasts.filter((f) => f.day === day && f.horizon === i + 1)
    return { day, expected: mean(rows.map((f) => f.point)), lo: mean(rows.map((f) => f.lo)), hi: mean(rows.map((f) => f.hi)) }
  })
}

/**
 * Whether a model can tell one weekday from another. The same-block and last-value models have no
 * weekday term: every day ahead rests on the same recent record, so the week comes out alike.
 */
export function tellsWeekdaysApart(model: ModelId): boolean {
  return model === 'weekdayBlock' || model === 'blend'
}

/**
 * The days ahead worth planning around: every day at the lowest expected reading. None when no day
 * reads lower than another, or when the model cannot tell weekdays apart, since then any difference
 * between its days is the edge of its window or rounding, not the day.
 */
export function lowestAhead(rows: readonly { expected: number | null }[], model: ModelId | null): number[] {
  if (model !== null && !tellsWeekdaysApart(model)) return []
  const values = rows.flatMap((r) => (r.expected === null ? [] : [r.expected]))
  if (!values.length) return []
  const min = Math.min(...values)
  if (values.every((v) => v === min)) return []
  return rows.flatMap((r, i) => (r.expected === min ? [i] : []))
}

/** A forecast is scored once its slot is logged; a slot never logged is never scored. */
export function scoresDue(forecasts: readonly Forecast[], values: ReadonlyMap<string, number>, scored: readonly ForecastScore[], today: string): ForecastScore[] {
  const have = new Set(scored.map((s) => `${s.day}|${s.block}|${s.horizon}`))
  const out: ForecastScore[] = []
  for (const f of forecasts) {
    const key = `${f.day}|${f.block}|${f.horizon}`
    if (have.has(key)) continue
    const actual = values.get(slotKey(f.day, f.block))
    if (actual === undefined) continue
    out.push({ day: f.day, block: f.block, horizon: f.horizon, model: f.model, point: f.point, lo: f.lo, hi: f.hi, actual, error: actual - f.point, hit: actual >= f.lo && actual <= f.hi, scoredOn: today })
  }
  return out
}

export interface Warning {
  /** Logged blocks among the last six that read under the forecast's low band. */
  under: number
  of: number
  warning: boolean
}

/**
 * Early warning, from the same models: a stretch is starting when four of the last six logged
 * blocks read under the low band of what was expected. Never a verdict: a count, pointed at
 * the two evening chips and the necessities.
 */
export function earlyWarning(values: ReadonlyMap<string, number>, lowOf: (key: string) => number | null, today: string): Warning {
  const keys: string[] = []
  for (let back = 0; back <= 6 && keys.length < WARNING_WINDOW; back++) {
    const day = addDays(today, -back)
    for (const block of [...BLOCKS].reverse()) {
      const key = slotKey(day, block)
      if (values.has(key) && lowOf(key) !== null) keys.push(key)
      if (keys.length >= WARNING_WINDOW) break
    }
  }
  const under = keys.filter((k) => (values.get(k) as number) < (lowOf(k) as number)).length
  return { under, of: keys.length, warning: keys.length >= WARNING_WINDOW && under >= WARNING_UNDER }
}

/** The mean of a day's forecasts and actuals over the blocks that were logged, for yesterday beside what happened. */
export function dayBeside(forecasts: readonly Forecast[], values: ReadonlyMap<string, number>, day: string, horizon = 1): { expected: number; lo: number; hi: number; actual: number; blocks: number; hit: boolean } | null {
  const rows = forecasts.filter((f) => f.day === day && f.horizon === horizon && values.has(slotKey(f.day, f.block)))
  if (!rows.length) return null
  const mean = (xs: number[]) => Math.round(xs.reduce((s, v) => s + v, 0) / xs.length)
  const expected = mean(rows.map((f) => f.point))
  const lo = mean(rows.map((f) => f.lo))
  const hi = mean(rows.map((f) => f.hi))
  const actual = mean(rows.map((f) => values.get(slotKey(f.day, f.block)) as number))
  return { expected, lo, hi, actual, blocks: rows.length, hit: actual >= lo && actual <= hi }
}

export function daysOfRecord(checkins: readonly CheckIn[], today: string): number {
  const first = checkins.reduce<string | null>((f, c) => (f === null || c.day < f ? c.day : f), null)
  return first ? daysBetween(first, today) + 1 : 0
}

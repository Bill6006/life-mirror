import { BLOCKS } from '../blocks'
import { ratesBy, standings, type CellPoint, type CellRate, type Direction, type Standing } from './compare'
import { type CountedInput, type DayFacts, dayFactsOf, type Kind, kindsOf } from './kinds'
import { beforeDay, type Days, daysOf, type Occasion } from './occasions'
import { LEVEL_BANDS } from './stored'

// The pattern table (the counted foundation, 2026-11-12; kept and served since 2026-11-13). For each kind the record
// can count: when it was recorded, by the weekday, by the check-in of the day, and by what came before the day. Every
// cell is "k of n" over the occasions where the record could say either way, and every cell of every split of one
// kind is one family: the chance check pays for every place it looked. Beside the kinds, the reading out of 100 in
// each cell, as an average and as counts in the five bands: counted, with no chance and no standing of its own.

export type Split = 'weekday' | 'checkin' | 'shortNight' | 'lowEvening'
export const WEEKDAY_CELLS = ['0', '1', '2', '3', '4', '5', '6'] as const

export interface PatternCell {
  split: Split
  /** A weekday 0 (Sunday) to 6, a check-in, or "yes" for what came before. */
  cell: string
  /** How many of the cell's known occasions carried the thing, and how many it holds; and the same for the rest. */
  k: number
  n: number
  restK: number
  m: number
  /** The cell's rate less the rest's; null when either side is empty. */
  diff: number | null
  p: number | null
  standing: Standing
  direction: Direction
}

/** A kind as the record counts it: what it is, and how often it was recorded where the record can speak for it. */
export interface KindCount {
  kind: string
  unit: Kind['unit']
  label: string
  category: Kind['category']
  private: boolean
  since?: string
  cutoff?: string
  /** The occasions the record could speak for, and how many carried the thing. */
  known: number
  occurrences: number
}

export interface PatternEntry extends KindCount {
  /** How many comparisons were tested: what the correction was made across, and the number said with a lead. */
  family: number
  cells: PatternCell[]
}

/** The reading out of 100 over one cell's check-ins, against the rest. */
export interface LevelCell {
  split: Split
  cell: string
  n: number
  /** The average, to one decimal. */
  mean: number
  /** Check-ins in each band, Firing to Empty. */
  bands: number[]
  restN: number
  restMean: number
}

export interface PatternTable {
  /** The day it was built on: only days before it are counted. */
  builtFor: string
  /** Every kind with anything tested. */
  kinds: PatternEntry[]
  /** Every kind the record can speak for with too few occasions to test anything: its counts alone. */
  untested: KindCount[]
  /** Every kind above, tested or not, in the list's own order. */
  order: string[]
  level: LevelCell[]
}

/** One kind's occasions as the splits need them: a day, whether the thing happened, and what the check-in was. */
interface Known {
  day: string
  facts: DayFacts
  happened: boolean
  block?: string
}

/** The record as it stood before a day began: nothing of that day or after it is counted. */
function asItStood(input: CountedInput, today: string): CountedInput {
  const past = <T extends { day: string }>(list: readonly T[]): T[] => list.filter((x) => x.day < today)
  return { ...input, checkins: past(input.checkins), contexts: past(input.contexts), offers: past(input.offers), outcomes: past(input.outcomes), workoutDays: input.workoutDays.filter((d) => d < today) }
}

type BeforeOf = (day: string) => ReturnType<typeof beforeDay>

/** A record laid out once for every kind. */
interface Laid {
  kinds: Kind[]
  facts: Map<string, DayFacts>
  days: Days
  beforeOf: BeforeOf
}

function layOut(record: CountedInput, today: string): Laid {
  const input = asItStood(record, today)
  const days = daysOf(input.checkins)
  const facts = dayFactsOf(input, days)
  const before = new Map<string, ReturnType<typeof beforeDay>>()
  const beforeOf: BeforeOf = (day) => before.get(day) ?? (before.set(day, beforeDay(day, days)).get(day) as ReturnType<typeof beforeDay>)
  return { kinds: kindsOf(input), facts, days, beforeOf }
}

/** One split of one kind, as the comparison takes it. */
interface SplitPoints {
  split: Split
  within: 'stretch' | 'day'
  cells: readonly string[]
  points: CellPoint[]
}

/** What "came before" a day, as a cell: yes, no, or null where the record cannot say. */
const cameBefore = (v: boolean | null | undefined): string | null => (v === null || v === undefined ? null : v ? 'yes' : 'no')

/** Where the record can speak for a kind, and its occasions laid out for each split. Null when it can speak for none. */
function occasionsFor(kind: Kind, laid: Laid): { known: Known[]; splits: SplitPoints[] } | null {
  const known: Known[] = []
  if (kind.unit === 'day') {
    for (const day of [...laid.facts.keys()].sort()) {
      const d = laid.facts.get(day) as DayFacts
      if (!kind.known(d)) continue
      known.push({ day, facts: d, happened: kind.happened(d) })
    }
  } else {
    for (const o of laid.days.occasions) {
      if (!kind.known(o)) continue
      known.push({ day: o.day, facts: laid.facts.get(o.day) as DayFacts, happened: kind.happened(o), block: o.block })
    }
  }
  if (!known.length) return null
  const points = (cell: (x: Known) => string | null): CellPoint[] => known.flatMap((x) => { const c = cell(x); return c === null ? [] : [{ day: x.day, cell: c, happened: x.happened }] })
  const splits: SplitPoints[] = [
    { split: 'weekday', within: 'stretch', cells: WEEKDAY_CELLS, points: points((x) => String(x.facts.weekday)) },
    ...(kind.unit === 'checkin' ? [{ split: 'checkin' as const, within: 'day' as const, cells: BLOCKS as readonly string[], points: points((x) => x.block ?? null) }] : []),
    // A short night before is no split of the sleep kinds themselves: it is the same answer.
    ...(kind.id.startsWith('sleep.') ? [] : [{ split: 'shortNight' as const, within: 'stretch' as const, cells: ['yes'], points: points((x) => cameBefore(laid.beforeOf(x.day)?.shortNight)) }]),
    { split: 'lowEvening', within: 'stretch', cells: ['yes'], points: points((x) => cameBefore(laid.beforeOf(x.day)?.lowEvening)) },
  ]
  return { known, splits }
}

/** A kind's comparisons, kept in memory by exactly what they were computed from: every occasion's day, cell and answer, split by split. */
const kept = new Map<string, { from: string; family: number; cells: PatternCell[] }>()

/** For tests: the kept comparisons as a new start of the app finds them. */
export function forgetKeptPatterns(): void {
  kept.clear()
}

/** How many kinds' comparisons are kept: for the test that says an unchanged kind is not worked out again. */
export const keptPatterns = (): number => kept.size

function compared(kind: Kind, splits: readonly SplitPoints[], keep: boolean): { family: number; cells: PatternCell[] } {
  const from = keep ? splits.map((s) => `${s.split}:${s.points.map((p) => `${p.day}${p.cell}${p.happened ? '+' : '-'}`).join(',')}`).join('|') : ''
  if (keep) {
    const was = kept.get(kind.id)
    if (was && was.from === from) return was
  }
  const id = `pattern|${kind.id}`
  const rates: { split: Split; rate: CellRate }[] = splits.flatMap((s) => ratesBy(s.points, { id: `${id}|${s.split}`, within: s.within, cells: s.cells }).map((rate) => ({ split: s.split, rate })))
  const stood = standings(rates.map((c) => c.rate))
  const family = stood[0]?.family ?? 0
  const cells = rates.map(({ split, rate }, i): PatternCell => ({ split, cell: rate.cell, k: rate.k, n: rate.n, restK: rate.restK, m: rate.m, diff: rate.diff, p: rate.p, standing: stood[i].standing, direction: stood[i].direction }))
  const result = { family, cells }
  // Only a kind with something tested costs anything to work out again.
  if (keep && family > 0) kept.set(kind.id, { from, ...result })
  return result
}

/** One kind's place in the table: its counts, and its cells where anything was tested. Null where the record can speak for none of it. */
function entryFor(kind: Kind, laid: Laid, keep: boolean): { count: KindCount; family: number; cells: PatternCell[] } | null {
  const laidOut = occasionsFor(kind, laid)
  if (!laidOut) return null
  const count: KindCount = { kind: kind.id, unit: kind.unit, label: kind.label, category: kind.category, private: kind.private, ...(kind.since ? { since: kind.since } : {}), ...(kind.cutoff ? { cutoff: kind.cutoff } : {}), known: laidOut.known.length, occurrences: laidOut.known.filter((x) => x.happened).length }
  return { count, ...compared(kind, laidOut.splits, keep) }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** The reading out of 100 in every cell of every split: counted over the complete check-ins, never compared. */
function levelCells(laid: Laid): LevelCell[] {
  const out: LevelCell[] = []
  const split = (name: Split, cells: readonly string[], cellOf: (o: Occasion) => string | null): void => {
    const at = laid.days.occasions.map(cellOf)
    let total = 0
    let sum = 0
    laid.days.occasions.forEach((o, i) => {
      if (at[i] === null) return
      total++
      sum += o.reading
    })
    for (const cell of cells) {
      const inCell = laid.days.occasions.filter((_, i) => at[i] === cell)
      if (!inCell.length) continue
      const own = inCell.reduce((s, o) => s + o.reading, 0)
      const rest = total - inCell.length
      out.push({ split: name, cell, n: inCell.length, mean: round1(own / inCell.length), bands: LEVEL_BANDS.map((b) => inCell.filter((o) => o.band === b).length), restN: rest, restMean: rest ? round1((sum - own) / rest) : 0 })
    }
  }
  split('weekday', WEEKDAY_CELLS, (o) => String(o.weekday))
  split('checkin', BLOCKS, (o) => o.block)
  split('shortNight', ['yes'], (o) => cameBefore(laid.beforeOf(o.day)?.shortNight))
  split('lowEvening', ['yes'], (o) => cameBefore(laid.beforeOf(o.day)?.lowEvening))
  return out
}

function tableOf(today: string, laid: Laid, entries: readonly (ReturnType<typeof entryFor>)[]): PatternTable {
  const kinds: PatternEntry[] = []
  const untested: KindCount[] = []
  const order: string[] = []
  for (const e of entries) {
    if (!e) continue
    order.push(e.count.kind)
    if (e.family > 0) kinds.push({ ...e.count, family: e.family, cells: e.cells })
    else untested.push(e.count)
  }
  return { builtFor: today, kinds, untested, order, level: levelCells(laid) }
}

/** Every kind by every split, over the days before `today`. A kind with nothing tested keeps its counts alone. */
export function patternTable(record: CountedInput, today: string): PatternTable {
  const laid = layOut(record, today)
  return tableOf(today, laid, laid.kinds.map((kind) => entryFor(kind, laid, false)))
}

/**
 * The same table, built a kind at a time with a pause between kinds, so a screen is never held while it is worked
 * out; a kind whose occasions have not changed since it was last worked out here is not worked out again.
 */
export async function patternTableKept(record: CountedInput, today: string, pause: () => Promise<void>): Promise<PatternTable> {
  const laid = layOut(record, today)
  const entries: ReturnType<typeof entryFor>[] = []
  for (const kind of laid.kinds) {
    entries.push(entryFor(kind, laid, true))
    await pause()
  }
  return tableOf(today, laid, entries)
}

/** A followed pattern as its count is asked for: the cell of one kind a "Claude noticed" observation named, and the day it was noticed. */
export interface FollowedAsk {
  id: string
  kind: string
  split: string
  cell: string
  noticedOn: string
}

/** A followed pattern as counted: k of n in its cell against the rest, on the occasions after the day it was noticed alone. */
export interface FollowedCount {
  id: string
  kind: string
  split: Split
  cell: string
  noticedOn: string
  k: number
  n: number
  restK: number
  m: number
  standing: Standing
  direction: Direction
  /** How many followed patterns were tested together: the family the chance check paid for. */
  family: number
}

/**
 * Each followed pattern counted again on what came after the day it was noticed (2026-11-13): the days that suggested
 * it cannot also prove it. The comparison core as it stands, on that one cell of that kind's own split, over the days
 * before `today`; the family is every followed pattern together. One whose kind the record no longer counts, or whose
 * cell that kind's split does not have, is counted nowhere.
 */
export function followedCounts(record: CountedInput, today: string, asks: readonly FollowedAsk[]): FollowedCount[] {
  if (!asks.length) return []
  const laid = layOut(record, today)
  const rated: { ask: FollowedAsk; split: Split; rate: CellRate }[] = []
  for (const ask of asks) {
    const kind = laid.kinds.find((k) => k.id === ask.kind)
    const s = kind ? occasionsFor(kind, laid)?.splits.find((x) => x.split === ask.split && x.cells.includes(ask.cell)) : undefined
    if (!s) continue
    const rate = ratesBy(s.points.filter((point) => point.day > ask.noticedOn), { id: `followed|${ask.id}`, within: s.within, cells: [ask.cell] })[0]
    if (rate) rated.push({ ask, split: s.split, rate })
  }
  const stood = standings(rated.map((r) => r.rate))
  return rated.map(({ ask, split, rate }, i) => ({ id: ask.id, kind: ask.kind, split, cell: rate.cell, noticedOn: ask.noticedOn, k: rate.k, n: rate.n, restK: rate.restK, m: rate.m, standing: stood[i].standing, direction: stood[i].direction, family: stood[i].family }))
}

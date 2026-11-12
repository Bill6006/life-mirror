import { BLOCKS } from '../blocks'
import { ratesBy, standings, type CellPoint, type CellRate, type Direction, type Standing } from './compare'
import { type CountedInput, type DayFacts, dayFactsOf, type Kind, kindsOf } from './kinds'
import { beforeDay, daysOf } from './occasions'

// The pattern table (the counted foundation, 2026-11-12; in shadow: nothing reads it yet). For each kind the record
// can count: when it was recorded, by the weekday, by the check-in of the day, and by what came before the day. Every
// cell is "k of n" over the occasions where the record could say either way, and every cell of every split of one
// kind is one family: the chance check pays for every place it looked.

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

export interface PatternEntry {
  kind: string
  unit: Kind['unit']
  /** The occasions the record could speak for, and how many carried the thing. */
  known: number
  occurrences: number
  /** How many comparisons were tested: what the correction was made across, and the number said with a lead. */
  family: number
  cells: PatternCell[]
}

export interface PatternTable {
  /** The day it was built on: only days before it are counted. */
  builtFor: string
  kinds: PatternEntry[]
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

/** Every kind by every split, over the days before `today`. A kind with nothing tested is left out. */
export function patternTable(record: CountedInput, today: string): PatternTable {
  const input = asItStood(record, today)
  const days = daysOf(input.checkins)
  const facts = dayFactsOf(input, days)
  const before = new Map<string, ReturnType<typeof beforeDay>>()
  const beforeOf = (day: string) => before.get(day) ?? before.set(day, beforeDay(day, days)).get(day)
  const entries: PatternEntry[] = []
  for (const kind of kindsOf(input)) {
    const known: Known[] = []
    if (kind.unit === 'day') {
      for (const day of [...facts.keys()].sort()) {
        const d = facts.get(day) as DayFacts
        if (!kind.known(d)) continue
        known.push({ day, facts: d, happened: kind.happened(d) })
      }
    } else {
      for (const o of days.occasions) {
        if (!kind.known(o)) continue
        known.push({ day: o.day, facts: facts.get(o.day) as DayFacts, happened: kind.happened(o), block: o.block })
      }
    }
    if (!known.length) continue
    const points = (cell: (x: Known) => string | null): CellPoint[] => known.flatMap((x) => { const c = cell(x); return c === null ? [] : [{ day: x.day, cell: c, happened: x.happened }] })
    const id = `pattern|${kind.id}`
    const tag = (split: Split, cells: CellRate[]): { split: Split; rate: CellRate }[] => cells.map((rate) => ({ split, rate }))
    const compared = [
      ...tag('weekday', ratesBy(points((x) => String(x.facts.weekday)), { id: `${id}|weekday`, within: 'stretch', cells: WEEKDAY_CELLS })),
      ...(kind.unit === 'checkin' ? tag('checkin', ratesBy(points((x) => x.block ?? null), { id: `${id}|checkin`, within: 'day', cells: BLOCKS })) : []),
      // A short night before is no split of the sleep kinds themselves: it is the same answer.
      ...(kind.id.startsWith('sleep.') ? [] : tag('shortNight', ratesBy(points((x) => { const s = beforeOf(x.day)?.shortNight; return s === null || s === undefined ? null : s ? 'yes' : 'no' }), { id: `${id}|shortNight`, within: 'stretch', cells: ['yes'] }))),
      ...tag('lowEvening', ratesBy(points((x) => { const l = beforeOf(x.day)?.lowEvening; return l === null || l === undefined ? null : l ? 'yes' : 'no' }), { id: `${id}|lowEvening`, within: 'stretch', cells: ['yes'] })),
    ]
    const stood = standings(compared.map((c) => c.rate))
    const family = stood[0]?.family ?? 0
    if (family === 0) continue
    entries.push({
      kind: kind.id,
      unit: kind.unit,
      known: known.length,
      occurrences: known.filter((x) => x.happened).length,
      family,
      cells: compared.map(({ split, rate }, i) => ({ split, cell: rate.cell, k: rate.k, n: rate.n, restK: rate.restK, m: rate.m, diff: rate.diff, p: rate.p, standing: stood[i].standing, direction: stood[i].direction })),
    })
  }
  return { builtFor: today, kinds: entries }
}

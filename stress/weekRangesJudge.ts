import { existsSync, readFileSync } from 'node:fs'
import type { RangePerson, Sums } from './weekRanges'

// The level-plus-weekday way's ranges: their judge. The criteria were frozen on 2026-11-21, before the way's range code
// was written; the private repository holds them, and the results file names their hash. Four are judged here as they
// were frozen; the rest is reported. A range's score is its width plus five times how far outside it the answer fell.
//
// node stress/.out/weekRanges.mjs judge <results folder> [tuning]

const IDS = ['plain', 'streaks', 'sparse', 'season', 'rhythm', 'rhythm-half', 'rhythm-one', 'rhythm-turn']
const NAMES = ['days 29 to 90', 'days 91 to 150', 'days 151 to 180']
const Z = 1.959963984540054

interface Interval {
  mean: number
  lo: number
  hi: number
  n: number
}
function interval(values: readonly number[]): Interval {
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
  const half = (Z * sd) / Math.sqrt(n)
  return { mean, lo: mean - half, hi: mean + half, n }
}
const show = (i: Interval): string => `${i.mean.toFixed(3)} (${i.lo.toFixed(3)} to ${i.hi.toFixed(3)}; ${i.n} people)`
const plus = (a: readonly number[], b: readonly number[]): number[] => a.map((v, k) => v + b[k])
const NONE = [0, 0, 0, 0, 0, 0, 0, 0, 0]
/** Every row of a person whose day lies in some stretches: today's and the week ahead's together. */
const every = (p: RangePerson, stretches: readonly number[]): number[] => stretches.reduce<number[]>((s, st) => plus(plus(s, p.week[st]), p.today[st]), NONE)
/** Each person's score with the way less without, over some stretches. */
const scoreWithLessWithout = (people: readonly RangePerson[], stretches: readonly number[]): number[] => people.flatMap((p) => { const t = every(p, stretches); return t[0] ? [(t[6] - t[5]) / t[0]] : [] })
const stretchName = (stretches: readonly number[]): string => (stretches.length === 3 ? 'days 29 to 180' : stretches.length === 2 ? 'days 91 to 180' : NAMES[stretches[0]])

export function judgeRanges(folder: string, tuning: boolean): void {
  if (!folder) throw new Error('usage: weekRanges.mjs judge <folder> [tuning]')
  const runs = new Map(IDS.flatMap((id) => (existsSync(`${folder}/${id}.json`) ? [[id, JSON.parse(readFileSync(`${folder}/${id}.json`, 'utf8')) as { numbers: unknown; seeds: [number, number]; results: RangePerson[] }] as const] : [])))
  const first = [...runs.values()][0]
  console.log(`The level-plus-weekday way's ranges, ${tuning ? 'on the tuning seeds (nothing here is a verdict)' : 'THE VERDICT'}: ${folder}`)
  if (first) console.log(`The method's numbers: ${first.numbers === null ? "none: today's system alone" : JSON.stringify(first.numbers)}; seeds ${first.seeds[0]} to ${first.seeds[1]}`)
  const baseline = first?.numbers === null
  let pass = true
  const judged = (label: string, ok: boolean, line: string): void => {
    if (!ok) pass = false
    console.log(`${label}: ${line}: ${tuning ? (ok ? 'would pass' : 'WOULD FAIL') : ok ? 'PASS' : 'FAIL'}`)
  }
  const need = (id: string): RangePerson[] | null => {
    const r = runs.get(id)
    if (!r) {
      pass = false
      console.log(`  ${id}: NOT RUN`)
      return null
    }
    return r.results
  }

  if (!baseline) {
    console.log('\nCriterion R1, rhythm, days 151 to 180, the rows written on days the way is in use: the range still holds what today\'s do (the share inside with the way less today\'s, of 100; lower end above -2).')
    {
      const people = need('rhythm')
      if (people) {
        const diffs = people.flatMap((p) => (p.used[2][0] ? [(100 * (p.used[2][2] - p.used[2][1])) / p.used[2][0]] : []))
        const t = people.reduce<number[]>((s, p) => plus(s, p.used[2]), NONE)
        const i = interval(diffs)
        judged('  rhythm', i.lo > -2, `${show(i)}; over those rows ${((100 * t[2]) / t[0]).toFixed(1)} of 100 inside with the way, ${((100 * t[1]) / t[0]).toFixed(1)} for today's system`)
      }
    }
    console.log('\nCriterion R2, rhythm, days 151 to 180, every row: the ranges get better (the score without less with, wholly above nothing).')
    {
      const people = need('rhythm')
      if (people) {
        const i = interval(scoreWithLessWithout(people, [2]).map((v) => -v))
        judged('  rhythm', i.lo > 0, show(i))
      }
    }
    console.log('\nCriterion R3: no harm (the score with less without, upper end under 0.18).')
    for (const [id, st] of [['rhythm', [0]], ['plain', [0, 1, 2]], ['streaks', [0, 1, 2]], ['sparse', [0, 1, 2]], ['season', [0, 1, 2]], ['rhythm-half', [0, 1, 2]], ['rhythm-one', [0, 1, 2]], ['rhythm-turn', [2]]] as const) {
      const people = need(id)
      if (!people) continue
      const i = interval(scoreWithLessWithout(people, st))
      judged(`  ${id}, ${stretchName(st)}`, i.hi < 0.18, show(i))
    }
    console.log('\nCriterion R4, rhythm-turn, days 91 to 180, every row: a turned pattern costs little (the score with less without, upper end under 0.36).')
    {
      const people = need('rhythm-turn')
      if (people) {
        const i = interval(scoreWithLessWithout(people, [1, 2]))
        judged('  rhythm-turn', i.hi < 0.36, show(i))
      }
    }
    console.log(`\n${tuning ? 'ON THE TUNING SEEDS' : 'THE VERDICT'}: ${pass ? (tuning ? 'every criterion would pass' : 'PASS') : tuning ? 'not every criterion would pass' : 'FAIL'}`)
  }

  console.log('\nReported, not judged. Each pair is today\'s system, then the system with the way.')
  for (const id of IDS) {
    const run = runs.get(id)
    if (!run) continue
    const people = run.results
    console.log(`  ${id} (${people.length} people): the way in use on ${people.reduce((s, p) => s + p.days, 0)} person-days; slots it left without a row: ${people.reduce((s, p) => s + p.left, 0)}`)
    for (const [label, pick] of [['the week ahead', (p: RangePerson): Sums[] => p.week], ['today', (p: RangePerson): Sums[] => p.today]] as const) {
      NAMES.forEach((name, st) => {
        const t = people.reduce<number[]>((s, p) => plus(s, pick(p)[st]), NONE)
        if (!t[0]) return
        console.log(`    ${label}, ${name}: inside the range ${((100 * t[1]) / t[0]).toFixed(1)} and ${((100 * t[2]) / t[0]).toFixed(1)} of 100; width ${(t[3] / t[0]).toFixed(2)} and ${(t[4] / t[0]).toFixed(2)}; score ${(t[5] / t[0]).toFixed(2)} and ${(t[6] / t[0]).toFixed(2)}; the stored point's miss ${(t[7] / t[0]).toFixed(3)} and ${(t[8] / t[0]).toFixed(3)}`)
      })
    }
    const a = Array.from({ length: 8 }, (_, h) => people.reduce<number[]>((s, p) => plus(s, p.ahead[h]), NONE))
    console.log(`    days 151 to 180 by days ahead, inside of 100 / width / score: ${a.map((t, h) => (t[0] ? `${h}: ${((100 * t[1]) / t[0]).toFixed(0)} and ${((100 * t[2]) / t[0]).toFixed(0)} / ${(t[3] / t[0]).toFixed(1)} and ${(t[4] / t[0]).toFixed(1)} / ${(t[5] / t[0]).toFixed(1)} and ${(t[6] / t[0]).toFixed(1)}`: `${h}: -`)).join('; ')}`)
    const u = people.reduce<number[]>((s, p) => plus(plus(plus(s, p.used[0]), p.used[1]), p.used[2]), NONE)
    if (u[0]) console.log(`    the rows written on days the way was in use (${u[0]}): inside ${((100 * u[1]) / u[0]).toFixed(1)} and ${((100 * u[2]) / u[0]).toFixed(1)} of 100; width ${(u[3] / u[0]).toFixed(2)} and ${(u[4] / u[0]).toFixed(2)}; score ${(u[5] / u[0]).toFixed(2)} and ${(u[6] / u[0]).toFixed(2)}; the stored point's miss ${(u[7] / u[0]).toFixed(3)} and ${(u[8] / u[0]).toFixed(3)}`)
  }
}

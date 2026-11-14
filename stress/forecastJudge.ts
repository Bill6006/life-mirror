import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHALLENGER } from '../src/challenger'
import { FORECAST_WORLDS, type ForecastPerson } from './forecastSim'

// Reads a folder of the forecast challenger's results and says, world by world, how many people were adopted, with
// the margin's three numbers as given (by default the code's own). With "grid" it reads the same results under a
// range of margins, for tuning: the margin is applied here, so one run of the people serves every margin.
//
// node stress/.out/forecastJudge.mjs <folder> [minSlots minGain minClear | grid]

interface Margin {
  minSlots: number
  minGain: number
  minClear: number
}

const phi = (x: number): number => {
  // The normal curve's share under x (Abramowitz and Stegun 7.1.26 on the error function).
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2)
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

/** Wilson's 95% interval for k of n. */
export function wilson(k: number, n: number): [number, number] {
  const z = 1.959964
  const p = k / n
  const den = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - h) / den, (c + h) / den]
}

/** The best rule of the design's form at one person's counts: it knows the lift, takes it off each morning after the thing, and looks once at 1 in 20. */
export function boundOf(b: { m: number; s: number; d: number }): number {
  if (b.m === 0 || b.s <= 0) return phi(-1.645)
  // The gain a morning, with the miss drawn from the normal curve about d with spread s: its average and spread, by numerical integration.
  const steps = 4000
  let w = 0
  let g1 = 0
  let g2 = 0
  for (let i = 0; i <= steps; i++) {
    const e = b.d + b.s * (-8 + (16 * i) / steps)
    const density = Math.exp(-((e - b.d) ** 2) / (2 * b.s * b.s))
    const gain = Math.abs(e) - Math.abs(e - b.d)
    w += density
    g1 += density * gain
    g2 += density * gain * gain
  }
  const g = g1 / w
  const t = Math.sqrt(Math.max(0, g2 / w - g * g))
  return t > 0 ? phi((g * Math.sqrt(b.m)) / t - 1.645) : 1
}

const adoptedOn = (p: ForecastPerson, m: Margin): number | null => {
  for (const r of p.rows) if (r[1] >= m.minSlots && r[2] !== null && r[2] >= m.minGain && r[3] !== null && r[3] >= m.minClear) return r[0]
  return null
}

function read(folder: string, world: string): ForecastPerson[] | null {
  const file = join(folder, `${world}.json`)
  if (!existsSync(file)) return null
  const people = (JSON.parse(readFileSync(file, 'utf8')) as { results: ForecastPerson[] }).results
  const second = join(folder, 'second', `${world}.json`)
  return existsSync(second) ? [...people, ...(JSON.parse(readFileSync(second, 'utf8')) as { results: ForecastPerson[] }).results] : people
}

const pct = (v: number): string => (100 * v).toFixed(2)

function judge(folder: string, m: Margin): void {
  console.log(`margin: at least ${m.minSlots} slots, a gain of ${m.minGain} points, ${m.minClear} clear of its own spread`)
  for (const world of FORECAST_WORLDS) {
    const people = read(folder, world.id)
    if (!people) continue
    const first = people.map((p) => adoptedOn(p, m))
    const adopted = first.filter((d) => d !== null) as number[]
    const [lo, hi] = wilson(adopted.length, people.length)
    const kinds = people.filter((p) => p.rows.some((r) => r[4] > 0)).length
    let days = 0
    let on = 0
    let slots = 0
    let worse = 0
    people.forEach((p) => {
      for (const r of p.rows) {
        days++
        if (!(r[1] >= m.minSlots && r[2] !== null && r[2] >= m.minGain && r[3] !== null && r[3] >= m.minClear)) continue
        on++
        slots += r[5]
        worse += r[6]
      }
    })
    const median = adopted.length ? [...adopted].sort((a, b) => a - b)[Math.floor(adopted.length / 2)] + 1 : null
    let line = `${world.id.padEnd(15)} ${world.kind.padEnd(8)} people ${people.length}  adopted ${adopted.length} (${pct(adopted.length / people.length)} in 100; interval ${pct(lo)} to ${pct(hi)})  median first day ${median ?? '-'}  days adopted ${pct(on / Math.max(1, days))} in 100  a thing at pattern on any day ${pct(kinds / people.length)} in 100  miss on adopted days ${slots ? (worse / slots).toFixed(2) : '-'} points a slot (${slots} slots; + is worse)`
    if (people[0].bound) {
      const bound = people.reduce((s, p) => s + boundOf(p.bound as { m: number; s: number; d: number }), 0) / people.length
      line += `  bound ${pct(bound)} in 100, a third of it ${pct(bound / 3)}`
    }
    console.log(line)
  }
}

if (process.argv[2]) {
  const folder = process.argv[2]
  if (process.argv[3] === 'grid') {
    for (const minClear of [2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4])
      for (const minSlots of [20, 30, 45])
        for (const minGain of [0, 0.5, 1]) {
          const cells = FORECAST_WORLDS.map((w) => {
            const people = read(folder, w.id)
            if (!people) return null
            return `${w.id} ${pct(people.filter((p) => adoptedOn(p, { minSlots, minGain, minClear }) !== null).length / people.length)}`
          }).filter(Boolean)
          console.log(`clear ${minClear} slots ${minSlots} gain ${minGain}: ${cells.join(' | ')}`)
        }
  } else {
    const [s, g, c] = process.argv.slice(3).map(Number)
    judge(folder, { minSlots: Number.isFinite(s) ? s : CHALLENGER.minSlots, minGain: Number.isFinite(g) ? g : CHALLENGER.minGain, minClear: Number.isFinite(c) ? c : CHALLENGER.minClear })
  }
}

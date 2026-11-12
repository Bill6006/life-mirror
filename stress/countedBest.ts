import { existsSync, writeFileSync } from 'node:fs'
import { ratesBy, standings, type CellPoint, type Compared } from '../src/counted/compare'
import { countedWorldById, EVENING_THINGS, recordOf } from './countedWorlds'
import { wilson } from './stats'

// Best days under the one standard. The weekly view sets the top tenth of days against the others and asks, of each
// condition, how often it was recorded on the best days and on the rest. That is the core's "when" question with the
// split "a best day or another day", one occasion a day, whole days changing places inside the fortnight: the call
// the simulation's verdict judged for the splits by what came before the day. What the verdict did not hold is a
// split taken from the day's own reading, set against things that come in runs. This asks it of a simulated person:
// twelve evening things, the day thing and the seven weekdays as conditions, one family of twenty, at day 90, 180
// and 365 (at day 60 the top tenth holds six days and nothing is tested).
//
// node stress/.out/countedBest.mjs <fromSeed> <toSeed> <world,world,...> [out.json]
//
// Seeds 1 to 1000 are tuning seeds. Seeds 580001 to 590000 are kept for this family's own read, should it need one.
// A world whose things follow the state (follows-band) is no world with nothing there for this question: a thing
// that follows a low evening does go with worse days. In weekly-rhythm the weekdays are real, so there only the
// things are counted as nothing there.

const LOOKS = [90, 180, 365] as const
const BEST_DAYS_MIN = 20
const BEST_SHARE = 0.1
const EVENING = 2
const [fromArg, toArg, worldsArg, out] = process.argv.slice(2)
const from = Number(fromArg ?? 1)
const to = Number(toArg ?? 1000)
const tuning = to <= 1000
const own = from >= 580001 && to <= 590000
if (!tuning && !own) throw new Error('this family reads seeds 1 to 1000 (tuning) or 580001 to 590000 (its own read)')
if (out && existsSync(out)) throw new Error(`${out} is already there: a range is read once`)
const worlds = (worldsArg ?? 'independent-30,runs,runs-persistent').split(',')
const people = to - from + 1
const kept: Record<string, { seed: number; pattern: number[]; lead: number[] }[]> = {}
console.log(`seeds ${from} to ${to}; each condition's rate on the top tenth of days against the other days, one family of ${EVENING_THINGS + 8}`)
console.log('world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  upper95%  lead-only%  mark')
for (const id of worlds) {
  const spec = countedWorldById(id)
  if (!spec.families.includes('B') || !spec.families.includes('A-day')) throw new Error(`${id} holds no evening things or no day thing`)
  if (id === 'follows-band') throw new Error('follows-band is not a world with nothing there for best days')
  const weekdaysReal = id === 'weekly-rhythm'
  const tally = LOOKS.map(() => ({ tested: 0, c05: 0, c01: 0, pattern: 0, lead: 0, silent: 0 }))
  kept[id] = []
  for (let seed = from; seed <= to; seed++) {
    const rec = recordOf(spec, seed)
    const row = { seed, pattern: [] as number[], lead: [] as number[] }
    LOOKS.forEach((look, at) => {
      const t = tally[at]
      // A day's reading as the weekly view takes it: the mean of its answered check-ins, with two or more.
      const days: { d: number; value: number }[] = []
      for (let d = 0; d < look; d++) {
        const values = rec.reading[d].filter((v): v is number => v !== null)
        if (values.length >= 2) days.push({ d, value: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 })
      }
      if (days.length < BEST_DAYS_MIN) {
        t.silent++
        row.pattern.push(0)
        row.lead.push(0)
        return
      }
      const sorted = [...days].sort((a, b) => b.value - a.value)
      const top = new Set(sorted.slice(0, Math.max(2, Math.round(sorted.length * BEST_SHARE))).map((x) => x.d))
      const one = (key: string, known: (d: number) => boolean, happened: (d: number) => boolean): Compared => {
        const points: CellPoint[] = days.filter((x) => known(x.d)).map((x) => ({ day: rec.dayName[x.d], cell: top.has(x.d) ? 'best' : 'other', happened: happened(x.d) }))
        return ratesBy(points, { id: `best|${id}|${seed}|${look}|${key}`, within: 'stretch', cells: ['best'] })[0]
      }
      const things: Compared[] = Array.from({ length: EVENING_THINGS }, (_, j) => one(`evening.${j}`, (d) => rec.reading[d][EVENING] !== null, (d) => rec.eveningThings[j][d]))
      things.push(one('day', () => true, (d) => rec.dayThing[d]))
      const weekdays: Compared[] = Array.from({ length: 7 }, (_, w) => one(`weekday.${w}`, () => true, (d) => rec.weekday[d] === w))
      const family = [...things, ...weekdays]
      const stood = standings(family)
      // What has nothing there: the things, and the weekdays wherever the world gives the week no rhythm.
      const nothing = family.map((_, i) => i < things.length || !weekdaysReal)
      family.forEach((c, i) => {
        if (!nothing[i] || c.p === null) return
        t.tested++
        if (c.p <= 0.05) t.c05++
        if (c.p <= 0.01) t.c01++
      })
      const pattern = stood.some((s, i) => nothing[i] && s.standing === 'pattern')
      const lead = !pattern && stood.some((s, i) => nothing[i] && s.standing === 'lead')
      if (pattern) t.pattern++
      if (lead) t.lead++
      row.pattern.push(pattern ? 1 : 0)
      row.lead.push(lead ? 1 : 0)
    })
    kept[id].push(row)
  }
  LOOKS.forEach((look, at) => {
    const t = tally[at]
    const pct = (a: number, b: number): string => (b ? ((100 * a) / b).toFixed(2) : '-').padStart(7)
    const w = wilson(t.pattern, people)
    const eager = t.tested > 0 && (t.c05 / t.tested > 0.056 || t.c01 / t.tested > 0.013)
    const mark = w.hi > 0.07 ? 'OVER: the interval reaches above 7 in 100' : eager ? 'EAGER: the chance itself' : 'within'
    console.log(`${id.padEnd(18)} ${String(look).padStart(4)}  ${String(t.tested).padStart(6)}  ${pct(t.c05, t.tested)}  ${pct(t.c01, t.tested)}  ${String(people).padStart(6)}  ${String(t.pattern).padStart(7)}  ${pct(t.pattern, people)}   ${(100 * w.hi).toFixed(2).padStart(6)}     ${pct(t.lead, people)}  ${mark}${t.silent ? ` (${t.silent} silent)` : ''}`)
  })
}
if (out) writeFileSync(out, JSON.stringify({ seeds: [from, to], worlds: kept }))

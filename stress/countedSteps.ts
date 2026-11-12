import { existsSync, writeFileSync } from 'node:fs'
import { compare, standings, type Point } from '../src/counted/compare'
import { bandOf } from '../src/score'
import { countedWorldById, EVENING_THINGS, LOOKS, recordOf } from './countedWorlds'
import { wilson } from './stats'

// With against without on a scale of steps. The simulation's verdict judged the reading out of 100. Before a
// comparison measured in steps on one reading may say "a steady pattern" (a hard session against the next morning's
// stress, say, where 0.4 of a step is the size worth saying), this asks the same twelve evening things of the next
// morning's own stress answer, an anchor from 1 to 5, like for like within the evening's band: how often a chance at
// or under 0.05 turns up with nothing there, and how often a family of twelve shows a pattern.
//
// node stress/.out/countedSteps.mjs <fromSeed> <toSeed> <world,world,...> [out.json]
//
// Seeds 1 to 1000 are tuning seeds. Seeds 560001 to 562000 are this family's own read, once, under the first
// criterion's mark (the interval's upper bound at most 7 in 100); 562001 to 570000 are its second read.

const WORTH_STEPS = 0.4
const [fromArg, toArg, worldsArg, out] = process.argv.slice(2)
const from = Number(fromArg ?? 1)
const to = Number(toArg ?? 1000)
const tuning = to <= 1000
const own = from >= 560001 && to <= 570000
if (!tuning && !own) throw new Error('this family reads seeds 1 to 1000 (tuning) or 560001 to 570000 (its own read)')
if (out && existsSync(out)) throw new Error(`${out} is already there: a range is read once`)
const worlds = (worldsArg ?? 'independent-30,runs-persistent,follows-band').split(',')
const people = to - from + 1
const kept: Record<string, { seed: number; pattern: number[]; lead: number[] }[]> = {}
console.log(`seeds ${from} to ${to}; the next morning's stress answer in steps, a size worth saying of ${WORTH_STEPS}`)
console.log('world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  upper95%  lead-only%  mark')
for (const id of worlds) {
  const spec = countedWorldById(id)
  if (!spec.families.includes('B')) throw new Error(`${id} holds no evening things`)
  const tally = LOOKS.map(() => ({ tested: 0, c05: 0, c01: 0, pattern: 0, lead: 0 }))
  kept[id] = []
  for (let seed = from; seed <= to; seed++) {
    const rec = recordOf(spec, seed)
    const row = { seed, pattern: [] as number[], lead: [] as number[] }
    LOOKS.forEach((look, at) => {
      const family = Array.from({ length: EVENING_THINGS }, (_, j) => {
        const points: Point[] = []
        for (let d = 0; d + 1 < look; d++) {
          const evening = rec.reading[d][2]
          const stress = rec.morningStress[d + 1]
          if (evening === null || stress === null) continue
          points.push({ day: rec.dayName[d], event: rec.eveningThings[j][d], outcome: stress, band: bandOf(evening) })
        }
        return compare(points, { id: `steps|${id}|${seed}|${look}|${j}`, worth: WORTH_STEPS })
      })
      const t = tally[at]
      for (const c of family) {
        if (c.p === null) continue
        t.tested++
        if (c.p <= 0.05) t.c05++
        if (c.p <= 0.01) t.c01++
      }
      const stood = standings(family)
      const pattern = stood.some((s) => s.standing === 'pattern')
      const lead = !pattern && stood.some((s) => s.standing === 'lead')
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
    const mark = people !== 2000 ? '' : w.hi <= 0.07 ? 'pass' : t.pattern / people >= 0.07 ? 'FAIL' : 'NOT DECIDED: a second read is needed'
    console.log(`${id.padEnd(18)} ${String(look).padStart(4)}  ${String(t.tested).padStart(6)}  ${pct(t.c05, t.tested)}  ${pct(t.c01, t.tested)}  ${String(people).padStart(6)}  ${String(t.pattern).padStart(7)}  ${pct(t.pattern, people)}   ${(100 * w.hi).toFixed(2).padStart(6)}     ${pct(t.lead, people)}  ${mark}`)
  })
}
if (out) writeFileSync(out, JSON.stringify({ seeds: [from, to], worth: WORTH_STEPS, worlds: kept }))

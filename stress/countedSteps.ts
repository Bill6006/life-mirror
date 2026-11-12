import { compare, standings, type Point } from '../src/counted/compare'
import { bandOf } from '../src/score'
import { countedWorldById, EVENING_THINGS, LOOKS, recordOf } from './countedWorlds'

// Tuning only, on seeds 1 to 1000. The simulation judged with against without on the reading out of 100. Before a
// comparison measured in steps on one reading moves onto the core (a hard session against the next morning's stress,
// say, where 0.4 of a step is the size worth saying), this asks the same twelve evening things of the next morning's
// own stress answer, an anchor from 1 to 5, like for like within the evening's band: how often a chance at or under
// 0.05 turns up with nothing there, and how often a family of twelve shows a pattern. A reported check, never a verdict.
//
// node stress/.out/countedSteps.mjs [toSeed]

const WORTH_STEPS = 0.4
const to = Number(process.argv[2] ?? 1000)
if (to > 1000) throw new Error('tuning reads seeds 1 to 1000 only')
console.log(`seeds 1 to ${to}; the next morning's stress answer in steps, a size worth saying of ${WORTH_STEPS}`)
console.log('world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  lead-only%')
for (const id of ['independent-30', 'runs-persistent', 'follows-band']) {
  const spec = countedWorldById(id)
  const tally = LOOKS.map(() => ({ tested: 0, c05: 0, c01: 0, pattern: 0, lead: 0 }))
  for (let seed = 1; seed <= to; seed++) {
    const rec = recordOf(spec, seed)
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
      if (stood.some((s) => s.standing === 'pattern')) t.pattern++
      else if (stood.some((s) => s.standing === 'lead')) t.lead++
    })
  }
  LOOKS.forEach((look, at) => {
    const t = tally[at]
    const pct = (a: number, b: number): string => (b ? ((100 * a) / b).toFixed(2) : '-').padStart(7)
    console.log(`${id.padEnd(18)} ${String(look).padStart(4)}  ${String(t.tested).padStart(6)}  ${pct(t.c05, t.tested)}  ${pct(t.c01, t.tested)}  ${String(to).padStart(6)}  ${String(t.pattern).padStart(7)}  ${pct(t.pattern, to)}  ${pct(t.lead, to)}`)
  })
}

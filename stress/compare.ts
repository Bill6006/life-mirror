import { readdirSync, readFileSync } from 'node:fs'

// Two results folders compared person by person: every run the second folder holds, against the same run in the first,
// its people's results read whole. Used to show that a switch changes nothing where it never acts (requirement 15's
// threshold rule, 2026-10-19): the passing design's tuning run against the same run with the switch on. The settings and
// the run time are not compared.
//
// node stress/.out/compare.mjs <folder> <other folder>

const [a, b] = process.argv.slice(2)
if (!a || !b) throw new Error('two results folders are needed')
const files = readdirSync(b).filter((f) => f.endsWith('.json') && !f.startsWith('verdict'))
if (files.length === 0) throw new Error(`${b} holds no runs`)
let same = 0
let differ = 0
let missing = 0
for (const f of files.sort()) {
  let first: string
  try {
    first = readFileSync(`${a}/${f}`, 'utf8')
  } catch {
    missing++
    console.log(`MISSING ${f}: not in ${a}`)
    continue
  }
  const x = JSON.parse(first) as { scenario: string; seeds: [number, number]; results: { seed: number }[] }
  const y = JSON.parse(readFileSync(`${b}/${f}`, 'utf8')) as typeof x
  if (x.scenario !== y.scenario || x.seeds.join() !== y.seeds.join() || x.results.length !== y.results.length) {
    differ++
    console.log(`DIFFERENT ${f}: another run (${x.scenario} ${x.seeds.join('-')} ×${x.results.length} against ${y.scenario} ${y.seeds.join('-')} ×${y.results.length})`)
    continue
  }
  // Assert the content first: two empty reads would be equal too.
  if (x.results.length === 0) throw new Error(`${f} holds no people`)
  const firstDiff = x.results.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(y.results[i]))
  if (firstDiff === -1) {
    same++
    console.log(`SAME ${f}: ${x.results.length} people`)
  } else {
    differ++
    const r = x.results[firstDiff] as unknown as Record<string, unknown>
    const s = y.results[firstDiff] as unknown as Record<string, unknown>
    const fields = Object.keys(r).filter((k) => JSON.stringify(r[k]) !== JSON.stringify(s[k]))
    const people = x.results.filter((p, i) => JSON.stringify(p) !== JSON.stringify(y.results[i])).length
    console.log(`DIFFERENT ${f}: ${people} of ${x.results.length} people, the first seed ${x.results[firstDiff].seed}, in ${fields.join(', ')}`)
  }
}
console.log(`\n${same} same, ${differ} different, ${missing} missing, of ${files.length}`)

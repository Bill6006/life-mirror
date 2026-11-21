import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WEEK } from './levelWeekday'
import { runRanges } from './weekRanges'
import { runWeek, truthOf, weekWorldById } from './weekSim'

// The level-plus-weekday way: a small fixture of simulated people as the verdicts' code made them, so that any later
// move of the way's code (into src/, when it is built) can be proven to give the same people, number for number.
// Twelve tuning people in `rhythm` and in `rhythm-turn`: their points (stress/weekSim.ts) and their rows and ranges
// (stress/weekRanges.ts), with the method's numbers as the verdicts fixed them. Tuning seeds only.
//
// node stress/.out/weekFixture.mjs write   writes stress/week-fixture.json (refused where one is there)
// node stress/.out/weekFixture.mjs check   makes the same people again and compares; exits 1 on any difference

const FILE = fileURLToPath(new URL('../week-fixture.json', import.meta.url))
const WORLDS = ['rhythm', 'rhythm-turn']
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)

function make(): unknown {
  return {
    numbers: WEEK,
    worlds: WORLDS.map((id) => {
      const world = weekWorldById(id)
      const truth = truthOf(world)
      return {
        world: id,
        points: SEEDS.map((seed) => ({ ...runWeek(world, seed, WEEK, truth), ms: 0 })),
        ranges: SEEDS.map((seed) => ({ ...runRanges(id, seed, WEEK), ms: 0 })),
      }
    }),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const what = process.argv[2]
  if (what === 'write') {
    if (existsSync(FILE)) throw new Error(`${FILE} is already there`)
    writeFileSync(FILE, `${JSON.stringify(make())}\n`)
    console.log(`written: ${FILE}`)
  } else if (what === 'check') {
    const kept = readFileSync(FILE, 'utf8').trim()
    const now = JSON.stringify(make())
    if (kept === now) console.log('the same people, number for number')
    else {
      console.log('DIFFERENT: the code no longer gives the people the verdicts were read on')
      process.exitCode = 1
    }
  } else throw new Error('write or check')
}

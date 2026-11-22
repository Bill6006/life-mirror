import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { STAGE_C, type StageCNumbers, type StageCState } from './stageC'
import { runStageC } from './stageCSim'
import type { CTruth } from './stageCWorlds'

// Stage C: a fixture of its verdict's people, for a build to match number for number. For each person, on five days of
// the record: which of Stage C's terms write the day, and every row it writes (the point, the low and the high as the
// app stores them). The people are simulated; nothing of the owner's record is in this file or the fixture.
//
// node stress/.out/stageCFixture.mjs write [file] [first seed]     makes the fixture again from the method as it stands
// node stress/.out/stageCFixture.mjs check [file] [first seed]     makes the people again and sets them beside the fixture

const FILE = 'stress/stageC-fixture.json'
/** The verdict's first seed: a person is that seed plus the number beside its world. */
const FIRST = 920001
const PEOPLE: readonly [world: string, plus: number][] = [
  ['plain', 0],
  ['two', 0],
  ['two', 1],
  ['two', 2],
  ['two-strong', 0],
  ['two-strong', 1],
  ['sun', 0],
  ['sun', 1],
  ['sun', 2],
  ['sun-bad', 0],
  ['sun-bad', 1],
  ['all', 0],
  ['all', 1],
  ['all', 2],
  ['kind-move', 0],
  ['kind-move', 1],
  ['kind-move', 2],
  ['kind-move', 3],
  ['kind-idle', 0],
  ['kind-idle', 1],
  ['rhythm', 0],
  ['rhythm', 1],
  ['rhythm-turn', 0],
  ['season', 0],
]
const DAYS = [60, 90, 120, 150, 179]
/** The told forecast is no part of the fixture: the truth it would be told is left at nothing. */
const NO_TRUTH: CTruth = { steps: [0, 1].map(() => Array.from({ length: 7 }, () => [0, 0, 0])), sun: 0, skill: [1, 1, 1, 1, 1, 1, 1, 1] }

interface Entry {
  world: string
  seed: number
  /** The day of writing, numbered from the record's first (0). */
  day: number
  state: StageCState
  rows: [key: string, row: { point: number; lo: number; hi: number }][]
}
interface Fixture {
  numbers: StageCNumbers
  first: number
  entries: Entry[]
}

export function make(first: number): Fixture {
  const entries: Entry[] = []
  for (const [world, plus] of PEOPLE) {
    const seed = first + plus
    runStageC(world, seed, [STAGE_C], NO_TRUTH, false, 'stageB', (day, state, rows) => {
      if (DAYS.includes(day)) entries.push({ world, seed, day, state, rows: [...rows] })
    })
  }
  return { numbers: STAGE_C, first, entries }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && /stageCFixture\.mjs$/.test(process.argv[1])) {
  const [what, fileArg, firstArg] = process.argv.slice(2)
  const file = fileArg || FILE
  const first = Number(firstArg || FIRST)
  if (what === 'write') {
    const fixture = make(first)
    writeFileSync(file, JSON.stringify(fixture))
    const used = fixture.entries.filter((e) => e.state.inUse)
    console.log(`${fixture.entries.length} days of ${PEOPLE.length} people written to ${file}; Stage C in use on ${used.length} of them: the score's test ${used.filter((e) => e.state.score).length}, a reading's ${used.filter((e) => e.state.readings.some(Boolean)).length}, the weather ${used.filter((e) => e.state.weather.some(Boolean)).length}; ${used.reduce((s, e) => s + e.rows.length, 0)} rows`)
  } else if (what === 'check') {
    const kept = JSON.parse(readFileSync(file, 'utf8')) as Fixture
    const now = make(kept.first)
    if (JSON.stringify(kept.numbers) !== JSON.stringify(now.numbers)) throw new Error("the method's numbers are not the fixture's")
    const differing = kept.entries.filter((e, i) => JSON.stringify(e) !== JSON.stringify(now.entries[i]))
    if (kept.entries.length !== now.entries.length || differing.length > 0) throw new Error(`${differing.length} of ${kept.entries.length} days differ from the fixture, the first: ${differing[0]?.world} seed ${differing[0]?.seed} day ${differing[0]?.day}`)
    console.log(`the same people, number for number (${kept.entries.length} days, ${kept.entries.reduce((s, e) => s + e.rows.length, 0)} rows)`)
  } else throw new Error('usage: stageCFixture.mjs write|check [file] [first seed]')
}

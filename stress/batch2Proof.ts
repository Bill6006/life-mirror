import { comesBefore } from '../src/beforeDays'
import { BLOCKS } from '../src/blocks'
import { CHALLENGER } from '../src/challenger'
import type { CheckIn } from '../src/db'
import { chooseModel, loggedDays, MIN_DAYS_TODAY, predict } from '../src/forecast'
import { slotKey } from '../src/observe'
import { chooseOfFive, FIFTH, FIFTH_WAY, fifthWayOf, type FifthNumbers } from './weekdayPattern'
import { recordOf } from './countedWorlds'
import { fifthWorldById, MEASURE_FROM, runFifth } from './fifthSim'
import { DAYS, FIRST_DAY } from './forecastSim'
import { checkinsOf, holdWorldById, PAIRS, runHold, type Run } from './holdSim'

// Batch 2's shortcuts proven row for row on the first people, before any of the simulations' numbers are trusted
// (WORKING.md): every day of each person worked out again with none of them, by the app's own functions alone, and the
// two compared. The hold: `comesBefore` itself on every day, against the simulation's runs of each pair. The fifth way:
// the app's pick of four and of five on every day, each with a fresh fifth way and nothing kept between days, against
// the simulation's picks; and the day-ahead misses of criterion 2, again from fresh. A difference stops the run.
//
// node stress/.out/batch2Proof.mjs hold|fifth <world> <first seed> <people> [fifth way's numbers as JSON]

const [item, worldId, fromArg, countArg, numbersArg] = process.argv.slice(2)
if (!item || !worldId || !fromArg || !countArg) throw new Error('usage: batch2Proof.mjs hold|fifth <world> <first seed> <people> [numbers]')
const from = Number(fromArg)
const count = Number(countArg)

function runsOf(on: readonly boolean[]): Run[] {
  const out: Run[] = []
  let start: number | null = null
  for (let d = 1; d < DAYS; d++) {
    if (on[d] && start === null) start = d
    if (!on[d] && start !== null) {
      out.push([start, d - start])
      start = null
    }
  }
  if (start !== null) out.push([start, DAYS - start])
  return out
}

if (item === 'hold') {
  const world = holdWorldById(worldId)
  for (let seed = from; seed < from + count; seed++) {
    const t0 = Date.now()
    const sim = runHold(world, seed)
    const { checkins, dayName } = checkinsOf(world, seed)
    const on = PAIRS.map(() => new Array<boolean>(DAYS).fill(false))
    const record: CheckIn[] = []
    for (let d = 0; d < DAYS; d++) {
      record.push(...checkins[d])
      if (d === 0) continue
      const byId = new Map(comesBefore(record, dayName[d]).map((p) => [`before.${p.reading}.${p.level}`, p.standing === 'pattern']))
      PAIRS.forEach((p, i) => {
        on[i][d] = byId.get(p.id) === true
      })
    }
    let runs = 0
    PAIRS.forEach((p, i) => {
      const own = runsOf(on[i])
      runs += own.length
      if (JSON.stringify(own) !== JSON.stringify(sim.runs[i])) throw new Error(`hold, ${worldId}, seed ${seed}: ${p.id} runs ${JSON.stringify(sim.runs[i])} in the simulation, ${JSON.stringify(own)} by comesBefore`)
    })
    console.log(`hold ${worldId} seed ${seed}: every day of the sixteen pairs alike (${runs} runs at a pattern) in ${Math.round((Date.now() - t0) / 1000)} s`)
  }
} else if (item === 'fifth') {
  const world = fifthWorldById(worldId)
  const numbers: FifthNumbers = { ...FIFTH, ...(numbersArg ? (JSON.parse(numbersArg) as Partial<FifthNumbers>) : {}) }
  for (let seed = from; seed < from + count; seed++) {
    const t0 = Date.now()
    const sim = runFifth(world, seed, numbers, CHALLENGER)
    const byDay = new Map(sim.days.map((d) => [d[0], d[1]]))
    const rec = recordOf(world.spec, seed)
    const values = new Map<string, number>()
    let picked = 0
    let checked = 0
    let four = 0
    let five = 0
    let n = 0
    for (let t = 0; t < DAYS; t++) {
      if (t > 0) BLOCKS.forEach((b, i) => { const v = rec.reading[t - 1][i]; if (v !== null) values.set(slotKey(rec.dayName[t - 1], b), v) })
      if (t < FIRST_DAY) continue
      const today = rec.dayName[t]
      const chosen = loggedDays(values) >= MIN_DAYS_TODAY ? chooseModel(values, today) : null
      if (!chosen) {
        if (byDay.has(t)) throw new Error(`fifth, ${worldId}, seed ${seed}, day ${t}: the simulation picked where the app has no pick`)
        continue
      }
      const fresh = fifthWayOf(values, numbers)
      const ofFive = chooseOfFive(values, today, fresh, numbers)
      const way = ofFive?.way ?? chosen.model
      const simFifth = byDay.get(t)
      if (simFifth === undefined) throw new Error(`fifth, ${worldId}, seed ${seed}, day ${t}: the app picks, the simulation has no day`)
      if (simFifth !== (way === FIFTH_WAY ? 1 : 0)) throw new Error(`fifth, ${worldId}, seed ${seed}, day ${t}: the simulation's pick of five differs from the app's`)
      checked++
      if (way === FIFTH_WAY) picked++
      if (t + 1 >= MEASURE_FROM && t + 1 < DAYS) {
        const tomorrow = rec.dayName[t + 1]
        BLOCKS.forEach((b, i) => {
          const actual = rec.reading[t + 1][i]
          if (actual === null) return
          const p4 = predict(chosen.model, values, tomorrow, b)
          const p5 = way === FIFTH_WAY ? fresh.predict(tomorrow, b, today) : p4
          if (p4 === null || p5 === null) return
          four += Math.abs(actual - p4)
          five += Math.abs(actual - p5)
          n++
        })
      }
    }
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01
    if (n !== sim.four.n || n !== sim.five.n || !near(four, sim.four.sum) || !near(five, sim.five.sum)) throw new Error(`fifth, ${worldId}, seed ${seed}: criterion 2's misses differ (${four.toFixed(3)}/${five.toFixed(3)} on ${n} against ${sim.four.sum}/${sim.five.sum} on ${sim.four.n})`)
    console.log(`fifth ${worldId} seed ${seed}: every day's pick alike (${checked} days, the fifth way on ${picked}), criterion 2's misses alike on ${n} slots, in ${Math.round((Date.now() - t0) / 1000)} s`)
  }
} else throw new Error('hold or fifth')

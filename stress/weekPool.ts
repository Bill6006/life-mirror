import { existsSync, writeFileSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { WEEK, type WeekNumbers } from './levelWeekday'
import { runWeek, truthOf, weekWorldById, type Truth, type WeekPerson } from './weekSim'

// A range of simulated people through one of the level-plus-weekday way's worlds, spread over worker threads, written
// as one JSON file. A result already there is never overwritten: a range is read once.
//
// node stress/.out/weekPool.mjs <world> <fromSeed> <toSeed> <out.json> [threads] [the way's numbers as JSON]
// With WEEK_CHALLENGER=1 the app's challenger is also run each day on the way in use (far slower).

interface Job {
  world: string
  seeds: number[]
  numbers: WeekNumbers
  truth: Truth
  challenger: boolean
}

if (!isMainThread) {
  const job = workerData as Job
  const world = weekWorldById(job.world)
  for (const seed of job.seeds) parentPort?.postMessage(runWeek(world, seed, job.numbers, job.truth, job.challenger))
  parentPort?.postMessage('done')
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [worldId, from, to, out, threadsArg, numbersArg] = process.argv.slice(2)
  if (!worldId || !from || !to || !out) throw new Error('usage: weekPool.mjs <world> <fromSeed> <toSeed> <out.json> [threads] [numbers]')
  const world = weekWorldById(worldId)
  if (existsSync(out)) throw new Error(`${out} is already there: a range is read once`)
  const numbers: WeekNumbers = { ...WEEK, ...(numbersArg ? (JSON.parse(numbersArg) as Partial<WeekNumbers>) : {}) }
  const challenger = process.env.WEEK_CHALLENGER === '1'
  const seeds: number[] = []
  for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
  if (!seeds.length) throw new Error('no seeds')
  const truth = truthOf(world)
  const threads = Math.min(Number(threadsArg ?? 12), seeds.length)
  const results: WeekPerson[] = []
  const t0 = Date.now()
  let finished = 0
  await new Promise<void>((resolve, reject) => {
    for (let i = 0; i < threads; i++) {
      const mine = seeds.filter((_, k) => k % threads === i)
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { world: worldId, seeds: mine, numbers, truth, challenger } satisfies Job })
      w.on('message', (m: WeekPerson | 'done') => {
        if (m === 'done') {
          if (++finished === threads) resolve()
          return
        }
        results.push(m)
        if (results.length % 250 === 0) process.stderr.write(`${worldId}: ${results.length}/${seeds.length} after ${Math.round((Date.now() - t0) / 1000)} s\n`)
      })
      w.on('error', reject)
    }
  })
  results.sort((a, b) => a.seed - b.seed)
  if (results.length !== seeds.length) throw new Error(`${worldId}: ${results.length} results for ${seeds.length} seeds`)
  writeFileSync(out, JSON.stringify({ world: worldId, seeds: [Number(from), Number(to)], numbers, challenger, truth, ms: Date.now() - t0, results }))
  process.stderr.write(`${worldId}: ${results.length} people in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}\n`)
}

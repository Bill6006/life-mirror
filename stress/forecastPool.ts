import { existsSync, writeFileSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { CHALLENGER, type ChallengerNumbers } from '../src/challenger'
import { forecastWorldById, runForecast, type ForecastPerson } from './forecastSim'

// A range of simulated people through one of the forecast challenger's worlds, spread over worker threads, written as
// one JSON file. A result already there is never overwritten: a range is read once.
//
// node stress/.out/forecastPool.mjs <world> <fromSeed> <toSeed> <out.json> [threads] [numbers as JSON]

interface Job {
  world: string
  seeds: number[]
  numbers: ChallengerNumbers
}

if (!isMainThread) {
  const job = workerData as Job
  const world = forecastWorldById(job.world)
  for (const seed of job.seeds) parentPort?.postMessage(runForecast(world, seed, job.numbers))
  parentPort?.postMessage('done')
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [world, from, to, out, threadsArg, numbersArg] = process.argv.slice(2)
  if (!world || !from || !to || !out) throw new Error('usage: forecastPool.mjs <world> <fromSeed> <toSeed> <out.json> [threads] [numbers]')
  forecastWorldById(world)
  if (existsSync(out)) throw new Error(`${out} is already there: a range is read once`)
  const numbers: ChallengerNumbers = { ...CHALLENGER, ...(numbersArg ? (JSON.parse(numbersArg) as Partial<ChallengerNumbers>) : {}) }
  const seeds: number[] = []
  for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
  if (!seeds.length) throw new Error('no seeds')
  const threads = Math.min(Number(threadsArg ?? 12), seeds.length)
  const results: ForecastPerson[] = []
  const t0 = Date.now()
  let finished = 0
  await new Promise<void>((resolve, reject) => {
    for (let i = 0; i < threads; i++) {
      const mine = seeds.filter((_, k) => k % threads === i)
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { world, seeds: mine, numbers } satisfies Job })
      w.on('message', (m: ForecastPerson | 'done') => {
        if (m === 'done') {
          if (++finished === threads) resolve()
          return
        }
        results.push(m)
        if (results.length % 500 === 0) process.stderr.write(`${world}: ${results.length}/${seeds.length} after ${Math.round((Date.now() - t0) / 1000)} s\n`)
      })
      w.on('error', reject)
    }
  })
  results.sort((a, b) => a.seed - b.seed)
  if (results.length !== seeds.length) throw new Error(`${world}: ${results.length} results for ${seeds.length} seeds`)
  writeFileSync(out, JSON.stringify({ world, seeds: [Number(from), Number(to)], numbers, ms: Date.now() - t0, results }))
  process.stderr.write(`${world}: ${results.length} people in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}\n`)
}

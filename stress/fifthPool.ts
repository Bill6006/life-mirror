import { existsSync, writeFileSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { CHALLENGER } from '../src/challenger'
import { FIFTH, type FifthNumbers } from '../src/weekdayPattern'
import { fifthWorldById, runFifth, type FifthPerson } from './fifthSim'

// A range of simulated people through one of the fifth way's worlds, spread over worker threads, written as one JSON
// file. A result already there is never overwritten: a range is read once.
//
// node stress/.out/fifthPool.mjs <world> <fromSeed> <toSeed> <out.json> [threads] [fifth way's numbers as JSON]
// With FIFTH_RECORD=1 each person also keeps what stress/fifthMargin.ts needs to try other margins on the tuning seeds;
// what the run itself works out is the same either way.

interface Job {
  world: string
  seeds: number[]
  numbers: FifthNumbers
  record: boolean
}

if (!isMainThread) {
  const job = workerData as Job
  const world = fifthWorldById(job.world)
  for (const seed of job.seeds) parentPort?.postMessage(runFifth(world, seed, job.numbers, CHALLENGER, job.record))
  parentPort?.postMessage('done')
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [world, from, to, out, threadsArg, numbersArg] = process.argv.slice(2)
  if (!world || !from || !to || !out) throw new Error('usage: fifthPool.mjs <world> <fromSeed> <toSeed> <out.json> [threads] [numbers]')
  fifthWorldById(world)
  if (existsSync(out)) throw new Error(`${out} is already there: a range is read once`)
  const numbers: FifthNumbers = { ...FIFTH, ...(numbersArg ? (JSON.parse(numbersArg) as Partial<FifthNumbers>) : {}) }
  const record = process.env.FIFTH_RECORD === '1'
  const seeds: number[] = []
  for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
  if (!seeds.length) throw new Error('no seeds')
  const threads = Math.min(Number(threadsArg ?? 12), seeds.length)
  const results: FifthPerson[] = []
  const t0 = Date.now()
  let finished = 0
  await new Promise<void>((resolve, reject) => {
    for (let i = 0; i < threads; i++) {
      const mine = seeds.filter((_, k) => k % threads === i)
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { world, seeds: mine, numbers, record } satisfies Job })
      w.on('message', (m: FifthPerson | 'done') => {
        if (m === 'done') {
          if (++finished === threads) resolve()
          return
        }
        results.push(m)
        if (results.length % 250 === 0) process.stderr.write(`${world}: ${results.length}/${seeds.length} after ${Math.round((Date.now() - t0) / 1000)} s\n`)
      })
      w.on('error', reject)
    }
  })
  results.sort((a, b) => a.seed - b.seed)
  if (results.length !== seeds.length) throw new Error(`${world}: ${results.length} results for ${seeds.length} seeds`)
  writeFileSync(out, JSON.stringify({ world, seeds: [Number(from), Number(to)], numbers, challenger: CHALLENGER, record, ms: Date.now() - t0, results }))
  process.stderr.write(`${world}: ${results.length} people in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}\n`)
}

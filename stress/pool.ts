import { writeFileSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { B_DEFAULT, type BConfig } from './engineB'
import { runPerson, type PersonResult } from './run'
import { scenarioById } from './scenarios'

// Runs a range of simulated people through one engine in one scenario, spread over worker threads,
// and writes every person's result as one JSON file.
//
// node stress/.out/pool.mjs <scenario> <A|B> <fromSeed> <toSeed> <out.json> [threads] ['{"cfg":"overrides"}']

interface Job {
  scenario: string
  engine: 'A' | 'B'
  seeds: number[]
  cfg: BConfig
}

if (!isMainThread) {
  const job = workerData as Job
  const s = scenarioById(job.scenario)
  for (const seed of job.seeds) parentPort?.postMessage(runPerson(s, job.engine, seed, job.cfg))
  parentPort?.postMessage('done')
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [scenario, engineArg, from, to, out, threadsArg, cfgArg] = process.argv.slice(2)
  if (engineArg !== 'A' && engineArg !== 'B') throw new Error('the engine is A or B')
  const engine: 'A' | 'B' = engineArg
  const cfg: BConfig = { ...B_DEFAULT, ...(cfgArg ? (JSON.parse(cfgArg) as Partial<BConfig>) : {}) }
  const seeds: number[] = []
  for (let s = Number(from); s <= Number(to); s++) seeds.push(s)
  const threads = Math.min(Number(threadsArg ?? 12), seeds.length)
  const results: PersonResult[] = []
  const t0 = Date.now()
  let finished = 0
  await new Promise<void>((resolve, reject) => {
    for (let i = 0; i < threads; i++) {
      const mine = seeds.filter((_, k) => k % threads === i)
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { scenario, engine, seeds: mine, cfg } satisfies Job })
      w.on('message', (m: PersonResult | 'done') => {
        if (m === 'done') {
          if (++finished === threads) resolve()
          return
        }
        results.push(m)
        if (results.length % 100 === 0) process.stderr.write(`${scenario}/${engine}: ${results.length}/${seeds.length} after ${Math.round((Date.now() - t0) / 1000)} s\n`)
      })
      w.on('error', reject)
    }
  })
  results.sort((a, b) => a.seed - b.seed)
  writeFileSync(out, JSON.stringify({ scenario, engine, cfg, seeds: [Number(from), Number(to)], ms: Date.now() - t0, results }))
  process.stderr.write(`${scenario}/${engine}: ${results.length} people in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}\n`)
}

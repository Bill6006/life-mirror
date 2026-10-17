import { readFileSync } from 'node:fs'
import type { PersonA, PersonB, PersonResult } from './run'
import { median, quantile, wilson } from './stats'

// A quick read of one results file, for tuning on the tuning seeds. The verdict is not read here:
// metrics.ts judges the frozen criteria on the validation seeds.
//
// node stress/.out/summary.mjs <results.json> [delta]

const file = process.argv[2]
const delta = Number(process.argv[3] ?? 0.25)
const data = JSON.parse(readFileSync(file, 'utf8')) as { scenario: string; engine: 'A' | 'B'; results: PersonResult[] }
const pct = (k: number, n: number) => {
  const w = wilson(k, n)
  return `${(100 * w.p).toFixed(1)}% [${(100 * w.lo).toFixed(1)}, ${(100 * w.hi).toFixed(1)}] (${k}/${n})`
}
const right = (dir: string | null, truth: number) => (dir === 'helps' ? truth > 0 : dir === 'hurts' ? truth < 0 : dir === 'little' ? Math.abs(truth) < delta : false)

console.log(`${data.scenario} / ${data.engine}: ${data.results.length} people`)
if (data.engine === 'A') {
  const rs = data.results as PersonA[]
  const keys = rs[0]?.tracked.map((t) => t.key) ?? []
  for (const k of keys) {
    const ts = rs.map((r) => r.tracked.find((t) => t.key === k)!)
    for (const tier of ['promising', 'holdsUp', 'unhelpful'] as const) {
      const got = ts.filter((t) => t.first[tier])
      const ok = got.filter((t) => t.first[tier]?.right)
      console.log(`  ${k} ${tier}: reached ${pct(got.length, ts.length)}, right ${pct(ok.length, got.length)}, median day ${median(ok.map((t) => t.first[tier]!.day))}`)
    }
  }
  const allHolds = rs.flatMap((r) => r.holdsUp)
  console.log(`  every Holds up: ${allHolds.length}, false ${pct(allHolds.filter((h) => !(h.truth > 0)).length, allHolds.length)}`)
  console.log(`  offers/person ${median(rs.map((r) => r.offers))}, move offers ${median(rs.map((r) => r.moveOffers))}, benefit/offer ${(rs.reduce((s, r) => s + r.benefit, 0) / rs.reduce((s, r) => s + r.offers, 0)).toFixed(4)}`)
} else {
  const rs = data.results as PersonB[]
  const keys = rs[0]?.tracked.map((t) => t.key) ?? []
  for (const k of keys) {
    const ts = rs.map((r) => r.tracked.find((t) => t.key === k)!)
    const truth = median(ts.map((t) => t.truth))
    console.log(`  ${k}: truth ${truth.toFixed(3)} (ITT ${median(ts.map((t) => t.ittTruth)).toFixed(3)})`)
    for (const lv of ['early', 'likely', 'established'] as const) {
      const got = ts.filter((t) => t.first[lv])
      const ok = got.filter((t) => right(t.first[lv]!.dir, t.truth))
      const days = ts.map((t) => t.firstRight[lv] ?? 180)
      console.log(`    ${lv}: reached ${pct(got.length, ts.length)}, first call right ${pct(ok.length, got.length)}, days to a right call: median ${median(days)}, 80th ${quantile(days, 0.8)}`)
    }
    const d90 = ts.filter((t) => t.d90)
    if (d90.length) {
      const bias = d90.reduce((s, t) => s + (t.d90!.theta - t.truth), 0) / d90.length
      const cov = d90.filter((t) => Math.abs(t.d90!.theta - t.truth) <= 1.96 * t.d90!.se).length
      console.log(`    day 90: bias ${bias.toFixed(3)}, 95% interval covers ${pct(cov, d90.length)}`)
    }
    console.log(`    at day 180: offers of the move ${median(ts.map((t) => t.offersAll))}, decisions per arm ${median(ts.map((t) => t.n1End))} / ${median(ts.map((t) => t.n0End))}, CS half-width ${median(ts.filter((t) => t.csHalfEnd !== null).map((t) => t.csHalfEnd as number)).toFixed(3)}`)
    const cs = ts.filter((t) => t.coverAll !== null)
    console.log(`    CS covers the effect of offering at every look: ${pct(cs.filter((t) => t.coverAll).length, cs.length)}`)
    const sl = ts.reduce((s, t) => s + t.sparseLooks, 0)
    const sc = ts.reduce((s, t) => s + t.sparseCovered, 0)
    console.log(`    belief intervals with under ten per arm cover: ${pct(sc, sl)}; little difference established ${pct(ts.filter((t) => t.littleEst !== null).length, ts.length)}; revised ${pct(ts.filter((t) => t.revisedDay !== null).length, ts.length)}`)
    const ctx = new Map<string, number>()
    for (const t of ts) for (const [c, v] of Object.entries(t.ctx)) ctx.set(`${c} ${v.dir}`, (ctx.get(`${c} ${v.dir}`) ?? 0) + 1)
    if (ctx.size) console.log(`    context calls (likely+): ${[...ctx.entries()].map(([c, n]) => `${c} ${n}`).join(', ')}`)
  }
  const est = rs.flatMap((r) => r.est.filter((e) => !e.ctx))
  const estCtx = rs.flatMap((r) => r.est.filter((e) => e.ctx))
  const wrongDir = est.filter((e) => e.dir !== 'little' && !right(e.dir, e.truth))
  console.log(`  every established call (general): ${est.length} (${(est.length / rs.length).toFixed(2)}/person), false ${pct(est.filter((e) => !right(e.dir, e.truth)).length, est.length)}; helps/hurts false ${pct(wrongDir.length, est.filter((e) => e.dir !== 'little').length)}`)
  console.log(`  context-specific established: ${estCtx.length}, false ${pct(estCtx.filter((e) => !right(e.dir, e.truth)).length, estCtx.length)}`)
  for (const lv of ['early', 'likely', 'established'] as const) {
    const ev = rs.flatMap((r) => r.ladder.filter((x) => x.level === lv))
    const dirs = ['helps', 'hurts', 'little'].map((d) => {
      const e = ev.filter((x) => x.dir === d)
      return `${d} ${e.length} right ${e.length ? ((100 * e.filter((x) => right(x.dir, x.truth)).length) / e.length).toFixed(0) : '-'}%`
    })
    console.log(`  ladder ${lv}: ${ev.length} calls, right ${pct(ev.filter((x) => right(x.dir, x.truth)).length, ev.length)}; ${dirs.join('; ')}`)
  }
  const offers = rs.reduce((s, r) => s + r.offers, 0)
  console.log(`  offers/person ${median(rs.map((r) => r.offers))}, move offers ${median(rs.map((r) => r.moveOffers))}, to low moves ${pct(rs.reduce((s, r) => s + r.lowOffers, 0), rs.reduce((s, r) => s + r.moveOffers, 0))}, benefit/offer ${(rs.reduce((s, r) => s + r.benefit, 0) / offers).toFixed(4)}, re-established ${rs.reduce((s, r) => s + r.reEstablished, 0)}`)
}

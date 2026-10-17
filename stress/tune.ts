import { readFileSync } from 'node:fs'
import type { PersonB } from './run'
import { median, quantile, wilson } from './stats'

// A tuning digest: for one configuration's runs on the tuning seeds, the few numbers that decide
// between settings. node stress/.out/tune.mjs <label> <null.json> <large.json> <mixed.json>

const [label, nullFile, largeFile, mixedFile] = process.argv.slice(2)
const load = (f: string) => (JSON.parse(readFileSync(f, 'utf8')) as { results: PersonB[] }).results
const right = (dir: string | null, truth: number) => (dir === 'helps' ? truth > 0 : dir === 'hurts' ? truth < 0 : dir === 'little' ? Math.abs(truth) < 0.25 : false)
const rate = (k: number, n: number) => {
  const w = wilson(k, n)
  return `${(100 * w.p).toFixed(1)}% (≤${(100 * w.hi).toFixed(1)})`
}
const nul = load(nullFile)
const large = load(largeFile)
const mixed = load(mixedFile)
const key = 'walk-ten|stress|nextBlock'
const nt = nul.map((r) => r.tracked.find((t) => t.key === key)!)
const lt = large.map((r) => r.tracked.find((t) => t.key === key)!)
const nullFalseEst = nt.filter((t) => t.first.established && t.first.established.dir !== 'little').length
const nullAllEst = nul.flatMap((r) => r.est.filter((e) => e.dir !== 'little'))
const days = lt.map((t) => t.firstRight.established ?? 180)
const by144 = lt.filter((t) => (t.firstRight.established ?? 999) <= 144).length
const est = mixed.flatMap((r) => r.est)
const lad = (lv: string) => {
  const ev = mixed.flatMap((r) => r.ladder.filter((x) => x.level === lv))
  return `${ev.length} right ${rate(ev.filter((x) => right(x.dir, x.truth)).length, ev.length)}`
}
console.log(`${label}
  null: test move established helps/hurts ${rate(nullFalseEst, nt.length)}; any false established per person ${(nullAllEst.length / nul.length).toFixed(3)}
  large: right established by day 144 ${rate(by144, lt.length)}, median day ${median(days)}, 80th ${quantile(days, 0.8)}; offers of the move ${median(lt.map((t) => t.offersAll))}; per arm ${median(lt.map((t) => t.n1End))}/${median(lt.map((t) => t.n0End))}
  mixed: established ${est.length} (${(est.length / mixed.length).toFixed(2)}/person), false ${rate(est.filter((e) => !right(e.dir, e.truth)).length, est.length)}; early ${lad('early')}; likely ${lad('likely')}; benefit/offer ${(mixed.reduce((s, r) => s + r.benefit, 0) / mixed.reduce((s, r) => s + r.offers, 0)).toFixed(4)}`)

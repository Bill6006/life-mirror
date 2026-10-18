import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { PersonA, PersonB, TrackB } from './run'
import { mean, median, wilson } from './stats'

// The verdict by requirement 14's rule, the owner's decision of 2026-10-18 ("Yes: judge the engine by requirement
// 14."): "The false-finding mark comes first: if the simulation shows three weeks is unrealistic at Life Mirror's
// actual cadence while that mark holds, the realistic time is reported to the owner and no safeguard is weakened."
//
// Every clause of the frozen criteria (CRITERIA.md, unchanged) is read here exactly as metrics.ts reads it, the same
// files, the same counts, the same comparisons. Each clause is then one of two kinds, fixed before the verdict's runs:
//   gate      it limits wrong calls, bias or honesty: it must pass, word for word;
//   reported  it asks how soon, or how often by a day, a call is reached: its value is reported, not judged.
// S2 stays a gate; by the same decision its scenario, the mixed catalogue, is run on 10,000 people so its interval
// can decide. The verdict passes only if every gate passes. metrics.ts stays the judge of the frozen verdict.
//
// node stress/.out/verdict14.mjs [dir] [out.json]

const dir = process.argv[2] ?? 'stress/.out/val'
const out = process.argv[3] ?? `${dir}/verdict14.json`
const DELTA = 0.25
const TEST = 'walk-ten|stress|nextBlock'

const loadB = (name: string): PersonB[] | null => (existsSync(`${dir}/${name}-B.json`) ? (JSON.parse(readFileSync(`${dir}/${name}-B.json`, 'utf8')).results as PersonB[]) : null)
const loadA = (name: string): PersonA[] | null => (existsSync(`${dir}/${name}-A.json`) ? (JSON.parse(readFileSync(`${dir}/${name}-A.json`, 'utf8')).results as PersonA[]) : null)
const track = (rs: PersonB[], key = TEST): TrackB[] => rs.map((r) => r.tracked.find((t) => t.key === key) as TrackB).filter(Boolean)
const right = (dir: string | null, truth: number) => (dir === 'helps' ? truth > 0 : dir === 'hurts' ? truth < 0 : dir === 'little' ? Math.abs(truth) < DELTA : false)
const est = (t: TrackB) => t.first.established
const fmt = (k: number, n: number) => {
  const w = wilson(k, n)
  return { k, n, p: w.p, lo: w.lo, hi: w.hi, text: `${(100 * w.p).toFixed(1)}% [${(100 * w.lo).toFixed(1)}, ${(100 * w.hi).toFixed(1)}] (${k}/${n})` }
}

type Kind = 'gate' | 'reported'
interface Clause {
  id: string
  kind: Kind
  what: string
  /** For a gate: whether it passes, or null when its files were not run. For a reported clause: whether its frozen mark was met. */
  met: boolean | null
  detail: string
}
const clauses: Clause[] = []
const add = (id: string, kind: Kind, what: string, met: boolean | null, detail: string) => clauses.push({ id, kind, what, met, detail })
const missing = (id: string, kind: Kind, what: string, files: string) => add(id, kind, what, null, `not run: ${files}`)

// ---- Safeguards: every one a gate ----------------------------------------------------------------

const nul = loadB('null')
let s1: boolean | null = null
if (nul) {
  const t = track(nul)
  const f = fmt(t.filter((x) => est(x) && est(x)?.dir !== 'little').length, t.length)
  s1 = f.hi < 0.05
  add('S1', 'gate', 'a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)', s1, f.text)
} else missing('S1', 'gate', 'no-effect move', 'null-B')

const mixed = loadB('mixed')
let s2: boolean | null = null
if (mixed) {
  const all = mixed.flatMap((r) => r.est)
  const f = fmt(all.filter((e) => !right(e.dir, e.truth)).length, all.length)
  const perYear = (all.filter((e) => !right(e.dir, e.truth)).length / mixed.length) * (365 / 180)
  s2 = all.length > 0 && f.hi < 0.05
  add('S2', 'gate', `fewer than 1 in 20 established calls false, across the whole system (mixed catalogue, ${mixed.length} people)`, s2, `${f.text}; false established per person-year ${perYear.toFixed(3)}; established calls per person ${(all.length / mixed.length).toFixed(3)}`)
} else missing('S2', 'gate', 'system-wide', 'mixed-B')

add('S3', 'gate', 'nothing established, and no causal word, except from randomized comparisons', true, 'holds by construction, as metrics.ts records: the only path to established in engine B is the confidence sequence on randomized decisions.')

const missNull = loadB('missing-null')
const missLarge = loadB('missing-large')
const large = loadB('large')
let s4: boolean | null = null
if (missNull && missLarge && large) {
  const t = track(missNull)
  const hurts = t.filter((x) => x.first.likely?.dir === 'hurts' || x.first.established?.dir === 'hurts').length
  const f = fmt(hurts, t.length)
  const biasMiss = mean(track(missLarge).filter((x) => x.d180).map((x) => (x.d180 as { theta: number }).theta - x.truth))
  const biasBase = mean(track(large).filter((x) => x.d180).map((x) => (x.d180 as { theta: number }).theta - x.truth))
  s4 = f.hi < 0.05 && Math.abs(biasMiss - biasBase) <= 0.1
  add('S4', 'gate', 'missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias', s4, `hurts ${f.text}; day-180 bias with missingness ${biasMiss.toFixed(3)}, without ${biasBase.toFixed(3)}, added ${(biasMiss - biasBase).toFixed(3)}`)
} else missing('S4', 'gate', 'missingness', 'missing-null-B, missing-large-B, large-B')

let s5: boolean | null = null
if (large) {
  const t = track(large)
  const d90 = t.filter((x) => x.d90)
  const bias = mean(d90.map((x) => (x.d90 as { theta: number }).theta - x.truth))
  const cov = t.filter((x) => x.coverAll !== null)
  const f = fmt(cov.filter((x) => x.coverAll).length, cov.length)
  s5 = Math.abs(bias) <= 0.1 && f.hi >= 0.95
  add('S5', 'gate', 'adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error', s5, `day-90 bias ${bias.toFixed(3)} (${d90.length} people); coverage at every look ${f.text}`)
} else missing('S5', 'gate', 'adaptive', 'large-B')

// ---- Claims, clause by clause --------------------------------------------------------------------

const largeA = loadA('large')
const nullA = loadA('null')
const moderate = loadB('moderate')
const moderateA = loadA('moderate')
if (large && largeA && nullA && moderate && moderateA) {
  const daysB = track(large).map((x) => x.firstRight.established ?? 180)
  const holdsA = (r: PersonA) => r.tracked.find((t) => t.key === 'walk-ten|stress')?.first.holdsUp
  const daysA = largeA.map((r) => (holdsA(r)?.right ? holdsA(r)!.day : 180))
  const aNull = fmt(nullA.filter((r) => holdsA(r)).length, nullA.length)
  const mB = median(daysB)
  const mA = median(daysA)
  const halfB = fmt(track(moderate).filter((x) => x.firstRight.established !== undefined).length, track(moderate).length)
  const halfA = fmt(moderateA.filter((r) => holdsA(r)?.right).length, moderateA.length)
  add('C1a', 'reported', 'full-step median days to a right established ≤ 0.8 × today\'s to a right Holds up', mB <= 0.8 * mA, `B median ${mB} days, A median ${mA} days; A's own no-effect Holds-up rate ${aNull.text}`)
  add('C1b', 'reported', 'half-step share with a right established call by day 180 ≥ today\'s share for Holds up', halfB.p >= halfA.p, `B ${halfB.text}, A ${halfA.text}`)
} else missing('C1', 'reported', 'better than today', 'large-B, large-A, null-A, moderate-B, moderate-A')

const sparseNull = loadB('sparse-null')
const sparseLarge = loadB('sparse-large')
if (sparseNull && sparseLarge) {
  const all = [...track(sparseNull), ...track(sparseLarge)]
  const looks = all.reduce((s, x) => s + x.sparseLooks, 0)
  const covered = all.reduce((s, x) => s + x.sparseCovered, 0)
  const cs = track(sparseLarge).filter((x) => x.coverAll !== null)
  const fc = fmt(cs.filter((x) => x.coverAll).length, cs.length)
  add('C2', 'gate', 'honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5\'s coverage', looks > 0 && covered / looks >= 0.9 && (cs.length === 0 || fc.hi >= 0.95), `belief intervals ${fmt(covered, looks).text}; sequence coverage ${fc.text}`)
} else missing('C2', 'gate', 'sparse', 'sparse-null-B, sparse-large-B')

{
  const parts: string[] = []
  let ok = true
  let any = false
  for (const name of ['large', 'rhythm-large', 'rebound-large', 'context-large']) {
    const rs = loadB(name)
    if (!rs) {
      parts.push(`${name}: not run`)
      ok = false
      continue
    }
    any = true
    const d90 = track(rs).filter((x) => x.d90)
    const bias = mean(d90.map((x) => (x.d90 as { theta: number }).theta - x.truth))
    const cov = fmt(d90.filter((x) => Math.abs((x.d90 as { theta: number }).theta - x.truth) <= 1.96 * (x.d90 as { se: number }).se).length, d90.length)
    ok = ok && Math.abs(bias) <= 0.1 && cov.p >= 0.93
    parts.push(`${name}: bias ${bias.toFixed(3)}, covers ${cov.text}`)
  }
  add('C3', 'gate', 'causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)', any ? ok : null, parts.join('; '))
}
add('C4', 'gate', 'is S3', true, 'see S3')
add('C5', 'gate', 'is S5', s5, 'see S5')

if (nul && large) {
  const t = track(nul)
  const eligible = t.filter((x) => x.eligibleAfter30 >= (150 * 3) / 7)
  const little = fmt(eligible.filter((x) => x.littleEst !== null).length, eligible.length)
  const fullLittle = fmt(track(large).filter((x) => x.littleEst !== null).length, track(large).length)
  add('C6a', 'gate', 'S1 holds under daily looks', s1, 'see S1')
  add('C6b', 'reported', 'with no effect and the move eligible at least three times a week, an established little difference by day 180 in at least half', eligible.length > 0 && little.p >= 0.5, little.text)
  add('C6c', 'gate', 'at a full step, little difference called in fewer than 1 in 20', fullLittle.p < 0.05, fullLittle.text)
} else missing('C6', 'gate', 'stopping', 'null-B, large-B')

if (large && largeA) {
  const perB = large.reduce((s, r) => s + r.moveOffers, 0) / large.reduce((s, r) => s + r.checkins, 0)
  const perA = largeA.reduce((s, r) => s + r.moveOffers, 0) / largeA.reduce((s, r) => s + r.checkins, 0)
  const low = fmt(large.reduce((s, r) => s + r.lowOffers, 0), large.reduce((s, r) => s + r.moveOffers, 0))
  const benB = large.reduce((s, r) => s + r.benefit, 0) / large.reduce((s, r) => s + r.offers, 0)
  const benA = largeA.reduce((s, r) => s + r.benefit, 0) / largeA.reduce((s, r) => s + r.offers, 0)
  add('C7', 'gate', 'exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today\'s', perB <= perA + 1e-9 && perB <= 1 && 1 - low.p >= 0.9 && benB >= benA, `move offers per check-in B ${perB.toFixed(3)}, A ${perA.toFixed(3)}; offers to low moves ${low.text}; benefit per offer B ${benB.toFixed(4)}, A ${benA.toFixed(4)}`)
} else missing('C7', 'gate', 'burden', 'large-B, large-A')

const split = loadB('pool-split')
const same = loadB('pool-same')
const sameOff = loadB('pool-same-off')
if (split && same && sameOff) {
  const nul2 = track(split, 'talk-to-yourself-by-name|stress|nextBlock')
  const real = track(split, 'cyclic-sigh|stress|nextBlock')
  const fNull = fmt(nul2.filter((x) => est(x) && est(x)?.dir !== 'little').length, nul2.length)
  const fReal = fmt(real.filter((x) => x.firstRight.established !== undefined).length, real.length)
  const tOn = median([...track(same, 'cyclic-sigh|stress|nextBlock'), ...track(same, 'talk-to-yourself-by-name|stress|nextBlock')].map((x) => x.firstRight.likely ?? 180))
  const tOff = median([...track(sameOff, 'cyclic-sigh|stress|nextBlock'), ...track(sameOff, 'talk-to-yourself-by-name|stress|nextBlock')].map((x) => x.firstRight.likely ?? 180))
  add('C8a', 'gate', 'two moves sharing a tag: the no-effect one established in fewer than 1 in 20', fNull.p < 0.05, fNull.text)
  add('C8b', 'reported', 'the real one established by day 180 in at least 80%', fReal.p >= 0.8, fReal.text)
  add('C8c', 'reported', 'two same-tag moves at half a step: pooling shortens the median time to likely', tOn < tOff, `median days to likely with pooling ${tOn}, without ${tOff}`)
} else missing('C8', 'gate', 'pooling', 'pool-split-B, pool-same-B, pool-same-off-B')

const herOnly = loadB('with-her-only')
const ctxSame = loadB('context-same')
if (herOnly && ctxSame) {
  const t = track(herOnly)
  const withHer = fmt(t.filter((x) => x.ctx['withHer=1']?.dir === 'helps').length, t.length)
  const without = fmt(t.filter((x) => x.ctx['withHer=0']?.dir === 'helps').length, t.length)
  const ts = track(ctxSame)
  const per = ['withHer', 'office', 'weekend', 'shortSleep'].map((k) => [k, fmt(ts.filter((x) => x.ctx[`${k}=0`] || x.ctx[`${k}=1`]).length, ts.length)] as const)
  add('C9a', 'reported', 'a move that helps only with her: a with-her call of likely or better by day 180 in at least 70%', withHer.p >= 0.7, withHer.text)
  add('C9b', 'gate', 'a without-her helps call of likely or better in fewer than 1 in 10', without.p < 0.1, without.text)
  add('C9c', 'gate', 'with no true context difference, a context-specific call of likely or better in fewer than 1 in 20, per context', per.every(([, f]) => f.p < 0.05), per.map(([k, f]) => `${k} ${f.text}`).join(', '))
} else missing('C9', 'gate', 'contexts', 'with-her-only-B, context-same-B')

const pz = loadB('prior-zero')
const ph = loadB('prior-harm')
if (pz && ph) {
  const t0 = track(pz)
  const estHelps = fmt(t0.filter((x) => est(x)?.dir === 'helps').length, t0.length)
  const near = fmt(t0.filter((x) => x.post120 !== null && Math.abs(x.post120) <= 0.25).length, t0.length)
  const th = track(ph)
  const below = fmt(th.filter((x) => x.post120 !== null && x.post120 < 0).length, th.length)
  add('C10a', 'gate', 'a misleading prior (+1) against no effect: established helps in fewer than 1 in 20', estHelps.p < 0.05, estHelps.text)
  add('C10b', 'reported', 'by day 120 the estimate within 0.25 of 0 in at least 80%', near.p >= 0.8, near.text)
  add('C10c', 'reported', 'against harm (−0.5): by day 120 believed not to help (estimate below 0) in at least 80%', below.p >= 0.8, below.text)
} else missing('C10', 'gate', 'misleading prior', 'prior-zero-B, prior-harm-B')

const nm = loadB('next-morning')
const md = loadB('multi-day')
if (nm && md) {
  const next = track(nm, 'green-walk|stress|nextBlock')
  const morning = track(nm, 'green-walk|stress|nextMorning')
  const fNext = fmt(next.filter((x) => est(x)?.dir === 'helps').length, next.length)
  const fMorning = fmt(morning.filter((x) => x.firstRight.established !== undefined && est(x)?.dir === 'helps').length, morning.length)
  const mt = track(md, 'next-week-costs|stress|sevenDays').filter((x) => x.d180)
  const bias = mt.length ? mean(mt.map((x) => (x.d180 as { theta: number }).theta - x.truth)) : NaN
  add('C11a', 'gate', 'a next-morning-only effect: next-check-in established helps in fewer than 1 in 20', fNext.p < 0.05, fNext.text)
  add('C11b', 'reported', 'next-morning established helps by day 180 in at least 70%', fMorning.p >= 0.7, fMorning.text)
  add('C11c', 'gate', 'a multi-day effect with carryover: the estimate within ±0.15 step', Math.abs(bias) <= 0.15, `multi-day bias ${Number.isFinite(bias) ? bias.toFixed(3) : 'no estimate'} (${mt.length} people)`)
  add('C11d', 'gate', 'no window\'s data enters another window\'s estimate, checked in the code', true, 'windows are separate tests by key in engine B, as metrics.ts records')
} else missing('C11', 'gate', 'windows', 'next-morning-B, multi-day-B')
add('C12', 'gate', 'is S4', s4, 'see S4')

const change = loadB('change')
if (change && large) {
  const t = track(change).filter((x) => est(x)?.dir === 'helps' && (est(x)?.day ?? 999) < 120)
  const stepped = fmt(t.filter((x) => x.revisedDay !== null && x.revisedDay >= 120 && x.revisedDay <= 180).length, t.length)
  const reached = track(large).filter((x) => est(x)?.dir === 'helps')
  const kept = fmt(reached.filter((x) => x.establishedAtEnd).length, reached.length)
  add('C13a', 'reported', 'an established-helps move whose effect falls to zero on day 120 stepped down within 60 days in at least 80%', t.length > 0 && stepped.p >= 0.8, `${stepped.text} (of people established before day 120)`)
  add('C13b', 'gate', 'an effect that never changes keeps its established call to day 180 in at least 90% of the people who reached it', reached.length > 0 && kept.p >= 0.9, kept.text)
} else missing('C13', 'gate', 'change', 'change-B, large-B')

if (mixed) {
  const promise: Record<string, number> = { early: 2 / 3, likely: 4 / 5, established: 19 / 20 }
  const parts: string[] = []
  let ok = true
  for (const lv of ['early', 'likely', 'established']) {
    const ev = mixed.flatMap((r) => r.ladder.filter((x) => x.level === lv))
    const f = fmt(ev.filter((x) => right(x.dir, x.truth)).length, ev.length)
    ok = ok && ev.length > 0 && f.hi >= promise[lv]
    parts.push(`${lv} ${f.text} (promise ${(100 * promise[lv]).toFixed(0)}%)`)
  }
  add('C14', 'gate', 'a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval', ok, parts.join('; '))
} else missing('C14', 'gate', 'calibration', 'mixed-B')
add('C15', 'gate', 'is S1 with S2', s1 === null || s2 === null ? null : s1 && s2, 'see S1 and S2')

// ---- The verdict -------------------------------------------------------------------------------

const gates = clauses.filter((c) => c.kind === 'gate')
const failed = gates.filter((c) => c.met !== true)
const verdict = failed.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(out, JSON.stringify({ verdict, failed: failed.map((c) => c.id), clauses }, null, 2))
for (const c of clauses) {
  const tag = c.kind === 'gate' ? (c.met === true ? 'PASS' : c.met === false ? 'FAIL' : 'N/A ') : c.met === true ? 'met ' : c.met === false ? 'not ' : 'n/a '
  console.log(`${tag} ${c.kind === 'gate' ? 'gate    ' : 'reported'} ${c.id} ${c.what}\n      ${c.detail}`)
}
console.log(`\n${gates.length} gates, ${gates.length - failed.length} pass${failed.length ? `; failed: ${failed.map((c) => c.id).join(', ')}` : ''}`)
console.log(`VERDICT BY REQUIREMENT 14: ${verdict}`)

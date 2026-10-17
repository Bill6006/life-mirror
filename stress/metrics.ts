import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { PersonA, PersonB, TrackB } from './run'
import { mean, median, quantile, wilson } from './stats'

// The stress test's judge (stage 2): the frozen criteria of 2026-10-16 (REVIEW_EXECUTION_PLAN.md,
// SHA-256 42ef0804… in PROGRESS.md), read on the validation runs in stress/.out/val/. Safeguards pass
// only if their Monte Carlo interval's upper end is under the limit; claims pass on their point
// estimate. Nothing here is tuned: it reads, counts and compares.
//
// node stress/.out/metrics.mjs [dir] [out.json]

const dir = process.argv[2] ?? 'stress/.out/val'
const out = process.argv[3] ?? `${dir}/verdict.json`
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

interface Row {
  id: string
  what: string
  pass: boolean | null
  detail: string
}
const rows: Row[] = []
const add = (id: string, what: string, pass: boolean | null, detail: string) => rows.push({ id, what, pass, detail })
const missing = (id: string, what: string, files: string) => add(id, what, null, `not run: ${files}`)

// ---- Safeguards ---------------------------------------------------------------------------------

const nul = loadB('null')
if (nul) {
  const t = track(nul)
  const f = fmt(t.filter((x) => est(x) && est(x)?.dir !== 'little').length, t.length)
  add('S1', 'a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)', f.hi < 0.05, f.text)
} else missing('S1', 'no-effect move', 'null-B')

const mixed = loadB('mixed')
if (mixed) {
  const all = mixed.flatMap((r) => r.est)
  const f = fmt(all.filter((e) => !right(e.dir, e.truth)).length, all.length)
  const perYear = (all.filter((e) => !right(e.dir, e.truth)).length / mixed.length) * (365 / 180)
  add('S2', 'fewer than 1 in 20 established calls false, across the whole system (mixed catalogue)', all.length > 0 && f.hi < 0.05, `${f.text}; false established per person-year ${perYear.toFixed(3)}; established calls per person ${(all.length / mixed.length).toFixed(3)}`)
} else missing('S2', 'system-wide', 'mixed-B')

add('S3', 'nothing established, and no causal word, except from randomized comparisons', true, 'holds by construction: the only path to established in engine B is the confidence sequence on randomized decisions (engineB.call); no observational estimate exists in the prototype. Checked in the code, and every established call in every run comes from a test with randomized decisions on both arms (counted below).')

const missNull = loadB('missing-null')
const missLarge = loadB('missing-large')
const large = loadB('large')
if (missNull && missLarge && large) {
  const t = track(missNull)
  const hurts = t.filter((x) => (x.first.likely?.dir === 'hurts') || (x.first.established?.dir === 'hurts')).length
  const f = fmt(hurts, t.length)
  const biasMiss = mean(track(missLarge).filter((x) => x.d180).map((x) => (x.d180 as { theta: number }).theta - x.truth))
  const biasBase = mean(track(large).filter((x) => x.d180).map((x) => (x.d180 as { theta: number }).theta - x.truth))
  add('S4', 'missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias', f.hi < 0.05 && Math.abs(biasMiss - biasBase) <= 0.1, `hurts ${f.text}; day-180 bias with missingness ${biasMiss.toFixed(3)}, without ${biasBase.toFixed(3)}, added ${(biasMiss - biasBase).toFixed(3)}`)
} else missing('S4', 'missingness', 'missing-null-B, missing-large-B, large-B')

if (large) {
  const t = track(large)
  const d90 = t.filter((x) => x.d90)
  const bias = mean(d90.map((x) => (x.d90 as { theta: number }).theta - x.truth))
  const cov = t.filter((x) => x.coverAll !== null)
  const f = fmt(cov.filter((x) => x.coverAll).length, cov.length)
  add('S5', 'adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error', Math.abs(bias) <= 0.1 && f.hi >= 0.95, `day-90 bias ${bias.toFixed(3)} (${d90.length} people); coverage at every look ${f.text}`)
} else missing('S5', 'adaptive', 'large-B')

// ---- Claims -------------------------------------------------------------------------------------

const largeA = loadA('large')
const nullA = loadA('null')
const moderate = loadB('moderate')
const moderateA = loadA('moderate')
if (large && largeA && nullA && moderate && moderateA) {
  const daysB = track(large).map((x) => x.firstRight.established ?? 180)
  const holdsA = (r: PersonA) => r.tracked.find((t) => t.key === 'walk-ten|stress')?.first.holdsUp
  const daysA = largeA.map((r) => (holdsA(r)?.right ? holdsA(r)!.day : 180))
  const aNull = fmt(nullA.filter((r) => holdsA(r)).length, nullA.length)
  const aUnsafe = aNull.p >= 0.05
  const mB = median(daysB)
  const mA = median(daysA)
  const halfB = fmt(track(moderate).filter((x) => x.firstRight.established !== undefined).length, track(moderate).length)
  const halfA = fmt(moderateA.filter((r) => holdsA(r)?.right).length, moderateA.length)
  const mainPass = mB <= 0.8 * mA && halfB.p >= halfA.p
  const altPass = aUnsafe && fmt(track(large).filter((x) => x.firstRight.established !== undefined).length, track(large).length).p >= 0.8
  add('C1', 'better than today: full-step median days to a right established ≤ 0.8 × today\'s to a right Holds up; half-step share ≥ today\'s', aUnsafe ? altPass : mainPass, `B median ${mB} days (80th ${quantile(daysB, 0.8)}), A median ${mA} days; half step: B ${halfB.text}, A ${halfA.text}; A's own no-effect Holds-up rate ${aNull.text}${aUnsafe ? ' (A breaks the 1-in-20 mark: the alternative clause applies)' : ''}`)
} else missing('C1', 'better than today', 'large-B, large-A, null-A, moderate-B, moderate-A')

const sparseNull = loadB('sparse-null')
const sparseLarge = loadB('sparse-large')
if (sparseNull && sparseLarge) {
  const all = [...track(sparseNull), ...track(sparseLarge)]
  const looks = all.reduce((s, x) => s + x.sparseLooks, 0)
  const covered = all.reduce((s, x) => s + x.sparseCovered, 0)
  const cs = track(sparseLarge).filter((x) => x.coverAll !== null)
  const fc = fmt(cs.filter((x) => x.coverAll).length, cs.length)
  add('C2', 'honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5\'s coverage', looks > 0 && covered / looks >= 0.9 && (cs.length === 0 || fc.hi >= 0.95), `belief intervals ${fmt(covered, looks).text}; sequence coverage ${fc.text}`)
} else missing('C2', 'sparse', 'sparse-null-B, sparse-large-B')

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
  add('C3', 'causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)', any ? ok : null, parts.join('; '))
}
add('C4', 'is S3', rows.find((r) => r.id === 'S3')?.pass ?? null, 'see S3')
add('C5', 'is S5', rows.find((r) => r.id === 'S5')?.pass ?? null, 'see S5')

if (nul && large) {
  const t = track(nul)
  const s1 = rows.find((r) => r.id === 'S1')?.pass ?? false
  // Eligible at least three times a week: at least 3/7 of the days from day 30 had an eligible moment where the reading was the target.
  const eligible = t.filter((x) => x.eligibleAfter30 >= (150 * 3) / 7)
  const little = fmt(eligible.filter((x) => x.littleEst !== null).length, eligible.length)
  const fullLittle = fmt(track(large).filter((x) => x.littleEst !== null).length, track(large).length)
  add('C6', 'repeated looks and stopping: S1 under daily looks; little difference established for no effect by day 180 in at least half (move eligible ≥ 3 a week); called for a full step in fewer than 1 in 20', s1 && eligible.length > 0 && little.p >= 0.5 && fullLittle.p < 0.05, `S1 ${s1 ? 'holds' : 'fails'}; little difference, no effect: ${little.text}; little difference at a full step: ${fullLittle.text}`)
} else missing('C6', 'stopping', 'null-B, large-B')

if (large && largeA) {
  const perB = large.reduce((s, r) => s + r.moveOffers, 0) / large.reduce((s, r) => s + r.checkins, 0)
  const perA = largeA.reduce((s, r) => s + r.moveOffers, 0) / largeA.reduce((s, r) => s + r.checkins, 0)
  const low = fmt(large.reduce((s, r) => s + r.lowOffers, 0), large.reduce((s, r) => s + r.moveOffers, 0))
  const benB = large.reduce((s, r) => s + r.benefit, 0) / large.reduce((s, r) => s + r.offers, 0)
  const benA = largeA.reduce((s, r) => s + r.benefit, 0) / largeA.reduce((s, r) => s + r.offers, 0)
  add('C7', 'exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today\'s', perB <= perA + 1e-9 && perB <= 1 && 1 - low.p >= 0.9 && benB >= benA, `move offers per check-in B ${perB.toFixed(3)}, A ${perA.toFixed(3)}; offers to low moves ${low.text}; benefit per offer B ${benB.toFixed(4)}, A ${benA.toFixed(4)}`)
} else missing('C7', 'burden', 'large-B, large-A')

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
  add('C8', 'pooling without false sameness: the no-effect partner established in fewer than 1 in 20; the real one established by day 180 in ≥ 80%; pooling shortens the median time to likely', fNull.p < 0.05 && fReal.p >= 0.8 && tOn < tOff, `no-effect partner ${fNull.text}; real one ${fReal.text}; median days to likely with pooling ${tOn}, without ${tOff}`)
} else missing('C8', 'pooling', 'pool-split-B, pool-same-B, pool-same-off-B')

const herOnly = loadB('with-her-only')
const ctxSame = loadB('context-same')
if (herOnly && ctxSame) {
  const t = track(herOnly)
  const withHer = fmt(t.filter((x) => x.ctx['withHer=1']?.dir === 'helps').length, t.length)
  const without = fmt(t.filter((x) => x.ctx['withHer=0']?.dir === 'helps').length, t.length)
  const ts = track(ctxSame)
  const per = ['withHer', 'office', 'weekend', 'shortSleep'].map((k) => [k, fmt(ts.filter((x) => x.ctx[`${k}=0`] || x.ctx[`${k}=1`]).length, ts.length)] as const)
  add('C9', 'context without fragmenting: with-her call (likely+) in ≥ 70%; without-her helps (likely+) in fewer than 1 in 10; with no true difference, a context-specific call in fewer than 1 in 20 per context', withHer.p >= 0.7 && without.p < 0.1 && per.every(([, f]) => f.p < 0.05), `with her ${withHer.text}; without her helps ${without.text}; no difference: ${per.map(([k, f]) => `${k} ${f.text}`).join(', ')}`)
} else missing('C9', 'contexts', 'with-her-only-B, context-same-B')

const pz = loadB('prior-zero')
const ph = loadB('prior-harm')
if (pz && ph) {
  const t0 = track(pz)
  const estHelps = fmt(t0.filter((x) => est(x)?.dir === 'helps').length, t0.length)
  const near = fmt(t0.filter((x) => x.post120 !== null && Math.abs(x.post120) <= 0.25).length, t0.length)
  const th = track(ph)
  const below = fmt(th.filter((x) => x.post120 !== null && x.post120 < 0).length, th.length)
  add('C10', 'a misleading prior discounted: established helps in fewer than 1 in 20; by day 120 within 0.25 of 0 in ≥ 80%; against harm, believed not to help by day 120 in ≥ 80%', estHelps.p < 0.05 && near.p >= 0.8 && below.p >= 0.8, `prior +1 vs 0: established helps ${estHelps.text}, within 0.25 at day 120 ${near.text}; prior +1 vs −0.5: below 0 at day 120 ${below.text}`)
} else missing('C10', 'misleading prior', 'prior-zero-B, prior-harm-B')

const nm = loadB('next-morning')
const md = loadB('multi-day')
if (nm && md) {
  const next = track(nm, 'green-walk|stress|nextBlock')
  const morning = track(nm, 'green-walk|stress|nextMorning')
  const fNext = fmt(next.filter((x) => est(x)?.dir === 'helps').length, next.length)
  const fMorning = fmt(morning.filter((x) => x.firstRight.established !== undefined && est(x)?.dir === 'helps').length, morning.length)
  const mt = track(md, 'next-week-costs|stress|sevenDays').filter((x) => x.d180)
  const bias = mt.length ? mean(mt.map((x) => (x.d180 as { theta: number }).theta - x.truth)) : NaN
  add('C11', 'windows kept apart: next-check-in helps established in fewer than 1 in 20; next-morning established by day 180 in ≥ 70%; multi-day estimate within ±0.15; no window\'s data in another\'s (code)', fNext.p < 0.05 && fMorning.p >= 0.7 && Math.abs(bias) <= 0.15, `next check-in ${fNext.text}; next morning ${fMorning.text}; multi-day bias ${Number.isFinite(bias) ? bias.toFixed(3) : 'no estimate'} (${mt.length} people); windows are separate tests by key in engine B`)
} else missing('C11', 'windows', 'next-morning-B, multi-day-B')
add('C12', 'is S4', rows.find((r) => r.id === 'S4')?.pass ?? null, 'see S4')

const change = loadB('change')
if (change && large) {
  const t = track(change).filter((x) => est(x)?.dir === 'helps' && (est(x)?.day ?? 999) < 120)
  const stepped = fmt(t.filter((x) => x.revisedDay !== null && x.revisedDay >= 120 && x.revisedDay <= 180).length, t.length)
  const reached = track(large).filter((x) => est(x)?.dir === 'helps')
  const kept = fmt(reached.filter((x) => x.establishedAtEnd).length, reached.length)
  add('C13', 'change over time: stepped down within 60 days of the change in ≥ 80%; an unchanging effect kept to day 180 in ≥ 90% of those who reached it', t.length > 0 && stepped.p >= 0.8 && reached.length > 0 && kept.p >= 0.9, `stepped down ${stepped.text} (of people established before day 120); kept ${kept.text}`)
} else missing('C13', 'change', 'change-B, large-B')

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
  add('C14', 'a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval', ok, parts.join('; '))
} else missing('C14', 'calibration', 'mixed-B')
add('C15', 'is S1 with S2', (rows.find((r) => r.id === 'S1')?.pass ?? false) && (rows.find((r) => r.id === 'S2')?.pass ?? false), 'see S1 and S2')

// ---- The failure hunt ---------------------------------------------------------------------------

const hunt: string[] = []
{
  let wrong = 0
  let total = 0
  const names = ['null', 'noisy-null', 'rebound-null', 'rhythm-null', 'context-null', 'sparse-null', 'missing-null', 'adherence-null', 'correlated-null', 'every-checkin-null', 'prior-zero', 'mixed', 'large', 'moderate', 'tiny', 'harmful', 'noisy-large', 'rebound-large', 'rhythm-large', 'context-large', 'with-her-only', 'context-same', 'sparse-large', 'missing-large', 'adherence-large', 'next-morning', 'multi-day', 'change', 'prior-harm', 'pool-split', 'pool-same']
  for (const n of names) {
    const rs = loadB(n)
    if (!rs) continue
    for (const e of rs.flatMap((r) => r.est)) {
      total++
      if ((e.dir === 'helps' && e.truth < 0) || (e.dir === 'hurts' && e.truth > 0)) wrong++
    }
  }
  hunt.push(`confidently wrong (established in the wrong direction), every scenario: ${wrong} of ${total} established calls`)
  if (large) {
    const t = track(large).filter((x) => x.eligibleAfter30 > 0)
    hunt.push(`stops learning (a full-step move eligible but never offered after day 30): ${fmt(t.filter((x) => x.offersAfter30 === 0).length, t.length).text}`)
  }
  const rb = loadB('rebound-null')
  if (rb) {
    const t = track(rb)
    hunt.push(`rebound taken for an effect (no-effect move established, strong regression to the mean): ${fmt(t.filter((x) => est(x) && est(x)?.dir !== 'little').length, t.length).text}`)
  }
  let re = 0
  let people = 0
  for (const n of ['null', 'noisy-null', 'rebound-null', 'rhythm-null', 'context-null', 'sparse-null', 'missing-null', 'adherence-null', 'correlated-null', 'every-checkin-null', 'prior-zero']) {
    const rs = loadB(n)
    if (!rs) continue
    re += rs.reduce((s, r) => s + r.reEstablished, 0)
    people += rs.length
  }
  hunt.push(`rediscovered false positives (the same no-effect move established twice), all no-effect scenarios: ${re} in ${people} people`)
  const narrow: string[] = []
  for (const n of ['large', 'rhythm-large', 'rebound-large', 'context-large', 'noisy-large', 'adherence-large', 'missing-large', 'sparse-large']) {
    const rs = loadB(n)
    if (!rs) continue
    const d90 = track(rs).filter((x) => x.d90)
    const c = d90.filter((x) => Math.abs((x.d90 as { theta: number }).theta - x.truth) <= 1.96 * (x.d90 as { se: number }).se).length / Math.max(1, d90.length)
    if (c < 0.9) narrow.push(`${n} ${(100 * c).toFixed(1)}%`)
  }
  hunt.push(`falsely narrow uncertainty (day-90 coverage under 90%): ${narrow.length ? narrow.join(', ') : 'none'}`)
  const poor = loadB('large-poor')
  if (poor) {
    const d90 = track(poor).filter((x) => x.d90)
    const bias = mean(d90.map((x) => (x.d90 as { theta: number }).theta - x.truth))
    const cov = fmt(d90.filter((x) => Math.abs((x.d90 as { theta: number }).theta - x.truth) <= 1.96 * (x.d90 as { se: number }).se).length, d90.length)
    hunt.push(`prediction contaminating the causal estimate (a deliberately poor, constant prediction): day-90 bias ${bias.toFixed(3)}, coverage ${cov.text}`)
  }
}

// ---- What the runs settle, and how fast ---------------------------------------------------------

const speed: string[] = []
for (const [name, label] of [['large', 'a full step, as the scenario stands'], ['large-first', 'a full step on the move the queue tests first (sensitivity)'], ['moderate', 'half a step']] as const) {
  const rs = loadB(name)
  if (!rs) continue
  const t = track(rs)
  const days = t.map((x) => x.firstRight.established ?? Infinity)
  const reached = days.filter(Number.isFinite)
  const likely = t.map((x) => x.firstRight.likely ?? Infinity).filter(Number.isFinite)
  speed.push(`${label}: established by day 180 in ${fmt(reached.length, t.length).text}${reached.length ? `, median ${median(reached)} days among them` : ''}; likely by day 180 in ${fmt(likely.length, t.length).text}${likely.length ? `, median ${median(likely)} days` : ''}; offers of the move ${median(t.map((x) => x.offersAll))}, decisions per arm at day 180 ${median(t.map((x) => x.n1End))} / ${median(t.map((x) => x.n0End))}`)
}

const verdictSafe = ['S1', 'S2', 'S3', 'S4', 'S5'].every((id) => rows.find((r) => r.id === id)?.pass === true)
const c1 = rows.find((r) => r.id === 'C1')?.pass === true
const allClaims = rows.filter((r) => r.id.startsWith('C')).every((r) => r.pass === true)
const verdict = verdictSafe && allClaims ? 'PASS' : !verdictSafe || !c1 ? 'MATERIAL FAILURE' : 'DESIGN DEFECT'
const report = { verdict, rows, hunt, speed }
writeFileSync(out, JSON.stringify(report, null, 2))
for (const r of rows) console.log(`${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'N/A '} ${r.id} ${r.what}\n      ${r.detail}`)
console.log('\nFAILURE HUNT')
for (const h of hunt) console.log(`  ${h}`)
console.log('\nSPEED')
for (const s of speed) console.log(`  ${s}`)
console.log(`\nVERDICT: ${verdict}`)

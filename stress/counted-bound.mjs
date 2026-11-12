// The power bound for the counted foundation (2026-11-12): before any criterion is frozen, the most a test that keeps
// the standard's own terms could detect in the two real-effect worlds. The terms are the standard's, not the test's:
// two-sided, at 0.05 over the family's size, with the size worth saying and the minimums required. Everything else
// is as kind as it can be: every occasion known, no stretch to shuffle inside, the spread known.
//
//   node stress/counted-bound.mjs
//
// 1. A weekday effect: a thing that happens at a rate of 0.3, and at 0.6 on one weekday. The best test of one cell
//    against the rest with the margins held is Fisher's exact test; its power is summed over every table.
// 2. A like-for-like difference of ten points on the reading out of 100, at an event rate of 0.3. The best test of
//    two means with the spread known is the z test; its power is a normal area.
// Exact sums and areas: no simulation, no seed.

const ALPHA = 0.05
const MIN_SIDE = 8
const MIN_OCCURRENCES = 5
const WORTH_RATE = 0.15
const WORTH_POINTS = 10
const DAYS = [60, 180, 365]

const logFact = [0]
const lf = (n) => {
  for (let i = logFact.length; i <= n; i++) logFact.push(logFact[i - 1] + Math.log(i))
  return logFact[n]
}
const logChoose = (n, k) => lf(n) - lf(k) - lf(n - k)
const binom = (n, p, k) => Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))

/** Fisher's exact test, two-sided, for every table with these row sums and this column sum: the chance by the cell's count. */
function fisher(n1, n0, total) {
  const lo = Math.max(0, total - n0)
  const hi = Math.min(n1, total)
  const pmf = []
  for (let t = lo; t <= hi; t++) pmf.push(Math.exp(logChoose(n1, t) + logChoose(n0, total - t) - logChoose(n1 + n0, total)))
  return { lo, p: pmf.map((own) => Math.min(1, pmf.filter((q) => q <= own * (1 + 1e-7)).reduce((s, q) => s + q, 0))) }
}

/** The weekday effect: the chance a pattern is reached for the one weekday, tested as one of `family` comparisons. */
function weekdayPower(days, family, base = 0.3, raised = 0.6) {
  // Counted from a Monday, the raised weekday the first: it has the most occasions the horizon can give one weekday.
  const n1 = Math.ceil(days / 7)
  const n0 = days - n1
  if (n1 < MIN_SIDE || n0 < MIN_SIDE) return { n1, n0, power: 0 }
  const tables = new Map()
  let power = 0
  for (let x1 = 0; x1 <= n1; x1++) {
    const p1 = binom(n1, raised, x1)
    for (let x0 = 0; x0 <= n0; x0++) {
      const total = x1 + x0
      if (total < MIN_OCCURRENCES) continue
      if (Math.abs(x1 / n1 - x0 / n0) < WORTH_RATE) continue
      const f = tables.get(total) ?? tables.set(total, fisher(n1, n0, total)).get(total)
      if (f.p[x1 - f.lo] <= ALPHA / family) power += p1 * binom(n0, base, x0)
    }
  }
  return { n1, n0, power }
}

/** The normal curve's area below z, and the z that leaves a given area above it. */
const phi = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - tail : tail
}
const zAbove = (area) => {
  let lo = 0
  let hi = 10
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (1 - phi(mid) > area) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** The like-for-like difference: the chance a pattern is reached for a true difference of `effect` points, one evening occasion a day. */
function meansPower(days, family, spread, effect = 10, rate = 0.3) {
  const n1 = Math.round(days * rate)
  const n0 = days - n1
  if (n1 < MIN_SIDE || n0 < MIN_SIDE) return { n1, n0, power: 0 }
  const se = spread * Math.sqrt(1 / n1 + 1 / n0)
  // Reached when the difference seen clears chance and is of a size worth saying, in either direction.
  const bar = Math.max(WORTH_POINTS, zAbove(ALPHA / family / 2) * se)
  return { n1, n0, power: 1 - phi((bar - effect) / se) + phi((-bar - effect) / se) }
}

const pct = (v) => (100 * v).toFixed(1).padStart(5)
console.log('1. A rate of 0.3 rising to 0.6 on one weekday: the best a test could reach (percent of people), by days of record')
console.log('   family | ' + DAYS.map((d) => String(d).padStart(5)).join(' | ') + '   (occasions in the cell: ' + DAYS.map((d) => Math.ceil(d / 7)).join(', ') + ')')
for (const family of [1, 7, 10]) console.log(`   ${String(family).padStart(6)} | ` + DAYS.map((d) => pct(weekdayPower(d, family).power)).join(' | '))
console.log('\n2. A like-for-like difference at an event rate of 0.3: the best a test could reach (percent), by days of record')
for (const effect of [10, 15]) {
  console.log(`   a true difference of ${effect} points`)
  console.log('   spread, family | ' + DAYS.map((d) => String(d).padStart(5)).join(' | '))
  for (const spread of [8, 10, 12, 15]) for (const family of [1, 12]) console.log(`   ${String(spread).padStart(6)}, ${String(family).padStart(6)} | ` + DAYS.map((d) => pct(meansPower(d, family, spread, effect).power)).join(' | '))
}
console.log('\nA true difference of exactly ten points is seen as ten or more only half the time, however long the record:')
console.log('the size worth saying caps that world near 50 percent. A criterion for it must be set under that cap, or the world must use a larger true difference.')

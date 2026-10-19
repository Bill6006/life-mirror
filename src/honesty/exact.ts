// Exact tests for the honesty checks (stage R7): Fisher's exact test on a two-by-two table of counts, and Holm's
// correction across every comparison a check makes, so a check that looks in many places cannot manufacture a finding.
// The tables are a few hundred slots at most, so the sums are exact.

const logFactCache: number[] = [0]

/** log(n!), built up once and kept. */
function logFact(n: number): number {
  for (let k = logFactCache.length; k <= n; k++) logFactCache[k] = logFactCache[k - 1] + Math.log(k)
  return logFactCache[n]
}

/**
 * The chance of the table with `a` in its top-left cell, given its margins: a and b on the first row, c and d on the
 * second; the first column is a and c.
 */
function tableP(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d
  return Math.exp(logFact(a + b) + logFact(c + d) + logFact(a + c) + logFact(b + d) - logFact(n) - logFact(a) - logFact(b) - logFact(c) - logFact(d))
}

/** The tables with the same margins as a b / c d, by their top-left cell, each with its chance. */
function tables(a: number, b: number, c: number, d: number): { a: number; p: number }[] {
  const row1 = a + b
  const col1 = a + c
  const n = a + b + c + d
  const lo = Math.max(0, row1 + col1 - n)
  const hi = Math.min(row1, col1)
  const out: { a: number; p: number }[] = []
  for (let x = lo; x <= hi; x++) out.push({ a: x, p: tableP(x, row1 - x, col1 - x, n - row1 - col1 + x) })
  return out
}

/** Fisher's exact test, one-sided: the chance of a top-left cell at least as large as `a`, the margins held. */
export function fisherGreater(a: number, b: number, c: number, d: number): number {
  return Math.min(1, tables(a, b, c, d).filter((t) => t.a >= a).reduce((s, t) => s + t.p, 0))
}

/** Fisher's exact test, two-sided: the chance of a table no more likely than the one seen, the margins held. */
export function fisherTwoSided(a: number, b: number, c: number, d: number): number {
  const seen = tableP(a, b, c, d)
  // A relative tolerance, so a table exactly as likely as the one seen is never lost to rounding.
  return Math.min(1, tables(a, b, c, d).filter((t) => t.p <= seen * (1 + 1e-7)).reduce((s, t) => s + t.p, 0))
}

/** Holm's adjusted p-values, in the order given: each the most any smaller p needs, so the order never inverts. */
export function holmAdjusted(ps: readonly number[]): number[] {
  const m = ps.length
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p)
  const out = new Array<number>(m)
  let running = 0
  order.forEach(({ p, i }, k) => {
    running = Math.max(running, Math.min(1, (m - k) * p))
    out[i] = running
  })
  return out
}

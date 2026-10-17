// Numeric helpers for the stress test (stage 2, agreed 2026-10-10). Offline only: nothing in src/
// imports this folder.

/** A uniform source in [0, 1). */
export type Rng = () => number

/** sfc32: a small, fast generator with a 128-bit state, seeded deterministically from four words. */
export function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

/** A stream named by a seed and a label, so the world and each engine draw from their own sequences. */
export function stream(seed: number, label: string): Rng {
  let h = 2166136261 ^ seed
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 16777619)
  const r = sfc32(seed >>> 0, h >>> 0, (seed * 2654435761) >>> 0, 0x9e3779b9 ^ h)
  for (let i = 0; i < 12; i++) r()
  return r
}

/** A standard normal draw (Box–Muller). */
export function gauss(rng: Rng): number {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** The standard normal CDF (Abramowitz–Stegun 7.1.26 via erf), accurate to about 1e-7. */
export function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** The standard normal quantile (Acklam's rational approximation). */
export function qnorm(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) return -qnorm(1 - p)
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Solves A x = b for a small symmetric positive-definite A (row-major, n by n) by Cholesky; null when A is not positive definite. */
export function solveSpd(A: Float64Array, b: Float64Array, n: number, ridge = 0): Float64Array | null {
  const L = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j] + (i === j ? ridge : 0)
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]
      if (i === j) {
        if (!(s > 1e-12)) return null
        L[i * n + i] = Math.sqrt(s)
      } else L[i * n + j] = s / L[j * n + j]
    }
  }
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]
    y[i] = s / L[i * n + i]
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]
    x[i] = s / L[i * n + i]
  }
  return x
}

/** The inverse of a small SPD matrix: one Cholesky factor, then each column solved from it; null when it is not positive definite. */
export function invertSpd(A: Float64Array, n: number, ridge = 0): Float64Array | null {
  const L = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j] + (i === j ? ridge : 0)
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]
      if (i === j) {
        if (!(s > 1e-12)) return null
        L[i * n + i] = Math.sqrt(s)
      } else L[i * n + j] = s / L[j * n + j]
    }
  }
  const out = new Float64Array(n * n)
  const y = new Float64Array(n)
  for (let col = 0; col < n; col++) {
    for (let i = 0; i < n; i++) {
      let s = i === col ? 1 : 0
      for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]
      y[i] = s / L[i * n + i]
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i]
      for (let k = i + 1; k < n; k++) s -= L[k * n + i] * out[k * n + col]
      out[i * n + col] = s / L[i * n + i]
    }
  }
  return out
}

/** A binomial proportion with its 95 % Wilson interval: the Monte Carlo interval every rate is reported with. */
export function wilson(k: number, n: number): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: NaN, lo: NaN, hi: NaN }
  const z = 1.959964
  const p = k / n
  const den = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) }
}

export const median = (xs: readonly number[]): number => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const quantile = (xs: readonly number[], q: number): number => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]
}

export const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN)

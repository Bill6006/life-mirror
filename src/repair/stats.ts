// The learning repair's numeric helpers: copied verbatim from the stress test's stress/stats.ts (gauss, phi, invertSpd),
// so the engine the app runs computes exactly what the engine the stress test judged computed.

/** A uniform source in [0, 1). */
export type Rng = () => number

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

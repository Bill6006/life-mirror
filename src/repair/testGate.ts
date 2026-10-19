import { vi } from 'vitest'

// For unit tests only, never imported by the app. Since stage R6 the learning repair is open for everyone; today's engine
// stays its fallback (breaker.ts), so its tests still run, with the repair closed the one way the app allows: an automated
// test browser (`navigator.webdriver`) holding the test key at 0, as the browser tests set it. Undo with
// `vi.unstubAllGlobals()` after each test.

/**
 * Closes the learning repair for the rest of the test, as the browser tests' key does. The storage it stands in also holds
 * the install as in step with the cloud, as Node's missing storage counts it (freshIds.ts), so ids run as they always did.
 */
export function closeRepair(): void {
  const store = new Map<string, string>([
    ['life-mirror.preview.learningRepair', '0'],
    ['lm.inStep', '1'],
  ])
  vi.stubGlobal('navigator', { webdriver: true })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  })
}

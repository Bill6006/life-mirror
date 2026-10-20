import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetRepairBreaker, tripRepair } from './breaker'
import { engineFailed } from './gate'

// The learning repair is the only engine (the owner's requirement of 2026-10-20). There is no switch and no closed mode:
// the one state is whether it failed on this phone since the app started, and a new start reads the record again.

describe('the engine on this phone', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetRepairBreaker()
  })

  it('has not failed until a read throws; then it has, for the rest of the session, until the next start', () => {
    expect(engineFailed()).toBe(false)
    tripRepair(new TypeError('a record no test foresaw'), '2026-10-20')
    expect(engineFailed()).toBe(true)
    resetRepairBreaker()
    expect(engineFailed()).toBe(false)
  })

  it('cannot be closed by the old test key, in an automated browser or anywhere else', () => {
    const store = new Map<string, string>([['life-mirror.preview.learningRepair', '0']])
    vi.stubGlobal('navigator', { webdriver: true })
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined })
    expect(engineFailed()).toBe(false)
  })
})

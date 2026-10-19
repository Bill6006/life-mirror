import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAULT_KEY, faultForTests, guardRepair, guardRepairNow, onRepairTrip, repairFaults, repairTripped, resetRepairBreaker, tripRepair } from './breaker'

// The learning repair's safety net (stage R6): a rebuild that throws closes the repair for the session, is kept on the phone
// as a count, its days and the error's name, and never stops anything else.

function storage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) })
  return store
}

describe("the repair's breaker", () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetRepairBreaker()
  })

  it('keeps each trip as a count, its first and last day and the error’s name, never its message', () => {
    const store = storage()
    expect(repairFaults()).toBeNull()
    tripRepair(new TypeError('Cannot read the walk’s record'), '2026-10-19')
    expect(repairTripped()).toBe(true)
    expect(repairFaults()).toEqual({ count: 1, first: '2026-10-19', last: '2026-10-19', name: 'TypeError' })
    // Reads already under way throw too: the same trip, counted once a session.
    tripRepair(new TypeError('again'), '2026-10-19')
    expect(repairFaults()?.count).toBe(1)
    // The next start of the app tries again, and a throw there is a second trip.
    resetRepairBreaker()
    tripRepair(new RangeError('out of range'), '2026-10-21')
    expect(repairFaults()).toEqual({ count: 2, first: '2026-10-19', last: '2026-10-21', name: 'RangeError' })
    expect(store.get(FAULT_KEY)).not.toMatch(/walk|range/)
  })

  it('trips even where the storage throws, and reads nothing from a storage it cannot parse', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => tripRepair(new Error('x'), '2026-10-19')).not.toThrow()
    expect(repairTripped()).toBe(true)
    expect(repairFaults()).toBeNull()
    const store = storage()
    store.set(FAULT_KEY, '{not json')
    expect(repairFaults()).toBeNull()
    store.set(FAULT_KEY, JSON.stringify({ count: '3', first: 1 }))
    expect(repairFaults()).toBeNull()
  })

  it('gives a read’s value when it holds, and its fallback, tripped, when it throws or rejects', async () => {
    storage()
    expect(await guardRepair('2026-10-19', async () => 7, null)).toBe(7)
    expect(guardRepairNow('2026-10-19', () => 7, null)).toBe(7)
    expect(repairTripped()).toBe(false)
    expect(
      await guardRepair(
        '2026-10-19',
        async () => {
          throw new TypeError('x')
        },
        null,
      ),
    ).toBeNull()
    expect(repairTripped()).toBe(true)
    resetRepairBreaker()
    expect(
      guardRepairNow(
        '2026-10-20',
        () => {
          throw new TypeError('x')
        },
        'closed',
      ),
    ).toBe('closed')
    expect(repairTripped()).toBe(true)
    expect(repairFaults()).toMatchObject({ count: 2, last: '2026-10-20' })
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('takes the browser tests’ stand-in fault only from an automated test browser holding its key', () => {
    const store = storage()
    store.set('life-mirror.test.repairFault', '1')
    vi.stubGlobal('navigator', { webdriver: false })
    expect(faultForTests()).toBe(false)
    vi.stubGlobal('navigator', { webdriver: true })
    expect(faultForTests()).toBe(true)
    store.delete('life-mirror.test.repairFault')
    expect(faultForTests()).toBe(false)
  })

  it('tells a screen drawn with the repair open the moment it trips, until it stops listening', () => {
    storage()
    const heard = vi.fn()
    const stop = onRepairTrip(heard)
    tripRepair(new Error('x'), '2026-10-19')
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    resetRepairBreaker()
    tripRepair(new Error('x'), '2026-10-19')
    expect(heard).toHaveBeenCalledTimes(1)
  })
})

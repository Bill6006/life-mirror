import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetRepairBreaker, tripRepair } from './breaker'
import { repairMode, repairOn } from './gate'

// Who sees the learning repair. Stage R6 opened it for everyone; only an automated test browser can set it otherwise, by its
// test key: 0 closes it, for the tests of today's engine, which stays its fallback; and while the switch was closed, 1 opened
// a preview. Its breaker closes it for the rest of a session in which a rebuild threw.

describe('who sees the learning repair', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetRepairBreaker()
  })
  const key = (v: string | null) => vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'life-mirror.preview.learningRepair' ? v : null), setItem: () => undefined })

  it('open as the build ships, for everyone: an ordinary browser keeps it open, whatever its storage holds', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    key(null)
    expect(repairMode()).toBe('open')
    expect(repairOn()).toBe(true)
    key('0')
    expect(repairMode()).toBe('open')
    expect(repairOn()).toBe(true)
  })

  it('closes only in an automated test browser that holds the key at 0', () => {
    vi.stubGlobal('navigator', { webdriver: true })
    key(null)
    expect(repairMode()).toBe('open')
    key('1')
    expect(repairMode()).toBe('open')
    key('0')
    expect(repairMode()).toBe('gated')
    expect(repairOn()).toBe(false)
  })

  it('while the switch was closed, previewed only in an automated test browser that asked for it', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    key('1')
    expect(repairMode('gated')).toBe('gated')
    vi.stubGlobal('navigator', { webdriver: true })
    key(null)
    expect(repairMode('gated')).toBe('gated')
    key('1')
    expect(repairMode('gated')).toBe('preview')
    expect(repairOn(repairMode('gated'))).toBe(true)
  })

  it('a storage that throws leaves the switch as it ships', () => {
    vi.stubGlobal('navigator', { webdriver: true })
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(repairMode()).toBe('open')
    expect(repairMode('gated')).toBe('gated')
  })

  it('its breaker closes it for the rest of the session, and a new start opens it again', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    key(null)
    expect(repairOn()).toBe(true)
    tripRepair(new TypeError('x'), '2026-10-19')
    expect(repairMode()).toBe('open')
    expect(repairOn()).toBe(false)
    expect(repairOn('open')).toBe(false)
    resetRepairBreaker()
    expect(repairOn()).toBe(true)
  })
})

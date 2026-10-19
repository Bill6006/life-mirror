import { afterEach, describe, expect, it, vi } from 'vitest'
import { repairMode, repairOn } from './gate'

// Who may see the learning repair while it is built: an automated test browser that asks for its preview, and no one else,
// until stage R6 opens its switch.

describe('who may see the learning repair', () => {
  afterEach(() => vi.unstubAllGlobals())
  const flag = (v: string | null) => vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'life-mirror.preview.learningRepair' ? v : null) })

  it('closed as the build ships: an ordinary browser never sees it, even holding the preview key', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    flag('1')
    expect(repairMode()).toBe('gated')
    expect(repairOn()).toBe(false)
  })

  it('previews only in an automated test browser that asks for it', () => {
    vi.stubGlobal('navigator', { webdriver: true })
    flag(null)
    expect(repairMode()).toBe('gated')
    flag('1')
    expect(repairMode()).toBe('preview')
    expect(repairOn()).toBe(true)
  })

  it('open, for everyone', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    flag(null)
    expect(repairMode('open')).toBe('open')
    expect(repairOn(repairMode('open'))).toBe(true)
  })

  it('a storage that throws keeps it closed', () => {
    vi.stubGlobal('navigator', { webdriver: true })
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(repairMode()).toBe('gated')
  })
})

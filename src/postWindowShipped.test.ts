import { describe, expect, it } from 'vitest'
import { AWAY_FROM_HOME, HOME_ONLY } from './postWindow'
import { awayMode, awayOn, homeOnlyMode, homeOnlyOn } from './postWindowFlow'

// The two post-window features as they ship: open since stage 1 (2026-10-16), at the owner's word once
// Pass 1B was complete, the Worker first. Closed by hand they are off, as postWindow.test.ts reads them.

describe('the post-window gates as they ship', () => {
  it('are open, the Worker and the phone reading the same two values; closed by hand, they are off', () => {
    expect(HOME_ONLY).toBe('open')
    expect(AWAY_FROM_HOME).toBe('open')
    expect(homeOnlyMode()).toBe('open')
    expect(awayMode()).toBe('open')
    expect(homeOnlyOn()).toBe(true)
    expect(awayOn()).toBe(true)
    expect(homeOnlyOn(homeOnlyMode('gated'))).toBe(false)
    expect(awayOn(awayMode('gated'))).toBe(false)
  })
})

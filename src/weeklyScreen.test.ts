import { describe, expect, it } from 'vitest'
import { aheadRangeLine } from './weeklyScreen'

// Final UI polish (2026-09-26): the week's range is said plainly, whichever way it runs from tomorrow
// to a week out. A later range can be wider, narrower or only shifted; it is never said to widen.

describe('the week ahead’s range, in plain words', () => {
  it('names both ranges when they differ, as the owner worded it', () => {
    expect(aheadRangeLine({ near: { lo: 64, hi: 80 }, far: { lo: 68, hi: 83 } })).toBe('Expected range: 64–80 tomorrow and 68–83 a week out.')
  })

  it('never says the range widens, whether it widens, narrows or only shifts', () => {
    const lines = [
      aheadRangeLine({ near: { lo: 64, hi: 80 }, far: { lo: 68, hi: 83 } }),
      aheadRangeLine({ near: { lo: 60, hi: 84 }, far: { lo: 66, hi: 78 } }),
      aheadRangeLine({ near: { lo: 66, hi: 78 }, far: { lo: 60, hi: 84 } }),
    ]
    for (const l of lines) expect(l).not.toMatch(/widen/i)
    expect(lines[2]).toBe('Expected range: 66–78 tomorrow and 60–84 a week out.')
  })

  it('says one range once when every day has the same', () => {
    expect(aheadRangeLine({ near: { lo: 70, hi: 80 }, far: { lo: 70, hi: 80 } })).toBe('Expected range: 70–80 each day.')
  })
})

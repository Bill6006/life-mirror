import { describe, expect, it } from 'vitest'
import { offeredWhen } from './moveCard'

// Final UI polish (2026-09-26): a move waiting for the next check-in says when it was offered, from
// today's point of view, so last night's move never reads as this morning's.

describe('when a waiting move was offered, in words', () => {
  it('says this morning or this afternoon for a move offered earlier today', () => {
    const at = new Date(2026, 8, 25, 13, 5)
    expect(offeredWhen({ day: '2026-09-25', block: 'morning' }, at)).toBe('this morning')
    expect(offeredWhen({ day: '2026-09-25', block: 'afternoon' }, new Date(2026, 8, 25, 17, 40))).toBe('this afternoon')
  })

  it('says yesterday and its block for a move from the day before', () => {
    expect(offeredWhen({ day: '2026-09-24', block: 'evening' }, new Date(2026, 8, 25, 8, 30))).toBe('yesterday evening')
  })

  it('names the day for anything older', () => {
    expect(offeredWhen({ day: '2026-09-22', block: 'afternoon' }, new Date(2026, 8, 25, 8, 30))).toBe('Tue, Sep 22, afternoon')
  })
})

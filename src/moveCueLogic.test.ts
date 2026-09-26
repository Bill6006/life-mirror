import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSeen, movesBelow, overlapsAny, saveSeen, visibleShare } from './moveCueLogic'

// Final UI polish (2026-09-26): the cue above the tab bar while a move on Now is still lower down and
// unseen. The rules, held here; the screen's behaviour is held by the phone tests.

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the move cue: what counts as seen, and what is still below', () => {
  it('measures a card against the screen above the tab bar', () => {
    expect(visibleShare(900, 1300, 760)).toBe(0)
    expect(visibleShare(560, 960, 760)).toBe(0.5)
    expect(visibleShare(100, 500, 760)).toBe(1)
    // A card taller than the screen counts as whole once it fills it.
    expect(visibleShare(-100, 1000, 760)).toBe(1)
  })

  it('cues the live moves not yet seen and still lower down, in page order', () => {
    const cards = [
      { key: 'a', top: 800, bottom: 1200 },
      { key: 'b', top: 1220, bottom: 1600 },
    ]
    expect(movesBelow(cards, 760, new Set())).toEqual(['a', 'b'])
    expect(movesBelow(cards, 760, new Set(['a']))).toEqual(['b'])
    expect(movesBelow(cards, 760, new Set(['a', 'b']))).toEqual([])
  })

  it('never cues a card already on the screen or one above it; a sliver at the foot is still below', () => {
    expect(movesBelow([{ key: 'on', top: 200, bottom: 600 }], 760, new Set())).toEqual([])
    expect(movesBelow([{ key: 'above', top: -700, bottom: -300 }], 760, new Set())).toEqual([])
    expect(movesBelow([{ key: 'peek', top: 700, bottom: 1100 }], 760, new Set())).toEqual(['peek'])
  })

  it('knows when the cue would sit on the Brain’s words', () => {
    const cue = { left: 120, top: 700, right: 270, bottom: 736 }
    expect(overlapsAny(cue, [{ left: 30, top: 600, right: 360, bottom: 690 }])).toBe(false)
    expect(overlapsAny(cue, [{ left: 30, top: 690, right: 360, bottom: 720 }])).toBe(true)
    expect(overlapsAny(cue, [{ left: 0, top: 0, right: 0, bottom: 0 }])).toBe(false)
  })

  it('keeps what was seen across a relaunch, and still works on a phone that keeps nothing', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    saveSeen(new Set(['3:2026-09-24T20:40:00.000Z']))
    expect([...loadSeen()]).toEqual(['3:2026-09-24T20:40:00.000Z'])
    const blocked = () => {
      throw new Error('storage blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(loadSeen().size).toBe(0)
    expect(() => saveSeen(new Set(['x']))).not.toThrow()
  })
})

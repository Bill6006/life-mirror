import { afterEach, describe, expect, it, vi } from 'vitest'
import { CUE_NEAR, fitAt, keeps, loadSeen, movesBelow, overlapsAny, placeCue, saveSeen, visibleShare, type Box, type Guarded } from './moveCueLogic'

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

describe('where the cue floats (2026-10-02)', () => {
  // A 390-wide phone, the tab bar's top at 768: the cue's tap area 158 by 48 just above it, its pill 150 by 36 inside.
  const vw = 390
  const button: Box = { left: 116, top: 716, right: 274, bottom: 764 }
  const pill: Box = { left: 120, top: 722, right: 270, bottom: 758 }
  const at = (boxes: Guarded[]) => placeCue({ vw, top: 8, gutter: 16, button, pill, boxes })
  const box = (kind: Guarded['kind'], top: number, bottom: number, left = 30, right = 360): Guarded => ({ kind, top, bottom, left, right })
  /** The tap area a placement makes: the button's width, h tall, centred on the moved pill. */
  const tapOf = (p: { dx: number; dy: number; h: number }): Box => {
    const mid = (pill.top + pill.bottom) / 2 - p.dy
    return { left: button.left + p.dx, right: button.right + p.dx, top: mid - p.h / 2, bottom: mid + p.h / 2 }
  }
  const pillOf = (p: { dx: number; dy: number }): Box => ({ left: pill.left + p.dx, right: pill.right + p.dx, top: pill.top - p.dy, bottom: pill.bottom - p.dy })

  it('stays in its own place, its full tap area, when that covers nothing', () => {
    expect(at([])).toEqual({ dx: 0, dy: 0, h: 48 })
    expect(at([box('words', 600, 620), box('control', 640, 700)])).toEqual({ dx: 0, dy: 0, h: 48 })
  })

  it('never covers the Brain’s words: it takes the nearest place above that does not', () => {
    // The pill's foot two clear of the words' top: 758 - 60 = 698. Words are no control, so the tap area may reach them.
    expect(at([box('brain', 700, 760)])).toEqual({ dx: 0, dy: 60, h: 48 })
    expect(at([box('brain', 700, 760), box('brain', 640, 699)])?.dy).toBeGreaterThan(60)
  })

  it('never lets its tap area meet a control, Why among them: it gives up height before it gives up its place, never below the pill', () => {
    const why = box('control', 761, 800, 200, 260)
    // Under the tap area's foot only: it stays, 40 tall instead of 48, its foot a pixel clear of the control's top.
    const found = at([why])
    expect(found).toEqual({ dx: 0, dy: 0, h: 40 })
    expect(tapOf(found as { dx: number; dy: number; h: number }).bottom).toBeLessThanOrEqual(760)
    // A control under the pill itself: it moves, and nothing of it meets the control.
    const under = box('control', 740, 800)
    const moved = at([under]) as { dx: number; dy: number; h: number }
    expect(moved.dy).toBeGreaterThan(0)
    expect(keeps(tapOf(moved), pillOf(moved), [under], vw, false)).toBe(true)
  })

  it('would rather cover no words: a free place at the edge comes before a word covered in its own place', () => {
    // Words under the centre and to the left; the right edge is clear in the cue's own row.
    expect(at([box('words', 715, 760, 30, 200)])).toEqual({ dx: vw - 16 - (button.right - button.left) - button.left, dy: 0, h: 48 })
    // Words under every edge too: the nearest clear row above, centred.
    expect(at([box('words', 715, 760, 30, 370)])).toEqual({ dx: 0, dy: 46, h: 48 })
    expect(46).toBeLessThanOrEqual(CUE_NEAR)
  })

  it('near its place, a word or two outside the Brain comes before floating far up the screen', () => {
    // Words across the whole width for a band near the bar, a clear gap far above.
    expect(at([box('words', 600, 760, 0, 390)])).toEqual({ dx: 0, dy: 0, h: 48 })
  })

  it('floats into the gap between two cards when that is the nearest place, its tap area fitted to the gap; and waits when nothing on the screen keeps the rules', () => {
    // The Brain's taps end at 610 and a row of windows begins at 650: the pill fits between, its tap area 40 tall.
    const strip = box('control', 650, 760)
    const taps = box('control', 572, 610)
    const found = at([strip, taps]) as { dx: number; dy: number; h: number }
    expect(found.dy).toBeGreaterThan(CUE_NEAR)
    expect(found.h).toBeLessThan(48)
    expect(found.h).toBeGreaterThanOrEqual(36)
    expect(keeps(tapOf(found), pillOf(found), [strip, taps], vw, false)).toBe(true)
    expect(pillOf(found).top).toBeGreaterThanOrEqual(610)
    expect(pillOf(found).bottom).toBeLessThanOrEqual(650)
    expect(at([box('control', 0, 770, 0, 390)])).toBeNull()
  })

  it('fits its tap area where its pill stands, as tall as the controls passing under it allow, and gives up only when the pill itself would meet one', () => {
    const space = (boxes: Guarded[]) => ({ vw, top: 8, gutter: 16, button, pill, boxes })
    expect(fitAt(space([]), 0, 0, false)).toEqual({ dx: 0, dy: 0, h: 48 })
    // A control scrolled to just under the tap area's foot: shorter, the pill where it was.
    expect(fitAt(space([box('control', 762, 800, 200, 260)]), 0, 0, false)).toEqual({ dx: 0, dy: 0, h: 42 })
    // Scrolled on, under the pill itself: nowhere to stand here.
    expect(fitAt(space([box('control', 740, 800, 200, 260)]), 0, 0, false)).toBeNull()
  })

  it('never leaves the screen', () => {
    const found = at([box('words', 700, 760, 0, 380)])
    if (found) {
      expect(button.left + found.dx).toBeGreaterThanOrEqual(0)
      expect(button.right + found.dx).toBeLessThanOrEqual(vw)
    }
  })
})

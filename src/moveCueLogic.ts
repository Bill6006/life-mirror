// Final UI polish (2026-09-26): the cue that says a move is still lower on Now. What counts as seen,
// what is still below, and what is remembered. Pure, so the rules can be held by tests.

/** A move card on Now: its key (the offer and when it was drawn) and where it sits on the screen. */
export interface CardBox {
  key: string
  top: number
  bottom: number
}

/** Half a card on the screen above the tab bar is a card seen, held for long enough to be read. */
export const SEEN_SHARE = 0.5
export const DWELL_MS = 600
export const SEEN_STORE = 'life-mirror.movesSeen'
const SEEN_KEEP = 80

/** How much of a card sits on the usable screen (above the tab bar), as a share of what could show: a card taller than the screen counts as whole when it fills it. */
export function visibleShare(top: number, bottom: number, barTop: number): number {
  const height = bottom - top
  if (height <= 0 || barTop <= 0) return 0
  const shown = Math.max(0, Math.min(bottom, barTop) - Math.max(top, 0))
  return shown / Math.min(height, barTop)
}

/** The live moves not yet seen and still lower on the screen, in page order. A card above the screen is not below. */
export function movesBelow(cards: readonly CardBox[], barTop: number, seen: ReadonlySet<string>): string[] {
  return cards.filter((c) => !seen.has(c.key) && c.top > 0 && visibleShare(c.top, c.bottom, barTop) < SEEN_SHARE).map((c) => c.key)
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Whether a box meets any of the others: the cue never sits on the Brain's words. */
export function overlapsAny(a: Box, others: readonly Box[], margin = 2): boolean {
  return others.some((b) => b.right - b.left > 0 && b.bottom - b.top > 0 && a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin)
}

/** The moves already seen on this phone, kept across a refresh or a relaunch. */
export function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORE)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveSeen(seen: ReadonlySet<string>): void {
  try {
    localStorage.setItem(SEEN_STORE, JSON.stringify([...seen].slice(-SEEN_KEEP)))
  } catch {
    // A phone that keeps nothing still shows the cue; it simply may show it again after a relaunch.
  }
}

/**
 * What lies under where the cue might float (2026-10-02): a line of the Brain's words, any other line
 * of words, or a control (a button, a link, a field; the Brain's Why and its taps among them).
 */
export interface Guarded extends Box {
  kind: 'brain' | 'words' | 'control'
}

/** Where the cue goes from its own place just above the tab bar: its pill right by dx and up by dy, and its tap area h tall, centred on the pill. */
export interface Placement {
  dx: number
  dy: number
  h: number
}

/** Within this distance of its own place, the cue would rather sit on a word or two than float far up the screen. */
export const CUE_NEAR = 96
const CUE_STEP = 2

const meets = (a: Box, b: Box, margin: number): boolean => a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin

/** A box moved right by dx and up by dy. */
export const shifted = (b: Box, p: Pick<Placement, 'dx' | 'dy'>): Box => ({ left: b.left + p.dx, right: b.right + p.dx, top: b.top - p.dy, bottom: b.bottom - p.dy })

/**
 * Whether a place keeps the rules never broken: the pill clear of the Brain's words, and pill and tap
 * area clear of every control, on the screen; with words, the pill also clear of every other word.
 * A control is kept a pixel clear: the cue's own place is measured in whole pixels, its neighbours' not.
 */
export function keeps(tap: Box, pill: Box, boxes: readonly Guarded[], vw: number, words: boolean): boolean {
  if (tap.left < 0 || tap.right > vw) return false
  return boxes.every((b) => (b.kind === 'control' ? !meets(tap, b, 1) && !meets(pill, b, 1) : b.kind === 'brain' || words ? !meets(pill, b, 2) : true))
}

/**
 * Where the cue floats (2026-10-02). Its own place is centred just above the tab bar. It never covers
 * the Brain's words or a control, and its tap area never meets a control, so it never takes a tap meant
 * for one: the tap area is as tall as in its own place where that fits, and no shorter than the pill
 * where it does not. It would rather cover no words at all. The nearest place above its own that keeps
 * every rule comes first (centred, then at the right edge, then at the left); within CUE_NEAR, a place
 * that covers a word or two outside the Brain comes before one further up; beyond, the same order up
 * the screen. Null when no place on the screen keeps the rules never broken: the cue waits.
 */
export interface CueSpace {
  vw: number
  top: number
  gutter: number
  button: Box
  pill: Box
  boxes: readonly Guarded[]
}

/** The cue with its pill moved right by dx and up by dy, its tap area as tall as the rules allow there, up to its own; null when even the pill's own height breaks them. */
export function fitAt(o: CueSpace, dx: number, dy: number, words: boolean): Placement | null {
  const tall = o.button.bottom - o.button.top
  const short = o.pill.bottom - o.pill.top
  const pill = shifted(o.pill, { dx, dy })
  const mid = (pill.top + pill.bottom) / 2
  const tap = (h: number): Box => ({ left: o.button.left + dx, right: o.button.right + dx, top: mid - h / 2, bottom: mid + h / 2 })
  for (let h = tall; h >= short; h -= CUE_STEP) if (keeps(tap(h), pill, o.boxes, o.vw, words)) return { dx, dy, h }
  return keeps(tap(short), pill, o.boxes, o.vw, words) ? { dx, dy, h: short } : null
}

export function placeCue(o: CueSpace): Placement | null {
  const bw = o.button.right - o.button.left
  const xs = [0, o.vw - o.gutter - bw - o.button.left, o.gutter - o.button.left].filter((dx, i, all) => all.indexOf(dx) === i)
  const furthest = Math.max(0, o.pill.top - o.top)
  const at = (dx: number, dy: number, words: boolean): Placement | null => fitAt(o, dx, dy, words)
  const find = (from: number, to: number, words: boolean): Placement | null => {
    for (let dy = from; dy <= to; dy += CUE_STEP) {
      for (const dx of xs) {
        const found = at(dx, dy, words)
        if (found) return found
      }
    }
    return null
  }
  const near = Math.min(CUE_NEAR, furthest)
  return find(0, near, true) ?? find(0, near, false) ?? find(near + CUE_STEP, furthest, true) ?? find(near + CUE_STEP, furthest, false)
}

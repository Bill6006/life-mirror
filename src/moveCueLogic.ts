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

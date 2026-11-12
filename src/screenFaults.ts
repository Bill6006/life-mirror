// A screen that threw while it was being drawn (2026-11-12). The app shows a plain line and a way to try again, and
// keeps on this phone how many times it happened, when, on which screen, and the error's name alone: never its
// message, which could carry something of the record. It rides the day's facts row for the Worker's report, as the
// engine's and the storage's failures do, so the builder sees one without the owner having to say. Never synced on its
// own, never anything of the record.

/** Where the faults are kept: this phone's own storage. */
export const SCREEN_FAULT_KEY = 'life-mirror.screen.faults'

export interface ScreenFaults {
  /** How many times a screen threw while drawing. */
  count: number
  /** The first and the last, to the minute. */
  first: string
  last: string
  /** The last one's error name, never its message. */
  name: string
  /** The screen that was open the last time, by the app's own name for it. */
  screen: string
}

/** The page's storage, where there is one. */
function page(): { localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } } {
  return globalThis as never
}

/** A name made of letters alone, at most forty: an error's class or one of the app's screens, and nothing a message could smuggle in. */
const plain = (v: unknown, otherwise: string): string => (typeof v === 'string' && /^[A-Za-z]{1,40}$/.test(v) ? v : otherwise)

/** The faults kept on this phone, or null when there are none or the storage cannot be read. */
export function screenFaults(): ScreenFaults | null {
  try {
    const raw = page().localStorage?.getItem(SCREEN_FAULT_KEY) ?? null
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<ScreenFaults>
    if (typeof v.count !== 'number' || typeof v.first !== 'string' || typeof v.last !== 'string') return null
    return { count: v.count, first: v.first, last: v.last, name: plain(v.name, 'Error'), screen: plain(v.screen, 'unknown') }
  } catch {
    return null
  }
}

/** A screen threw while drawing: kept, by count, minute, screen and the error's name. */
export function screenFailed(screen: string, error: unknown, now: Date = new Date()): void {
  try {
    const store = page().localStorage
    if (!store) return
    const at = now.toISOString().slice(0, 16)
    const before = screenFaults()
    const name = plain((error as { name?: unknown } | null)?.name, 'Error')
    const next: ScreenFaults = { count: (before?.count ?? 0) + 1, first: before?.first ?? at, last: at, name, screen: plain(screen, 'unknown') }
    store.setItem(SCREEN_FAULT_KEY, JSON.stringify(next))
  } catch {
    // Storage that cannot be written keeps nothing; the screen still says what happened.
  }
}

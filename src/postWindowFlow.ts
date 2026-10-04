import { AWAY_FROM_HOME, HOME_ONLY } from './postWindow'

// Whether the two post-window features show and act on this phone at all. Closed as the build
// ships: nothing of either is shown, stored or read, and every screen, draw and sheet reads as it
// always has. An automated test browser alone may preview them, so they can be tested and seen; a
// preview reaches nothing but that browser's own screen and store, since the Worker's gates stay
// closed and a test browser holds no token.

const HOME_PREVIEW = 'life-mirror.preview.homeOnly'
const AWAY_PREVIEW = 'life-mirror.preview.away'

export type GateMode = 'gated' | 'preview' | 'open'

function modeOf(gate: 'gated' | 'open', key: string): GateMode {
  if (gate === 'open') return 'open'
  try {
    // Read through globalThis: the service worker shapes days too, and has neither; there it stays closed.
    const g = globalThis as { navigator?: { webdriver?: boolean }; localStorage?: { getItem(key: string): string | null } }
    return g.navigator?.webdriver === true && g.localStorage?.getItem(key) === '1' ? 'preview' : 'gated'
  } catch {
    return 'gated'
  }
}

export function homeOnlyMode(gate: 'gated' | 'open' = HOME_ONLY): GateMode {
  return modeOf(gate, HOME_PREVIEW)
}

export function awayMode(gate: 'gated' | 'open' = AWAY_FROM_HOME): GateMode {
  return modeOf(gate, AWAY_PREVIEW)
}

/** Whether the moves that need the house, and Skip's "Not home", show and act on this phone. */
export function homeOnlyOn(mode: GateMode = homeOnlyMode()): boolean {
  return mode !== 'gated'
}

/** Whether Away from home shows and acts on this phone. */
export function awayOn(mode: GateMode = awayMode()): boolean {
  return mode !== 'gated'
}

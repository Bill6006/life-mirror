import { readBrainPrefs } from './brainShared'
import { db } from './db'
import { DEFAULT_FIRMNESS, HOW_FIRM, type FirmnessPref } from './firmness'

// How firm on the phone (Pass 2): whether the setting shows under Settings → Brain and reaches the
// phone's own lines. Closed as the build ships: the setting is hidden and every line reads as it
// always has. An automated test browser alone may preview it, so it can be tested and seen; a
// preview reaches nothing but this phone's own screen, since the Worker's gate stays closed.

const PREVIEW_KEY = 'life-mirror.preview.howFirm'

export type FirmMode = 'gated' | 'preview' | 'open'

export function firmMode(gate: 'gated' | 'open' = HOW_FIRM): FirmMode {
  if (gate === 'open') return 'open'
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true && typeof localStorage !== 'undefined' && localStorage.getItem(PREVIEW_KEY) === '1' ? 'preview' : 'gated'
  } catch {
    return 'gated'
  }
}

/** Whether How firm shows and is honoured on this phone at all. */
export function firmOn(mode: FirmMode = firmMode()): boolean {
  return mode !== 'gated'
}

/** The setting the phone's own lines are said at: the one chosen, Adaptive until one is; null while the gate is closed. */
export function firmPrefOf(prefs: { firmness?: FirmnessPref } | undefined, mode: FirmMode = firmMode()): FirmnessPref | null {
  return mode === 'gated' ? null : (prefs?.firmness ?? DEFAULT_FIRMNESS)
}

/** The setting now, read only while the gate is open: nothing is read while it is closed. */
export async function firmPrefNow(mode: FirmMode = firmMode()): Promise<FirmnessPref | null> {
  if (mode === 'gated') return null
  return firmPrefOf(readBrainPrefs(await db.brainPrefs.get('prefs')), mode)
}

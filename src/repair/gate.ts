import { LEARNING_REPAIR } from '../brainShared'

/** The preview's key: set only by the browser tests and the live checks, in throwaway contexts. */
const PREVIEW_KEY = 'life-mirror.preview.learningRepair'

/**
 * Where the learning repair stands on this phone: closed; open, once stage R6 opens its switch; or a preview, which only an
 * automated test browser can open, so each stage can be tested and seen on the live site while it is built. The owner's
 * phone and the Worker see it closed until then.
 */
export type RepairMode = 'gated' | 'preview' | 'open'

export function repairMode(gate: 'gated' | 'open' = LEARNING_REPAIR): RepairMode {
  if (gate === 'open') return 'open'
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true && typeof localStorage !== 'undefined' && localStorage.getItem(PREVIEW_KEY) === '1' ? 'preview' : 'gated'
  } catch {
    return 'gated'
  }
}

/** Whether the learning repair draws and shows on this phone. */
export function repairOn(mode: RepairMode = repairMode()): boolean {
  return mode !== 'gated'
}

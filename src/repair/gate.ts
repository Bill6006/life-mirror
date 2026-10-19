import { useEffect, useState } from 'preact/hooks'
import { LEARNING_REPAIR } from '../brainShared'
import { onRepairTrip, repairTripped } from './breaker'

/** The test key: set only by the browser tests and the live checks, in throwaway contexts. */
const PREVIEW_KEY = 'life-mirror.preview.learningRepair'

/**
 * Where the learning repair stands on this phone. Stage R6 opened its switch, so it is open for everyone. Only an automated
 * test browser can set it otherwise, through its test key: 0 closes it, so the tests of today's engine, which stays the
 * fallback, run as before the switch; and while the switch was closed, 1 opened a preview, so each stage could be tested and
 * seen on the live site as it was built. The owner's phone never runs under `navigator.webdriver`, so no key reaches it.
 */
export type RepairMode = 'gated' | 'preview' | 'open'

/** The test key, read only in an automated test browser; null anywhere else, or when the storage cannot be read. */
function testKey(): string | null {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true && typeof localStorage !== 'undefined' ? localStorage.getItem(PREVIEW_KEY) : null
  } catch {
    return null
  }
}

export function repairMode(gate: 'gated' | 'open' = LEARNING_REPAIR): RepairMode {
  const key = testKey()
  if (gate === 'open') return key === '0' ? 'gated' : 'open'
  return key === '1' ? 'preview' : 'gated'
}

/** Whether the learning repair draws and shows on this phone: on, unless its breaker tripped this session (breaker.ts). */
export function repairOn(mode: RepairMode = repairMode()): boolean {
  return mode !== 'gated' && !repairTripped()
}

/** The same, for a screen: drawn with the repair on, it redraws closed the moment the breaker trips. */
export function useRepairOn(): boolean {
  const [on, setOn] = useState(() => repairOn())
  useEffect(() => onRepairTrip(() => setOn(repairOn())), [])
  return on
}

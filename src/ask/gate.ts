import { ASK } from '../brainShared'

// Ask Life Mirror's gate on the phone (stage A1, 2026-10-19). Closed while it is built: no Ask button, no "Ask about this",
// no thread written. Only an automated test browser opens a preview, through its test key, so each stage can be tested and
// seen on the live site as it is built; the owner's phone never runs under `navigator.webdriver`, so no key reaches it.

/** The test key: set only by the browser tests and the live checks, in throwaway contexts. */
const PREVIEW_KEY = 'life-mirror.preview.ask'

export type AskMode = 'gated' | 'preview' | 'open'

/** The test key, read only in an automated test browser; null anywhere else, or when the storage cannot be read. */
function testKey(): string | null {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true && typeof localStorage !== 'undefined' ? localStorage.getItem(PREVIEW_KEY) : null
  } catch {
    return null
  }
}

export function askMode(gate: 'gated' | 'open' = ASK): AskMode {
  const key = testKey()
  if (gate === 'open') return key === '0' ? 'gated' : 'open'
  return key === '1' ? 'preview' : 'gated'
}

/** Whether Ask shows on this phone. */
export function askOn(mode: AskMode = askMode()): boolean {
  return mode !== 'gated'
}

// A new build takes over the page (Part 35's lost place, reproduced in Pass 4). The service worker
// skips waiting and claims the page, and the page then reloads onto the new build. Reloading at
// once, under someone's typing, throws away a field that saves when it is left: the place, a name,
// a note. So the reload waits until no field is being typed in, and a moment more for the save
// that leaving it started.

/** How long after a field is left the reload waits for its save (engineering judgment: a save is one IndexedDB write, milliseconds). */
export const RELOAD_SETTLE_MS = 1500

/** Inputs that take a tap, not typing. */
const TAPPED = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image', 'hidden'])

/** Whether the focused element is one someone types into. */
export function typingIn(active: Element | null): boolean {
  if (!active) return false
  if ((active as HTMLElement).isContentEditable) return true
  if (active.tagName === 'TEXTAREA') return true
  return active.tagName === 'INPUT' && !TAPPED.has(((active as HTMLInputElement).type || 'text').toLowerCase())
}

/** The little of the window the reload needs, so the rule can be tested without a browser. */
export interface ReloadHost {
  document: { activeElement: Element | null; addEventListener(type: 'focusout', listener: () => void, options: { once: true }): void }
  location: { reload(): void }
  setTimeout(handler: () => void, ms: number): unknown
}

/** Reload onto the new build now, or, while a field is being typed in, once it is left and its save has had a moment. */
export function reloadWhenSafe(host: ReloadHost = window, settleMs = RELOAD_SETTLE_MS): void {
  const attempt = () => {
    if (typingIn(host.document.activeElement)) host.document.addEventListener('focusout', () => void host.setTimeout(attempt, settleMs), { once: true })
    else host.location.reload()
  }
  attempt()
}

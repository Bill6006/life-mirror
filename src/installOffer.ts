import { useEffect, useState } from 'preact/hooks'

// Installing the app from its own page (2026-10-03). On a phone where other apps of the same site are
// installed, the browser's menu says "already installed" for every page of the site and fails to open
// one for this app. The browser's own install dialog, asked for by the page, looks at this app's start
// page alone. So the offer the browser makes is held from the moment it comes, and Settings shows it.

/** The browser's offer to install: shown with prompt(), answered in userChoice. */
export interface InstallOffer extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let held: InstallOffer | null = null
const watchers = new Set<() => void>()

function notify(): void {
  for (const w of watchers) w()
}

/** Holds the browser's offer from the first moment it is made (it can come before Settings is ever opened). */
export function watchInstallOffer(target: EventTarget = window): () => void {
  const onOffer = (e: Event) => {
    // The page asks when you tap, instead of the browser asking on its own.
    e.preventDefault()
    held = e as InstallOffer
    notify()
  }
  const onInstalled = () => {
    held = null
    notify()
  }
  target.addEventListener('beforeinstallprompt', onOffer)
  target.addEventListener('appinstalled', onInstalled)
  return () => {
    target.removeEventListener('beforeinstallprompt', onOffer)
    target.removeEventListener('appinstalled', onInstalled)
  }
}

export function installOffered(): boolean {
  return held !== null
}

/** The browser's own install dialog, once per offer; the answer is the browser's. */
export async function installApp(): Promise<'accepted' | 'dismissed' | 'none'> {
  const offer = held
  if (!offer) return 'none'
  held = null
  notify()
  await offer.prompt()
  return (await offer.userChoice).outcome
}

/** Whether the browser is offering to install the app now. */
export function useInstallOffer(): boolean {
  const [offered, setOffered] = useState(installOffered())
  useEffect(() => {
    const w = () => setOffered(installOffered())
    watchers.add(w)
    w()
    return () => void watchers.delete(w)
  }, [])
  return offered
}

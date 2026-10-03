import { describe, expect, it } from 'vitest'
import { installApp, installOffered, watchInstallOffer, type InstallOffer } from './installOffer'

// The browser's offer to install, held for Settings (2026-10-03): the page asks when you tap, once per
// offer, and the offer goes once it is used or the app is installed.

function offer(outcome: 'accepted' | 'dismissed'): { event: InstallOffer; prompted: () => number } {
  let prompted = 0
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: async () => {
      prompted++
    },
    userChoice: Promise.resolve({ outcome }),
  }) as InstallOffer
  return { event, prompted: () => prompted }
}

describe('the browser’s offer to install', () => {
  it('is held from the moment it comes, shown once, and let go once used, once the app is installed, or once no longer watched', async () => {
    const target = new EventTarget()
    const stop = watchInstallOffer(target)
    expect(installOffered()).toBe(false)

    const first = offer('accepted')
    target.dispatchEvent(first.event)
    // The browser does not ask on its own: the page asks when you tap.
    expect(first.event.defaultPrevented).toBe(true)
    expect(installOffered()).toBe(true)
    expect(await installApp()).toBe('accepted')
    expect(first.prompted()).toBe(1)
    expect(installOffered()).toBe(false)
    // Used once: nothing more to ask.
    expect(await installApp()).toBe('none')

    const second = offer('dismissed')
    target.dispatchEvent(second.event)
    expect(installOffered()).toBe(true)
    target.dispatchEvent(new Event('appinstalled'))
    expect(installOffered()).toBe(false)
    expect(second.prompted()).toBe(0)

    stop()
    target.dispatchEvent(offer('accepted').event)
    expect(installOffered()).toBe(false)
  })

  it('says what the browser answered when the dialog is dismissed', async () => {
    const target = new EventTarget()
    const stop = watchInstallOffer(target)
    const o = offer('dismissed')
    target.dispatchEvent(o.event)
    expect(await installApp()).toBe('dismissed')
    expect(installOffered()).toBe(false)
    stop()
  })
})

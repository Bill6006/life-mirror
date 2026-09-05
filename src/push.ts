import { VAPID_PUBLIC_KEY } from './vapid'

// The browser's push address. Subscribing asks the phone's push service for an address that
// only the holder of the private signing key can send to; the ping it carries has no content.

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function subscribePush(): Promise<PushSubscriptionJSON> {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY }))
  return sub.toJSON()
}

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe()
}

/** A short, recognisable form of the address for the screen; the full form is what gets copied. */
export function shortAddress(endpoint: string): string {
  try {
    const u = new URL(endpoint)
    return `${u.host}/…${endpoint.slice(-6)}`
  } catch {
    return endpoint.slice(0, 24)
  }
}

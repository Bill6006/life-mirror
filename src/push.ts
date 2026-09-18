import { VAPID_PUBLIC_KEY } from './vapid'

// The browser's push address. Subscribing asks the phone's push service for an address that
// only the holder of the private signing key can send to; the ping it carries has no content.
// An address made under an older signing key is useless to the new one, so it is replaced.

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

function keyBytes(): Uint8Array {
  const pad = VAPID_PUBLIC_KEY.length % 4 === 0 ? '' : '='.repeat(4 - (VAPID_PUBLIC_KEY.length % 4))
  const raw = atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Whether an address was made under the signing key this build carries; an address that does not say is taken as current. */
export function sameKey(sub: Pick<PushSubscription, 'options'>): boolean {
  const theirs = sub.options?.applicationServerKey
  if (!theirs) return true
  const a = new Uint8Array(theirs)
  const b = keyBytes()
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export async function subscribePush(): Promise<PushSubscriptionJSON> {
  const reg = await navigator.serviceWorker.ready
  let existing = await reg.pushManager.getSubscription()
  if (existing && !sameKey(existing)) {
    await existing.unsubscribe()
    existing = null
  }
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY }))
  return sub.toJSON()
}

/**
 * On open: an address made under an older signing key is replaced, when notifications are still
 * allowed. Returns the new address, or null when nothing changed.
 */
export async function refreshPushIfKeyChanged(): Promise<PushSubscriptionJSON | null> {
  if (!pushSupported() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return null
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (!existing || sameKey(existing)) return null
  await existing.unsubscribe()
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })
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

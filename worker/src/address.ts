import type { Subscription } from './push'

// The phone's ping address. Since 2026-10-20 (the owner's decision) it travels with the settings record in the cloud copy,
// so the Worker always reads the current one: a browser that withdraws its notification permission cancels the address,
// and a copy made by hand went stale without a word. A settings record with the address field is the phone's word, its
// subscription or none when the ping was turned off there. Only a record without the field, from an app before this
// change, leaves the address copied by hand into the secret in use.

export interface PushAddress {
  sub: Subscription | null
  /** Where it was read: the settings record, the secret copied by hand, or nowhere. */
  from: 'cloud' | 'secret' | null
  /** When the phone set it up, as its settings say; null for the secret's. */
  setUpAt: string | null
}

/** A subscription the push service can be sent to: an https endpoint and both keys; null otherwise. */
function subscriptionOf(v: unknown): Subscription | null {
  if (!v || typeof v !== 'object') return null
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null }
  if (typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://')) return null
  const p256dh = s.keys?.p256dh
  const auth = s.keys?.auth
  if (typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) return null
  return { endpoint: s.endpoint, keys: { p256dh, auth } }
}

/** The address to send to: the settings record's whenever it carries the field, else the secret's. */
export function pushAddressOf(settings: unknown, secret: string | undefined): PushAddress {
  if (settings && typeof settings === 'object' && Object.prototype.hasOwnProperty.call(settings, 'push')) {
    const p = (settings as { push?: unknown }).push as { subscription?: unknown; subscribedAt?: unknown } | null | undefined
    const sub = subscriptionOf(p?.subscription)
    return { sub, from: 'cloud', setUpAt: sub && typeof p?.subscribedAt === 'string' ? p.subscribedAt : null }
  }
  if (!secret) return { sub: null, from: null, setUpAt: null }
  try {
    const sub = subscriptionOf(JSON.parse(secret))
    return { sub, from: sub ? 'secret' : null, setUpAt: null }
  } catch {
    return { sub: null, from: null, setUpAt: null }
  }
}

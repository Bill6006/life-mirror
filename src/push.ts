import type { PushState, Settings } from './settings'
import { VAPID_PUBLIC_KEY } from './vapid'

// The browser's push address. Subscribing asks the phone's push service for an address that
// only the holder of the private signing key can send to; the ping it carries has no content.
// An address made under an older signing key is useless to the new one, so it is replaced.
// Since 2026-10-20 (the owner's report and decision) the address travels with the settings in the
// cloud copy, and the phone keeps it alive: a browser that withdraws its notification permission
// cancels the address, and nothing here noticed until a reminder failed to come.

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

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe()
}

/** How long a check waits for the service worker: none comes where none is registered. */
const READY_MS = 4000

/** The service worker's registration, or null when there is no push here or it does not come in time. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READY_MS)
  })
  try {
    return await Promise.race([navigator.serviceWorker.ready, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Whether this phone may show notifications, as surely as the browser can say: the page's permission, and where that is
 * still undecided, the push manager's, since an installed app's own permission can stand behind an undecided page
 * permission. Read afresh each time and never kept: one read at a screen's opening hid the ping (2026-10-20).
 */
export async function notifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    const reg = await registration()
    const state = reg ? await reg.pushManager.permissionState({ userVisibleOnly: true }) : 'prompt'
    return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'default'
  } catch {
    return 'default'
  }
}

/** The push state for a live address: set up now, unless it is the one already kept; queued for the cloud copy. */
function liveState(sub: PushSubscriptionJSON, kept: PushState): PushState {
  const same = Boolean(sub.endpoint) && kept.subscription?.endpoint === sub.endpoint
  return { subscription: sub, subscribedAt: same && kept.subscribedAt ? kept.subscribedAt : new Date().toISOString(), changed: false, droppedAt: null, needsTap: false, syncedEndpoint: sub.endpoint ?? null }
}

/**
 * At start and on coming back to the app: the address kept, checked against the browser's own, while reminders are on and
 * the ping was set up here or synced from here (never one turned off by hand). A live address the cloud copy has not had
 * is sent; one made under an older signing key is replaced; one the browser lost is made again at once when
 * notifications are allowed, and when only a tap can allow them, Now offers that tap. The push state to keep, or null
 * when nothing changes.
 */
export async function reconcilePush(s: Pick<Settings, 'push' | 'cloudPush' | 'reminders'>): Promise<PushState | null> {
  const kept = s.push
  if (!s.reminders.enabled || kept.droppedAt) return kept.needsTap ? { ...kept, needsTap: false } : null
  const reg = await registration()
  if (!reg) return null
  let live = await reg.pushManager.getSubscription()
  if (live && !sameKey(live)) {
    await live.unsubscribe()
    live = null
  }
  if (live) {
    const sub = live.toJSON()
    if (kept.subscription?.endpoint === sub.endpoint && kept.syncedEndpoint === sub.endpoint && !kept.needsTap) return null
    return liveState(sub, kept)
  }
  // No live address: only a ping set up before is made again; nothing starts one unasked.
  if (!(kept.subscription || kept.subscribedAt || s.cloudPush?.subscription)) return null
  const permission = await notifyPermission()
  let needsTap = permission === 'default'
  if (permission === 'granted') {
    try {
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })
      return liveState(sub.toJSON(), kept)
    } catch {
      // A push service that gives no address now: the tap on Now tries again.
      needsTap = true
    }
  }
  // Blocked, no tap can help, and Settings says so; undecided, Now offers the tap.
  if (kept.subscription === null && Boolean(kept.needsTap) === needsTap) return null
  return { ...kept, subscription: null, needsTap }
}

/**
 * On a tap (Settings' set-up, Now's line): asks for the permission while it is undecided, then makes or reuses the
 * address. Null when notifications are not allowed.
 */
export async function setUpPing(kept: PushState): Promise<PushState | null> {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
  if ((await notifyPermission()) !== 'granted') return null
  return liveState(await subscribePush(), kept)
}

/** A short, recognisable form of the address for the screen. */
export function shortAddress(endpoint: string): string {
  try {
    const u = new URL(endpoint)
    return `${u.host}/…${endpoint.slice(-6)}`
  } catch {
    return endpoint.slice(0, 24)
  }
}

/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { blockAt, type Block } from './blocks'
import { copy } from './copy'
import { allCheckIns, db, getSettings, markReminded, updateSettings, type CheckIn, type Intention } from './db'
import { fill } from './format'
import { minutesOf, pushDecision } from './settings'
import { VAPID_PUBLIC_KEY } from './vapid'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

const BASE = '/life-mirror/'

// A new build takes over at once, so the app never shows a stale phase.
self.skipWaiting()
clientsClaim()

// Everything the app needs is cached on first load, so it opens with no network.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`)))

// The content-free ping, and the content-free cue from the Worker. Everything that decides happens here, on the phone, from the record.
self.addEventListener('push', (event) => {
  let kind = 'ping'
  try {
    kind = (event.data?.json() as { kind?: string } | null)?.kind ?? 'ping'
  } catch {
    kind = 'ping'
  }
  event.waitUntil(kind === 'cue' ? onCue() : onPing())
})

/** Nothing is due, but the browser insists a push shows something. A silent notice, taken down at once. */
async function quiet(): Promise<void> {
  await self.registration.showNotification(copy.appName, { body: copy.reminders.quiet, tag: 'quiet', silent: true, data: { url: BASE } })
  setTimeout(() => {
    void self.registration.getNotifications({ tag: 'quiet' }).then((ns) => ns.forEach((n) => n.close()))
  }, 2500)
}

/**
 * A cue whose moment has come: the Worker sent nothing but the fact of it; the words are the
 * plan's own, recorded on this phone when it was made. Only plans not yet started, the latest
 * per commitment.
 */
async function onCue(): Promise<void> {
  const now = new Date()
  const { day } = blockAt(now)
  const minute = now.getHours() * 60 + now.getMinutes()
  const plans = (await db.intentions.where('day').equals(day).toArray()).filter((p) => p.offerId === null && minutesOf(p.time) <= minute)
  const latest = new Map<number, Intention>()
  for (const p of plans.sort((a, b) => (a.setAt < b.setAt ? -1 : 1))) latest.set(p.aimId, p)
  const lines = [...latest.values()].map((p) => (p.step ? `${copy.aims.cues[p.cue]} · ${p.step}` : copy.aims.cues[p.cue]))
  if (!lines.length) return quiet()
  await self.registration.showNotification(copy.appName, { body: lines.join(' · '), tag: 'cue', icon: `${BASE}icons/icon-192.png`, data: { url: BASE } })
}

async function onPing(): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const visible = windows.some((c) => c.visibilityState === 'visible')
  const [settings, all] = await Promise.all([getSettings(), allCheckIns()])
  const now = new Date()
  const { day } = blockAt(now)
  const todays = new Map<Block, CheckIn>(all.filter((c) => c.day === day).map((c) => [c.block, c]))
  const decision = pushDecision(now, settings, todays, visible)

  if (decision.kind === 'remind') {
    await markReminded(decision.day, decision.block)
    await self.registration.showNotification(copy.appName, {
      body: fill(copy.reminders.body, { block: copy.blocks[decision.block].toLowerCase() }),
      tag: `checkin-${decision.day}-${decision.block}`,
      icon: `${BASE}icons/icon-192.png`,
      data: { url: `${BASE}?checkin=1` },
    })
    return
  }
  if (decision.kind === 'nothing') return
  await quiet()
}

// The push service may rotate the address. Keep a fresh one and flag it for copying again.
self.addEventListener('pushsubscriptionchange', (event) => {
  ;(event as ExtendableEvent).waitUntil(
    (async () => {
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })
      await updateSettings((s) => ({ ...s, push: { subscription: sub.toJSON(), subscribedAt: new Date().toISOString(), changed: true } }))
    })(),
  )
})

// A tapped reminder brings the app forward at the right block, or opens it there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? BASE
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const open = clients.find((c): c is WindowClient => 'focus' in c)
      if (!open) return self.clients.openWindow(url)
      await open.focus()
      return 'navigate' in open ? open.navigate(url) : open
    }),
  )
})

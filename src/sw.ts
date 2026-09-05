/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { blockAt, type Block } from './blocks'
import { copy } from './copy'
import { allCheckIns, getSettings, markReminded, updateSettings, type CheckIn } from './db'
import { fill } from './format'
import { pushDecision } from './settings'
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

// The content-free ping. Everything that decides happens here, on the phone, from the record.
self.addEventListener('push', (event) => {
  event.waitUntil(onPing())
})

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

  // Nothing is due, but the browser insists a push shows something. A silent notice, taken down at once.
  await self.registration.showNotification(copy.appName, { body: copy.reminders.quiet, tag: 'quiet', silent: true, data: { url: BASE } })
  setTimeout(() => {
    void self.registration.getNotifications({ tag: 'quiet' }).then((ns) => ns.forEach((n) => n.close()))
  }, 2500)
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

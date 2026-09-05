import { useEffect } from 'preact/hooks'
import { blockAt, type Block } from './blocks'
import { copy } from './copy'
import { markReminded, type CheckIn } from './db'
import { fill } from './format'
import { reminderDue, type Settings } from './settings'

/**
 * In-app reminders. A notification can only be shown while this page is alive, so this
 * fires when the app sits in the background past a block's time. One per block, same words
 * every time, nothing in quiet hours, nothing for a block already begun (Rule 2).
 */
export function useReminders(settings: Settings | undefined, all: CheckIn[] | undefined): void {
  useEffect(() => {
    if (!settings || !all || !settings.reminders.enabled) return
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      if (document.visibilityState === 'visible') return
      const now = new Date()
      const { day } = blockAt(now)
      const todays = new Map<Block, CheckIn>(all.filter((c) => c.day === day).map((c) => [c.block, c] as const))
      const block = reminderDue(now, settings, todays)
      if (!block) return
      await markReminded(day, block)
      const body = fill(copy.reminders.body, { block: copy.blocks[block].toLowerCase() })
      const base = import.meta.env.BASE_URL
      const options: NotificationOptions = { body, tag: `checkin-${day}-${block}`, icon: `${base}icons/icon-192.png`, data: { url: base } }
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
      if (reg) await reg.showNotification(copy.appName, options)
      else new Notification(copy.appName, options)
    }

    const timer = setInterval(() => void tick(), 30_000)
    const onVisibility = () => void tick()
    document.addEventListener('visibilitychange', onVisibility)
    void tick()
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [settings, all])
}

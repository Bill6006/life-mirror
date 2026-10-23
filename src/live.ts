import type Dexie from 'dexie'
import { liveQuery, type Subscription } from 'dexie'
import { useEffect, useState } from 'preact/hooks'
import { db } from './db'
import { onStorageClosed, reopenIfClosed } from './storageWatch'

/** After the storage closed under the app, a live read asks again this long after, doubling while it stays out, to RETRY_MAX_MS. */
export const RETRY_BASE_MS = 250
export const RETRY_MAX_MS = 8000
/** A read that fails with an error of its own is asked again this many times; one that keeps failing is a fault to fix, and logged. */
export const ERROR_RETRIES = 2

/**
 * Follows one read of the record: `onValue` with its result, and again whenever the tables it read change (Dexie's
 * liveQuery). Asked again after the storage was interrupted under the app (2026-10-23, the blank Now): Dexie's liveQuery
 * drops a read cut short by a closed connection or an aborted transaction without a word, and a screen waiting on its
 * first answer waited for good. Each time the storage closes, the read is asked again a moment later, the database opened
 * again first when it was left shut; an error of the read's own is asked again twice. Returns the way to stop.
 */
export function followRead<T>(querier: () => Promise<T>, onValue: (value: T) => void, dexie: Dexie = db): () => void {
  let sub: Subscription | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let outs = 0
  let errors = 0
  const start = () => {
    if (stopped) return
    // A read that starts while the database is shut after an interruption would be refused without a word: opened again first.
    if (!dexie.isOpen()) return void reopenIfClosed(dexie).then(follow)
    follow()
  }
  const follow = () => {
    if (stopped) return
    sub?.unsubscribe()
    sub = liveQuery(querier).subscribe({
      next: (v) => {
        outs = 0
        errors = 0
        onValue(v as T)
      },
      error: (e) => {
        console.error(e)
        if (errors++ < ERROR_RETRIES) again()
      },
    })
  }
  const again = () => {
    if (stopped || timer) return
    const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** outs++)
    timer = setTimeout(() => {
      timer = null
      void reopenIfClosed(dexie).then(follow)
    }, wait)
  }
  const off = onStorageClosed(again)
  start()
  return () => {
    stopped = true
    off()
    if (timer) clearTimeout(timer)
    sub?.unsubscribe()
  }
}

/** Re-runs a Dexie query whenever the tables it touched change, and after the storage was interrupted. Undefined while loading. */
export function useLive<T>(querier: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => followRead(querier, (v) => setValue(v)), deps)
  return value
}

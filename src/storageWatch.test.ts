import 'fake-indexeddb/auto'
import Dexie, { liveQuery } from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { factSheet, writeFactsRow } from './brainFlow'
import { db } from './db'
import { FLOORS_WAIT_MS } from './idFloors'
import { followRead, RETRY_BASE_MS } from './live'
import { nowWaited, reopenIfClosed, STORAGE_FAULT_KEY, storageClosed, storageFaults } from './storageWatch'

// The blank Now (2026-10-23): the phone's storage interrupted under the app while Now made its first reads. Dexie's
// liveQuery drops a read cut short by a closed connection or an aborted transaction without a word, and an interruption
// while the database opens makes the open fail, after which Dexie refuses every read until it is opened again. A live
// read now asks again after the storage closed, opening the database again when its open failed; a database closed on
// purpose stays closed; and each interruption is kept on this phone and rides the sheet for the Worker's report alone.

const DAY = '2026-10-23'
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** How a read of the record ends: answered, or the error's name (an error object itself is never compared: Dexie's carry the database). */
const refusal = () => db.checkins.count().then(() => 'answered', (e: unknown) => String((e as { name?: unknown } | null)?.name))

/** A read of the record whose first run the storage cuts short: the connection closed under it, the read dropped. */
function cutShortOnce(): { querier: () => Promise<number>; runs: () => number } {
  let runs = 0
  return {
    querier: async () => {
      runs++
      if (runs === 1) {
        // As Chrome does when its storage fails under the page: the connection closed, with its close event, and the
        // read under way failing with the error Dexie's liveQuery drops without a word.
        db.close({ disableAutoOpen: false })
        throw new Dexie.DatabaseClosedError('the storage closed under the read')
      }
      return db.checkins.count()
    },
    runs: () => runs,
  }
}

/** The next opens of the database fail, as an open the storage interrupts does; the way to let them through again. */
function failOpens(n: number): () => void {
  const factory = indexedDB as IDBFactory & { open: IDBFactory['open'] }
  const real = factory.open.bind(factory)
  let left = n
  factory.open = ((name: string, version?: number) => {
    if (left-- <= 0) return real(name, version)
    const req = { error: new DOMException('the storage was interrupted', 'AbortError'), onsuccess: null, onerror: null as null | ((e: unknown) => void), onupgradeneeded: null, onblocked: null, result: undefined }
    setTimeout(() => req.onerror?.({ target: req, type: 'error', preventDefault() {}, stopPropagation() {} }), 0)
    return req as unknown as IDBOpenDBRequest
  }) as IDBFactory['open']
  return () => {
    factory.open = real
  }
}

describe('the storage interrupted under the app', () => {
  let kept: Map<string, string>
  beforeEach(async () => {
    kept = new Map()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, String(v)), removeItem: (k: string) => void kept.delete(k) })
    await db.delete()
    await db.open()
    await db.checkins.add({ day: DAY, block: 'morning', answers: { mood: 3 }, startedAt: `${DAY}T13:00:00.000Z`, completedAt: `${DAY}T13:01:00.000Z`, updatedAt: `${DAY}T13:01:00.000Z`, activeMs: 60_000 })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a first read it cuts short is asked again and answers; Dexie’s own liveQuery alone waits for good', async () => {
    const plain = cutShortOnce()
    let plainValue: number | undefined
    const sub = liveQuery(plain.querier).subscribe({ next: (v) => void (plainValue = v) })
    await settle(RETRY_BASE_MS * 6)
    sub.unsubscribe()
    // The defect, as the phone met it: the read dropped, no error, never asked again.
    expect(plain.runs()).toBe(1)
    expect(plainValue).toBeUndefined()

    const read = cutShortOnce()
    let value: number | undefined
    const stop = followRead(read.querier, (v) => void (value = v))
    await settle(RETRY_BASE_MS * 6)
    stop()
    expect(read.runs()).toBeGreaterThanOrEqual(2)
    expect(value).toBe(1)
  })

  it('an open it cuts short leaves the database refusing every read until it is opened again, and the read opens it again', async () => {
    db.close({ disableAutoOpen: false })
    const letThrough = failOpens(2)
    // A read that starts the open: the open fails, and Dexie then refuses what comes after it.
    expect(await refusal()).not.toBe('answered')
    expect(await refusal()).toBe('DatabaseClosedError')
    let plainValue: number | undefined
    const sub = liveQuery(() => db.checkins.count()).subscribe({ next: (v) => void (plainValue = v) })
    let value: number | undefined
    const stop = followRead(() => db.checkins.count(), (v) => void (value = v))
    // Still out for one more open: the read waits, then asks again once the storage is back.
    await settle(RETRY_BASE_MS * 2)
    letThrough()
    await settle(RETRY_BASE_MS * 16)
    stop()
    sub.unsubscribe()
    expect(value).toBe(1)
    expect(plainValue).toBeUndefined()
    expect(db.isOpen()).toBe(true)
  })

  it('a connection closed while the database opens leaves Dexie refusing everything with no failure, and the read opens it again', async () => {
    db.close({ disableAutoOpen: false })
    let once = true
    // The storage closes the connection while the open runs its last step.
    db.on('ready', () => {
      if (!once) return
      once = false
      db.close({ disableAutoOpen: false })
    })
    expect(await refusal()).toBe('DatabaseClosedError')
    // Shut, with no failure Dexie would own to: every read refused.
    expect(db.isOpen()).toBe(false)
    expect(db.hasFailed()).toBe(false)
    expect(await refusal()).toBe('DatabaseClosedError')
    let plainValue: number | undefined
    const sub = liveQuery(() => db.checkins.count()).subscribe({ next: (v) => void (plainValue = v) })
    // Its first read made, and refused, before anything opens the database again.
    await settle(20)
    let value: number | undefined
    const stop = followRead(() => db.checkins.count(), (v) => void (value = v))
    await settle(RETRY_BASE_MS * 4)
    stop()
    sub.unsubscribe()
    expect(value).toBe(1)
    expect(plainValue).toBeUndefined()
  })

  it('opens it again with a read waiting on the open: the read answers, never asked again without end', async () => {
    db.close({ disableAutoOpen: false })
    let once = true
    db.on('ready', () => {
      if (!once) return
      once = false
      db.close({ disableAutoOpen: false })
    })
    expect(await refusal()).toBe('DatabaseClosedError')
    // A read made while the open runs: on the settled promise Dexie kept it would ask again without end, starving the open.
    const opening = reopenIfClosed(db)
    const waiting = refusal()
    await opening
    expect(await waiting).toBe('answered')
    expect(db.isOpen()).toBe(true)
  })

  /** The next open's connection closed by the storage the moment Dexie has it, before the counters are raised; heard or not. */
  function closeNextOpen(heard: boolean): void {
    const factory = indexedDB as IDBFactory & { open: IDBFactory['open'] }
    const real = factory.open.bind(factory)
    factory.open = ((name: string, version?: number) => {
      factory.open = real
      const req = real(name, version)
      req.addEventListener('success', () =>
        queueMicrotask(() => {
          const conn = req.result as IDBDatabase & { onclose: ((e: Event) => void) | null }
          conn.close()
          // Heard: its close event reaches Dexie, as Chrome sends one; unheard: the connection is simply gone.
          if (heard) conn.onclose?.(new Event('close'))
        }),
      )
      return req
    }) as IDBFactory['open']
  }

  it('never lets a connection closed while the database opens hold the open: heard, the open goes on at once', async () => {
    expect(kept.get('lm.idFloors')).toBeTruthy()
    db.close({ disableAutoOpen: false })
    closeNextOpen(true)
    const started = performance.now()
    expect(['answered', 'DatabaseClosedError']).toContain(await refusal())
    // No counters to raise on a connection gone, so no wait at all.
    expect(performance.now() - started).toBeLessThan(FLOORS_WAIT_MS / 2)
    let value: number | undefined
    const stop = followRead(() => db.checkins.count(), (v) => void (value = v))
    await settle(RETRY_BASE_MS * 4)
    stop()
    expect(value).toBe(1)
  })

  it('never lets a connection closed while the database opens hold the open: unheard, it goes on within the limit', async () => {
    expect(kept.get('lm.idFloors')).toBeTruthy()
    db.close({ disableAutoOpen: false })
    closeNextOpen(false)
    // Without the limit this read waited for good: the counters' transaction on the open, the open on the counters.
    const started = performance.now()
    expect(['answered', 'DatabaseClosedError']).toContain(await refusal())
    expect(performance.now() - started).toBeLessThan(FLOORS_WAIT_MS + 1500)
    let value: number | undefined
    const stop = followRead(() => db.checkins.count(), (v) => void (value = v))
    await settle(RETRY_BASE_MS * 4)
    stop()
    expect(value).toBe(1)
  })

  it('leaves a database closed on purpose closed, and keeps no interruption for it', async () => {
    db.close()
    await reopenIfClosed(db)
    expect(db.isOpen()).toBe(false)
    await settle(10)
    expect(storageFaults()).toBeNull()
    await db.open()
  })

  it('keeps each interruption on this phone, counts and minutes and the error’s name alone, and Now’s waits with the reads', async () => {
    db.close({ disableAutoOpen: false })
    await settle(10)
    expect(storageFaults()).toMatchObject({ count: 1, name: 'closed' })
    storageClosed('AbortError', new Date('2026-10-23T20:26:40.000Z'))
    nowWaited(['checkins', 'pickup'], new Date('2026-10-23T20:26:41.000Z'))
    expect(storageFaults()).toMatchObject({ count: 2, last: '2026-10-23T20:26', name: 'AbortError', waits: 1, waited: ['checkins', 'pickup'] })
    expect(Object.keys(JSON.parse(kept.get(STORAGE_FAULT_KEY) as string)).sort()).toEqual(['count', 'first', 'last', 'name', 'waited', 'waits'])
  })

  it('rides the Brain’s sheet for the Worker’s report, and only when one was kept', async () => {
    expect((await factSheet(DAY, new Date(2026, 9, 23, 16, 30))).storageFault).toBeUndefined()
    storageClosed('AbortError', new Date('2026-10-23T20:26:40.000Z'))
    const sheet = await factSheet(DAY, new Date(2026, 9, 23, 16, 30))
    expect(sheet.storageFault).toMatchObject({ count: 1, first: '2026-10-23T20:26', name: 'AbortError' })
    // On the sheet beside the facts, never among them: no writer reads it.
    expect(sheet.facts.some((f) => JSON.stringify(f).includes('AbortError'))).toBe(false)
  })

  it('writes the facts row again when only an interruption is new, so the Worker’s report shows it', async () => {
    const at = new Date(2026, 9, 23, 16, 30)
    await writeFactsRow(DAY, at)
    expect((await db.facts.get(DAY))?.sheet.storageFault).toBeUndefined()
    // Nothing else changed: the same facts would have kept the old row, and the report would never have shown it.
    expect(await writeFactsRow(DAY, at)).toBe(false)
    storageClosed('AbortError', new Date('2026-10-23T20:26:40.000Z'))
    expect(await writeFactsRow(DAY, at)).toBe(true)
    expect((await db.facts.get(DAY))?.sheet.storageFault).toMatchObject({ count: 1, name: 'AbortError' })
  })
})

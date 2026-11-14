import type { Page } from '@playwright/test'
import { seedRecord, storeRows } from './askSeed'

// Stand-in events noticed in stand-in notes (Phase 5, 2026-11-13), for the browser tests. The events here are of
// stand-in types the one list does not hold, so an automated browser holds the test key that reads two stand-in
// types beside the list, as the app's earlier previews were opened.

/** The key an automated browser holds to read the two stand-in event types. */
export const NOTICED_KEY = 'life-mirror.preview.noticed'

/** Writes rows straight into one of the phone's stores. */
export async function putRows(page: Page, store: string, rows: readonly Record<string, unknown>[]): Promise<void> {
  await page.evaluate(
    async ({ name, list }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      for (const row of list) tx.objectStore(name).put(row)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { name: store, list: rows },
  )
}

export interface SeededNoticed {
  /** The ids of the events that stand, the newest note first, as the sheet lists them. */
  standing: string[]
  /** The words quoted from each standing event's note, in the same order. */
  quotes: string[]
}

/**
 * Twelve days of check-ins, three of the evenings given a note, and six events: three that stand (one of them stored
 * under its type's earlier id), one from a kept note, one whose note does not hold its quote, and one of a type no
 * list knows. With `marked`, the oldest standing event is marked wrong.
 */
export async function seedNoticed(page: Page, opts: { marked?: boolean } = {}): Promise<SeededNoticed> {
  await seedRecord(page, 12)
  const evenings = (await storeRows<{ id: number; day: string; block: string; extras?: Record<string, unknown> }>(page, 'checkins')).filter((r) => r.block === 'evening').sort((a, b) => (a.day < b.day ? -1 : 1))
  const [first, second, third] = [evenings[2], evenings[5], evenings[8]]
  const notes = ['A long day. I raised my voice at the dog again, and felt it after.', 'Up late on the phone once more, well past eleven.', 'Raised my voice in traffic. Short on sleep and it showed all afternoon and into the evening.']
  await putRows(page, 'checkins', [first, second, third].map((r, i) => ({ ...r, extras: { ...(r.extras ?? {}), note: notes[i] } })))
  await putRows(page, 'notes', [{ id: 30, day: third.day, at: `${third.day}T21:00:00.000Z`, text: 'I raise my voice more when I have slept badly.' }])
  const at = (r: { id: number; day: string }) => ({ store: 'checkins', id: String(r.id), day: r.day, block: 'evening' })
  const base = { noticedAt: '2026-09-22T10:00:00.000Z', method: 'stand-in' }
  await putRows(page, 'noteEvents', [
    { id: 'e1', type: 'stand-in-one', note: at(first), quote: 'I raised my voice at the dog again', ...base },
    { id: 'e2', type: 'stand-in-two', note: at(second), quote: 'Up late on the phone once more, well past eleven.', ...base },
    // Stored under the first type's earlier id: it is that type today.
    { id: 'e3', type: 'stand-in-first', note: at(third), quote: 'Raised my voice in traffic.', ...base },
    { id: 'e4', type: 'stand-in-one', note: { store: 'notes', id: '30', day: third.day }, quote: 'I raise my voice more when I have slept badly.', ...base },
    // Its note never held these words: it stands nowhere.
    { id: 'e5', type: 'stand-in-one', note: at(first), quote: 'words the note does not hold', ...base },
    // A type no list knows.
    { id: 'e6', type: 'no-such-type', note: at(second), quote: 'Up late on the phone', ...base },
  ])
  if (opts.marked) await putRows(page, 'noteMarks', [{ id: 'event:e1', kind: 'wrong', at: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z' }])
  // The newest note first; of two on one day, the kept note's event and the check-in's were noticed at the same moment, so by id.
  return { standing: ['e3', 'e4', 'e2', 'e1'], quotes: ['Raised my voice in traffic.', 'I raise my voice more when I have slept badly.', 'Up late on the phone once more, well past eleven.', 'I raised my voice at the dog again'] }
}

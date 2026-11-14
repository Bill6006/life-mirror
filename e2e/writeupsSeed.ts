import type { Page } from '@playwright/test'
import { seedRecord, storeRows } from './askSeed'
import { putRows } from './noticedSeed'

// Stand-in monthly write-ups (Phase 6, 2026-11-13), for the browser tests: the rows the Worker would write, put
// straight into the phone's store. Every word is a stand-in; the days cited are days of the stand-in record.

export interface SeededWriteUps {
  /** The days of the stand-in record's evenings, oldest first. */
  days: string[]
}

/**
 * Twelve days of check-ins and a write-up of their month, September 2026: two things recorded and two noticed, the
 * first noticed one followed. With `earlier`, a first reading beside it; with `marked`, the first noticed one marked wrong.
 */
export async function seedWriteUps(page: Page, opts: { earlier?: boolean; marked?: boolean } = {}): Promise<SeededWriteUps> {
  await seedRecord(page, 12)
  const days = (await storeRows<{ day: string; block: string }>(page, 'checkins')).filter((r) => r.block === 'evening').map((r) => r.day).sort()
  const reading = (n: number, at: string, first: string) => ({
    id: `2026-09:${n}`,
    month: '2026-09',
    reading: n,
    at,
    day: at.slice(0, 10),
    method: 1,
    model: 'stand-in',
    builtFrom: { counts: { days: 12, checkins: 36 }, parts: 1, lines: 60, fingerprint: 'a'.repeat(64), builtAt: at },
    recorded: [
      { text: first, days: [days[2], days[5], days[8]], kinds: ['dayRecord'] },
      { text: 'You wrote a note on three evenings, each after a long day.', days: [days[3]], kinds: ['notes'] },
    ],
    noticed: [
      { text: 'The shorter nights came before the days you skipped a plan.', days: [days[4], days[6]], kinds: ['dayRecord'], followed: { kind: 'sleep.short', split: 'weekday', cell: '6', k: 2, n: 4, restK: 3, m: 20 } },
      { text: 'A walk before dinner went with calmer evenings.', days: [days[7]], kinds: ['dayRecord'] },
    ],
  })
  const rows = [reading(opts.earlier ? 2 : 1, '2026-09-23T15:00:00.000Z', 'You checked in every evening of the stretch.')]
  if (opts.earlier) rows.push(reading(1, '2026-09-21T15:00:00.000Z', 'An earlier reading said this of the same days.'))
  await putRows(page, 'writeups', rows)
  if (opts.marked) await putRows(page, 'noteMarks', [{ id: `obs:${rows[0].id}:noticed:1`, kind: 'wrong', at: '2026-09-23T16:00:00.000Z', updatedAt: '2026-09-23T16:00:00.000Z' }])
  return { days }
}

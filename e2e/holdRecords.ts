// Stand-in records for the hold's browser tests (the forecast follow-ups, Batch 2, item 6), written with no app page
// open. Every reading sits at its middle phrase but stress in the evening, and the morning after a stressed evening
// reads lower; so the stress pair is the only one the record can test.

const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
const LOWER = { mood: 2, energy: 2, focus: 2, stress: 4, overwhelm: 4, irritation: 4 }

export interface Row {
  day: string
  block: 'morning' | 'evening'
  asked: string[]
  startedAt: string
  completedAt: string
  updatedAt: string
  answers: Record<string, number>
  activeMs: number
}

const pad = (n: number): string => String(n).padStart(2, '0')
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** A complete check-in on the day `back` days before `today`, every reading at its middle phrase but `over`. */
function row(today: Date, back: number, block: 'morning' | 'evening', over: Record<string, number> = {}): Row {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40)
  const done = new Date(at.getTime() + 95_000).toISOString()
  const ids = block === 'morning' ? MORNING : EVENING
  return { day: dayKey(date), block, asked: ids, startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers: Object.fromEntries(ids.map((id) => [id, over[id] ?? 3])), activeMs: 60_000 }
}

/** A small seeded generator, so a record keeps no rhythm and is the same every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The evening test's four weeks to `today` (smoke.spec.ts): stress at its top phrase on a fortnight's 2nd, 3rd, 5th and
 * 9th evenings counted back, the morning after lower each time; and, with `tonight`, tonight's evening stressed too.
 */
export function fortnights(today: Date, tonight: boolean): Row[] {
  const rows: Row[] = []
  for (let back = 28; back >= 1; back--) {
    const stressed = [2, 3, 5, 9].includes(back % 14)
    rows.push(row(today, back, 'evening', stressed ? { stress: 5 } : {}), row(today, back - 1, 'morning', stressed ? LOWER : {}))
  }
  if (tonight) rows.push(row(today, 0, 'evening', { stress: 5 }))
  return rows
}

/**
 * A hundred days to `today`: stress at its top phrase on about a third of the evenings, in no rhythm, the morning after
 * lower each time; and, with `tonight`, tonight's evening stressed too.
 */
export function hundredDays(today: Date, tonight: boolean): Row[] {
  const r = seeded(43)
  const rows: Row[] = []
  for (let back = 100; back >= 1; back--) {
    const stressed = r() < 0.35
    rows.push(row(today, back, 'evening', stressed ? { stress: 5 } : {}), row(today, back - 1, 'morning', stressed ? LOWER : {}))
  }
  if (tonight) rows.push(row(today, 0, 'evening', { stress: 5 }))
  return rows
}

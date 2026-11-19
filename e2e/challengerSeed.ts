// A stand-in record for the forecast's challenger in the browser (Phase 8, 2026-11-19): a hundred and sixty days in
// which a stand-in private item, marked at the evening check-in where it is always on screen, lowers the next
// morning's mood and focus, and a note event of one type, on about four in ten of the evenings with a note, lowers its
// energy and raises its stress; the two independent. Each event is identified that evening. The last evening carries
// both. Seeded, so it is the same on every run; stand-in answers and names only. The same record the unit tests hold
// (src/challengerTesting.ts), drawn here from a seed of its own.

const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']

export const SEED_ITEM = { id: 41, name: 'Stand-in private item', createdAt: '2026-01-01T00:00:00.000Z', archived: 0 }
export const SEED_TYPE = 'raised-voice'
export const SEED_TYPE_LABEL = 'Raised my voice'
const QUOTE = 'raised my voice'

/** A small seeded stream, so the record is the same on every run. */
function stream(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dayKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/** The days before `today` (YYYY-MM-DD), oldest first; check-ins numbered from 1, at hours safe in every zone the tests run in. */
export function challengerRecord(today: string, days = 160): { checkins: Record<string, unknown>[]; events: Record<string, unknown>[] } {
  const next = stream(20261119)
  const last = days - 1
  const item = Array.from({ length: days }, (_, i) => i === last || next() < 0.4)
  const noted = Array.from({ length: days }, (_, i) => i === last || next() < 0.75)
  const event = noted.map((n, i) => n && (i === last || next() < 0.4))
  const start = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))
  const checkins: Record<string, unknown>[] = []
  const events: Record<string, unknown>[] = []
  let id = 1
  const key = String(SEED_ITEM.id)
  for (let i = 0; i < days; i++) {
    const day = dayKey(new Date(start - (days - i) * 86_400_000))
    const after = (list: boolean[]) => i > 0 && list[i - 1]
    const morning: Record<string, number> = Object.fromEntries(MORNING.map((r) => [r, 3]))
    Object.assign(morning, { mood: after(item) ? 1 : 5, focus: after(item) ? 1 : 5, energy: after(event) ? 1 : 5, stress: after(event) ? 5 : 1, sleepHours: 4 })
    const mAt = `${day}T13:00:00.000Z`
    checkins.push({ id: id++, day, block: 'morning', asked: MORNING, answers: morning, startedAt: mAt, completedAt: mAt, updatedAt: mAt, activeMs: 30_000 })
    const eid = id++
    const eAt = `${day}T23:00:00.000Z`
    const extras: Record<string, unknown> = { privateShown: { [key]: true } }
    if (item[i]) extras.private = { [key]: true }
    if (noted[i]) extras.note = event[i] ? `Today I ${QUOTE} at work.` : 'A quiet evening.'
    checkins.push({ id: eid, day, block: 'evening', asked: EVENING, answers: Object.fromEntries(EVENING.map((r) => [r, 3])), startedAt: eAt, completedAt: eAt, updatedAt: eAt, activeMs: 30_000, extras })
    if (event[i]) events.push({ id: `ev-${eid}`, type: SEED_TYPE, note: { store: 'checkins', id: String(eid), day, block: 'evening' }, quote: QUOTE, noticedAt: `${day}T23:59:00.000Z`, method: 'stand-in' })
  }
  return { checkins, events }
}

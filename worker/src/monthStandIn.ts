import { monthSpan } from './month'
import { addDays } from './time'
import { APP, memoryStore, type Store } from './turso'

// A stand-in month (2026-11-13): a record that is nobody's, made in the Worker's own code, for the run by hand that
// proves the month task end to end. Nothing here was read from anyone's record, and a run by hand reads nothing else.

/** Stand-in notes: plain sentences, a few of which say one of the event types' behaviours. */
export const STAND_IN_NOTES: readonly string[] = [
  'A long day at work, then a quiet evening.',
  'I raised my voice in traffic on the way home.',
  'Stayed up later than I meant to, reading.',
  'A good walk before dinner.',
  'Skipped the run I had planned.',
  'Tired by noon; an early night.',
  'Argued with a neighbour about the fence.',
  'A calm morning and a full afternoon.',
]

/** The stand-in month for a day, by its first day: the newest month whose three days after it have all passed. */
export function standInFirst(today: string): string {
  const before = (first: string): string => `${addDays(first, -1).slice(0, 7)}-01`
  const last = before(`${today.slice(0, 7)}-01`)
  const span = monthSpan(last)
  return span && today > span.servedTo ? last : before(last)
}

/** A store that holds a stand-in record around a month: a day's row, a morning and an evening check-in each day, a note on two evenings in three. */
export function standInStore(first: string): Store {
  const store = memoryStore()
  const span = monthSpan(first)
  if (!span) return store
  const stamp = `${first}T12:00:00.000Z`
  const put = (s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: stamp, deleted: 0, synced_at: stamp })
  put('settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  let id = 1
  let n = 0
  for (let d = span.servedFrom; d <= span.servedTo; d = addDays(d, 1), n++) {
    put('days', d, d, { day: d, atOffice: n % 7 < 5 })
    put('checkins', String(id), d, { id: id++, day: d, block: 'morning', answers: {}, extras: {}, completedAt: `${d}T12:30:00.000Z` })
    put('checkins', String(id), d, { id: id++, day: d, block: 'evening', answers: {}, extras: n % 3 === 2 ? {} : { note: STAND_IN_NOTES[n % STAND_IN_NOTES.length] }, completedAt: `${d}T23:30:00.000Z` })
  }
  return store
}

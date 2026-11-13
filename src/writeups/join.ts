import { FORGET_ID, type NoteMark } from '../noteEvents/shared'
import { obsMarkIdOf, type Followed, type Observation, type WriteUp } from './shared'

// What of the monthly write-ups is shown, and what counts (2026-11-13): the join, on the phone. An observation is
// shown only while its write-up was written after the forget moment, every day it cites still holds a record, and
// every kind of record it drew on may be shown. One marked wrong stays in view, so the mark can be taken back, and
// counts for nothing. A deletion or a switch hides at once: nothing here waits for a re-read. No import beyond the
// shared shapes, and nothing stored: it is worked out from the record each time.

export interface WriteUpsInput {
  writeups: readonly WriteUp[]
  /** The phone's own marks: observations marked wrong, and the forget moment. */
  marks: readonly NoteMark[]
  /** The days that still hold a record. */
  days: ReadonlySet<string>
  /** Whether a kind of record may be shown: its switch in Settings, Brain. */
  kindOn: (kind: string) => boolean
  /** Whether faith is shown. */
  faithShown: boolean
  /** Private items' names while names may not be shown outside their screen; empty while they may. */
  hiddenNames: readonly string[]
}

export interface ShownObservation {
  part: 'recorded' | 'noticed'
  /** Its place in its part as the write-up was written, from one: the mark's id rests on it. */
  place: number
  text: string
  days: string[]
  kinds: string[]
  followed?: Followed
  /** Marked wrong: in view with its mark, counting for nothing. */
  wrong: boolean
  markId: string
}

export interface ShownWriteUp {
  id: string
  month: string
  reading: number
  at: string
  day: string
  recorded: ShownObservation[]
  noticed: ShownObservation[]
}

export interface ShownMonth {
  month: string
  /** The newest reading that has something to show. */
  newest: ShownWriteUp
  /** Earlier readings that still have something to show, the newer first: beside the newest, never under it. */
  earlier: ShownWriteUp[]
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const holdsName = (text: string, name: string): boolean => name.trim() !== '' && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name.trim())}($|[^\\p{L}\\p{N}])`, 'iu').test(text)

/** The moment up to which everything learned is forgotten, or null. */
export function forgetMoment(marks: readonly NoteMark[]): string | null {
  const m = marks.find((x) => x.id === FORGET_ID && x.kind === 'forget')
  return m && !Number.isNaN(Date.parse(m.at)) ? m.at : null
}

/** Whether one observation may be shown at all: its days, its kinds of record, faith, and private names. */
function mayShow(o: Observation, x: WriteUpsInput): boolean {
  if (!o.days.every((d) => x.days.has(d))) return false
  if (!o.kinds.every((k) => x.kindOn(k))) return false
  if ((o.faith === true || o.kinds.includes('faith')) && !x.faithShown) return false
  return !x.hiddenNames.some((n) => holdsName(o.text, n))
}

function shownOf(w: WriteUp, x: WriteUpsInput, wrong: ReadonlySet<string>): ShownWriteUp {
  const part = (list: readonly Observation[], name: 'recorded' | 'noticed'): ShownObservation[] =>
    list.flatMap((o, i) => {
      if (!mayShow(o, x)) return []
      const markId = obsMarkIdOf(w.id, name, i + 1)
      return [{ part: name, place: i + 1, text: o.text, days: o.days, kinds: o.kinds, ...(o.followed ? { followed: o.followed } : {}), wrong: wrong.has(markId), markId }]
    })
  return { id: w.id, month: w.month, reading: w.reading, at: w.at, day: w.day, recorded: part(w.recorded, 'recorded'), noticed: part(w.noticed, 'noticed') }
}

/** The months with something to show, the newest month first; in each, the newest reading, and the earlier ones beside it. */
export function shownWriteUps(x: WriteUpsInput): ShownMonth[] {
  const forgot = forgetMoment(x.marks)
  const wrong = new Set(x.marks.filter((m) => m.kind === 'wrong').map((m) => m.id))
  const byMonth = new Map<string, ShownWriteUp[]>()
  for (const w of x.writeups) {
    // Written at or before the forget moment: forgotten, whatever it holds.
    if (forgot !== null && Date.parse(w.at) <= Date.parse(forgot)) continue
    const s = shownOf(w, x, wrong)
    if (s.recorded.length + s.noticed.length === 0) continue
    byMonth.set(w.month, [...(byMonth.get(w.month) ?? []), s])
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, list]) => {
      const readings = [...list].sort((a, b) => b.reading - a.reading)
      return { month, newest: readings[0], earlier: readings.slice(1) }
    })
}

export interface FollowedPattern extends Followed {
  /** The observation it came from, and the day it was noticed: only occasions after that day count toward it. */
  markId: string
  month: string
  noticedOn: string
  text: string
}

/** The followed patterns that count: of each month's newest reading alone, shown, and not marked wrong. */
export function followedPatterns(months: readonly ShownMonth[]): FollowedPattern[] {
  return months.flatMap((m) => m.newest.noticed.flatMap((o) => (o.followed && !o.wrong ? [{ ...o.followed, markId: o.markId, month: m.month, noticedOn: m.newest.day, text: o.text }] : [])))
}

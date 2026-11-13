import { FORGET_ID, wrongIdOf, type NoteEvent, type NoteMark } from './shared'
import { eventTypeOf, eventTypes, type EventType } from './types'

// What was noticed in notes, joined to the notes themselves (2026-11-13), on the phone. An event stands only while
// its type is one the list knows, it was noticed after the forget moment, the note it came from is still in the
// record, and that note still holds the quoted words exactly. One that does not stand counts for nothing at once and
// is shown nowhere. One marked wrong still stands, so the mark can be undone, and counts nowhere.

/** The little of a check-in and of a kept note the join reads. */
export interface NoteOfCheckin {
  id?: number
  day: string
  block: string
  extras?: { note?: string }
}
export interface NoteKept {
  id?: number
  day: string
  text: string
}

export interface Noticed {
  event: NoteEvent
  /** Its type as the list names it today. */
  type: EventType
  /** Marked wrong by the owner. */
  wrong: boolean
  /** The check-in whose note it sits on; null for a note kept from a question, which was written at no check-in. */
  checkinId: number | null
}

export interface JoinInput {
  events: readonly NoteEvent[]
  marks: readonly NoteMark[]
  checkins: readonly NoteOfCheckin[]
  kept: readonly NoteKept[]
  types?: readonly EventType[]
}

/** Every event that stands, the newest note first. */
export function noticedOf(input: JoinInput): Noticed[] {
  const types = input.types ?? eventTypes()
  const forget = input.marks.find((m) => m.id === FORGET_ID && m.kind === 'forget')?.at ?? ''
  const wrong = new Set(input.marks.filter((m) => m.kind === 'wrong').map((m) => m.id))
  const checkins = new Map(input.checkins.filter((c) => c.id !== undefined).map((c) => [String(c.id), c]))
  const kept = new Map(input.kept.filter((k) => k.id !== undefined).map((k) => [String(k.id), k]))
  const out: Noticed[] = []
  for (const event of input.events) {
    const type = eventTypeOf(event.type, types)
    if (!type) continue
    if (forget && event.noticedAt <= forget) continue
    const quote = event.quote.trim()
    if (!quote) continue
    const note = event.note.store === 'checkins' ? checkins.get(event.note.id)?.extras?.note : kept.get(event.note.id)?.text
    if (typeof note !== 'string' || !note.includes(quote)) continue
    out.push({ event, type, wrong: wrong.has(wrongIdOf(event.id)), checkinId: event.note.store === 'checkins' ? Number(event.note.id) : null })
  }
  return out.sort((a, b) => (a.event.note.day < b.event.note.day ? 1 : a.event.note.day > b.event.note.day ? -1 : a.event.noticedAt < b.event.noticedAt ? 1 : a.event.noticedAt > b.event.noticedAt ? -1 : a.event.id < b.event.id ? -1 : 1))
}

/** What the counts read: an event that stands, is not marked wrong, and sits on a check-in's note. */
export interface CountedNotice {
  /** The type's current id and label. */
  type: string
  label: string
  checkinId: number
}

export function countedNotices(all: readonly Noticed[]): CountedNotice[] {
  return all.filter((n) => !n.wrong && n.checkinId !== null && Number.isFinite(n.checkinId)).map((n) => ({ type: n.type.id, label: n.type.label, checkinId: n.checkinId as number }))
}

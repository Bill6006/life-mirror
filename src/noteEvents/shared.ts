// A thing noticed in a note (2026-11-13): the row the Worker writes for each, and the phone's own marks on them. The
// Worker's rows are pulled and kept read-only; the marks are the phone's, synced like any record. No event is written
// yet: the month's read, built after this, writes the first. No import: the phone and the Worker both take this file.

/** The Worker's store of events noticed in notes. */
export const NOTE_EVENTS_STORE = 'noteEvents'

export interface NoteEvent {
  id: string
  /** Its type's id, as the one list of event types knew it when it was noticed. */
  type: string
  /** The note it came from: a check-in's note, or a note kept from a question. */
  note: { store: 'checkins' | 'notes'; id: string; day: string; block?: string }
  /** The owner's exact words, as they stand in the note. */
  quote: string
  /** When it was noticed, and by which method. */
  noticedAt: string
  method: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : null)

/** A row of the Worker's as an event, or null when it is not one: nothing half-read is kept. */
export function noteEventOf(id: string, body: unknown): NoteEvent | null {
  let b: unknown = body
  if (typeof body === 'string') {
    try {
      b = JSON.parse(body)
    } catch {
      return null
    }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const o = b as Record<string, unknown>
  const n = o.note && typeof o.note === 'object' && !Array.isArray(o.note) ? (o.note as Record<string, unknown>) : null
  const type = text(o.type, 80)
  const quote = text(o.quote, 2000)
  const noticedAt = text(o.noticedAt, 40)
  const method = text(o.method, 80)
  if (!id || !n || !type || !quote || !noticedAt || !method || Number.isNaN(Date.parse(noticedAt))) return null
  const store = n.store === 'checkins' || n.store === 'notes' ? n.store : null
  const noteId = typeof n.id === 'string' || typeof n.id === 'number' ? String(n.id) : ''
  if (!store || !noteId || typeof n.day !== 'string' || !DAY.test(n.day)) return null
  const block = n.block === 'morning' || n.block === 'afternoon' || n.block === 'evening' ? n.block : undefined
  return { id, type, note: { store, id: noteId, day: n.day, ...(block ? { block } : {}) }, quote, noticedAt, method }
}

/** The phone's own mark: an event marked wrong, or the moment up to which everything noticed is forgotten. */
export interface NoteMark {
  id: string
  kind: 'wrong' | 'forget'
  /** When the mark was made; for the forget mark, the moment itself: what was noticed up to it counts for nothing. */
  at: string
  updatedAt: string
}

/** The one record that holds the forget moment. */
export const FORGET_ID = 'forget'
/** The mark's id for an event marked wrong. */
export const wrongIdOf = (eventId: string): string => `event:${eventId}`

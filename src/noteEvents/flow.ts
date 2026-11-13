import { db } from '../db'
import { noticedOf, type Noticed } from './join'
import { FORGET_ID, wrongIdOf } from './shared'

// What was noticed in notes, on the phone (2026-11-13): read with the notes it came from, and the owner's own marks.

/** Every event that stands, the newest note first: the Worker's rows, the marks, the check-ins and the kept notes read in one go. */
export async function noticedNow(): Promise<Noticed[]> {
  const [events, marks, checkins, kept] = await Promise.all([db.noteEvents.toArray(), db.noteMarks.toArray(), db.checkins.toArray(), db.notes.toArray()])
  return noticedOf({ events, marks, checkins, kept })
}

/** Marks an event wrong, or takes the mark back. A marked event counts nowhere; the Worker's row is untouched. */
export async function markWrong(eventId: string, wrong: boolean, now: Date = new Date()): Promise<void> {
  const id = wrongIdOf(eventId)
  if (!wrong) {
    await db.noteMarks.delete(id)
    return
  }
  const at = now.toISOString()
  await db.noteMarks.put({ id, kind: 'wrong', at, updatedAt: at })
}

/**
 * Forgets everything noticed up to this moment: none of it counts or is shown again. The Worker's rows stay on
 * record, as its lines do. Nothing on a screen calls this yet: the control arrives with the month's write-ups.
 */
export async function forgetNoticed(now: Date = new Date()): Promise<void> {
  const at = now.toISOString()
  await db.noteMarks.put({ id: FORGET_ID, kind: 'forget', at, updatedAt: at })
}

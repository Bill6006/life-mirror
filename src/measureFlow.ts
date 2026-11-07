import { db, type Outcome, type Recording } from './db'
import type { Path } from './catalogue'
import { library } from './library'
import { decide } from './pathVersions'

// A measured Path's record on the phone (P2 and P4 of the AI-generated Paths design, 2026-11-06): its
// start with the strands you chose, the behaviours you check right after a rep, how hard it was, what
// someone who was there noticed on your phone, and a recording of yourself, kept on this phone alone and
// checked the next day or later. Never anyone's reaction, and no name. Your answers to the start's two
// questions are not kept: only the strands they led you to choose.

/** The cards a decision rests on, each with the day it was last reviewed. */
const cardsNow = () => library.map((c) => ({ id: c.id, reviewed: c.reviewed }))

/** Start a Path the catalogue adds: your decision on this version, and the commitment with the strands you chose. A second start keeps one commitment. */
export function startPath(path: Path, strands: readonly string[], now: Date = new Date()): Promise<void> {
  return db.transaction('rw', [db.aims, db.pathVersions], async () => {
    await decide(path, 'started', cardsNow(), undefined, now)
    const live = await db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.path === path.id).first()
    if (live?.id !== undefined) {
      await db.aims.update(live.id, { strands: [...strands] })
      return
    }
    await db.aims.add({ kind: 'path', path: path.id, stepMoveId: null, pausedAt: null, createdAt: now.toISOString(), archivedAt: null, strands: [...strands] })
  })
}

/** Later, or Not this with one optional reason: the Path is offered nowhere, and stays yours to read again. */
export function setAsidePath(path: Path, decision: 'later' | 'notThis', reason?: string, now: Date = new Date()): Promise<void> {
  return decide(path, decision, cardsNow(), decision === 'notThis' ? reason : undefined, now)
}

/** The strands you have on, changed from the card: never none. */
export async function setStrands(aimId: number, strands: readonly string[]): Promise<void> {
  if (!strands.length) return
  await db.aims.update(aimId, { strands: [...strands] })
}

async function outcomeOf(offerId: number): Promise<Outcome | undefined> {
  return db.outcomes.where('offerId').equals(offerId).first()
}

/** Right after a rep: the behaviours you checked you did, and how hard it was. A second answer replaces the first; null effort takes it back. */
export async function setRepSheet(offerId: number, sheet: { checks?: readonly string[]; effort?: Outcome['effort'] | null }): Promise<void> {
  const x = await outcomeOf(offerId)
  if (x?.id === undefined) return
  const patch: Partial<Outcome> = {}
  if (sheet.checks !== undefined) patch.checks = [...sheet.checks]
  if (sheet.effort !== undefined) patch.effort = sheet.effort ?? undefined
  await db.outcomes.update(x.id, patch)
}

/** What someone who was there noticed, marked on your phone: the behaviours alone, with the moment, and no name. */
export async function setOtherChecks(offerId: number, checks: readonly string[], now: Date = new Date()): Promise<void> {
  const x = await outcomeOf(offerId)
  if (x?.id === undefined) return
  await db.outcomes.update(x.id, { otherChecks: [...checks], otherAt: now.toISOString() })
}

/** A recording of yourself, kept on this phone alone; a second one for the same rep replaces the first. */
export function saveRecording(offerId: number, audio: Blob, mime: string, ms: number, now: Date = new Date()): Promise<number> {
  return db.transaction('rw', db.recordings, async () => {
    await db.recordings.where('offerId').equals(offerId).delete()
    return db.recordings.add({ offerId, at: now.toISOString(), audio, mime, ms })
  })
}

export function recordingFor(offerId: number): Promise<Recording | undefined> {
  return db.recordings.where('offerId').equals(offerId).first()
}

/** Every recording, newest first, without reading the sound: what the card lists. */
export async function recordingList(): Promise<Pick<Recording, 'id' | 'offerId' | 'at' | 'ms'>[]> {
  const all = await db.recordings.toArray()
  return all.map(({ id, offerId, at, ms }) => ({ id, offerId, at, ms })).sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** The recording checked, the next day or later: the line you wrote before playing it, then the behaviours it shows. */
export async function checkRecording(offerId: number, note: string, checks: readonly string[], now: Date = new Date()): Promise<void> {
  const x = await outcomeOf(offerId)
  if (x?.id === undefined) return
  const line = note.trim()
  await db.outcomes.update(x.id, { recordingChecks: [...checks], recordingCheckedAt: now.toISOString(), recordingNote: line || undefined })
}

/** A recording deleted by you: gone from this phone; what you checked on it stays. */
export async function deleteRecording(id: number): Promise<void> {
  await db.recordings.delete(id)
}

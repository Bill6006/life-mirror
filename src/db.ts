import Dexie, { liveQuery, type Table } from 'dexie'
import { useEffect, useState } from 'preact/hooks'
import { compareSlots, type Block } from './blocks'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// Everything lives in IndexedDB on the phone. Nothing here talks to a network.

export interface CheckIn {
  id?: number
  day: string
  block: Block
  /** When the check-in was first opened. */
  startedAt: string
  /** When the last reading was answered; null while any reading is missing. */
  completedAt: string | null
  updatedAt: string
  answers: Answers
  /** Time spent tapping, in ms; pauses longer than a minute are not counted. */
  activeMs: number
}

class LifeMirrorDB extends Dexie {
  checkins!: Table<CheckIn, number>
  constructor() {
    super('life-mirror')
    this.version(1).stores({ checkins: '++id, &[day+block], day, completedAt' })
  }
}

export const db = new LifeMirrorDB()

export function isComplete(c: Pick<CheckIn, 'block' | 'answers'>): boolean {
  return blockReadings(c.block).every((id) => c.answers[id] !== undefined)
}

export function answeredCount(c: Pick<CheckIn, 'block' | 'answers'>): number {
  return blockReadings(c.block).filter((id) => c.answers[id] !== undefined).length
}

/** The check-in for a slot, or null when none has been started. */
export async function getCheckIn(day: string, block: Block): Promise<CheckIn | null> {
  return (await db.checkins.where('[day+block]').equals([day, block]).first()) ?? null
}

export function saveAnswer(day: string, block: Block, readingId: ReadingId, position: Position, activeMsDelta: number): Promise<CheckIn> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec: CheckIn = (await getCheckIn(day, block)) ?? {
      day,
      block,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
      answers: {},
      activeMs: 0,
    }
    rec.answers = { ...rec.answers, [readingId]: position }
    rec.activeMs += Math.max(0, Math.round(activeMsDelta))
    rec.updatedAt = now
    if (isComplete(rec)) rec.completedAt ??= now
    rec.id = await db.checkins.put(rec)
    return rec
  })
}

export function clearAnswer(day: string, block: Block, readingId: ReadingId): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const rec = await getCheckIn(day, block)
    if (!rec) return
    const answers = { ...rec.answers }
    delete answers[readingId]
    await db.checkins.put({ ...rec, answers, completedAt: null, updatedAt: new Date().toISOString() })
  })
}

export function deleteCheckIn(id: number): Promise<void> {
  return db.checkins.delete(id)
}

/** Every check-in, newest slot first. */
export async function allCheckIns(): Promise<CheckIn[]> {
  const all = await db.checkins.toArray()
  return all.sort((a, b) => compareSlots(b, a))
}

/** The most recent completed check-in in a slot before the given one, or null. */
export async function previousCompleted(day: string, block: Block): Promise<CheckIn | null> {
  const all = await db.checkins.filter((c) => c.completedAt !== null).toArray()
  const before = all.filter((c) => compareSlots(c, { day, block }) < 0).sort((a, b) => compareSlots(b, a))
  return before[0] ?? null
}

/** Re-runs a Dexie query whenever the tables it touched change. Undefined while loading. */
export function useLive<T>(querier: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v as T),
      error: (e) => console.error(e),
    })
    return () => sub.unsubscribe()
  }, deps)
  return value
}

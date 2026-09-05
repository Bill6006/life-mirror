import Dexie, { type Table } from 'dexie'
import { compareSlots, type Block, type Slot } from './blocks'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { remindedKey, withDefaults, type Settings } from './settings'

// Everything lives in IndexedDB on the phone. Nothing here talks to a network.

export type WinOutcome = 'done' | 'partly' | 'no'
export type ExtraKey = 'caffeine' | 'dinner' | 'closeToGod'

export interface Extras {
  caffeine?: true
  dinner?: true
  closeToGod?: true
  /** Private items logged, keyed by item id. Names live only in privateItems. */
  private?: Record<string, true>
}

export interface CheckIn {
  id?: number
  day: string
  block: Block
  /** The readings this check-in asked, fixed when it began. Older records mean the block's full set. */
  asked?: ReadingId[]
  /** When the check-in was first opened. */
  startedAt: string
  /** When the last asked reading was answered; null while any is missing. */
  completedAt: string | null
  updatedAt: string
  answers: Answers
  /** Time spent tapping, in ms; pauses longer than a minute are not counted. */
  activeMs: number
  extras?: Extras
}

export interface Win {
  id?: number
  /** The day the win is for. */
  forDay: string
  /** The day it was written, the evening before. */
  setOn: string
  text: string
  outcome: WinOutcome | null
  answeredAt: string | null
  updatedAt: string
}

export interface PrivateItem {
  id?: number
  name: string
  createdAt: string
  archived: 0 | 1
}

class LifeMirrorDB extends Dexie {
  checkins!: Table<CheckIn, number>
  settings!: Table<Settings, number>
  wins!: Table<Win, number>
  privateItems!: Table<PrivateItem, number>
  constructor() {
    super('life-mirror')
    this.version(1).stores({ checkins: '++id, &[day+block], day, completedAt' })
    this.version(2).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
    })
  }
}

export const db = new LifeMirrorDB()

export function askedOf(c: Pick<CheckIn, 'block' | 'asked'>): readonly ReadingId[] {
  return c.asked ?? blockReadings(c.block)
}

export function isComplete(c: Pick<CheckIn, 'block' | 'asked' | 'answers'>): boolean {
  return askedOf(c).every((id) => c.answers[id] !== undefined)
}

export function answeredCount(c: Pick<CheckIn, 'block' | 'asked' | 'answers'>): number {
  return askedOf(c).filter((id) => c.answers[id] !== undefined).length
}

/** The check-in for a slot, or null when none has been started. */
export async function getCheckIn(day: string, block: Block): Promise<CheckIn | null> {
  return (await db.checkins.where('[day+block]').equals([day, block]).first()) ?? null
}

function newCheckIn(slot: Slot, asked: readonly ReadingId[], now: string): CheckIn {
  return { day: slot.day, block: slot.block, asked: [...asked], startedAt: now, completedAt: null, updatedAt: now, answers: {}, activeMs: 0 }
}

export function saveAnswer(slot: Slot, asked: readonly ReadingId[], readingId: ReadingId, position: Position, activeMsDelta: number): Promise<CheckIn> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    rec.answers = { ...rec.answers, [readingId]: position }
    rec.activeMs += Math.max(0, Math.round(activeMsDelta))
    rec.updatedAt = now
    if (isComplete(rec)) rec.completedAt ??= now
    rec.id = await db.checkins.put(rec)
    return rec
  })
}

export function clearAnswer(slot: Slot, readingId: ReadingId): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const rec = await getCheckIn(slot.day, slot.block)
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

// Evening extras: recorded on the evening check-in, one tap each, only when tapped.

export function setExtra(slot: Slot, asked: readonly ReadingId[], key: ExtraKey, on: boolean): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    const extras: Extras = { ...(rec.extras ?? {}) }
    if (on) extras[key] = true
    else delete extras[key]
    rec.extras = extras
    rec.updatedAt = now
    rec.id = await db.checkins.put(rec)
  })
}

export function setPrivateLogged(slot: Slot, asked: readonly ReadingId[], itemId: number, on: boolean): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    const logged: Record<string, true> = { ...(rec.extras?.private ?? {}) }
    if (on) logged[String(itemId)] = true
    else delete logged[String(itemId)]
    rec.extras = { ...(rec.extras ?? {}), private: logged }
    rec.updatedAt = now
    rec.id = await db.checkins.put(rec)
  })
}

// Settings

export async function getSettings(): Promise<Settings> {
  return withDefaults(await db.settings.get(1))
}

export function updateSettings(change: (s: Settings) => Settings): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next: Settings = { ...change(await getSettings()), id: 1, updatedAt: new Date().toISOString() }
    await db.settings.put(next)
    return next
  })
}

export function markReminded(day: string, block: Block): Promise<Settings> {
  return updateSettings((s) => {
    const kept = Object.fromEntries(Object.entries(s.reminded).filter(([k]) => k.startsWith(day)))
    return { ...s, reminded: { ...kept, [remindedKey(day, block)]: true as const } }
  })
}

// Tomorrow's minimum win

export async function winFor(day: string): Promise<Win | null> {
  return (await db.wins.where('forDay').equals(day).first()) ?? null
}

/** Sets the one line for a day; an empty line removes it. */
export function setWin(forDay: string, setOn: string, text: string): Promise<void> {
  return db.transaction('rw', db.wins, async () => {
    const now = new Date().toISOString()
    const existing = await winFor(forDay)
    const trimmed = text.trim()
    if (!trimmed) {
      if (existing?.id !== undefined) await db.wins.delete(existing.id)
      return
    }
    if (existing) await db.wins.put({ ...existing, text: trimmed, updatedAt: now })
    else await db.wins.add({ forDay, setOn, text: trimmed, outcome: null, answeredAt: null, updatedAt: now })
  })
}

export function answerWin(forDay: string, outcome: WinOutcome | null): Promise<void> {
  return db.transaction('rw', db.wins, async () => {
    const existing = await winFor(forDay)
    if (!existing) return
    const now = new Date().toISOString()
    await db.wins.put({ ...existing, outcome, answeredAt: outcome ? now : null, updatedAt: now })
  })
}

// Private items: named here, measured like anything else, shown nowhere else unless chosen.

export function privateItems(): Promise<PrivateItem[]> {
  return db.privateItems.where('archived').equals(0).toArray()
}

export async function addPrivateItem(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.privateItems.add({ name: trimmed, createdAt: new Date().toISOString(), archived: 0 })
}

export async function archivePrivateItem(id: number): Promise<void> {
  await db.privateItems.update(id, { archived: 1 })
}

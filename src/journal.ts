import { db, JOURNAL_MAX, type JournalEntry } from './db'

// Let it out (agreed 2026-10-15): a night's free writing at the evening check-in, its own synced store,
// kept forever unless you delete an entry. While the cloud has not confirmed it, the second copy of
// every queued change keeps it too (pendingCopy). Never evidence: nothing here is read by the learning
// engine, and nothing in it becomes a reading, a fact or a finding.

/** The night's entry, or null before anything was written. */
export async function journalFor(day: string): Promise<JournalEntry | null> {
  return (await db.journal.where('day').equals(day).first()) ?? null
}

/**
 * Writes the night's entry, at most JOURNAL_MAX characters. The first save sets when it was written;
 * a later change, when it was edited. Blank words with no entry yet write nothing.
 */
export function saveJournal(day: string, text: string, now: Date = new Date()): Promise<JournalEntry | null> {
  const words = text.slice(0, JOURNAL_MAX)
  return db.transaction('rw', db.journal, async () => {
    const at = now.toISOString()
    const existing = await db.journal.where('day').equals(day).first()
    if (!existing) {
      if (!words.trim()) return null
      const entry: JournalEntry = { day, text: words, writtenAt: at, editedAt: null, updatedAt: at }
      entry.id = await db.journal.add(entry)
      return entry
    }
    if (existing.text === words) return existing
    await db.journal.update(existing.id as number, { text: words, editedAt: at, updatedAt: at })
    return { ...existing, text: words, editedAt: at, updatedAt: at }
  })
}

/** A past entry edited from Journal: when it was edited is kept beside when it was written. */
export function updateJournal(id: number, text: string, now: Date = new Date()): Promise<void> {
  const words = text.slice(0, JOURNAL_MAX)
  return db.transaction('rw', db.journal, async () => {
    const entry = await db.journal.get(id)
    if (!entry || entry.text === words) return
    const at = now.toISOString()
    await db.journal.update(id, { text: words, editedAt: at, updatedAt: at })
  })
}

/** An entry deleted, after you confirmed it: gone here, and from the cloud copy by the next sync. */
export function deleteJournal(id: number): Promise<void> {
  return db.journal.delete(id)
}

/** Every entry with words in it, newest night first. */
export async function allJournal(): Promise<JournalEntry[]> {
  return (await db.journal.toArray())
    .filter((e) => e.text.trim())
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.writtenAt < b.writtenAt ? 1 : -1))
}

/** The entries holding every word searched for, any case; all of them when nothing is searched. On the phone alone. */
export function searchJournal(entries: readonly JournalEntry[], query: string): JournalEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...entries]
  return entries.filter((e) => {
    const text = e.text.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

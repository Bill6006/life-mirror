import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SYNCED_STORES } from './cloudOutbox'
import { db, JOURNAL_MAX } from './db'
import { allJournal, deleteJournal, journalFor, saveJournal, searchJournal, updateJournal } from './journal'

// Let it out (agreed 2026-10-15): the night's writing, its own synced store, kept until you delete it.

const NIGHT = '2026-10-16'
const at = (h: number, m = 0) => new Date(2026, 9, 16, h, m)

describe('the journal', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('keeps the night’s words with when they were written, and when they were edited', async () => {
    expect(await saveJournal(NIGHT, '   ', at(21))).toBeNull()
    expect(await journalFor(NIGHT)).toBeNull()
    await saveJournal(NIGHT, 'A long day.', at(21))
    expect(await journalFor(NIGHT)).toMatchObject({ day: NIGHT, text: 'A long day.', writtenAt: at(21).toISOString(), editedAt: null })
    // The same words again change nothing; new words are an edit.
    await saveJournal(NIGHT, 'A long day.', at(21, 5))
    expect((await journalFor(NIGHT))?.editedAt).toBeNull()
    await saveJournal(NIGHT, 'A long day. A better evening.', at(21, 10))
    expect(await journalFor(NIGHT)).toMatchObject({ text: 'A long day. A better evening.', writtenAt: at(21).toISOString(), editedAt: at(21, 10).toISOString() })
    expect(await db.journal.count()).toBe(1)
  })

  it('holds a generous night, never more than its limit', async () => {
    await saveJournal(NIGHT, 'x'.repeat(JOURNAL_MAX + 500), at(22))
    expect((await journalFor(NIGHT))?.text.length).toBe(JOURNAL_MAX)
    expect(JOURNAL_MAX).toBeGreaterThanOrEqual(10_000)
  })

  it('syncs as its own store, so every change is queued for the cloud and its second copy', async () => {
    expect(SYNCED_STORES).toContain('journal')
    await saveJournal(NIGHT, 'Queued.', at(21))
    const queued = (await db.outbox.toArray()).filter((r) => r.store === 'journal')
    expect(queued).toHaveLength(1)
    expect(JSON.parse(queued[0].body as string)).toMatchObject({ day: NIGHT, text: 'Queued.' })
  })

  it('reads back newest night first, edits and deletes an entry, and leaves out one emptied', async () => {
    await saveJournal('2026-10-14', 'The first night.', new Date(2026, 9, 14, 21))
    await saveJournal('2026-10-15', 'The second night.', new Date(2026, 9, 15, 21))
    await saveJournal(NIGHT, 'Tonight.', at(21))
    expect((await allJournal()).map((e) => e.day)).toEqual([NIGHT, '2026-10-15', '2026-10-14'])
    const second = (await allJournal()).find((e) => e.day === '2026-10-15')
    await updateJournal(second?.id as number, 'The second night, read again.', at(22))
    expect(await journalFor('2026-10-15')).toMatchObject({ text: 'The second night, read again.', editedAt: at(22).toISOString() })
    await deleteJournal(second?.id as number)
    expect((await allJournal()).map((e) => e.day)).toEqual([NIGHT, '2026-10-14'])
    await saveJournal(NIGHT, '', at(23))
    expect((await allJournal()).map((e) => e.day)).toEqual(['2026-10-14'])
  })

  it('finds the entries holding every word searched for, any case', async () => {
    await saveJournal('2026-10-14', 'Work was heavy; the walk helped.', new Date(2026, 9, 14, 21))
    await saveJournal('2026-10-15', 'A quiet evening at home.', new Date(2026, 9, 15, 21))
    const all = await allJournal()
    expect(searchJournal(all, '').length).toBe(2)
    expect(searchJournal(all, 'WALK').map((e) => e.day)).toEqual(['2026-10-14'])
    expect(searchJournal(all, 'evening home').map((e) => e.day)).toEqual(['2026-10-15'])
    expect(searchJournal(all, 'walk home')).toEqual([])
  })
})

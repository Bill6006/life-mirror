import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepairEvidence, TestShown } from '../repair/evidence'

// Ask Life Mirror's record on the phone (stage A1, 2026-10-19): a thread from a starter, from "Ask about this" or from a
// typed question; the last read a new one compares against; asking again; cancelling a waiting question; deleting a
// thread whole; the list newest first; and search over questions and answers. The repair's read is stood in.

let ev: RepairEvidence
vi.mock('../repair/evidence', async (original) => ({ ...(await original<typeof import('../repair/evidence')>()), repairEvidence: async () => ev }))

const { db } = await import('../db')
const { allThreads, askAbout, askAgain, askStarter, askTyped, cancelTurn, deleteThread, lastRead, searchThreads } = await import('./flow')

const test_ = (over: Partial<TestShown>): TestShown => ({ key: 'walk-ten|mood|nextBlock', moveId: 'walk-ten', target: 'mood', window: 'nextBlock', level: 'likely', direction: 'helps', revised: false, belief: 0.3, theta: 0.4, lo: 0.1, hi: 0.7, offered: 6, heldBack: 5, days: 11, ctx: [], running: true, began: '2026-10-01', ...over })
const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m)

describe('Ask Life Mirror on the phone', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    ev = { shown: [test_({})], quiet: [], track: [], helps: [], nearest: [], waiting: [] }
  })

  it('answers a starter at once in a new thread, and keeps it as the last read', async () => {
    expect(await lastRead()).toBeNull()
    const id = await askStarter('know', at(9))
    expect(id).not.toBeNull()
    const [whole] = await allThreads()
    expect(whole.thread).toMatchObject({ title: 'What do you know about me so far?', from: { kind: 'starter', starter: 'know' }, day: '2026-10-19' })
    expect(whole.turns).toHaveLength(1)
    expect(whole.turns[0]).toMatchObject({ tier: 'quick', state: 'answered', kind: 'know', cited: [{ key: 'walk-ten|mood|nextBlock', level: 'likely', direction: 'helps' }] })
    expect(whole.turns[0].quick?.sections.length).toBeGreaterThan(0)
    expect(await lastRead()).toMatchObject({ day: '2026-10-19', cited: [{ key: 'walk-ten|mood|nextBlock' }] })
  })

  it('compares a new read against the last "What do you know" or "What’s changed", never a "What should we test next"', async () => {
    await askStarter('know', at(9))
    ev = { ...ev, shown: [test_({ level: 'established' })] }
    await askStarter('next', at(10))
    expect(await lastRead()).toMatchObject({ cited: [{ key: 'walk-ten|mood|nextBlock', level: 'likely' }] })
  })

  it('opens the next read with what changed since the last, and asks again in the same thread', async () => {
    const id = (await askStarter('know', at(9))) as number
    ev = { ...ev, shown: [test_({ level: 'established' })] }
    await askStarter('know', at(10))
    const [newest] = await allThreads()
    expect(newest.turns[0].quick?.sections[0].lines[0]).toBe('A ten-minute walk, now, for Mood: Likely: helps → Established: helps')
    const first = (await allThreads()).find((w) => w.thread.id === id) as Awaited<ReturnType<typeof allThreads>>[number]
    expect(await askAgain(first.turns[0].id as number, at(11))).toBe(true)
    const again = (await allThreads()).find((w) => w.thread.id === id) as Awaited<ReturnType<typeof allThreads>>[number]
    expect(again.turns.map((t) => t.kind)).toEqual(['know', 'know'])
    expect(again.turns[1].cited[0].level).toBe('established')
  })

  it('asks about a finding in a new thread with it attached', async () => {
    await askAbout({ keys: ['walk-ten|mood|nextBlock'] }, 'evidence', 'About A ten-minute walk, now', at(9))
    const [whole] = await allThreads()
    expect(whole.thread.from).toEqual({ kind: 'about', source: 'evidence', keys: ['walk-ten|mood|nextBlock'] })
    expect(whole.turns[0]).toMatchObject({ kind: 'about', keys: ['walk-ten|mood|nextBlock'], state: 'answered' })
    // From the Brain card: the tests the line's ladder facts name.
    await askAbout({ factIds: ['week.today', 'ladder.walk-ten.mood'] }, 'brain', 'About the day’s line', at(10))
    const [brain] = await allThreads()
    expect(brain.thread.from).toEqual({ kind: 'about', source: 'brain', keys: ['walk-ten|mood|nextBlock'] })
  })

  it('keeps a typed question waiting, takes a follow-up in its thread, and cancels one still waiting', async () => {
    expect(await askTyped('   ', null, at(9))).toBeNull()
    const id = (await askTyped('Does walking help my mood?', null, at(9))) as number
    await askTyped('And in the evening?', id, at(9, 5))
    const [whole] = await allThreads()
    expect(whole.thread).toMatchObject({ title: 'Does walking help my mood?', from: { kind: 'typed' } })
    expect(whole.turns.map((t) => [t.question, t.state, t.tier])).toEqual([
      ['Does walking help my mood?', 'waiting', 'standard'],
      ['And in the evening?', 'waiting', 'standard'],
    ])
    await cancelTurn(whole.turns[1].id as number, at(9, 6))
    expect((await db.askTurns.get(whole.turns[1].id as number))?.state).toBe('cancelled')
    // An answered turn is never cancelled.
    const starter = (await askStarter('next', at(10))) as number
    const [answered] = await db.askTurns.where('threadId').equals(starter).toArray()
    await cancelTurn(answered.id as number, at(10, 1))
    expect((await db.askTurns.get(answered.id as number))?.state).toBe('answered')
  })

  it('deletes a thread whole, and lists the rest newest first, searchable over questions and answers', async () => {
    const a = (await askStarter('know', at(9))) as number
    const b = (await askTyped('Does walking help my mood?', null, at(10))) as number
    await askStarter('next', at(11))
    const list = await allThreads()
    expect(list.map((w) => w.thread.title)).toEqual(['What should we test next?', 'Does walking help my mood?', 'What do you know about me so far?'])
    expect(searchThreads(list, 'walking').map((w) => w.thread.id)).toEqual([b])
    expect(searchThreads(list, 'ten-minute walk').map((w) => w.thread.id).sort()).toEqual([(list[0].thread.id as number), a].sort())
    expect(searchThreads(list, '')).toHaveLength(3)
    const turnKeys = (await db.askTurns.where('threadId').equals(a).primaryKeys()).map(String)
    expect(turnKeys).toHaveLength(1)
    await deleteThread(a)
    expect(await db.askTurns.where('threadId').equals(a).count()).toBe(0)
    expect((await allThreads()).map((w) => w.thread.id)).not.toContain(a)
    // Gone from the cloud copy too: a tombstone for the thread and for each of its turns.
    const tombs = (await db.outbox.toArray()).filter((r) => r.op === 'delete')
    expect(tombs.filter((r) => r.store === 'askThreads').map((r) => r.key)).toEqual([String(a)])
    expect(tombs.filter((r) => r.store === 'askTurns').map((r) => r.key)).toEqual(turnKeys)
  })

  it('answers nothing when the record cannot be read, and writes nothing', async () => {
    ev = undefined as unknown as RepairEvidence
    vi.spyOn(await import('../repair/evidence'), 'repairEvidence').mockRejectedValueOnce(new TypeError('a stand-in for a record no test foresaw'))
    expect(await askStarter('know', at(9))).toBeNull()
    expect(await db.askThreads.count()).toBe(0)
  })
})

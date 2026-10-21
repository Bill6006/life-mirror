import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepairEvidence, TestShown } from '../repair/evidence'

// Ask Life Mirror's record on the phone (stage A1, 2026-10-19): a thread from a starter, from "Ask about this" or from a
// typed question; the last read a new one compares against; asking again; cancelling a waiting question; deleting a
// thread whole; the list newest first; and search over questions and answers. The repair's read is stood in.

let ev: RepairEvidence
vi.mock('../repair/evidence', async (original) => ({ ...(await original<typeof import('../repair/evidence')>()), repairEvidence: async () => ev }))

const { db, updateSettings } = await import('../db')
const { allThreads, askAbout, askAgain, askAllowance, askDeep, askExplain, askSooner, askStarter, askTyped, askWaits, cancelTurn, deleteThread, keepNote, lastRead, reachedAny, removeNote, searchThreads, settleAskTurns, testOfTurn } = await import('./flow')
const { repairRecord } = await import('../repair/flow')
const { answerIdOf, askQueue, askTaskIds, deepTaskId } = await import('./shared')

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

  it('asks the deep tier in a thread of its own, and "Explain this to me" in the thread of the answer it explains (stage A2)', async () => {
    const deep = await askDeep(at(9), { sheet: false })
    const [whole] = await allThreads()
    expect(whole.thread).toMatchObject({ id: deep, title: 'Coach me on everything', from: { kind: 'starter', starter: 'deep' } })
    expect(whole.turns[0]).toMatchObject({ tier: 'deep', kind: 'deep', state: 'waiting' })
    const know = (await askStarter('know', at(10))) as number
    await askExplain(know, at(10, 5), { sheet: false })
    const thread = (await allThreads()).find((w) => w.thread.id === know) as Awaited<ReturnType<typeof allThreads>>[number]
    expect(thread.turns.map((t) => [t.kind, t.tier, t.state, t.question])).toEqual([
      ['know', 'quick', 'answered', 'What do you know about me so far?'],
      ['typed', 'standard', 'waiting', 'Explain this to me.'],
    ])
  })

  it('writes the day’s sheet again as a question for Claude is asked, so its run reads the evidence as it stood', async () => {
    await askTyped('Does walking help my mood?', null, at(9))
    expect(await db.facts.get('2026-10-19')).toBeDefined()
  })

  it('marks a waiting question answered once Claude’s answer comes, with the findings it cited as the read holds them', async () => {
    const thread = (await askTyped('Does walking help my mood?', null, at(9), { sheet: false })) as number
    const [turn] = await db.askTurns.where('threadId').equals(thread).toArray()
    expect(await settleAskTurns(at(9, 30))).toBe(0)
    await db.askAnswers.put({ id: answerIdOf(turn.id as number), turnId: turn.id as number, threadId: thread, day: '2026-10-19', at: at(9, 20).toISOString(), status: 'answered', text: 'A walk likely helps your mood.', factIds: ['ladder.walk-ten.mood', 'week.today'] })
    expect(await settleAskTurns(at(9, 30))).toBe(1)
    expect(await db.askTurns.get(turn.id as number)).toMatchObject({ state: 'answered', cited: [{ key: 'walk-ten|mood|nextBlock', level: 'likely', direction: 'helps' }] })
    // Once marked, nothing more to do.
    expect(await settleAskTurns(at(9, 40))).toBe(0)
  })

  it('says where each waiting question stands, and the day’s allowance only with a cloud copy', async () => {
    const thread = (await askTyped('Does walking help my mood?', null, at(9), { sheet: false })) as number
    const [turn] = await db.askTurns.where('threadId').equals(thread).toArray()
    expect((await askWaits(at(9, 1))).get(turn.id as number)).toEqual({ kind: 'cloud' })
    expect(await askAllowance(at(9, 1))).toBeNull()
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: 'a stand-in token' } }))
    await db.askRuns.put({ id: askTaskIds('2026-10-19')[0], task: 'ask', day: '2026-10-19', at: at(9, 2).toISOString(), status: 'fired', firedAt: at(9, 2).toISOString(), turns: [turn.id as number] })
    // Two answers left: room for the deep tier, which counts two (2026-10-21).
    expect(await askAllowance(at(9, 3))).toEqual({ left: 2, of: 3, deep: true })
    expect((await askWaits(at(9, 3))).get(turn.id as number)?.kind).not.toBe('cloud')
    expect(reachedAny([turn.id as number], [], await db.askRuns.toArray())).toBe(true)
    expect(reachedAny([turn.id as number + 1], [], await db.askRuns.toArray())).toBe(false)
  })

  it('says the units left and each question’s state from the Worker’s own queue, a question asked taking its units at once (item 1 of 2026-10-21)', async () => {
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: 'a stand-in token' } }))
    expect(await askAllowance(at(5))).toEqual({ left: 3, of: 3, deep: true })
    const first = (await askTyped('So far, what do you know about me?', null, at(5, 1), { sheet: false })) as number
    // Asked, not yet run: its unit is taken at once.
    expect(await askAllowance(at(5, 2))).toEqual({ left: 2, of: 3, deep: true })
    await askDeep(at(5, 3), { sheet: false })
    expect(await askAllowance(at(5, 4))).toEqual({ left: 0, of: 3, deep: false })
    const turns = (await db.askTurns.toArray()).sort((a, b) => (a.at < b.at ? -1 : 1))
    const waits = await askWaits(at(5, 4))
    expect([...waits.values()].map((w) => w.kind)).toEqual(['soon', 'soon'])
    // The Worker's queue on the same questions and runs: the same count, the same states.
    const queue = askQueue(turns.map((t) => ({ id: t.id as number, tier: t.tier, day: t.day })), await db.askRuns.toArray(), '2026-10-19')
    expect(queue).toEqual({ taken: turns.map((t) => t.id as number), tomorrow: [], left: 0, deep: false })
    // A fourth question finds no unit left today: tomorrow, as the Worker's queue says, though no run has used any yet.
    const fourth = (await askTyped('Does a nap help my afternoons?', null, at(5, 4), { sheet: false })) as number
    const [fourthTurn] = await db.askTurns.where('threadId').equals(fourth).toArray()
    expect((await askWaits(at(5, 4))).get(fourthTurn.id as number)).toEqual({ kind: 'tomorrow' })
    // The deep tier already ran today: a deep question waits for tomorrow, and the standard one is still next.
    await db.askRuns.put({ id: deepTaskId('2026-10-19'), task: 'deep', day: '2026-10-19', at: at(4).toISOString(), status: 'written', firedAt: at(4).toISOString(), turns: [999] })
    const after = await askWaits(at(5, 5))
    expect(after.get(turns.find((t) => t.tier === 'deep')?.id as number)).toEqual({ kind: 'tomorrow' })
    expect(after.get(first === null ? -1 : (turns.find((t) => t.tier !== 'deep')?.id as number))).toEqual({ kind: 'soon' })
    expect(await askAllowance(at(5, 5))).toEqual({ left: 0, of: 3, deep: false })
  })

  it('marks the one test a question names by both its move and its reading, and only that, for the queue (stage A3)', async () => {
    const named = (await askTyped('Does walking help my mood?', null, at(9), { sheet: false })) as number
    expect((await db.askTurns.where('threadId').equals(named).first())?.asked).toEqual([{ key: 'walk-ten|mood|nextBlock', day: '2026-10-19' }])
    // A move alone, or a reading alone, names no test.
    const vague = (await askTyped('Does walking help?', null, at(9, 5), { sheet: false })) as number
    expect((await db.askTurns.where('threadId').equals(vague).first())?.asked).toBeUndefined()
    // "Ask about this" attaches one test: it is asked about too.
    await askAbout({ keys: ['walk-ten|mood|nextBlock'] }, 'evidence', 'About A ten-minute walk, now', at(10))
    const [about] = await allThreads()
    expect(about.turns[0].asked).toEqual([{ key: 'walk-ten|mood|nextBlock', day: '2026-10-19' }])
    // Only keys and days reach the engine's record, never a question.
    const r = await repairRecord()
    expect(r.asked).toEqual([{ key: 'walk-ten|mood|nextBlock', day: '2026-10-19' }, { key: 'walk-ten|mood|nextBlock', day: '2026-10-19' }])
    expect(JSON.stringify(r)).not.toContain('Does walking help')
  })

  it('marks nothing for a question naming two tests, "Ask about this" attaching two, or a test already established (stage A3)', async () => {
    ev = { ...ev, shown: [test_({}), test_({ key: 'walk-ten|energy|nextBlock', target: 'energy' })] }
    const two = (await askTyped('Does walking help my mood or my energy?', null, at(9), { sheet: false })) as number
    expect((await db.askTurns.where('threadId').equals(two).first())?.asked).toBeUndefined()
    await askAbout({ keys: ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock'] }, 'brain', 'About the day’s line', at(10))
    // A test the read no longer shows is asked about in name only.
    await askAbout({ keys: ['nap-ten|focus|nextBlock'] }, 'evidence', 'About a test no longer shown', at(10, 30))
    expect((await db.askTurns.toArray()).flatMap((t) => t.asked ?? [])).toEqual([])
    ev = { ...ev, shown: [test_({ level: 'established' })] }
    const done = (await askTyped('Does walking help my mood?', null, at(11), { sheet: false })) as number
    expect((await db.askTurns.where('threadId').equals(done).first())?.asked).toBeUndefined()
  })

  it('marks no test over seven days, which never waits in the queue; its card still opens (stage A3)', async () => {
    ev = { ...ev, shown: [test_({ key: 'cancel-one-thing|stress|sevenDays', moveId: 'cancel-one-thing', target: 'stress', window: 'sevenDays' })] }
    const thread = (await askTyped('Does cancelling a subscription help my stress?', null, at(9), { sheet: false })) as number
    const [turn] = await db.askTurns.where('threadId').equals(thread).toArray()
    expect(testOfTurn(turn, undefined, ev)?.key).toBe('cancel-one-thing|stress|sevenDays')
    expect(turn.asked).toBeUndefined()
  })

  it('"Test it" names the test a turn asks about, short of established; "Test it sooner" marks it once a day (stage A3)', async () => {
    const thread = (await askTyped('Does walking help my mood?', null, at(9), { sheet: false })) as number
    const [turn] = await db.askTurns.where('threadId').equals(thread).toArray()
    expect(testOfTurn(turn, undefined, ev)?.key).toBe('walk-ten|mood|nextBlock')
    expect(testOfTurn(turn, undefined, { ...ev, shown: [test_({ level: 'established' })] })).toBeNull()
    // The answer's own test comes first, before the one the question names.
    const both = { ...ev, shown: [test_({}), test_({ key: 'walk-ten|energy|nextBlock', target: 'energy' })] }
    expect(testOfTurn(turn, { test: 'walk-ten|energy|nextBlock' }, both)?.key).toBe('walk-ten|energy|nextBlock')
    expect(testOfTurn({ ...turn, question: 'Anything?' }, { test: 'walk-ten|mood|nextBlock' }, ev)?.key).toBe('walk-ten|mood|nextBlock')
    // "Ask about this" offers a card for the one test it attaches, and only a typed question's words name one.
    expect(testOfTurn({ kind: 'about', keys: ['walk-ten|mood|nextBlock'], question: 'About it' }, undefined, both)?.key).toBe('walk-ten|mood|nextBlock')
    expect(testOfTurn({ kind: 'about', keys: ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock'], question: 'About A ten-minute walk, now, for Mood' }, undefined, both)).toBeNull()
    await askSooner(turn.id as number, 'walk-ten|mood|nextBlock', at(12))
    await askSooner(turn.id as number, 'walk-ten|mood|nextBlock', at(13))
    expect((await db.askTurns.get(turn.id as number))?.asked).toEqual([{ key: 'walk-ten|mood|nextBlock', day: '2026-10-19' }])
    await askSooner(turn.id as number, 'walk-ten|mood|nextBlock', new Date(2026, 9, 20, 9))
    expect((await db.askTurns.get(turn.id as number))?.asked).toHaveLength(2)
  })

  it('keeps a note in the owner’s own words, of today, from Ask; nothing for no words (stage A3)', async () => {
    const thread = (await askTyped('The neighbours had a party until two.', null, at(9), { sheet: false })) as number
    const [turn] = await db.askTurns.where('threadId').equals(thread).toArray()
    expect(await keepNote(turn.id as number, '   ', at(9, 5))).toBeNull()
    const id = (await keepNote(turn.id as number, ' The neighbours had a party until two. ', at(9, 5))) as number
    expect(await db.notes.get(id)).toMatchObject({ day: '2026-10-19', text: 'The neighbours had a party until two.', from: 'ask', turnId: turn.id })
    // Deleting the conversation keeps what was made from it ("Anything you made from it stays").
    await deleteThread(thread)
    expect(await db.notes.get(id)).toMatchObject({ text: 'The neighbours had a party until two.' })
    // Removed at the owner's tap: gone from this phone, and a tombstone for the cloud copy.
    await removeNote(id)
    expect(await db.notes.get(id)).toBeUndefined()
    expect((await db.outbox.toArray()).filter((r) => r.op === 'delete' && r.store === 'notes').map((r) => r.key)).toEqual([String(id)])
  })

  it('answers nothing when the record cannot be read, and writes nothing', async () => {
    ev = undefined as unknown as RepairEvidence
    vi.spyOn(await import('../repair/evidence'), 'repairEvidence').mockRejectedValueOnce(new TypeError('a stand-in for a record no test foresaw'))
    expect(await askStarter('know', at(9))).toBeNull()
    expect(await db.askThreads.count()).toBe(0)
  })
})

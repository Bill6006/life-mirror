import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP, markSilent, type OutboxRow } from './cloudOutbox'
import { memoryStore, notNullBody, type CloudRow, type CloudStore, type MemoryStore } from './cloudStore'
import { getMeta, putBackPending, refusedByCloud, resetCloudForTests, restartPull, setOnlineCheck, setStoreFactory, syncNow, TOMBSTONE_BODY, toCloudRow } from './cloudSync'
import { db, ensureDayContext, getSettings, saveAnswer, setDayContext, setWin, updateSettings, wipeEverything, type Offer } from './db'
import type { Block } from './blocks'
import { moves } from './catalogue'
import { answerPassive, deleteOutcome, pendingOffers, recordDoneNow } from './offerFlow'
import { clearPending, fitPending, keepQueued, PENDING_CAP, PENDING_KEY, pendingRows, readPending } from './pendingCopy'
import { blockReadings, type Position } from './readings'
import { memoryKeyValue, readLog, setTokenStorageForTests, type KeyValue } from './tokenVault'

// Sync safety (2026-10-02, second part). On a phone, one queued deletion went to the cloud with no
// body; the cloud's table refuses that, the whole batch with it, and every upload after it waited
// behind. Hours later the browser cleared the app's database and took the waiting changes with it: a
// move answered Done on its card, and what rode alongside it. Each part is played out here with
// made-up records: the deletion the table takes, one refused row that holds back nothing else, and
// the second copy beside the token that puts back what a cleared database lost before the cloud had
// it. Every token here is made up and never reaches a network.

const TOKEN = 'test-token-never-real'
let kv: KeyValue

/** The phone's browser clears the database. Local storage (the token's second copy, the floors, the queue's second copy) stays. */
async function clearDatabase(): Promise<void> {
  await db.delete()
  await db.open()
  resetCloudForTests()
}

/** The second copy is written when the database commits; one turn of the event loop sees it. */
const settled = () => new Promise((r) => setTimeout(r, 0))

async function checkIn(day: string, block: Block, value: Position): Promise<void> {
  const asked = blockReadings(block)
  for (const id of asked) await saveAnswer({ day, block }, asked, id, value, 500)
}

async function connect(store: CloudStore): Promise<void> {
  setStoreFactory(async () => store)
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
}

const rows = (store: MemoryStore, name: string): CloudRow[] => [...store.rows.values()].filter((r) => r.app === APP && r.store === name)

/** A store that refuses the rows a test names, one at a time or in a batch, as the live table refuses a row. */
function refusing(inner: MemoryStore, refuse: (r: CloudRow) => boolean): CloudStore & { tries: number } {
  const s = {
    ...inner,
    tries: 0,
    async upsert(batch: readonly CloudRow[]) {
      s.tries++
      if (batch.some(refuse)) throw notNullBody()
      return inner.upsert(batch)
    },
  }
  return s
}

const move = moves.find((m) => m.minutes === 5) ?? moves[0]
const DAY = '2026-03-12'
const OFFERED = new Date(2026, 2, 12, 14, 0)

function offeredMove(): Offer {
  return { kind: 'block', day: DAY, block: 'afternoon', at: OFFERED.toISOString(), situationKey: 'afternoon:energy', target: 'energy', stance: 'Stabilize', band: 'gettingBy', reading: 50, moveId: move.id, cardId: null, candidates: [move.id], coinFlip: false, passiveId: 'caffeine-cutoff', whyNot: null, skippedAt: null, closedAt: null }
}

beforeEach(async () => {
  kv = memoryKeyValue()
  setTokenStorageForTests(kv)
  await clearDatabase()
})

afterEach(() => {
  setStoreFactory(null)
  setOnlineCheck(null)
  setTokenStorageForTests(null)
})

describe('a deletion the cloud takes', () => {
  it('goes up as a tombstone with an empty body the table accepts, and what was queued with it goes up too', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-10', 'morning', 3)
    await setWin('2026-03-11', '2026-03-10', 'One line')
    expect(await syncNow()).toBe('done')
    // The win taken back: a deletion queued behind it, then more of the day.
    await setWin('2026-03-11', '2026-03-10', '')
    await checkIn('2026-03-10', 'afternoon', 4)
    expect((await db.outbox.toArray()).some((r) => r.op === 'delete' && r.body === null)).toBe(true)
    expect(await syncNow()).toBe('done')
    const win = rows(store, 'wins')[0]
    expect(win).toMatchObject({ deleted: 1, body: TOMBSTONE_BODY })
    expect(JSON.parse(win.body as string)).toEqual({})
    expect(rows(store, 'checkins').filter((r) => !r.deleted)).toHaveLength(2)
    expect(await db.outbox.count()).toBe(0)
    expect((await getMeta()).lastError).toBeNull()
  })

  it('as the phone sent it, with no body, the table refuses the deletion and the whole batch with it; with the body, it takes both', async () => {
    const store = memoryStore()
    await connect(store)
    await setWin('2026-03-11', '2026-03-10', 'One line')
    expect(await syncNow()).toBe('done')
    await setWin('2026-03-11', '2026-03-10', '')
    await checkIn('2026-03-10', 'morning', 3)
    const queued = await db.outbox.toArray()
    const tomb = toCloudRow(queued.find((r) => r.op === 'delete') as OutboxRow, 'p', '2026-03-10T10:00:00.000Z')
    const other = toCloudRow(queued.find((r) => r.store === 'checkins') as OutboxRow, 'p', '2026-03-10T10:00:00.001Z')
    // The deletion as the earlier version sent it: refused, and the check-in beside it with it.
    await expect(store.upsert([other, { ...tomb, body: null }])).rejects.toThrow('NOT NULL constraint failed: records.body')
    expect(rows(store, 'checkins')).toHaveLength(0)
    await store.upsert([other, tomb])
    expect(rows(store, 'checkins')).toHaveLength(1)
    expect(rows(store, 'wins')[0]).toMatchObject({ deleted: 1, body: '{}' })
  })
})

describe('a deletion right after a push', () => {
  it('an answer deleted in History just after it went up stays deleted: the next pull reads the phone’s own row again and does not bring it back', async () => {
    const store = memoryStore()
    await connect(store)
    const id = (await db.offers.add(offeredMove())) as number
    await recordDoneNow((await db.offers.get(id)) as Offer, new Date(2026, 2, 12, 14, 40))
    expect(await syncNow()).toBe('done')
    // The watermark still sits before the rows just pushed: the next pull reads them again.
    const answer = (await db.outcomes.toArray())[0]
    await deleteOutcome(answer)
    expect(await syncNow()).toBe('done')
    expect(await db.outcomes.count()).toBe(0)
    expect(rows(store, 'outcomes')[0]).toMatchObject({ deleted: 1, body: TOMBSTONE_BODY })
    // And once more: the tombstone read back changes nothing.
    expect(await syncNow()).toBe('done')
    expect(await db.outcomes.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('a record lost from the phone with no deletion still comes back on a full pull', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-10', 'morning', 3)
    expect(await syncNow()).toBe('done')
    await db.transaction('rw', [db.checkins, db.outbox], async () => {
      markSilent()
      await db.checkins.clear()
    })
    await restartPull()
    expect(await syncNow()).toBe('done')
    expect(await db.checkins.count()).toBe(1)
  })
})

describe('one refused row holds back nothing else', () => {
  it('sends the rest, keeps the refused row queued with every change to its record, says so, and sends it once the cloud takes it', async () => {
    const inner = memoryStore()
    let refuse = true
    const store = refusing(inner, (r) => refuse && r.store === 'wins')
    await connect(store)
    await checkIn('2026-03-10', 'morning', 3)
    await setWin('2026-03-11', '2026-03-10', 'One line')
    await setWin('2026-03-11', '2026-03-10', 'One line, kept')
    await checkIn('2026-03-10', 'evening', 2)
    expect(await syncNow()).toBe('failed')
    // Everything but the win went through; the win's two changes wait, in order.
    expect(rows(inner, 'checkins')).toHaveLength(2)
    expect(rows(inner, 'settings')).toHaveLength(1)
    expect(rows(inner, 'wins')).toHaveLength(0)
    const left = await db.outbox.toArray()
    expect(left.map((r) => r.store)).toEqual(['wins', 'wins'])
    const meta = await getMeta()
    expect(meta.refused).toBe(1)
    expect(meta.lastError).toContain('NOT NULL constraint failed: records.body')
    // The phone's last sync is the last one that left nothing behind.
    expect(meta.lastSyncAt).toBeNull()
    expect(inner.devices.size).toBe(0)

    refuse = false
    resetCloudForTests()
    expect(await syncNow()).toBe('done')
    expect(JSON.parse(rows(inner, 'wins')[0].body as string).text).toBe('One line, kept')
    expect(await db.outbox.count()).toBe(0)
    const after = await getMeta()
    expect(after.refused).toBe(0)
    expect(after.lastError).toBeNull()
    expect(after.lastSyncAt).not.toBeNull()
  })

  it('more refused rows than one read of the queue still let every other row through, and the push ends', async () => {
    const inner = memoryStore()
    const store = refusing(inner, (r) => r.store === 'wins')
    await connect(store)
    const at = '2026-03-10T10:00:00.000Z'
    // Four hundred and fifty refused rows queued first: more than the push reads at once.
    await db.outbox.bulkAdd(Array.from({ length: 450 }, (_, i): OutboxRow => ({ store: 'wins', key: String(1000 + i), op: 'put', body: '{}', day: null, updatedAt: at, at })))
    await checkIn('2026-03-10', 'morning', 3)
    expect(await syncNow()).toBe('failed')
    expect(rows(inner, 'checkins')).toHaveLength(1)
    expect(await db.outbox.count()).toBe(450)
    expect((await getMeta()).refused).toBe(450)
  })

  it('a network that goes down is not a refusal: nothing is sent row by row, and the queue stays whole', async () => {
    const inner = memoryStore()
    let sends = 0
    const store: CloudStore = {
      ...inner,
      async upsert() {
        sends++
        throw new Error('Failed to fetch')
      },
    }
    await connect(store)
    await checkIn('2026-03-10', 'morning', 3)
    const queued = (await db.outbox.toArray()).map((r) => r.id)
    expect(await syncNow()).toBe('failed')
    expect(sends).toBe(1)
    // Every change queued before is still queued (the sync itself queues the phone's id beside them).
    const after = new Set((await db.outbox.toArray()).map((r) => r.id))
    expect(queued.every((id) => after.has(id))).toBe(true)
    const meta = await getMeta()
    expect(meta.refused).toBe(0)
    expect(meta.lastError).toBe('Failed to fetch')
    expect(refusedByCloud(new Error('Failed to fetch'))).toBe(false)
    expect(refusedByCloud(notNullBody())).toBe(true)
    expect(refusedByCloud(Object.assign(new Error('x'), { code: 'SQLITE_TOOBIG' }))).toBe(true)
  })
})

describe('the queue’s second copy, beside the token', () => {
  it('keeps each record’s latest queued change once the database has committed it, and lets it go once the cloud has it', async () => {
    await checkIn('2026-03-10', 'morning', 3)
    await setWin('2026-03-11', '2026-03-10', 'One line')
    await setWin('2026-03-11', '2026-03-10', 'One line, kept')
    await settled()
    const kept = pendingRows()
    expect(kept.filter((r) => r.store === 'checkins')).toHaveLength(1)
    const wins = kept.filter((r) => r.store === 'wins')
    expect(wins).toHaveLength(1)
    expect(JSON.parse(wins[0].body as string).text).toBe('One line, kept')
    // The same changes the queue holds, latest per record, and never the token.
    expect(kv.getItem(PENDING_KEY)).not.toContain(TOKEN)

    const store = memoryStore()
    await connect(store)
    expect(await syncNow()).toBe('done')
    await settled()
    expect(pendingRows()).toEqual([])
    expect(kv.getItem(PENDING_KEY)).toBeNull()
  })

  it('never keeps a change the database did not commit', async () => {
    await db
      .transaction('rw', db.wins, async () => {
        await db.wins.add({ forDay: '2026-03-11', loggedOn: '2026-03-10', text: 'Never kept', outcome: null } as never)
        throw new Error('stopped before the commit')
      })
      .catch(() => undefined)
    await settled()
    expect(await db.wins.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(pendingRows()).toEqual([])
  })

  it('takes in a queue made before it existed, so the phone’s waiting changes are kept from the first start', async () => {
    setTokenStorageForTests(null)
    await checkIn('2026-03-10', 'morning', 3)
    await setWin('2026-03-11', '2026-03-10', 'One line')
    setTokenStorageForTests(kv)
    await settled()
    expect(pendingRows()).toEqual([])
    const records = new Set((await db.outbox.toArray()).map((r) => `${r.store}|${r.key}`))
    expect(await keepQueued(db)).toBe(records.size)
    expect(new Set(pendingRows().map((r) => `${r.store}|${r.key}`))).toEqual(records)
    expect([...records].some((k) => k.startsWith('wins|'))).toBe(true)
    // Each record's latest change, and the ids known beside the token.
    expect(JSON.parse(pendingRows().find((r) => r.store === 'wins')?.body as string).text).toBe('One line')
    // Twice changes nothing.
    expect(await keepQueued(db)).toBe(0)
  })

  it('a change leaving the queue takes only its own kept copy: never a later change of the same record, never one at the same place after a clearing', async () => {
    const at = (m: number) => `2026-03-10T10:0${m}:00.000Z`
    const change = (key: string, text: string, m: number): OutboxRow => ({ store: 'wins', key, op: 'put', body: JSON.stringify({ text }), day: null, updatedAt: at(m), at: at(m) })
    const [first] = (await db.outbox.bulkAdd([change('1', 'First', 1)], { allKeys: true })) as number[]
    await db.outbox.add(change('1', 'Second', 2))
    await settled()
    expect(pendingRows().map((r) => JSON.parse(r.body as string).text)).toEqual(['Second'])
    // The earlier change leaves the queue (a push that read it before the later one came): the later one stays kept.
    await db.outbox.delete(first)
    await settled()
    expect(pendingRows().map((r) => JSON.parse(r.body as string).text)).toEqual(['Second'])

    // A cleared database counts the queue from one again: a new change at the same place, leaving, takes nothing kept from before.
    await clearDatabase()
    const fresh = (await db.outbox.add(change('7', 'New', 3))) as number
    expect(fresh).toBe(1)
    await db.outbox.delete(fresh)
    await settled()
    expect(pendingRows().map((r) => `${r.key}:${JSON.parse(r.body as string).text}`)).toEqual(['1:Second'])
  })

  it('stays within its cap: the use log and what the app derives give way first, and it says it is partial', () => {
    const at = '2026-03-10T10:00:00.000Z'
    const row = (store: string, key: string, size: number): OutboxRow => ({ store, key, op: 'put', body: JSON.stringify({ pad: 'x'.repeat(size) }), day: null, updatedAt: at, at })
    const copy = {
      rows: {
        'forecasts|1': { id: 1, row: row('forecasts', '1', 400) },
        'checkins|1': { id: 2, row: row('checkins', '1', 400) },
        'useLog|9': { id: 3, row: row('useLog', '9', 400) },
        'outcomes|4': { id: 4, row: row('outcomes', '4', 400) },
      },
    }
    expect(fitPending(copy, PENDING_CAP)).toBe(JSON.stringify(copy))
    const fitted = JSON.parse(fitPending(copy, 1300)) as { rows: Record<string, unknown>; partial: boolean }
    expect(Object.keys(fitted.rows).sort()).toEqual(['checkins|1', 'outcomes|4'])
    expect(fitted.partial).toBe(true)
    expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(1300)
    // Tighter still: the oldest of what you entered goes next.
    expect(Object.keys((JSON.parse(fitPending(copy, 800)) as { rows: Record<string, unknown> }).rows)).toEqual(['outcomes|4'])
  })

  it('the wipe leaves nothing kept, not even a kept change the queue no longer holds', async () => {
    await checkIn('2026-03-10', 'morning', 3)
    await settled()
    expect(pendingRows().length).toBeGreaterThan(0)
    // A change the copy kept after the queue let it go (its write to the copy did not go through).
    const copy = JSON.parse(kv.getItem(PENDING_KEY) as string) as { rows: Record<string, unknown> }
    const at = '2026-03-10T10:00:00.000Z'
    copy.rows['wins|9'] = { id: 999, row: { store: 'wins', key: '9', op: 'put', body: '{}', day: null, updatedAt: at, at } }
    kv.setItem(PENDING_KEY, JSON.stringify(copy))
    await wipeEverything()
    await settled()
    expect(kv.getItem(PENDING_KEY)).toBeNull()
    clearPending()
    expect(readPending()).toEqual({ rows: {} })
  })
})

describe('a cleared database before the cloud had everything', () => {
  it('gets back the move answered Done on its card, its alongside item still open, and the rest of the day, under their own ids; nothing else', async () => {
    const store = memoryStore()
    await connect(store)
    await checkIn(DAY, 'morning', 3)
    expect(await syncNow()).toBe('done')

    // The afternoon, while the cloud takes nothing (offline here; the refused deletion on the phone).
    setOnlineCheck(() => false)
    await checkIn(DAY, 'afternoon', 4)
    const id = (await db.offers.add(offeredMove())) as number
    const offer = (await db.offers.get(id)) as Offer
    expect(await recordDoneNow(offer, new Date(2026, 2, 12, 14, 40))).toBe(true)
    // Done on the move; the item alongside it is not answered yet, so the offer stays open for it.
    expect((await db.offers.get(id))?.closedAt).toBeNull()
    await setWin('2026-03-13', DAY, 'One line')
    await settled()
    const before = {
      offer: await db.offers.get(id),
      outcome: (await db.outcomes.toArray())[0],
      checkins: (await db.checkins.toArray()).map((c) => `${c.id}:${c.block}`),
      win: (await db.wins.toArray())[0],
    }
    expect(before.outcome).toMatchObject({ offerId: id, outcome: 'done', passiveOutcome: null })
    expect(rows(store, 'offers')).toHaveLength(0)

    await clearDatabase()
    setStoreFactory(async () => store)
    setOnlineCheck(() => true)
    expect(await db.offers.count()).toBe(0)
    expect(await syncNow()).toBe('done')

    // Back as they were, under the same ids, linked as they were.
    expect(await db.offers.get(id)).toEqual(before.offer)
    expect((await db.outcomes.toArray())[0]).toEqual(before.outcome)
    expect((await db.checkins.toArray()).map((c) => `${c.id}:${c.block}`)).toEqual(before.checkins)
    expect((await db.wins.toArray())[0]).toEqual(before.win)
    // And in the cloud now; nothing waits.
    expect(rows(store, 'offers').map((r) => r.id)).toEqual([String(id)])
    expect(rows(store, 'outcomes')).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
    await settled()
    expect(pendingRows()).toEqual([])
    // Said once, in the token log.
    expect(readLog().filter((e) => e.kind === 'restored').map((e) => e.detail).join(' ')).toMatch(/were put back from the phone’s second copy/)

    // The alongside item is still the open question, answered the same as before the clearing.
    const open = await pendingOffers()
    expect(open.map((o) => o.id)).toEqual([id])
    await answerPassive((await db.offers.get(id)) as Offer, 'done')
    expect((await db.outcomes.toArray())[0].passiveOutcome).toBe('done')
    expect(await pendingOffers()).toEqual([])

    // A second sync puts back nothing more.
    expect(await syncNow()).toBe('done')
    expect(await db.offers.count()).toBe(1)
    expect(await db.outcomes.count()).toBe(1)
  })

  it('a deletion that never reached the cloud is made again after the clearing, and goes up as a tombstone', async () => {
    const store = memoryStore()
    await connect(store)
    await setWin('2026-03-11', '2026-03-10', 'One line')
    expect(await syncNow()).toBe('done')
    setOnlineCheck(() => false)
    await setWin('2026-03-11', '2026-03-10', '')
    await settled()
    await clearDatabase()
    setStoreFactory(async () => store)
    setOnlineCheck(() => true)
    expect(await syncNow()).toBe('done')
    expect(await db.wins.count()).toBe(0)
    expect(rows(store, 'wins')[0]).toMatchObject({ deleted: 1, body: TOMBSTONE_BODY })
  })

  it('puts back nothing the cloud already holds as new, and never undoes a later change', async () => {
    const store = memoryStore()
    await connect(store)
    await setWin('2026-03-11', '2026-03-10', 'First')
    await settled()
    const stale = kv.getItem(PENDING_KEY) as string
    expect(await syncNow()).toBe('done')
    await setWin('2026-03-11', '2026-03-10', 'Second')
    expect(await syncNow()).toBe('done')
    // The copy missed the first change's leaving: it still says "First".
    kv.setItem(PENDING_KEY, stale)
    await clearDatabase()
    setStoreFactory(async () => store)
    expect(await syncNow()).toBe('done')
    expect((await db.wins.toArray()).map((w) => w.text)).toEqual(['Second'])
    expect(JSON.parse(rows(store, 'wins')[0].body as string).text).toBe('Second')
    expect(kv.getItem(PENDING_KEY)).toBeNull()
  })

  it('a change made again on the cleared phone before the restore keeps the later one, and the earlier is set aside, not lost', async () => {
    const store = memoryStore()
    await connect(store)
    expect(await syncNow()).toBe('done')
    setOnlineCheck(() => false)
    await checkIn(DAY, 'evening', 2)
    await settled()
    await clearDatabase()
    setStoreFactory(async () => store)
    // Entered again on the cleared phone before any sync: the same evening, a later time, a new id.
    await checkIn(DAY, 'evening', 4)
    setOnlineCheck(() => true)
    expect(await syncNow()).toBe('done')
    const evenings = await db.checkins.where('[day+block]').equals([DAY, 'evening']).toArray()
    expect(evenings).toHaveLength(1)
    expect(Object.values(evenings[0].answers).every((v) => v === 4)).toBe(true)
    // One evening in the cloud as on the phone; the earlier one kept aside there, whole.
    expect(rows(store, 'checkins').filter((r) => !r.deleted).map((r) => r.id)).toEqual([String(evenings[0].id)])
    const aside = [...store.rows.values()].filter((r) => r.store === 'superseded')
    expect(aside).toHaveLength(1)
    expect(JSON.parse(aside[0].body as string).body.answers).toBeDefined()
  })

  it('a record changed again on the cleared phone keeps that later change: what was kept from before never undoes it', async () => {
    const store = memoryStore()
    await connect(store)
    expect(await syncNow()).toBe('done')
    setOnlineCheck(() => false)
    await ensureDayContext(DAY, await getSettings())
    await setDayContext(DAY, { atOffice: true })
    await settled()
    expect(pendingRows().some((r) => r.store === 'days')).toBe(true)
    const before = kv.getItem(PENDING_KEY) as string
    await clearDatabase()
    setStoreFactory(async () => store)
    // On the cleared phone, before any sync: the day made again, and changed again.
    await ensureDayContext(DAY, await getSettings())
    await setDayContext(DAY, { atOffice: false })
    await settled()
    // Even where the copy still holds the change from before (a write to it that did not go through), the later one stands.
    kv.setItem(PENDING_KEY, before)
    setOnlineCheck(() => true)
    expect(await syncNow()).toBe('done')
    expect((await db.days.get(DAY))?.atOffice).toBe(false)
    expect(JSON.parse(rows(store, 'days')[0].body as string).atOffice).toBe(false)
  })

  it('without a second copy (no local storage) the sync runs as before', async () => {
    setTokenStorageForTests(null)
    const store = memoryStore()
    await connect(store)
    await checkIn(DAY, 'morning', 3)
    expect(await putBackPending()).toBe(0)
    expect(await syncNow()).toBe('done')
    expect(rows(store, 'checkins')).toHaveLength(1)
  })
})

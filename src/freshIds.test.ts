import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP } from './cloudOutbox'
import { memoryStore, type CloudRow, type CloudStore, type MemoryStore } from './cloudStore'
import { markInStepIfSynced, resetCloudForTests, setOnlineCheck, setStoreFactory, syncNow } from './cloudSync'
import { db, ensureDayContext, getSettings, saveAnswer, setDayContext, setWin, updateSettings, type Offer } from './db'
import type { Block } from './blocks'
import { moves } from './catalogue'
import { BASE_FLOOR, FRESH_BASE_KEY, freshBase, IN_STEP_KEY, inStep, markInStep } from './freshIds'
import { recordDoneNow } from './offerFlow'
import { blockReadings, type Position } from './readings'
import { memoryKeyValue, setTokenStorageForTests, type KeyValue } from './tokenVault'
import { logUse } from './useLog'

// Sync safety (2026-10-03). Clearing a site's data wipes the database and local storage together: the phone
// is a new install. What it records before the token is pasted must never be written over the cloud's
// records. On 2026-10-03 such a first sync wrote ten records over the cloud's under the same ids. Each part
// is played out here with made-up records. Every token here is made up and never reaches a network.

const TOKEN = 'test-token-never-real'
let kv: KeyValue

async function clearDatabase(): Promise<void> {
  await db.delete()
  await db.open()
  resetCloudForTests()
}

/** The site's data cleared: the database and everything beside it gone; the cloud stays. */
async function clearSiteData(): Promise<void> {
  kv = memoryKeyValue()
  setTokenStorageForTests(kv)
  await clearDatabase()
}

async function checkIn(day: string, block: Block, value: Position): Promise<void> {
  const asked = blockReadings(block)
  for (const id of asked) await saveAnswer({ day, block }, asked, id, value, 500)
}

async function connect(store: CloudStore): Promise<void> {
  setStoreFactory(async () => store)
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: TOKEN } }))
}

const move = moves.find((m) => m.minutes === 5) ?? moves[0]

/** A move offered in a block, then answered Done on its card. */
async function moveDone(day: string, hour: number): Promise<{ offerId: number; outcomeId: number }> {
  const [y, m, d] = day.split('-').map(Number)
  const at = new Date(y, m - 1, d, hour, 0)
  const offer: Offer = { kind: 'block', day, block: 'afternoon', at: at.toISOString(), situationKey: 'afternoon:energy', target: 'energy', stance: 'Stabilize', band: 'gettingBy', reading: 50, moveId: move.id, cardId: null, candidates: [move.id], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null }
  const offerId = (await db.offers.add(offer)) as number
  await recordDoneNow((await db.offers.get(offerId)) as Offer, new Date(at.getTime() + 40 * 60_000))
  const outcome = await db.outcomes.where('offerId').equals(offerId).first()
  return { offerId, outcomeId: outcome?.id as number }
}

async function brainLine(day: string): Promise<number> {
  return (await db.briefLog.add({ day, situationId: null, mode: 'observation', text: '', factIds: [], cardIds: [], at: `${day}T10:00:00.000Z` })) as number
}

const rowsOf = (store: MemoryStore): Map<string, CloudRow> => new Map([...store.rows].filter(([, r]) => r.app === APP && r.store !== 'settings').map(([k, r]) => [k, { ...r }]))
const ids = async (name: string): Promise<number[]> => (await db.table(name).toCollection().primaryKeys()) as number[]

beforeEach(async () => {
  await clearSiteData()
})

afterEach(() => {
  setStoreFactory(null)
  setOnlineCheck(null)
  setTokenStorageForTests(null)
})

describe('a new install used before its token is pasted', () => {
  it('never writes over the cloud: what it made keeps ids past the fresh base, its links intact, and the cloud’s records come back whole', async () => {
    // The phone as it was: in step with the cloud, its record synced.
    markInStep()
    const store = memoryStore()
    await connect(store)
    await checkIn('2026-03-10', 'morning', 3)
    await logUse('appOpened')
    await logUse('screen', 'now')
    await brainLine('2026-03-10')
    const before = await moveDone('2026-03-10', 14)
    expect(await syncNow()).toBe('done')
    const cloud = rowsOf(store)
    expect(before).toEqual({ offerId: 1, outcomeId: 1 })

    // The site's data cleared. The app is opened and used before the token is pasted.
    await clearSiteData()
    expect(inStep()).toBe(false)
    await logUse('appOpened')
    await logUse('screen', 'now')
    await brainLine('2026-03-11')
    await checkIn('2026-03-11', 'morning', 4)
    const mine = await moveDone('2026-03-11', 14)
    for (const name of ['useLog', 'briefLog', 'checkins', 'offers', 'outcomes']) {
      const held = await ids(name)
      expect(held.length, name).toBeGreaterThan(0)
      expect(held.every((id) => id > BASE_FLOOR), name).toBe(true)
    }
    // A second write to a store already past the base takes the next id; the use log, which drops a failed write, keeps both.
    expect(await ids('useLog')).toHaveLength(2)
    const [first, second] = await ids('useLog')
    expect(second).toBe(first + 1)
    expect((await db.outcomes.get(mine.outcomeId))?.offerId).toBe(mine.offerId)

    // The token: the first sync reads the whole cloud before anything goes up.
    await connect(store)
    expect(await syncNow()).toBe('done')
    // Every record the cloud held is as it was: nothing written over.
    for (const [k, row] of cloud) expect(store.rows.get(k)?.body, k).toBe(row.body)
    // What the new install made went up under its own ids, linked as it was made.
    const outcome = store.rows.get(`${APP}|outcomes|${mine.outcomeId}`)
    expect(JSON.parse(outcome?.body as string).offerId).toBe(mine.offerId)
    expect(store.rows.get(`${APP}|offers|${mine.offerId}`)).toBeDefined()
    // The phone holds both: the cloud's history and its own.
    expect((await db.checkins.toArray()).map((c) => `${c.day}|${c.block}`).sort()).toEqual(['2026-03-10|morning', '2026-03-11|morning'])
    expect((await db.offers.get(before.offerId))?.day).toBe('2026-03-10')
    expect((await db.outcomes.get(before.outcomeId))?.offerId).toBe(before.offerId)
    // In step now, the fresh base let go.
    expect(inStep()).toBe(true)
    expect(kv.getItem(FRESH_BASE_KEY)).toBeNull()
  })

  it('the cloud’s day stands over the one made before the token; the day as you changed it is kept aside whole, the day as the week shaped it is simply replaced', async () => {
    markInStep()
    const store = memoryStore()
    await connect(store)
    const settings = await getSettings()
    await ensureDayContext('2026-03-12', settings)
    await setDayContext('2026-03-12', { atOffice: true })
    await ensureDayContext('2026-03-13', settings)
    await setDayContext('2026-03-13', { atOffice: true })
    expect(await syncNow()).toBe('done')
    const cloudDays = rowsOf(store)

    await clearSiteData()
    // Before the token: one day changed by hand, the other only made from the week's shape.
    await ensureDayContext('2026-03-12', settings)
    await setDayContext('2026-03-12', { atOffice: false })
    await ensureDayContext('2026-03-13', settings)
    await connect(store)
    expect(await syncNow()).toBe('done')

    for (const day of ['2026-03-12', '2026-03-13']) {
      expect(store.rows.get(`${APP}|days|${day}`)?.body, day).toBe(cloudDays.get(`${APP}|days|${day}`)?.body)
      expect((await db.days.get(day))?.atOffice, day).toBe(true)
    }
    const aside = [...store.rows.values()].filter((r) => r.store === 'superseded').map((r) => JSON.parse(r.body as string) as { store: string; id: string; body: { atOffice: boolean } })
    expect(aside.map((a) => `${a.store}:${a.id}:${a.body.atOffice}`)).toEqual(['days:2026-03-12:false'])
  })

  it('a win made before the token, on a day the cloud also holds one, is made one by the latest, and the other kept aside', async () => {
    markInStep()
    const store = memoryStore()
    await connect(store)
    await setWin('2026-03-14', '2026-03-13', 'From before')
    expect(await syncNow()).toBe('done')
    await clearSiteData()
    await new Promise((r) => setTimeout(r, 5))
    await setWin('2026-03-14', '2026-03-13', 'Made again')
    await connect(store)
    expect(await syncNow()).toBe('done')
    expect((await db.wins.toArray()).map((w) => w.text)).toEqual(['Made again'])
    expect([...store.rows.values()].some((r) => r.store === 'superseded' && JSON.parse(r.body as string).body.text === 'From before')).toBe(true)
  })
})

describe('in step, and the base', () => {
  it('a phone in step hands out ids as it always did', async () => {
    markInStep()
    await checkIn('2026-03-10', 'morning', 3)
    await logUse('appOpened')
    expect(await ids('checkins')).toEqual([1])
    expect(await ids('useLog')).toEqual([1])
  })

  it('a phone that synced before this version is marked in step when it starts, and one that never synced is not', async () => {
    await updateSettings((s) => s)
    await markInStepIfSynced()
    expect(inStep()).toBe(false)
    await db.cloudMeta.put({ key: 'state', watermark: '2026-03-10T10:00:00.000Z', lastSyncAt: '2026-03-10T10:00:00.000Z', lastError: null })
    await markInStepIfSynced()
    expect(inStep()).toBe(true)
  })

  it('two new installs a minute apart start sixty ids apart, a base once chosen is kept, and being in step lets it go', () => {
    const a = freshBase(Date.UTC(2026, 9, 3, 12, 0, 0))
    expect(a).toBeGreaterThan(BASE_FLOOR)
    expect(freshBase(Date.UTC(2026, 9, 3, 12, 5, 0))).toBe(a)
    kv.removeItem(FRESH_BASE_KEY)
    expect(freshBase(Date.UTC(2026, 9, 3, 12, 1, 0)) - a).toBe(60)
    markInStep()
    expect(kv.getItem(FRESH_BASE_KEY)).toBeNull()
    expect(kv.getItem(IN_STEP_KEY)).toBe('1')
  })

  it('the placeholder that moves a counter leaves nothing behind: nothing queued, nothing sent, and the slots keep their one record each', async () => {
    await checkIn('2026-03-10', 'morning', 3)
    await setWin('2026-03-11', '2026-03-10', 'One line')
    const queued = await db.outbox.toArray()
    expect(queued.some((r) => (r.body ?? '').includes('placeholder'))).toBe(false)
    expect(await db.checkins.count()).toBe(1)
    expect(await db.wins.count()).toBe(1)
    const store = memoryStore()
    await connect(store)
    expect(await syncNow()).toBe('done')
    expect([...store.rows.values()].some((r) => (r.body ?? '').includes('placeholder'))).toBe(false)
  })

  it('reopened before it is in step, the app runs on from what it already handed out, past the base', async () => {
    await logUse('appOpened')
    const [first] = await ids('useLog')
    expect(first).toBeGreaterThan(BASE_FLOOR)
    db.close()
    await db.open()
    await logUse('screen', 'now')
    expect(await ids('useLog')).toEqual([first, first + 1])
  })

  it('a raise that rolled back is looked for again: the next write still takes its id past the base', async () => {
    await db
      .transaction('rw', db.wins, async () => {
        await db.wins.add({ forDay: '2026-03-11', setOn: '2026-03-10', text: 'Never kept', outcome: null, answeredAt: null, updatedAt: '2026-03-10T10:00:00.000Z' } as never)
        throw new Error('stopped before the commit')
      })
      .catch(() => undefined)
    await new Promise((r) => setTimeout(r, 0))
    expect(await db.wins.count()).toBe(0)
    await setWin('2026-03-11', '2026-03-10', 'Kept')
    expect((await ids('wins')).every((id) => id > BASE_FLOOR)).toBe(true)
  })

  it('without local storage, ids run from one as they always did', async () => {
    setTokenStorageForTests(null)
    await clearDatabase()
    expect(inStep()).toBe(true)
    await checkIn('2026-03-10', 'morning', 3)
    expect(await ids('checkins')).toEqual([1])
  })
})

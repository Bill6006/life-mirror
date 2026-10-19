import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CHOICES_KEY, onChoicesChanged } from './choicesWatch'
import { db, getSettings, updateSettings, wipeEverything } from './db'
import { forgetAll, forgetPlace, nameHere, turnOff, turnOn } from './locationFlow'
import { MARK_KEY, readChoicesCopy, resetChoicesForTests, restoreChoices } from './phoneChoices'
import { memoryKeyValue, setTokenStorageForTests, type KeyValue } from './tokenVault'

// This phone's own choices against the browser clearing the database (the owner's fix of 2026-10-19): a choice made by
// hand survives tab changes, reloads, sync, recalibration and the app reopening. Local storage stands in for the phone's,
// kept across a cleared database exactly as the phone's was.

let storage: KeyValue

/** The browser clears the app's database; local storage survives; the app starts again. */
async function cleared(): Promise<void> {
  resetChoicesForTests()
  await db.delete()
  await db.open()
}

/** The writes that follow a choice have committed and the copy has been kept. */
const settle = () => new Promise((r) => setTimeout(r, 120))

const PLACE = { kind: 'home' as const, cells: ['c1', 'c2'], area: { lat: 40.7, lon: -74 }, learnedAt: '2026-10-01T12:00:00.000Z' }

describe('this phone’s own choices, through a cleared database', () => {
  beforeEach(async () => {
    storage = memoryKeyValue()
    setTokenStorageForTests(storage)
    resetChoicesForTests()
    await db.delete()
    await db.open()
  })
  afterEach(() => {
    setTokenStorageForTests(null)
    resetChoicesForTests()
  })

  it('keeps a copy from the first start, and puts Location Context, the weather, the places and their key back after a clear', async () => {
    expect(await restoreChoices()).toBe('first')
    await updateSettings((s) => ({ ...s, location: { on: true, area: { lat: 40.7, lon: -74, at: '2026-10-19T12:00:00.000Z' } }, weather: { on: true } }))
    await db.places.add({ ...PLACE })
    await db.placeMeta.put({ key: 'secret', value: 'c2VjcmV0' })
    await settle()
    expect(readChoicesCopy()).toMatchObject({ location: { on: true }, weather: { on: true }, secret: 'c2VjcmV0' })

    await cleared()
    // As the phone finds it: everything this phone alone held is gone with the database.
    expect((await getSettings()).location.on).toBe(false)
    expect(await restoreChoices()).toBe('restored')
    const s = await getSettings()
    expect(s.location).toEqual({ on: true, area: { lat: 40.7, lon: -74, at: '2026-10-19T12:00:00.000Z' } })
    expect(s.weather.on).toBe(true)
    expect((await db.places.toArray()).map(({ id: _id, ...p }) => p)).toEqual([PLACE])
    expect((await db.placeMeta.get('secret'))?.value).toBe('c2VjcmV0')
    // And the next start finds the database in use: nothing put back twice.
    resetChoicesForTests()
    expect(await restoreChoices()).toBe('kept')
    expect(await db.places.count()).toBe(1)
  })

  it('puts back the latest choice: turned off after it was on, a clear brings it back off', async () => {
    await restoreChoices()
    await updateSettings((s) => ({ ...s, location: { ...s.location, on: true } }))
    await settle()
    await updateSettings((s) => ({ ...s, location: { ...s.location, on: false } }))
    await settle()
    await cleared()
    await restoreChoices()
    expect((await getSettings()).location.on).toBe(false)
  })

  it('never lets a write made before the start-up check overwrite the copy it is about to read', async () => {
    await restoreChoices()
    await updateSettings((s) => ({ ...s, location: { ...s.location, on: true } }))
    await settle()
    await cleared()
    // Something writes the settings before the check has run, as the token's healing may.
    await updateSettings((s) => ({ ...s, direction: 'One line, mine' }))
    await settle()
    expect(readChoicesCopy()?.location.on).toBe(true)
    expect(await restoreChoices()).toBe('restored')
    expect((await getSettings()).location.on).toBe(true)
    expect((await getSettings()).direction).toBe('One line, mine')
  })

  it('a wipe takes the copy too, so what you deleted is never put back', async () => {
    await restoreChoices()
    await updateSettings((s) => ({ ...s, location: { ...s.location, on: true } }))
    await settle()
    await wipeEverything()
    expect(storage.getItem(CHOICES_KEY)).toBeNull()
    resetChoicesForTests()
    expect(await restoreChoices()).toBe('first')
    expect((await getSettings()).location.on).toBe(false)
  })

  it('Forget everything keeps the database’s mark, so the places it forgot are never put back', async () => {
    await restoreChoices()
    await db.places.add({ ...PLACE })
    await settle()
    await forgetAll()
    await settle()
    expect(await db.placeMeta.get(MARK_KEY)).toBeDefined()
    expect(readChoicesCopy()?.places).toEqual([])
    resetChoicesForTests()
    expect(await restoreChoices()).toBe('kept')
    expect(await db.places.count()).toBe(0)
  })

  it('keeps each choice by the time its action is done, with no wait, so closing the app at once loses nothing (2026-10-19)', async () => {
    await restoreChoices()
    // The copy that follows every write set aside: what is tested is each action's own keep, which holds whatever that takes.
    onChoicesChanged(null)
    // No location service here: turning on is still a choice made, kept before any reading is tried.
    expect(await turnOn()).toBe('unavailable')
    expect(readChoicesCopy()?.location.on).toBe(true)
    // Home named where the phone is: the place is in the copy when the naming is done.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 40.7128, longitude: -74.006, accuracy: 20 } }) } },
    })
    try {
      expect(await nameHere('home')).toBe('named')
    } finally {
      Reflect.deleteProperty(globalThis, 'navigator')
    }
    expect(readChoicesCopy()?.places.map((p) => p.kind)).toEqual(['home'])
    expect(readChoicesCopy()?.secret).toBe((await db.placeMeta.get('secret'))?.value)
    await forgetPlace((await db.places.toArray())[0].id as number)
    expect(readChoicesCopy()?.places).toEqual([])
    await turnOff()
    expect(readChoicesCopy()?.location.on).toBe(false)
  })

  it('writes the copy again from the database in use at every start, so a copy cut short when the app closed is set right (2026-10-19)', async () => {
    await restoreChoices()
    await updateSettings((s) => ({ ...s, location: { ...s.location, on: true } }))
    await db.places.add({ ...PLACE })
    await settle()
    // The copy as a write cut short would leave it: the mark matches, the choices are older.
    const kept = readChoicesCopy()
    storage.setItem(CHOICES_KEY, JSON.stringify({ ...kept, location: { on: false, area: null }, places: [] }))
    resetChoicesForTests()
    expect(await restoreChoices()).toBe('kept')
    expect(readChoicesCopy()).toMatchObject({ location: { on: true }, places: [PLACE] })
  })

  it('puts the choices back in one write, so nothing reads Location Context on before its places and their key are back (2026-10-19)', async () => {
    await restoreChoices()
    await updateSettings((s) => ({ ...s, location: { ...s.location, on: true } }))
    await db.places.add({ ...PLACE })
    await db.placeMeta.put({ key: 'secret', value: 'c2VjcmV0' })
    await settle()
    await cleared()
    // Each write the database commits, by the tables it touched.
    const commits: string[][] = []
    const heard = (parts: Record<string, unknown>) => {
      const tables = new Set(Object.keys(parts).flatMap((k) => /^idb:\/\/life-mirror\/([^/]+)\//.exec(k)?.slice(1) ?? []))
      if (tables.size) commits.push([...tables].sort())
    }
    Dexie.on('storagemutated', heard)
    try {
      expect(await restoreChoices()).toBe('restored')
    } finally {
      Dexie.on('storagemutated').unsubscribe(heard)
    }
    const withSettings = commits.filter((t) => t.includes('settings'))
    expect(withSettings).toHaveLength(1)
    expect(withSettings[0]).toEqual(expect.arrayContaining(['placeMeta', 'places', 'settings']))
  })

  it('another phone, with no copy of its own, starts with every switch off', async () => {
    await restoreChoices()
    await updateSettings((s) => ({ ...s, weather: { on: true } }))
    await settle()
    // Another phone: its own empty storage and its own empty database.
    setTokenStorageForTests(memoryKeyValue())
    await cleared()
    expect(await restoreChoices()).toBe('first')
    expect((await getSettings()).weather.on).toBe(false)
  })
})

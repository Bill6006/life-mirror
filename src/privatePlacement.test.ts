import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { afternoonPoints, PRIVATE_ALTERNATIVES, privateAssociations, privateIsLogged, privateShownAt } from './associations'
import { BLOCKS, type Block } from './blocks'
import { factSheet } from './brainFlow'
import { hasMove, moveById } from './catalogue'
import { addPrivateItem, blocksOf, db, ensureDayContext, getCheckIn, getSettings, markPrivateShown, placedIn, privateItems, setPrivateBlocks, setPrivateLogged, updateSettings, type CheckIn, type PrivateItem } from './db'
import { buildExport } from './export'
import { factById } from './facts'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { DEFAULT_SETTINGS } from './settings'

// Private items at the Morning and the Afternoon (Pass 3): each item is asked at the check-ins it
// is placed in, the evening until chosen; opening the list marks what was on screen, so an item
// never shown enters no comparison (Rule 2); each placement is read over its own window, with an
// alternative that part of the day allows; the Brain's evening fact keeps its id, and the export
// keeps where each item is asked.

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: Block, p: Position, extras?: CheckIn['extras']): CheckIn => ({ day, block, answers: allAt(blockReadings(block), p), startedAt: `${day}T08:00:00.000Z`, completedAt: `${day}T20:00:00.000Z`, updatedAt: `${day}T20:00:00.000Z`, activeMs: 30_000, extras })
const SHOWN = { privateShown: { '7': true as const } }
const LOGGED = { private: { '7': true as const }, privateShown: { '7': true as const } }

describe('where a private item is asked', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('is the evening until placed, keeps a placement in the day’s order, and refuses none or an unknown check-in', async () => {
    await addPrivateItem('Item one')
    const [it] = await privateItems()
    expect(blocksOf(it)).toEqual(['evening'])
    expect(placedIn(it, 'evening')).toBe(true)
    expect(await setPrivateBlocks(it.id as number, ['afternoon', 'morning'])).toBe(true)
    const placed = (await privateItems())[0]
    expect(placed.blocks).toEqual(['morning', 'afternoon'])
    expect(placedIn(placed, 'evening')).toBe(false)
    expect(await setPrivateBlocks(it.id as number, [])).toBe(false)
    expect(await setPrivateBlocks(it.id as number, ['night' as Block])).toBe(false)
    expect((await privateItems())[0].blocks).toEqual(['morning', 'afternoon'])
  })

  it('marks what was on screen on the check-in it was opened at, once each, apart from what was logged', async () => {
    const slot = { day: '2026-09-21', block: 'morning' as const }
    await markPrivateShown(slot, [], [7, 8])
    const first = await getCheckIn(slot.day, slot.block)
    expect(first?.extras?.privateShown).toEqual({ '7': true, '8': true })
    expect(first?.extras?.private).toBeUndefined()
    await markPrivateShown(slot, [], [7])
    expect((await getCheckIn(slot.day, slot.block))?.updatedAt).toBe(first?.updatedAt)
    await setPrivateLogged(slot, [], 7, true)
    expect((await getCheckIn(slot.day, slot.block))?.extras).toMatchObject({ private: { '7': true }, privateShown: { '7': true, '8': true } })
  })
})

describe('what the record says of an item, only where it was on screen (Rule 2)', () => {
  it('reads an evening only when the item was shown there: one never shown enters neither side', () => {
    const item = { id: 7, name: 'Item one', createdAt: '2026-09-01T00:00:00.000Z' }
    const all = [
      ci('2026-09-02', 'evening', 3, LOGGED),
      ci('2026-09-03', 'morning', 2),
      // Shown and left: an evening without it.
      ci('2026-09-03', 'evening', 3, SHOWN),
      ci('2026-09-04', 'morning', 4),
      // Never shown: it says nothing, however the morning after read.
      ci('2026-09-04', 'evening', 3),
      ci('2026-09-05', 'morning', 5),
    ]
    const [a] = privateAssociations(true, [item], all, '2026-09-11')
    expect(a.association.withEvent.n).toBe(1)
    expect(a.association.without.n).toBe(1)
  })

  it('reads an evening from before the shown mark as seen only when the list was open that evening, and never before the item existed', () => {
    const item = { id: 7, name: 'Item one', createdAt: '2026-09-03T12:00:00.000Z' }
    expect(privateShownAt(item, ci('2026-09-04', 'evening', 3, { private: { '8': true } }))).toBe(true)
    expect(privateShownAt(item, ci('2026-09-04', 'evening', 3, { private: { '7': true } }))).toBe(true)
    expect(privateShownAt(item, ci('2026-09-04', 'evening', 3))).toBe(false)
    expect(privateShownAt(item, ci('2026-09-02', 'evening', 3, { private: { '8': true } }))).toBe(false)
    // Before placement no morning asked any item.
    expect(privateShownAt(item, ci('2026-09-04', 'morning', 3, { private: { '8': true } }))).toBe(false)
    // Once the mark exists, it alone decides.
    expect(privateShownAt(item, ci('2026-09-04', 'evening', 3, { private: { '8': true }, privateShown: { '8': true } }))).toBe(false)
  })

  it('reads each placement over its own window: the morning to that afternoon, the afternoon to that evening, the evening to the next morning', () => {
    const item = { id: 7, name: 'Item one', createdAt: '2026-09-01T00:00:00.000Z', blocks: ['morning', 'afternoon', 'evening'] as Block[] }
    const all = [
      ci('2026-09-02', 'morning', 3, LOGGED),
      ci('2026-09-02', 'afternoon', 3, SHOWN),
      ci('2026-09-02', 'evening', 3, LOGGED),
      ci('2026-09-03', 'morning', 3, SHOWN),
      ci('2026-09-03', 'afternoon', 3, LOGGED),
      ci('2026-09-03', 'evening', 3, SHOWN),
      ci('2026-09-04', 'morning', 3),
    ]
    const out = privateAssociations(true, [item], all, '2026-09-11')
    expect(out.map((p) => p.block)).toEqual(['morning', 'afternoon', 'evening'])
    for (const p of out) expect([p.association.withEvent.n, p.association.without.n], p.block).toEqual([1, 1])
    // The afternoon's window is that day's evening; an afternoon with no evening after it has nothing to read.
    // The fifth has no evening but a next morning: that morning is never read for it.
    const points = afternoonPoints([...all, ci('2026-09-05', 'afternoon', 3, LOGGED), ci('2026-09-06', 'morning', 3)], '2026-09-11', privateIsLogged(7), (c) => privateShownAt(item, c))
    expect(points.map((x) => [x.day, x.event, x.outcome !== null])).toEqual([
      ['2026-09-02', false, true],
      ['2026-09-03', true, true],
      ['2026-09-05', true, false],
    ])
  })

  it('offers an alternative that part of the day allows, the evening’s as it always was', () => {
    for (const b of BLOCKS)
      for (const id of PRIVATE_ALTERNATIVES[b]) {
        expect(hasMove(id), id).toBe(true)
        expect(moveById(id).when, `${b}: ${id}`).toContain(b)
      }
    expect(PRIVATE_ALTERNATIVES.evening).toEqual(['warm-shower-bath', 'book-page', 'screen-free-half-hour', 'music-on-purpose'])
  })
})

describe('the record kept of it', () => {
  const DAY = '2026-09-11'
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('writes the Brain a fact per placement: the evening’s keeps its id, the morning’s names its own window', async () => {
    await addPrivateItem('Item one')
    const [it] = await privateItems()
    const id = it.id as number
    await setPrivateBlocks(id, ['morning', 'evening'])
    const on = { private: { [String(id)]: true as const }, privateShown: { [String(id)]: true as const } }
    const shown = { privateShown: { [String(id)]: true as const } }
    for (const c of [ci('2026-09-02', 'morning', 3, on), ci('2026-09-02', 'afternoon', 3), ci('2026-09-02', 'evening', 3, on), ci('2026-09-03', 'morning', 3, shown), ci('2026-09-03', 'afternoon', 3), ci('2026-09-03', 'evening', 3, shown), ci('2026-09-04', 'morning', 3)]) await db.checkins.put(c)
    await updateSettings((s) => ({ ...s, showPrivate: false }))
    const sheet = await factSheet(DAY, new Date(2026, 8, 11, 9, 0))
    const evening = factById(sheet, `private.${id}`)
    const morning = factById(sheet, `private.${id}.morning`)
    expect(evening?.tags).toEqual(['evening', 'sleep'])
    expect(evening?.text).toContain('Mornings after')
    expect(morning?.tags).toEqual(['morning', 'afternoon'])
    expect(morning?.text).toContain('Afternoons after')
    expect(morning?.values).toMatchObject({ name: 'Item one', block: 'morning' })
    expect(factById(sheet, `private.${id}.afternoon`)).toBeUndefined()
  })

  it('exports where each item is asked and what was on screen, only when private items are included', () => {
    const items: PrivateItem[] = [{ id: 7, name: 'Item one', createdAt: '', archived: 0, blocks: ['morning', 'evening'] }]
    const checkins = [ci('2026-09-05', 'morning', 3, SHOWN)]
    const parsed = JSON.parse(buildExport(checkins, [], items, DEFAULT_SETTINGS, { includePrivate: true }).json)
    expect(parsed.privateAskedAt).toEqual([{ name: 'Item one', blocks: ['morning', 'evening'] }])
    expect(parsed.checkins[0].extras).toMatchObject({ private: [], privateShown: ['Item one'] })
    const plain = buildExport(checkins, [], items, DEFAULT_SETTINGS, { includePrivate: false }).json
    expect(plain).not.toContain('Item one')
    expect(plain).not.toContain('privateAskedAt')
  })
})

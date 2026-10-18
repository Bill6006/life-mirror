import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHIP_STRETCH } from './audit'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings, updateSettings, type CheckIn } from './db'
import { weeklyData } from './forecastFlow'
import { ownChipAnswer, ownChipRetired, ownChipStates, ownShownKey } from './ownChips'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { allOwnChips, DEFAULT_SETTINGS, OWN_CHIP_LABEL_MAX, OWN_CHIPS_MAX, ownChipsOf, withOwnChipAdded, withOwnChipRemoved, type OwnChip } from './settings'

// Stage 3, item 5, part 6: your own chips. Up to three short labels, each asked as one tap at the evening check-in,
// compared like the built-in chips, stopping after going unused like them; one removed keeps its record. A label is
// your own words: no model reads it yet, so it never reaches the day's sheet.

const DAY = '2026-10-10'
const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn => ({ day, block, answers: allAt(blockReadings(block), p), startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000, extras })
const chip = (id: string, label = `Stand-in ${id}`): OwnChip => ({ id, label, createdAt: '2026-09-01T00:00:00.000Z', removedAt: null })

describe('adding and removing your own chips', () => {
  it('adds a trimmed label, three at most, and ignores an empty one', () => {
    let s = withOwnChipAdded(DEFAULT_SETTINGS, '  Stand-in one  ')
    expect(ownChipsOf(s).map((c) => c.label)).toEqual(['Stand-in one'])
    expect(withOwnChipAdded(s, '   ')).toBe(s)
    s = withOwnChipAdded(withOwnChipAdded(s, 'Stand-in two'), 'Stand-in three')
    expect(OWN_CHIPS_MAX).toBe(3)
    expect(withOwnChipAdded(s, 'Stand-in four')).toBe(s)
    expect(OWN_CHIP_LABEL_MAX).toBe(40)
    expect(ownChipsOf(withOwnChipAdded(DEFAULT_SETTINGS, 'x'.repeat(60)))[0].label).toHaveLength(40)
    expect(new Set(ownChipsOf(s).map((c) => c.id)).size).toBe(3)
  })

  it('keeps one removed, with its record, and frees its place', () => {
    const s = withOwnChipAdded(withOwnChipAdded(withOwnChipAdded(DEFAULT_SETTINGS, 'Stand-in one'), 'Stand-in two'), 'Stand-in three')
    const gone = withOwnChipRemoved(s, ownChipsOf(s)[0].id, new Date('2026-10-01T12:00:00.000Z'))
    expect(ownChipsOf(gone).map((c) => c.label)).toEqual(['Stand-in two', 'Stand-in three'])
    expect(allOwnChips(gone).find((c) => c.label === 'Stand-in one')?.removedAt).toBe('2026-10-01T12:00:00.000Z')
    expect(ownChipsOf(withOwnChipAdded(gone, 'Stand-in four'))).toHaveLength(3)
  })

  it('never rewrites a stored entry it cannot read', () => {
    const odd = { ...DEFAULT_SETTINGS, ownChips: [{ id: 7 } as unknown as OwnChip, chip('a')] }
    expect(ownChipsOf(odd).map((c) => c.id)).toEqual(['a'])
    expect(withOwnChipAdded(odd, 'Stand-in b').ownChips?.[0]).toEqual({ id: 7 })
    expect(withOwnChipRemoved(odd, 'a').ownChips?.[0]).toEqual({ id: 7 })
  })
})

describe('your own chips, counted and compared only where shown (Rule 2)', () => {
  const shown = (id: string) => ({ chipsShown: { [ownShownKey(id)]: true as const } })
  const evenings = (n: number, extras?: CheckIn['extras']) => Array.from({ length: n }, (_, i) => ci(addDays(DAY, -(i + 1)), 'evening', 3, extras))

  it('stops after thirty evenings that showed it without a tap, never over evenings from before it, and comes back with one tap', () => {
    expect(ownChipStates(evenings(CHIP_STRETCH), [chip('a')], {}, DAY)[0]).toMatchObject({ evenings: 0, retired: false })
    const states = ownChipStates(evenings(CHIP_STRETCH, shown('a')), [chip('a')], {}, DAY)
    expect(ownChipRetired('a', states)).toBe(true)
    const tapped = evenings(CHIP_STRETCH, shown('a')).map((c, i) => (i === 4 ? { ...c, extras: { ...c.extras, own: { a: true as const } } } : c))
    expect(ownChipRetired('a', ownChipStates(tapped, [chip('a')], {}, DAY))).toBe(false)
    expect(ownChipStates(evenings(CHIP_STRETCH, shown('a')), [chip('a')], { [ownShownKey('a')]: DAY }, DAY)[0]).toMatchObject({ evenings: 0, retired: false, broughtBack: DAY })
  })

  it('sets the evenings that showed it against each other alone', () => {
    // Ten evenings from before it, then six that showed it, three tapped.
    const before = evenings(10).map((c) => ({ ...c, day: addDays(c.day, -20) }))
    const after = [1, 3, 5, 7, 9, 11].flatMap((k) => [ci(addDays(DAY, -k - 1), 'evening', 3, { ...shown('a'), ...(k % 4 === 1 ? { own: { a: true as const } } : {}) }), ci(addDays(DAY, -k), 'morning', k % 4 === 1 ? 4 : 2)])
    const withMornings = [...before, ...before.map((c) => ci(addDays(c.day, 1), 'morning', 3)), ...after]
    const a = ownChipAnswer(withMornings, 'a', DAY)
    expect(a.times).toBe(3)
    expect(a.without.n).toBe(3)
    // The probe that could have said yes: the earlier evenings read as shown join the side without.
    expect(ownChipAnswer(withMornings.map((c) => (c.block === 'evening' && !c.extras ? { ...c, extras: shown('a') } : c)), 'a', DAY).without.n).toBe(13)
  })
})

describe('a label never reaches the day’s sheet', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('is left off every fact, the weekly ones included, while the weekly view on the phone counts it', async () => {
    const label = 'Stand-in label zq'
    await updateSettings((s) => ({ ...s, ownChips: [{ id: 'a', label, createdAt: '2026-09-01T00:00:00.000Z', removedAt: null }] }))
    // Thirty days, the chip shown every evening and tapped on every third.
    const rows: CheckIn[] = []
    for (let k = 30; k >= 1; k--) {
      const day = addDays(DAY, -k)
      rows.push(ci(day, 'morning', ((k % 5) + 1) as Position), ci(day, 'evening', 3, { chipsShown: { [ownShownKey('a')]: true }, ...(k % 3 === 0 ? { own: { a: true as const } } : {}) }))
    }
    await db.checkins.bulkAdd(rows)
    const sheet = await factSheet(DAY, new Date(2026, 9, 10, 20, 0))
    expect(sheet.facts.some((f) => f.id.startsWith('weekly.best'))).toBe(true)
    expect(JSON.stringify(sheet)).not.toContain(label)
    // The probe that could have said yes: the phone's weekly view names it.
    const view = await weeklyData(DAY)
    expect(view.best.own?.map((d) => d.label)).toEqual([label])
    const d = view.best.own?.[0]
    expect([(d?.ofBest ?? 0) + (d?.ofOthers ?? 0), (d?.onBest ?? 0) + (d?.onOthers ?? 0)]).toEqual([30, 10])
  })
})

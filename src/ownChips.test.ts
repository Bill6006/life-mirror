import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHIP_STRETCH } from './audit'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings, updateSettings, type CheckIn } from './db'
import { weeklyData } from './forecastFlow'
import { ownChipLine } from './associationWords'
import { ownChipAnswer, ownChipRetired, ownChipStandings, ownChipStates, ownShownKey } from './ownChips'
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

describe('your own chips on Evidence, under the one standard', () => {
  it('gives each chip its standing among your own chips, a family of their own, and says a reading only past too few', () => {
    // Four fortnights of evenings that showed both chips. The first was tapped on each fortnight's 1st, 2nd, 4th and 8th evenings, and the
    // morning after read better each time; the second was tapped three times.
    const better = (c: CheckIn): CheckIn => ({ ...c, answers: { ...c.answers, mood: 4, energy: 4, focus: 4, stress: 2, overwhelm: 2, irritation: 2 } })
    const both = { chipsShown: { [ownShownKey('a')]: true as const, [ownShownKey('b')]: true as const } }
    const rows: CheckIn[] = []
    for (let i = 0; i < 56; i++) {
      const day = addDays(DAY, i - 57)
      const first = [0, 1, 3, 7].includes(i % 14)
      rows.push(ci(day, 'evening', 3, { ...both, own: { ...(first ? { a: true as const } : {}), ...(i < 3 ? { b: true as const } : {}) } }), first ? better(ci(addDays(day, 1), 'morning', 3)) : ci(addDays(day, 1), 'morning', 3))
    }
    const { answers, stood } = ownChipStandings(rows, [chip('a'), chip('b')], DAY)
    expect(stood.get('own.a')).toMatchObject({ standing: 'pattern', direction: 'higher', family: 1 })
    expect(stood.get('own.b')).toMatchObject({ standing: 'tooFew' })
    expect(ownChipLine('Stand-in a', answers.get('a')!, stood, 'a')).toBe('Stand-in a: 16 evenings marked. The morning after read 75, against 50 after evenings that started the same (16 and 40). Like for like, 25 points higher: a steady pattern.')
    // Three taps: its own reading, and nothing set against it, where two readings used to be said.
    expect(ownChipLine('Stand-in b', answers.get('b')!, stood, 'b')).toMatch(/^Stand-in b: 3 evenings marked\. The morning after read \d+ \(3\); nothing yet to set it against\.$/)
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
    // Ninety days, the chip shown every evening; tapped on the nine best days, which keep no rhythm, and on nine others.
    const best = [3, 12, 20, 29, 37, 46, 54, 65, 78]
    const tapped = [...best, 8, 17, 26, 35, 44, 53, 62, 71, 86]
    // A morning at its best: every reading at the top, and the three that read better lower at the bottom.
    const atBest = (c: CheckIn): CheckIn => ({ ...c, answers: { ...c.answers, stress: 1, overwhelm: 1, irritation: 1 } })
    const rows: CheckIn[] = []
    for (let k = 90; k >= 1; k--) {
      const day = addDays(DAY, -k)
      rows.push(best.includes(k) ? atBest(ci(day, 'morning', 5)) : ci(day, 'morning', 3), ci(day, 'evening', 3, { chipsShown: { [ownShownKey('a')]: true }, ...(tapped.includes(k) ? { own: { a: true as const } } : {}) }))
    }
    await db.checkins.bulkAdd(rows)
    const sheet = await factSheet(DAY, new Date(2026, 9, 10, 20, 0))
    expect(sheet.facts.some((f) => f.id.startsWith('weekly.best'))).toBe(true)
    expect(JSON.stringify(sheet)).not.toContain(label)
    // The probe that could have said yes: the phone's weekly view names it.
    const view = await weeklyData(DAY)
    expect(view.best.own?.map((d) => d.label)).toEqual([label])
    // On all nine best days against nine of the other eighty-one: a lead, the standing that puts it on the view.
    expect(view.best.own?.[0]).toMatchObject({ onBest: 9, ofBest: 9, onOthers: 9, ofOthers: 81, standing: 'lead', direction: 'higher' })
  })
})

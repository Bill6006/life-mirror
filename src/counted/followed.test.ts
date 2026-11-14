import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { patternsForExport } from '../export'
import { writePatternsRow } from '../patternsFlow'
import { markObservation } from '../writeups/flow'
import { obsMarkIdOf, type WriteUp } from '../writeups/shared'
import { storedPatterns } from './patterns'
import { PATTERNS_ID, readPatterns, samePatterns } from './stored'
import { followedCounts, forgetKeptPatterns, patternTable, type FollowedAsk } from './table'
import { checkin, context, day, input } from './testing'

// The followed count (2026-11-13), on hand-worked stand-in records: a pattern Claude noticed is counted again on what
// came after the day it was noticed, and only there. The days that suggested it cannot also prove it.

const A = 250
const WEEKS = 16
const saturday = (n: number): boolean => new Date(2026, 0, 1 + n).getDay() === 6
/** Sixteen weeks of evenings; a late dinner where `dinner` says so. */
const evenings = (dinner: (n: number) => boolean) => Array.from({ length: WEEKS * 7 }, (_, i) => checkin(A + i, 'evening', { extras: dinner(A + i) ? { dinner: true } : {} }))
const record = (dinner: (n: number) => boolean = saturday) => input({ checkins: evenings(dinner) })
const TODAY = day(A + WEEKS * 7)
/** Noticed at the end of the eighth week: fifty-six days follow, eight of them Saturdays. */
const NOTICED = day(A + 55)
const ask = (over: Partial<FollowedAsk> = {}): FollowedAsk => ({ id: 'obs:2026-10:1:noticed:1', kind: 'chip.dinner', split: 'weekday', cell: '6', noticedOn: NOTICED, ...over })

describe('a followed pattern', () => {
  it('counts only the occasions after the day it was noticed', () => {
    expect(saturday(A + 55)).toBe(false)
    const [f] = followedCounts(record(), TODAY, [ask()])
    // Eight Saturdays since, a late dinner on each; forty-eight other evenings, none.
    expect(f).toMatchObject({ id: 'obs:2026-10:1:noticed:1', kind: 'chip.dinner', split: 'weekday', cell: '6', noticedOn: NOTICED, k: 8, n: 8, restK: 0, m: 48, standing: 'pattern', direction: 'higher', family: 1 })
    // The days that suggested it prove nothing: every Saturday dinner before the day noticed, none since.
    const [none] = followedCounts(record((n) => saturday(n) && n <= A + 55), TODAY, [ask()])
    expect(none).toMatchObject({ k: 0, n: 8, restK: 0, m: 48, standing: 'tooFew' })
    // The whole table, over the same record, still counts all sixteen Saturdays: only the followed count starts late.
    const whole = patternTable(record(), TODAY).kinds.find((k) => k.kind === 'chip.dinner')?.cells.find((c) => c.split === 'weekday' && c.cell === '6')
    expect([whole?.k, whole?.n]).toEqual([16, 16])
  })

  it('leaves out the day it was noticed itself, and every day from today on', () => {
    // Noticed on the ninth Saturday: that Saturday's own dinner is not counted, so seven Saturdays follow.
    const ninth = Array.from({ length: WEEKS * 7 }, (_, i) => A + i).filter(saturday)[8]
    const [f] = followedCounts(record(), TODAY, [ask({ noticedOn: day(ninth) })])
    expect([f.k, f.n]).toEqual([7, 7])
    // Counted on a day inside the record: nothing from that day on is in it.
    const [early] = followedCounts(record(), day(A + 70), [ask()])
    expect([early.n + early.m]).toEqual([14])
    // Noticed on the last day counted: nothing has come after yet.
    expect(followedCounts(record(), TODAY, [ask({ noticedOn: day(A + WEEKS * 7 - 1) })])[0]).toMatchObject({ k: 0, n: 0, restK: 0, m: 0, standing: 'tooFew' })
  })

  it('counts nowhere a kind the record does not count, a cell its split does not have, or a split that is not its own', () => {
    expect(followedCounts(record(), TODAY, [ask({ kind: 'chip.nothing' })])).toEqual([])
    expect(followedCounts(record(), TODAY, [ask({ cell: '9' })])).toEqual([])
    expect(followedCounts(record(), TODAY, [ask({ split: 'month' })])).toEqual([])
    // A cell of another split is not this split's: "yes" is a cell of what came before, never of the weekday.
    expect(followedCounts(record(), TODAY, [ask({ cell: 'yes' })])).toEqual([])
    expect(followedCounts(record(), TODAY, [])).toEqual([])
  })

  it('tests every followed pattern as one family', () => {
    const both = followedCounts(record(), TODAY, [ask(), ask({ id: 'obs:2026-10:1:noticed:2', cell: '0' })])
    expect(both.map((f) => [f.cell, f.family])).toEqual([['6', 2], ['0', 2]])
    // One with too few to test is in no family: the other stands alone.
    const one = followedCounts(record(), TODAY, [ask(), ask({ id: 'late', noticedOn: day(A + WEEKS * 7 - 2) })])
    expect(one.map((f) => [f.id, f.standing, f.family])).toEqual([['obs:2026-10:1:noticed:1', 'pattern', 1], ['late', 'tooFew', 1]])
  })
})

describe('the followed count in the table’s record', () => {
  const table = () => patternTable(record(), TODAY)
  const followed = () => followedCounts(record(), TODAY, [ask()])

  it('is kept in the table’s record and read back whole; a record with none reads as it always did', () => {
    const kept = storedPatterns(table(), '2026-11-14T10:00:00.000Z', followed())
    expect(kept.followed).toEqual([{ id: 'obs:2026-10:1:noticed:1', kind: 'chip.dinner', split: 'weekday', cell: '6', noticedOn: NOTICED, k: 8, n: 8, restK: 0, m: 48, standing: 'pattern', direction: 'higher', family: 1 }])
    expect(readPatterns(JSON.parse(JSON.stringify(kept)))?.followed).toEqual(kept.followed)
    const plain = storedPatterns(table(), '2026-11-14T10:00:00.000Z')
    expect(plain).not.toHaveProperty('followed')
    expect(readPatterns(JSON.parse(JSON.stringify(plain)))).not.toHaveProperty('followed')
  })

  it('makes the record no table when one does not read whole', () => {
    const kept = JSON.parse(JSON.stringify(storedPatterns(table(), '2026-11-14T10:00:00.000Z', followed()))) as { followed: Record<string, unknown>[] }
    for (const bad of [{ ...kept.followed[0], k: 9 }, { ...kept.followed[0], noticedOn: 'last week' }, { ...kept.followed[0], id: '' }, { ...kept.followed[0], standing: 'sure' }]) expect(readPatterns({ ...kept, followed: [bad] }), JSON.stringify(bad)).toBeNull()
    expect(readPatterns({ ...kept, followed: 'none' })).toBeNull()
    expect(readPatterns(kept)).not.toBeNull()
  })

  it('is a change the record is rewritten for', () => {
    const plain = storedPatterns(table(), '2026-11-14T10:00:00.000Z')
    const kept = storedPatterns(table(), '2026-11-14T10:00:00.000Z', followed())
    expect(samePatterns(plain, kept)).toBe(false)
    expect(samePatterns(kept, storedPatterns(table(), '2026-11-15T10:00:00.000Z', followed()))).toBe(true)
  })

  it('is in the export beside the table, for the kinds the export carries', () => {
    const kept = storedPatterns(table(), '2026-11-14T10:00:00.000Z', followed())
    const out = patternsForExport(kept, true, true) as { patternTable: { followedSinceNoticed?: unknown[] } }
    expect(out.patternTable.followedSinceNoticed).toEqual([{ kind: 'chip.dinner', split: 'weekday', cell: '6', noticedOn: NOTICED, sinceThen: '8 of 8', elsewhereSinceThen: '0 of 48', standing: 'pattern', lookedAt: 1 }])
    expect((patternsForExport(storedPatterns(table(), '2026-11-14T10:00:00.000Z'), true, true) as { patternTable: object }).patternTable).not.toHaveProperty('followedSinceNoticed')
  })
})

describe('the followed count on the phone', () => {
  const writeUp = (): WriteUp => ({
    id: '2026-10:1',
    month: '2026-10',
    reading: 1,
    at: `${NOTICED}T22:00:00.000Z`,
    day: NOTICED,
    method: 1,
    model: 'stand-in',
    builtFrom: { counts: { days: 37 }, parts: 1, lines: 120, fingerprint: 'a'.repeat(64) },
    recorded: [],
    noticed: [{ text: 'A late dinner went with Saturdays.', days: [day(A + 5)], kinds: ['dayRecord'], followed: { kind: 'chip.dinner', split: 'weekday', cell: '6', k: 8, n: 8, restK: 0, m: 48 } }],
  })
  beforeEach(async () => {
    await db.delete()
    await db.open()
    forgetKeptPatterns()
    await db.checkins.bulkAdd(evenings(saturday))
    await db.days.bulkAdd(Array.from({ length: WEEKS * 7 }, (_, i) => context(A + i)))
    await db.writeups.put(writeUp())
  })
  const kept = async () => readPatterns(await db.patterns.get(PATTERNS_ID))?.followed ?? []

  it('is counted at every build of the table, and gone at the next build once its observation is marked wrong', async () => {
    expect(await writePatternsRow(TODAY, new Date('2026-11-14T10:00:00.000Z'))).toBe(true)
    expect(await kept()).toEqual([{ id: obsMarkIdOf('2026-10:1', 'noticed', 1), kind: 'chip.dinner', split: 'weekday', cell: '6', noticedOn: NOTICED, k: 8, n: 8, restK: 0, m: 48, standing: 'pattern', direction: 'higher', family: 1 }])
    // Built again with nothing changed, the record is left as it is.
    expect(await writePatternsRow(TODAY, new Date('2026-11-14T11:00:00.000Z'))).toBe(false)
    await markObservation(obsMarkIdOf('2026-10:1', 'noticed', 1), true)
    expect(await writePatternsRow(TODAY, new Date('2026-11-14T12:00:00.000Z'))).toBe(true)
    expect(await kept()).toEqual([])
  })
})

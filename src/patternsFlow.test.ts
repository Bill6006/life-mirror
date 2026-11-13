import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { writeFactsRow } from './brainFlow'
import catalogue from './catalogue.json'
import { comparisonFaults, resetComparisonFaults } from './counted/fault'
import { PATTERNS_ID, readPatterns } from './counted/stored'
import { forgetKeptPatterns } from './counted/table'
import { at, checkin, context, day, offer, outcome } from './counted/testing'
import { db, type CheckIn, type Offer, type Outcome } from './db'
import { patternsFromExport } from './patternsFlow.testing'
import { countedRecord, patternsForAsk, refreshPatterns, writeDayRows, writePatternsRow } from './patternsFlow'

// The pattern table on the phone (2026-11-13), on stand-in records: built from the whole record, kept as one record,
// rewritten only when its content changes, never on the day's sheet, and never in the way of a screen.

const A = 250
const SPAN = 56
const TODAY = day(A + SPAN)
const NOW = new Date(at(A + SPAN, 9))
const saturday = (n: number): boolean => new Date(2026, 0, 1 + n).getDay() === 6
const none = async (): Promise<void> => undefined

async function seed(): Promise<void> {
  const checkins: CheckIn[] = Array.from({ length: SPAN }, (_, i) => [checkin(A + i, 'morning', { answers: { sleepHours: 3, sleepQuality: 3 } }), checkin(A + i, 'evening', { extras: saturday(A + i) ? { dinner: true } : {} })]).flat()
  await db.checkins.bulkAdd(checkins)
  await db.days.bulkAdd(Array.from({ length: SPAN }, (_, i) => context(A + i)))
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  forgetKeptPatterns()
  resetComparisonFaults()
})

describe('the pattern table on the phone', () => {
  it('is built from the whole record and kept as one record with a fixed id', async () => {
    await seed()
    expect(await writePatternsRow(TODAY, NOW, { pause: none })).toBe(true)
    expect(await db.patterns.count()).toBe(1)
    const table = readPatterns(await db.patterns.get(PATTERNS_ID))
    expect(table).toMatchObject({ id: 'table', format: 1, builtFor: TODAY, builtAt: NOW.toISOString(), updatedAt: NOW.toISOString() })
    const dinner = table?.kinds.find((k) => k.id === 'chip.dinner')
    expect(dinner).toMatchObject({ label: 'a late or heavy dinner', known: 56, occurrences: 8 })
    expect(dinner?.cells?.find((c) => c.split === 'weekday' && c.cell === '6')).toMatchObject({ k: 8, n: 8, restK: 0, m: 48, standing: 'pattern' })
    expect(table?.level.find((l) => l.split === 'checkin' && l.cell === 'evening')).toMatchObject({ n: 56, mean: 50 })
    // What it was built from: the whole record, read once.
    const record = await countedRecord()
    expect(record.checkins).toHaveLength(112)
    expect(record.contexts).toHaveLength(56)
  })

  it('is rewritten only when its content changes, and queued for the cloud once each time', async () => {
    await seed()
    await writePatternsRow(TODAY, NOW, { pause: none })
    const queued = async () => (await db.outbox.where('store').equals('patterns').toArray()).map((r) => [r.key, r.op])
    expect(await queued()).toEqual([['table', 'put']])
    await db.outbox.clear()
    // The same record, later the same day: nothing is written, nothing queued, and the record keeps its first stamp.
    const later = new Date(NOW.getTime() + 3_600_000)
    expect(await writePatternsRow(TODAY, later, { pause: none })).toBe(false)
    expect(await queued()).toEqual([])
    expect((await db.patterns.get(PATTERNS_ID))?.updatedAt).toBe(NOW.toISOString())
    // One more dinner on a past day: the content changed, and it is written and queued again.
    const monday = (await db.checkins.where('day').equals(day(A + 6)).toArray()).find((c) => c.block === 'evening') as CheckIn
    await db.checkins.update(monday.id as number, { extras: { dinner: true } })
    await db.outbox.clear()
    expect(await writePatternsRow(TODAY, later, { pause: none })).toBe(true)
    expect(await queued()).toEqual([['table', 'put']])
    expect(readPatterns(await db.patterns.get(PATTERNS_ID))?.kinds.find((k) => k.id === 'chip.dinner')).toMatchObject({ occurrences: 9 })
    expect((await db.patterns.get(PATTERNS_ID))?.updatedAt).toBe(later.toISOString())
  })

  it('counts only the days before the day it is built for, so the next day it is another table', async () => {
    await seed()
    await writePatternsRow(TODAY, NOW, { pause: none })
    expect(await writePatternsRow(day(A + SPAN + 1), new Date(at(A + SPAN + 1, 9)), { pause: none })).toBe(true)
    expect(readPatterns(await db.patterns.get(PATTERNS_ID))?.builtFor).toBe(day(A + SPAN + 1))
  })

  it('is never on the day’s sheet: no fact of the sheet carries a lookup’s head', async () => {
    await seed()
    await writeFactsRow(TODAY, NOW)
    await writePatternsRow(TODAY, NOW, { pause: none })
    const sheet = (await db.facts.get(TODAY))?.sheet
    expect(sheet?.facts.length).toBeGreaterThan(5)
    const heads = new Set(sheet?.facts.map((f) => f.id.split('.')[0]))
    for (const head of ['kinds', 'pattern', 'day', 'moves', 'workouts', 'pathSteps', 'lines', 'forecast']) expect(heads.has(head), head).toBe(false)
    // And writing the table leaves the sheet's row as it was.
    const before = JSON.stringify(await db.facts.get(TODAY))
    await writePatternsRow(day(A + SPAN + 1), NOW, { pause: none })
    expect(JSON.stringify(await db.facts.get(TODAY))).toBe(before)
  })

  it('writes no table when the build throws, and keeps the failure with the comparisons’ own', async () => {
    await seed()
    const broken = async (): Promise<void> => {
      throw new TypeError('made to fail')
    }
    expect(await writePatternsRow(TODAY, NOW, { pause: broken })).toBe(false)
    expect(await db.patterns.count()).toBe(0)
    expect(comparisonFaults()).toEqual({ count: 1, first: TODAY, last: TODAY, name: 'TypeError' })
    // The probe that can say yes: the same build, not made to fail, writes the table.
    expect(await writePatternsRow(TODAY, NOW, { pause: none })).toBe(true)
  })

  it('never overwrites a stored record of another format, and builds over one of its own that does not parse', async () => {
    await seed()
    await db.patterns.put({ id: 'table', format: 2, builtFor: TODAY, from: 'a newer app' } as never)
    expect(await writePatternsRow(TODAY, NOW, { pause: none })).toBe(false)
    expect(await db.patterns.get(PATTERNS_ID)).toMatchObject({ format: 2, from: 'a newer app' })
    await db.patterns.put({ id: 'table', format: 1, builtFor: 'not a day' } as never)
    expect(await writePatternsRow(TODAY, NOW, { pause: none })).toBe(true)
    expect(readPatterns(await db.patterns.get(PATTERNS_ID))?.builtFor).toBe(TODAY)
  })

  it('is built after the day’s sheet with no screen waiting, one build after another', async () => {
    await seed()
    // The sheet's own write answers before the table is there; the table follows on its own.
    await writeDayRows(TODAY, NOW)
    expect(await db.facts.get(TODAY)).toBeDefined()
    await refreshPatterns(TODAY, NOW)
    expect(await db.patterns.count()).toBe(1)
    // Two asked for at once are built one after the other, and the second finds nothing to write.
    const [first, second] = await Promise.all([refreshPatterns(day(A + SPAN + 1), NOW), refreshPatterns(day(A + SPAN + 1), NOW)])
    expect([first, second]).toEqual([true, false])
  })

  it('lets a question go on after a short wait when the table is not ready, and still finishes the table', async () => {
    await seed()
    const started = performance.now()
    await patternsForAsk(TODAY, NOW, 1)
    expect(performance.now() - started).toBeLessThan(2000)
    await refreshPatterns(TODAY, NOW)
    expect(await db.patterns.count()).toBe(1)
  })

  it('is in the export as counts and standings, a private item’s kind only when private items are included', async () => {
    await seed()
    await db.privateItems.add({ id: 7, name: 'a private thing', createdAt: at(A - 5, 9), archived: 0 })
    const evenings = (await db.checkins.toArray()).filter((c) => c.block === 'evening')
    for (const [i, c] of evenings.entries()) await db.checkins.update(c.id as number, { extras: { ...(c.extras ?? {}), privateShown: { '7': true }, ...(i < 20 ? { private: { '7': true } } : {}) } })
    await writePatternsRow(TODAY, NOW, { pause: none })
    const stored = await db.patterns.get(PATTERNS_ID)
    const without = patternsFromExport(stored, false, false)
    expect(without.kinds.map((k) => k.id)).not.toContain('private.7')
    expect(JSON.stringify(without)).not.toContain('a private thing')
    expect(without.kinds.find((k) => k.id === 'chip.dinner')).toMatchObject({ label: 'a late or heavy dinner', countedBy: 'day', known: 56, occurrences: 8 })
    const withPrivate = patternsFromExport(stored, true, false)
    expect(withPrivate.kinds.find((k) => k.id === 'private.7')).toMatchObject({ label: 'a private thing', occurrences: 20 })
    expect(withPrivate.level.length).toBeGreaterThan(0)
    // A stored record that is not the table's shape is left out whole.
    expect(patternsFromExport({ id: 'table', format: 2 }, true, true)).toEqual({ kinds: [], level: [] })
  })
})

describe('the cost of building the table', () => {
  it('builds a year of days with every kind of record in a time a phone can pay off the main path', async () => {
    // A year, three check-ins a day, chips by a fixed rule with no period, two private items, thirty moves answered.
    const moves = (catalogue as unknown as { moves: { id: string; family: string }[] }).moves.filter((m) => m.family !== 'faith').slice(0, 30).map((m) => m.id)
    let x = 7
    const draw = (): number => (x = (x * 16807) % 2147483647) / 2147483647
    const checkins: CheckIn[] = []
    const offers: Offer[] = []
    const outcomes: Outcome[] = []
    for (let i = 0; i < 365; i++) {
      const n = A - 365 + i
      const level = (): number => 1 + Math.floor(draw() * 5)
      checkins.push(checkin(n, 'morning', { level: level(), answers: { sleepHours: (1 + Math.floor(draw() * 5)) as never, sleepQuality: (1 + Math.floor(draw() * 5)) as never }, extras: { privateShown: { '7': true, '8': true }, ...(draw() < 0.2 ? { private: { '7': true } } : {}) } }))
      checkins.push(checkin(n, 'afternoon', { level: level(), extras: { privateShown: { '7': true, '8': true }, chipsShown: { sweet: true }, ...(draw() < 0.3 ? { sweet: true } : {}), ...(draw() < 0.1 ? { private: { '8': true } } : {}) } }))
      checkins.push(checkin(n, 'evening', { level: level(), extras: { privateShown: { '7': true, '8': true }, chipsShown: { sweet: true, nature: true }, caffeineShown: true, ...(draw() < 0.3 ? { dinner: true } : {}), ...(draw() < 0.2 ? { napped: true } : {}), ...(draw() < 0.15 ? { nothingLanded: true } : {}), ...(draw() < 0.25 ? { nature: true } : {}), ...(draw() < 0.3 ? { sweet: true } : {}), ...(draw() < 0.2 ? { private: { '7': true } } : {}) } }))
      for (let k = 0; k < 4; k++) {
        const id = i * 4 + k + 1
        const moveId = moves[Math.floor(draw() * moves.length)]
        offers.push(offer(id, n, moveId))
        outcomes.push(outcome(id, n, moveId, draw() < 0.6 ? 'done' : 'no'))
      }
    }
    await db.checkins.bulkAdd(checkins)
    await db.days.bulkAdd(Array.from({ length: 365 }, (_, i) => context(A - 365 + i)))
    await db.privateItems.bulkAdd([
      { id: 7, name: 'one private thing', createdAt: at(A - 400, 9), archived: 0 },
      { id: 8, name: 'another private thing', createdAt: at(A - 400, 9), archived: 0 },
    ])
    await db.offers.bulkAdd(offers)
    await db.outcomes.bulkAdd(outcomes)
    const started = performance.now()
    expect(await writePatternsRow(day(A), new Date(at(A, 9)), { pause: none })).toBe(true)
    const first = performance.now() - started
    const table = readPatterns(await db.patterns.get(PATTERNS_ID))
    const bytes = JSON.stringify(await db.patterns.get(PATTERNS_ID)).length
    // The same record again, in the same start of the app: every kind's comparisons are kept, and nothing is worked out.
    const again = performance.now()
    expect(await writePatternsRow(day(A), new Date(at(A, 10)), { pause: none })).toBe(false)
    const second = performance.now() - again
    console.log(`PATTERNS-COST kinds=${table?.kinds.length} tested=${table?.kinds.filter((k) => k.family > 0).length} bytes=${bytes} first=${Math.round(first)}ms again=${Math.round(second)}ms`)
    expect(table?.kinds.length).toBeGreaterThan(60)
    expect(first).toBeLessThan(60_000)
    expect(second).toBeLessThan(first)
    expect(bytes).toBeLessThan(400_000)
  }, 120_000)
})

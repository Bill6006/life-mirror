import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import catalogueJson from '../../src/catalogue.json'
import type { Fact } from '../../src/factTypes'
import { runLookup, type LookupCtx } from './lookups'
import { buildMonth, fingerprintOf, MONTH_COVERED, MONTH_LEFT_OUT, MONTH_MARGIN, MONTH_PART_BYTES, MONTH_PARTS_MOST, MONTH_READ, monthSpan, partsOf } from './month'
import { accessFor, gatesFrom, type Catalogue } from './retrieval'
import { APP, memoryStore } from './turso'

// A month of the record read once in full (2026-11-13), on a stand-in month: each day's lines as the exact-day lookup
// words them, three days either side, in parts of whole days; whole, or nothing is built.

const TZ = 'America/New_York'
const DAY = '2026-11-12'
const NOW = new Date('2026-11-12T20:00:00.000Z')
const catalogue: Catalogue = new Map((catalogueJson as unknown as { moves: { id: string; name: string; family: string }[] }).moves.map((m) => [m.id, { name: m.name, family: m.family, tags: [] }])) as unknown as Catalogue

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, deleted = 0) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: NOW.toISOString(), deleted, synced_at: NOW.toISOString() })
const OPEN = gatesFrom({ hideFaith: false, privateInSelection: false })
const access = (off: string[] = []) => accessFor('ask', OPEN, readBrainPrefs({ switches: Object.fromEntries(off.map((k) => [k, false])) }))
const ctx = (store: Mem, over: Partial<LookupCtx> = {}): LookupCtx => ({ store, catalogue, a: access(), day: DAY, now: NOW, timeZone: TZ, showPrivate: true, question: '', ...over })
const dayAt = (n: number): string => new Date(Date.UTC(2026, 8, 25 + n)).toISOString().slice(0, 10)

/** A stand-in record from 25 September to 6 November 2026: a day row, a morning and an evening check-in each day, the evening's with a note. */
function standIn(note: (day: string) => string = (d) => `A stand-in note for ${d}.`): Mem {
  const store = memoryStore()
  let id = 1
  for (let n = 0; n < 43; n++) {
    const day = dayAt(n)
    put(store, 'days', day, day, { day, atOffice: n % 2 === 0 })
    put(store, 'checkins', String(id), day, { id: id++, day, block: 'morning', answers: {}, extras: {}, completedAt: `${day}T12:00:00.000Z` })
    put(store, 'checkins', String(id), day, { id: id++, day, block: 'evening', answers: {}, extras: { note: note(day) }, completedAt: `${day}T23:00:00.000Z` })
  }
  return store
}
const built = async (store: Mem, first = '2026-10-01', over: Partial<LookupCtx> = {}) => {
  const b = await buildMonth(ctx(store, over), first)
  if (!b.ok) throw new Error(b.reason)
  return b
}
const dayOfFact = (f: Fact): string => f.id.split('.')[1]

describe('a month’s days', () => {
  it('are the month’s own, with three days served either side', () => {
    expect(MONTH_MARGIN).toBe(3)
    expect(monthSpan('2026-10-01')).toEqual({ month: '2026-10', from: '2026-10-01', to: '2026-10-31', servedFrom: '2026-09-28', servedTo: '2026-11-03' })
    expect(monthSpan('2026-02-01')).toMatchObject({ to: '2026-02-28', servedTo: '2026-03-03' })
    expect(monthSpan('2028-02-01')).toMatchObject({ to: '2028-02-29' })
    expect(monthSpan('2026-12-01')).toMatchObject({ to: '2026-12-31', servedTo: '2027-01-03' })
  })

  it('are named only by a month’s first day', () => {
    for (const bad of ['2026-10-02', '2026-13-01', '2026-10', 'october', '']) expect(monthSpan(bad), bad).toBeNull()
  })
})

describe('the written list of what a month’s read covers', () => {
  it('names each kind of record covered, and each left out with why', () => {
    expect(MONTH_COVERED).toHaveLength(10)
    expect(MONTH_LEFT_OUT.map((l) => l.what)).toEqual(['the journal', 'the Brain’s own lines, reviews and coach picks, and earlier write-ups', 'past questions and their answers', 'the log of changes to a Path', 'the Partner Path’s monthly check', 'voice recordings', 'places and the weather'])
    for (const l of MONTH_LEFT_OUT) expect(l.why.length, l.what).toBeGreaterThan(5)
  })
})

describe('a month’s lines', () => {
  it('are each day’s lines exactly as the exact-day lookup words them, with the same ids', async () => {
    const store = standIn()
    const b = await built(store)
    const all = b.parts.flatMap((p) => p.facts)
    for (const day of ['2026-09-28', '2026-10-01', '2026-10-17', '2026-10-31', '2026-11-03']) {
      const exact = (await runLookup(ctx(store), { lookup: 'day', date: day })).facts
      expect(exact.length, day).toBeGreaterThan(0)
      expect(all.filter((f) => dayOfFact(f) === day), day).toEqual(exact)
    }
  })

  it('cover every day of the month and three days either side, in order, and no day beyond', async () => {
    const b = await built(standIn())
    const days = [...new Set(b.parts.flatMap((p) => p.facts).map(dayOfFact))]
    expect(days[0]).toBe('2026-09-28')
    expect(days.at(-1)).toBe('2026-11-03')
    expect(days).toHaveLength(37)
    expect(days).toEqual([...days].sort())
    // The record holds days before and after those served: none of them is here.
    expect(days).not.toContain('2026-09-27')
    expect(days).not.toContain('2026-11-04')
    expect(b.parts.flatMap((p) => p.outside)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-11-01', '2026-11-02', '2026-11-03'])
  })

  it('say how many rows of each store they were built from, and how many lines the month itself holds', async () => {
    const b = await built(standIn())
    expect(b.counts).toEqual({ days: 37, checkins: 74, offers: 0, outcomes: 0, notes: 0, pathMarks: 0 })
    // Each day: its own row, two check-ins and one note. The month alone, without the days beside it.
    expect(b.lines).toBe(31 * 4)
    expect(b.parts.reduce((n, p) => n + p.lines, 0)).toBe(37 * 4)
  })

  it('leave out a kind of record that is switched off, as every read does', async () => {
    const store = standIn()
    const on = await built(store)
    const off = await built(store, '2026-10-01', { a: access(['notes']) })
    expect(on.parts.flatMap((p) => p.facts).some((f) => f.text.includes('you wrote'))).toBe(true)
    expect(off.parts.flatMap((p) => p.facts).some((f) => f.text.includes('you wrote'))).toBe(false)
    expect(off.lines).toBe(31 * 3)
  })
})

describe('the record a note’s line came from', () => {
  it('is kept for each note in the month’s lines: a check-in’s note by its check-in, a kept note by its own row', async () => {
    const store = standIn()
    put(store, 'notes', '700', '2026-10-10', { id: 700, day: '2026-10-10', at: '2026-10-10T15:00:00.000Z', text: 'A stand-in note kept from a question.' })
    const b = await built(store)
    const all = b.parts.flatMap((p) => p.facts)
    const evening = all.find((f) => f.id.startsWith('day.2026-10-17.') && f.text.includes('you wrote')) as Fact
    // 25 September is day 0, two check-ins a day from id 1: 17 October's evening check-in is id 46.
    expect(b.notes[evening.id]).toEqual({ store: 'checkins', id: '46', day: '2026-10-17', block: 'evening' })
    const kept = all.find((f) => f.text.includes('you kept a note')) as Fact
    expect(b.notes[kept.id]).toEqual({ store: 'notes', id: '700', day: '2026-10-10' })
    // Every note's line has its record, and no other line has one: 37 evenings and the one kept note.
    expect(Object.keys(b.notes)).toHaveLength(38)
    for (const id of Object.keys(b.notes)) expect(all.find((f) => f.id === id)?.values.category, id).toBe('notes')
  })

  it('tells two check-ins of one day apart, even when both notes say the same words', async () => {
    const store = standIn(() => 'The same words.')
    put(store, 'checkins', '900', '2026-10-17', { id: 900, day: '2026-10-17', block: 'afternoon', answers: {}, extras: { note: 'The same words.' }, completedAt: '2026-10-17T19:00:00.000Z' })
    const b = await built(store)
    const lines = b.parts.flatMap((p) => p.facts).filter((f) => f.id.startsWith('day.2026-10-17.') && f.text.includes('you wrote'))
    expect(lines.map((f) => [b.notes[f.id].id, b.notes[f.id].block])).toEqual([['900', 'afternoon'], ['46', 'evening']])
  })

  it('is not kept for a note of another day that says the same words', async () => {
    const b = await built(standIn(() => 'The same words.'))
    const lines = b.parts.flatMap((p) => p.facts).filter((f) => f.text.includes('you wrote'))
    expect(lines).toHaveLength(37)
    // Each line's record is its own day's evening check-in: day n of the stand-in record holds check-ins 2n+1 and 2n+2.
    for (const f of lines) {
      const day = f.id.split('.')[1]
      const n = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse('2026-09-25T00:00:00Z')) / 86_400_000)
      expect(b.notes[f.id], f.id).toEqual({ store: 'checkins', id: String(2 * n + 2), day, block: 'evening' })
    }
  })
})

describe('whole, or nothing', () => {
  it('builds nothing when a store’s read fell short of the database’s own count', async () => {
    const store = standIn()
    const real = store.countRecords.bind(store)
    // The database holds one row more than the read gave.
    store.countRecords = async (s, range) => (await real(s, range)) + (s === 'checkins' ? 1 : 0)
    expect(await buildMonth(ctx(store), '2026-10-01')).toEqual({ ok: false, reason: 'the month 2026-10 was not read whole: 74 of 75 rows of checkins' })
  })

  it('builds nothing for a month whose days after it have not all passed', async () => {
    const store = standIn()
    // The third day after October is 3 November: on that day it is not over yet.
    expect(await buildMonth(ctx(store, { day: '2026-11-03' }), '2026-10-01')).toEqual({ ok: false, reason: 'the month 2026-10 is read once 3 days have passed after it' })
    expect((await buildMonth(ctx(store, { day: '2026-11-04' }), '2026-10-01')).ok).toBe(true)
  })

  it('builds nothing for a day that is not a month’s first', async () => {
    expect(await buildMonth(ctx(standIn()), '2026-10-15')).toEqual({ ok: false, reason: '2026-10-15 is not the first day of a month' })
  })

  it('refuses a month that needs more parts than a read may have', async () => {
    expect(MONTH_PARTS_MOST).toBe(16)
    // Notes long enough that the month's lines pass sixteen parts of 32 KB.
    const store = standIn(() => 'word '.repeat(3200))
    const b = await buildMonth(ctx(store), '2026-10-01')
    expect(b.ok).toBe(false)
    expect((b as { reason: string }).reason).toMatch(/^the month 2026-10 needs \d+ parts, more than the 16 a read may have$/)
  })

  it('asks each store for four thousand rows at most in its one read', () => {
    expect(MONTH_READ).toBe(4000)
  })

  it('reads whole a store that holds more rows than an ordinary read gives', async () => {
    const store = standIn()
    for (let i = 0; i < 600; i++) put(store, 'notes', String(5000 + i), '2026-10-10', { id: 5000 + i, day: '2026-10-10', at: '2026-10-10T15:00:00.000Z', text: `Kept note ${i + 1}.` })
    const b = await built(store)
    expect(b.counts.notes).toBe(600)
    expect(b.parts.flatMap((p) => p.facts).filter((f) => f.text.includes('you kept a note'))).toHaveLength(600)
  })

  it('builds nothing when the finished workouts outran their one read', async () => {
    const store = standIn()
    store.readOutsideWorkouts = async () => Array.from({ length: 1000 }, (_, i) => ({ id: `w${i}`, body: null }))
    expect(await buildMonth(ctx(store), '2026-10-01')).toEqual({ ok: false, reason: 'the month 2026-10 was not read whole: the workouts outran one read' })
  })
})

describe('the parts', () => {
  const line = (day: string, n: number, size: number): Fact => ({ id: `day.${day}.${n}`, tags: [], text: 'x'.repeat(size), values: {} })
  const d = (day: string, sizes: number[], inside = true) => ({ day, inside, facts: sizes.map((s, i) => line(day, i + 1, s)) })

  it('hold whole days, closed before the day that would pass the size', () => {
    expect(MONTH_PART_BYTES).toBe(32 * 1024)
    const parts = partsOf([d('2026-10-01', [400, 400]), d('2026-10-02', [400]), d('2026-10-03', [400, 400])], 1300)
    expect(parts.map((p) => p.days)).toEqual([['2026-10-01', '2026-10-02'], ['2026-10-03']])
    expect(parts.map((p) => p.part)).toEqual([1, 2])
    expect(parts.map((p) => p.lines)).toEqual([3, 2])
    // No day is split, and every line is in exactly one part.
    expect(parts.flatMap((p) => p.facts.map((f) => f.id))).toEqual(['day.2026-10-01.1', 'day.2026-10-01.2', 'day.2026-10-02.1', 'day.2026-10-03.1', 'day.2026-10-03.2'])
  })

  it('give a day larger than a part one of its own, and skip a day with nothing recorded', () => {
    const parts = partsOf([d('2026-10-01', [100]), d('2026-10-02', [5000]), d('2026-10-03', []), d('2026-10-04', [100])], 1300)
    expect(parts.map((p) => p.days)).toEqual([['2026-10-01'], ['2026-10-02'], ['2026-10-04']])
  })

  it('name those of their days that are outside the month', () => {
    const parts = partsOf([d('2026-09-30', [100], false), d('2026-10-01', [100]), d('2026-11-01', [100], false)], 1300)
    expect(parts[0].outside).toEqual(['2026-09-30', '2026-11-01'])
  })

  it('split a real month into more than one part when its lines pass the size, each part under it', async () => {
    const b = await built(standIn(() => 'word '.repeat(400)))
    expect(b.parts.length).toBeGreaterThan(1)
    for (const p of b.parts) expect(p.bytes, `part ${p.part}`).toBeLessThanOrEqual(MONTH_PART_BYTES)
    expect(b.parts.map((p) => p.part)).toEqual(b.parts.map((_, i) => i + 1))
  })
})

describe('the fingerprint', () => {
  it('is the same for the same month read twice, and changes when a note in the month changes', async () => {
    const a = await built(standIn())
    const again = await built(standIn())
    expect(again.fingerprint).toBe(a.fingerprint)
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    const changed = await built(standIn((day) => (day === '2026-10-09' ? 'Another stand-in note.' : `A stand-in note for ${day}.`)))
    expect(changed.fingerprint).not.toBe(a.fingerprint)
  })

  it('does not change when a day beside the month changes: the month’s own lines alone are fingerprinted', async () => {
    const a = await built(standIn())
    const beside = await built(standIn((day) => (day === '2026-11-02' ? 'Another stand-in note.' : `A stand-in note for ${day}.`)))
    expect(beside.fingerprint).toBe(a.fingerprint)
    // The probe that can say yes: the line beside the month did change.
    expect(beside.parts.flatMap((p) => p.facts).some((f) => f.text.includes('Another stand-in note.'))).toBe(true)
  })

  it('reads ids and words in order', async () => {
    const f = (id: string, text: string): Fact => ({ id, tags: [], text, values: {} })
    expect(await fingerprintOf([f('a', 'one'), f('b', 'two')])).not.toBe(await fingerprintOf([f('b', 'two'), f('a', 'one')]))
    expect(await fingerprintOf([f('a', 'one')])).not.toBe(await fingerprintOf([f('a', 'one.')]))
  })
})

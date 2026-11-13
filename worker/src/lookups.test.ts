import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { BRAIN_SWITCHES, readBrainPrefs } from '../../src/brainShared'
import { copy } from '../../src/copy'
import catalogueJson from '../../src/catalogue.json'
import { kindsOf, type CountedInput } from '../../src/counted/kinds'
import { storedPatterns } from '../../src/counted/patterns'
import { patternTable } from '../../src/counted/table'
import { at as moment, checkin, context, day as dayN, input, offer, outcome } from '../../src/counted/testing'
import type { PrivateItem } from '../../src/db'
import type { Fact } from '../../src/factTypes'
import { GENERATED_STORE } from '../../src/pathJob'
import { OUTSIDE_APP, OUTSIDE_STORE } from '../../src/outsideRow'
import { CATEGORIES } from './briefing'
import { LOOKUP_PARAMS, mayRead, parseLookupQuery, runLookup, type LookupCtx, type LookupQuery } from './lookups'
import { accessFor, factCategories, gatesFrom, LOOKUPS, readOnDemand, type Catalogue } from './retrieval'
import { APP, memoryStore } from './turso'

// The lookups (2026-11-13), on stand-in records: what an Ask run may ask of the record beyond the day's sheet, each
// answered with facts, every one read under the same switches as every other read.

const TZ = 'America/New_York'
const DAY = '2026-11-12'
const NOW = new Date('2026-11-12T20:00:00.000Z')
const catalogue: Catalogue = new Map((catalogueJson as unknown as { moves: { id: string; name: string; family: string; hiddenWith?: string }[] }).moves.map((m) => [m.id, { name: m.name, family: m.family, ...(m.hiddenWith ? { hiddenWith: m.hiddenWith } : {}), tags: [] }]))

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, app = APP) => store.put({ app, store: s, id, day, body: JSON.stringify(body), updated_at: NOW.toISOString(), deleted: 0, synced_at: NOW.toISOString() })

const OPEN = gatesFrom({ hideFaith: false, privateInSelection: false })
const HIDDEN = gatesFrom({ hideFaith: true, privateInSelection: false })
const access = (off: string[] = [], gates = OPEN) => accessFor('ask', gates, readBrainPrefs({ switches: Object.fromEntries(off.map((k) => [k, false])) }))
const ctx = (store: Mem, over: Partial<LookupCtx> = {}): LookupCtx => ({ store, catalogue, a: access(), day: DAY, now: NOW, timeZone: TZ, showPrivate: true, question: '', ...over })
const run = (store: Mem, q: LookupQuery, over: Partial<LookupCtx> = {}) => runLookup(ctx(store, over), q)
const parse = (query: string) => parseLookupQuery(new URL(`https://w.test/claude/context?task=ask&day=${DAY}&${query}`), DAY)
const texts = (facts: readonly Fact[]) => facts.map((f) => f.text).join(' | ')
const ids = (facts: readonly Fact[]) => facts.map((f) => f.id)

// ─── The pattern table's stand-in record ────────────────────────────────────────────────────────

// Eight weeks of days. Dinner on Saturdays alone (a steady pattern); a private item tapped in the evening on the first
// twenty days; felt close to God on Sundays; a faith practice and a walk answered on most days; nothing else stands out.
const A = 250
const SPAN = 56
const weekday = (n: number): number => new Date(2026, 0, 1 + n).getDay()
const ITEM: PrivateItem = { id: 7, name: 'Zorblat', createdAt: moment(A - 5, 9), archived: 0 }
function counted(): CountedInput {
  const checkins = Array.from({ length: SPAN }, (_, i) => {
    const n = A + i
    return [
      checkin(n, 'morning', { answers: { sleepHours: weekday(n) === 1 ? 2 : 3, sleepQuality: 3 }, extras: { privateShown: { '7': true } } }),
      checkin(n, 'evening', { extras: { ...(weekday(n) === 6 ? { dinner: true } : {}), ...(weekday(n) === 0 ? { closeToGod: true } : {}), privateShown: { '7': true }, ...(i < 20 ? { private: { '7': true as const } } : {}) } }),
    ]
  }).flat()
  const offers = Array.from({ length: SPAN }, (_, i) => [offer(1000 + i, A + i, 'walk-ten'), offer(2000 + i, A + i, 'five-minutes-prayer')]).flat()
  const outcomes = Array.from({ length: SPAN }, (_, i) => [outcome(1000 + i, A + i, 'walk-ten', i % 2 ? 'done' : 'no'), outcome(2000 + i, A + i, 'five-minutes-prayer', i % 3 ? 'done' : 'no')]).flat()
  return input({ checkins, items: [ITEM], contexts: Array.from({ length: SPAN }, (_, i) => context(A + i, { churchDay: weekday(A + i) === 0 })), offers, outcomes })
}
const TABLE = storedPatterns(patternTable(counted(), dayN(A + SPAN)), NOW.toISOString())

function withTable(over: Partial<typeof TABLE> = {}): Mem {
  const store = memoryStore()
  put(store, 'patterns', 'table', null, { ...TABLE, ...over })
  return store
}

describe('a lookup query', () => {
  it('names one of eight lookups, and takes that lookup’s own parameters alone', () => {
    expect(LOOKUPS).toEqual(['kinds', 'pattern', 'day', 'moves', 'workouts', 'pathSteps', 'lines', 'forecast'])
    expect(Object.keys(LOOKUP_PARAMS).sort()).toEqual([...LOOKUPS].sort())
    expect(parse('lookup=kinds')).toEqual({ ok: true, query: { lookup: 'kinds' } })
    expect(parse('lookup=kinds&q=sleep')).toEqual({ ok: true, query: { lookup: 'kinds', q: 'sleep' } })
    expect(parse('lookup=pattern&kind=sleep.short')).toEqual({ ok: true, query: { lookup: 'pattern', kind: 'sleep.short' } })
    expect(parse('lookup=day&date=2026-11-10')).toEqual({ ok: true, query: { lookup: 'day', date: '2026-11-10' } })
    expect(parse('lookup=forecast&date=2026-11-13')).toEqual({ ok: true, query: { lookup: 'forecast', date: '2026-11-13' } })
    expect(parse('lookup=moves&from=2026-11-01&to=2026-11-10&limit=20')).toEqual({ ok: true, query: { lookup: 'moves', from: '2026-11-01', to: '2026-11-10', limit: 20 } })
    expect(parse('lookup=lines')).toEqual({ ok: true, query: { lookup: 'lines', from: '2026-10-13', to: DAY, limit: 50 } })
  })

  it('has a name on the phone for each lookup’s read, where what Claude read is listed', () => {
    const labels = copy.brainScreen.readLabels as Record<string, string>
    expect(LOOKUPS.map((l) => labels[`lookup.${l}`])).toEqual(['Lookup: what is counted', 'Lookup: when a thing was recorded', 'Lookup: one day', 'Lookup: moves', 'Lookup: workouts', 'Lookup: Path steps done', 'Lookup: past lines', 'Lookup: forecasts'])
  })

  it('refuses an unknown lookup, an unknown parameter, another lookup’s parameter, and a category beside a lookup', () => {
    const refused = (query: string) => {
      const r = parse(query)
      return r.ok ? null : r.reason
    }
    expect(refused('lookup=everything')).toBe('lookup "everything" is not one the layer names')
    expect(refused('lookup=pattern&kind=sleep.short&person=x')).toBe('unknown parameter "person" for the lookup pattern')
    expect(refused('lookup=pattern&kind=sleep.short&date=2026-11-10')).toBe('unknown parameter "date" for the lookup pattern')
    expect(refused('lookup=kinds&kind=sleep.short')).toBe('unknown parameter "kind" for the lookup kinds')
    expect(refused('lookup=day&date=2026-11-10&from=2026-11-01')).toBe('unknown parameter "from" for the lookup day')
    expect(refused('lookup=workouts&limit=5')).toBe('unknown parameter "limit" for the lookup workouts')
    expect(refused('lookup=kinds&category=notes')).toBe('ask for a category or a lookup, never both')
    expect(refused('lookup=pattern')).toBe('kind must be an id the lookup kinds gave')
    expect(refused('lookup=pattern&kind=a b')).toBe('kind must be an id the lookup kinds gave')
    expect(refused('lookup=day&date=tomorrow')).toBe('date must be a day, YYYY-MM-DD')
    expect(refused('lookup=day&date=2026-11-13')).toBe('date may not be after the task’s day')
    expect(refused('lookup=forecast&date=2026-11-20')).toBe('a forecast reaches 7 days ahead at most')
    expect(refused('lookup=moves&from=2026-11-10&to=2026-11-01')).toBe('from and to must be days, from before to')
    expect(refused('lookup=moves&to=2026-11-13')).toBe('to may not be after the task’s day')
    expect(refused('lookup=moves&from=2025-11-01')).toBe('from may reach back a year at most')
    expect(refused('lookup=moves&limit=101')).toBe('limit must be from 1 to 100')
    expect(refused(`lookup=kinds&q=${'x'.repeat(61)}`)).toBe('q is at most 60 characters')
  })
})

describe('the fact heads of the lookups', () => {
  const f = (id: string, category: unknown, tags: string[] = []): Fact => ({ id, tags, text: id, values: { category: category as string } })

  it('are each mapped on purpose: a lookup fact is read under the category it names, and faith’s tag adds faith', () => {
    for (const head of LOOKUPS) {
      expect(factCategories(f(`${head}.x`, 'notes'), new Map()), head).toEqual(['notes'])
      expect(factCategories(f(`${head}.x`, 'dayRecord', ['faith']), new Map()), head).toEqual(['dayRecord', 'faith'])
      expect(factCategories(f(`${head}.x`, 'faith', ['faith']), new Map()), head).toEqual(['faith'])
    }
  })

  it('let the Brain’s own past lines through for the lines lookup alone, under its history’s switch', () => {
    const line = f('lines.2026-11-10.1', 'brainHistory')
    expect(mayRead(line, access())).toBe(true)
    expect(mayRead(line, access(['brainHistory']))).toBe(false)
    // The same category on any other lookup's fact is not Ask's to read: its own profile leaves that category out.
    for (const head of LOOKUPS.filter((l) => l !== 'lines')) expect(mayRead(f(`${head}.x`, 'brainHistory'), access()), head).toBe(false)
  })

  it('read a category that is missing or unknown as closed, never as the day’s record', () => {
    for (const head of LOOKUPS) {
      for (const bad of [undefined, null, 7, 'everything', '']) {
        const cats = factCategories(f(`${head}.x`, bad), new Map())
        expect(cats, `${head} ${String(bad)}`).toEqual(['closed'])
        expect((CATEGORIES as readonly string[]).includes(cats[0])).toBe(false)
        expect(mayRead(f(`${head}.x`, bad), access())).toBe(false)
      }
    }
    // The probe that can say yes: a head that is no lookup's falls through to the day's record, as it always has.
    expect(factCategories(f('madeup.x', 'closed'), new Map())).toEqual(['dayRecord'])
  })
})

describe('the kinds lookup', () => {
  it('lists what the record counts, each with its id, its counts and its cut-off, and what it does not count', async () => {
    const r = await run(withTable(), { lookup: 'kinds' })
    expect(r).toMatchObject({ complete: true, notRead: 0 })
    const dinner = r.facts.find((x) => x.id === 'kinds.chip.dinner') as Fact
    expect(dinner.text).toBe('A late or heavy dinner: counted by the day; recorded at 8 of 56 it can speak for. Its pattern: lookup=pattern&kind=chip.dinner.')
    expect(dinner.values).toEqual({ occurrences: 8, known: 56, category: 'dayRecord' })
    const short = r.facts.find((x) => x.id === 'kinds.sleep.short') as Fact
    expect(short.text).toContain('cut-off: under six hours')
    expect(short.values).toMatchObject({ occurrences: 8, known: 56 })
    expect(r.facts.find((x) => x.id === 'kinds.private.7')?.text).toContain('Zorblat: counted by the check-in; recorded at 20 of 112')
    expect(ids(r.facts)).toEqual(expect.arrayContaining(['kinds.level', 'kinds.level.low', 'kinds.level.high', 'kinds.leftOut.journal', 'kinds.leftOut.voice']))
    expect(r.facts.find((x) => x.id === 'kinds.leftOut.journal')?.text).toBe('Not counted: the nightly journal. Never evidence: a statement from it carries no number, level or cause.')
  })

  it('filters by a keyword', async () => {
    const r = await run(withTable(), { lookup: 'kinds', q: 'sleep' })
    expect(ids(r.facts).sort()).toEqual(['kinds.sleep.long', 'kinds.sleep.short', 'kinds.sleep.sound'])
  })

  it('gives a private item’s name only where names may be shown, and marks the one a question names', async () => {
    const hidden = await run(withTable(), { lookup: 'kinds' }, { showPrivate: false })
    expect(texts(hidden.facts)).not.toContain('Zorblat')
    expect(hidden.facts.find((x) => x.id === 'kinds.private.7')?.text).toContain('A private item: counted by the check-in')
    const asked = await run(withTable(), { lookup: 'kinds' }, { showPrivate: false, question: 'When am I most likely to zorblat?' })
    expect(asked.facts.find((x) => x.id === 'kinds.private.7')?.text).toContain('This is the private item the question names.')
    expect(texts(asked.facts)).not.toContain('Zorblat')
    // A whole word only: a longer word that holds the name names nothing.
    const longer = await run(withTable(), { lookup: 'kinds' }, { showPrivate: false, question: 'What about zorblats?' })
    expect(longer.facts.find((x) => x.id === 'kinds.private.7')?.text).not.toContain('the question names')
    // With a keyword, the named one is still found, and nothing else private.
    const keyed = await run(withTable(), { lookup: 'kinds', q: 'sleep' }, { showPrivate: false, question: 'Is Zorblat tied to sleep?' })
    expect(ids(keyed.facts)).toContain('kinds.private.7')
  })

  it('drops a private kind with the private-items switch off, and every faith kind while faith is hidden', async () => {
    const off = await run(withTable(), { lookup: 'kinds' }, { a: access(['privateItems']) })
    expect(ids(off.facts).some((id) => id.startsWith('kinds.private.'))).toBe(false)
    const shown = ids((await run(withTable(), { lookup: 'kinds' })).facts)
    expect(shown).toEqual(expect.arrayContaining(['kinds.chip.closeToGod', 'kinds.context.church', 'kinds.move.five-minutes-prayer']))
    const hidden = await run(withTable(), { lookup: 'kinds' }, { a: access([], HIDDEN) })
    for (const id of ['kinds.chip.closeToGod', 'kinds.context.church', 'kinds.move.five-minutes-prayer']) expect(ids(hidden.facts), id).not.toContain(id)
    expect(texts(hidden.facts)).not.toMatch(/God|church|prayer/i)
    // The day's record switched off takes the kinds read under it; what is not counted is the app's own list and stays.
    const none = await run(withTable(), { lookup: 'kinds' }, { a: access(['dayRecord']) })
    expect(ids(none.facts)).not.toContain('kinds.chip.dinner')
    expect(ids(none.facts)).toContain('kinds.leftOut.journal')
  })

  it('says so when no table has been built, when it is stale, and when it cannot be read', async () => {
    expect(await run(memoryStore(), { lookup: 'kinds' })).toMatchObject({ complete: false, note: 'no pattern table has been built yet: the phone builds it when the app is next opened' })
    const old = '2026-11-10T19:59:59.000Z'
    expect((await run(withTable({ updatedAt: old }), { lookup: 'kinds' })).note).toBe(`the pattern table is stale (${old}): the phone rebuilds it when the app is next opened`)
    // Exactly 48 hours old is still served.
    expect((await run(withTable({ updatedAt: '2026-11-10T20:00:00.000Z' }), { lookup: 'kinds' })).note).toBeUndefined()
    expect((await run(withTable({ format: 2 as never }), { lookup: 'kinds' })).note).toBe('the pattern table could not be read')
  })
})

describe('the pattern lookup', () => {
  it('gives a kind as a whole and each cell as "k of n" against the rest, with its standing, in the app’s own words', async () => {
    const r = await run(withTable(), { lookup: 'pattern', kind: 'chip.dinner' })
    expect(r).toMatchObject({ complete: true, notRead: 0 })
    const whole = r.facts.find((x) => x.id === 'pattern.chip.dinner.all') as Fact
    expect(whole.text).toBe(`A late or heavy dinner: recorded at 8 of 56 days the record can speak for, up to ${dayN(A + SPAN - 1)}. 8 comparisons were looked at, by the weekday, a short night before. At least one stands as a steady pattern.`)
    expect(whole.values).toEqual({ occurrences: 8, known: 56, family: 8, category: 'dayRecord' })
    // The whole-kind fact carries no standing: it licenses no word of its own.
    expect('standing' in whole.values).toBe(false)
    const saturday = r.facts.find((x) => x.id === 'pattern.chip.dinner.weekday.6') as Fact
    expect(saturday.text).toBe('A steady pattern: a late or heavy dinner was recorded more often on Saturdays (8 of 8 on Saturdays, against 0 of 48 on other days).')
    expect(saturday.values).toEqual({ k: 8, n: 8, restK: 0, m: 48, pct: 100, restPct: 0, family: 8, standing: 'pattern', direction: 'higher', category: 'dayRecord' })
    const monday = r.facts.find((x) => x.id === 'pattern.chip.dinner.weekday.1') as Fact
    expect(monday.text).toBe('No clear pattern yet: a late or heavy dinner, 0 of 8 on Mondays, against 8 of 48 on other days.')
    expect(monday.values).toMatchObject({ standing: 'noPattern', pct: 0, restPct: 17 })
    // A short night came before the eight Mondays; no evening read low, so that split holds no cell and none is served.
    expect(ids(r.facts)).toContain('pattern.chip.dinner.shortNight.yes')
    expect(ids(r.facts)).not.toContain('pattern.chip.dinner.lowEvening.yes')
  })

  it('answers a kind with too few to compare with its whole-kind fact alone: the counts, and what is needed', async () => {
    const r = await run(withTable(), { lookup: 'pattern', kind: 'chip.napped' })
    expect(ids(r.facts)).toEqual(['pattern.chip.napped.all'])
    expect(r.facts[0].text).toBe(`A nap: recorded at 0 of 56 days the record can speak for, up to ${dayN(A + SPAN - 1)}. Too few to compare yet: a comparison needs 8 occasions in a cell and 8 outside it, and 5 occurrences in all.`)
    expect(r.facts[0].values).toEqual({ occurrences: 0, known: 56, family: 0, minSide: 8, minOccurrences: 5, category: 'dayRecord' })
  })

  it('carries the numbers a label says, so an answer that repeats the label is held to them', async () => {
    const r = await run(withTable(), { lookup: 'pattern', kind: 'level.low' })
    expect(r.facts[0].text).toContain('A check-in that read under 40 out of 100 (Worn down or Empty): recorded at 0 of 112 check-ins')
    expect(r.facts[0].values).toMatchObject({ said1: 40, said2: 100 })
  })

  it('gives the level as averages with their spread across the five bands, and no standing', async () => {
    const r = await run(withTable(), { lookup: 'pattern', kind: 'level' })
    const evening = r.facts.find((x) => x.id === 'pattern.level.checkin.evening') as Fact
    expect(evening.text).toBe('Check-ins in the evening read 50 out of 100 on average (56 check-ins: 0 Firing, 0 Solid, 56 Getting by, 0 Worn down, 0 Empty); at the other check-ins they read 50 (56 check-ins). An average describes and is no comparison: whether a difference stands is said by the two kinds "a check-in that read under 40" and "a check-in that read 80 or more".')
    expect(evening.values).toEqual({ mean: 50, n: 56, restMean: 50, restN: 56, scale: 100, low: 40, high: 80, band1: 0, band2: 0, band3: 56, band4: 0, band5: 0, category: 'dayRecord' })
    expect(r.facts.every((x) => !('standing' in x.values))).toBe(true)
  })

  it('answers an id the table does not hold and one the run may not read alike, and says a missing or stale table', async () => {
    const none = 'no kind "private.7" that this run may read: lookup=kinds lists the ids'
    expect(await run(withTable(), { lookup: 'pattern', kind: 'private.7' }, { a: access(['privateItems']) })).toMatchObject({ facts: [], note: none })
    expect((await run(withTable(), { lookup: 'pattern', kind: 'private.99' })).note).toBe('no kind "private.99" that this run may read: lookup=kinds lists the ids')
    expect((await run(withTable(), { lookup: 'pattern', kind: 'private.7' })).facts.length).toBeGreaterThan(1)
    // Names off: the same facts, the item unnamed.
    const unnamed = await run(withTable(), { lookup: 'pattern', kind: 'private.7' }, { showPrivate: false })
    expect(texts(unnamed.facts)).not.toContain('Zorblat')
    expect(unnamed.facts.find((x) => x.id === 'pattern.private.7.checkin.evening')?.text).toBe('A steady pattern: a private item was recorded more often in the evening (20 of 56 in the evening, against 0 of 56 at the other check-ins).')
    // Faith hidden: a faith kind is answered as no kind at all.
    expect((await run(withTable(), { lookup: 'pattern', kind: 'chip.closeToGod' }, { a: access([], HIDDEN) })).facts).toEqual([])
    expect((await run(withTable(), { lookup: 'pattern', kind: 'chip.closeToGod' })).facts.length).toBeGreaterThan(1)
    expect(await run(memoryStore(), { lookup: 'pattern', kind: 'chip.dinner' })).toMatchObject({ facts: [], complete: false })
    expect((await run(withTable({ updatedAt: '2026-11-01T00:00:00.000Z' }), { lookup: 'pattern', kind: 'chip.dinner' })).facts).toEqual([])
  })
})

// ─── One exact day ──────────────────────────────────────────────────────────────────────────────

const D = '2026-11-10'
/** A day that carried nearly everything, as the phone would have synced it. Times are New York's (UTC−5 in November). */
function richDay(over: { away?: boolean } = {}): Mem {
  const store = memoryStore()
  put(store, 'settings', '1', null, { id: 1, ownChips: [{ id: 'c1', label: 'called a friend', createdAt: '2026-10-01T12:00:00.000Z' }] })
  put(store, 'privateItems', '7', null, { id: 7, name: 'Zorblat', archived: 0 })
  put(store, 'days', D, D, { day: D, atOffice: true, pickupTime: '17:15', withHer: true, studyNight: true, churchDay: true, amongPeople: true, unwell: false, ...(over.away ? { awayFromHome: true } : {}) })
  put(store, 'checkins', '1', D, { id: 1, day: D, block: 'morning', startedAt: `${D}T12:05:00.000Z`, completedAt: `${D}T12:10:00.000Z`, answers: { mood: 3, sleepHours: 2, sleepQuality: 4 }, extras: { caffeineIntake: { band: 3, at: `${D}T12:10:00.000Z`, since: null } } })
  // The evening check-in, completed at half past midnight: the next calendar day, filed under this one.
  put(store, 'checkins', '2', D, { id: 2, day: D, block: 'evening', startedAt: '2026-11-11T05:25:00.000Z', completedAt: '2026-11-11T05:30:00.000Z', answers: { mood: 4, stress: 2 }, extras: { dinner: true, napped: true, sweet: true, nature: true, closeToGod: true, necessities: { shower: true }, teethBrushed: 0, private: { '7': true }, own: { c1: true }, note: 'a long day at work' } })
  const offerRow = (id: number, moveId: string, at: string, paths?: string[]) => put(store, 'offers', String(id), D, { id, day: D, block: 'morning', at, moveId, ...(paths ? { paths } : {}), skippedAt: null })
  const answer = (id: number, offerId: number, result: string, at: string) => put(store, 'outcomes', String(id), D, { id, offerId, day: D, outcome: result, at })
  offerRow(10, 'walk-ten', `${D}T13:00:00.000Z`)
  answer(20, 10, 'done', `${D}T13:20:00.000Z`)
  offerRow(11, 'five-minutes-prayer', `${D}T14:00:00.000Z`)
  answer(21, 11, 'done', `${D}T14:10:00.000Z`)
  offerRow(12, 'eye-contact-stranger', `${D}T15:00:00.000Z`, ['social'])
  answer(22, 12, 'no', `${D}T15:30:00.000Z`)
  offerRow(13, 'sp-record-point', `${D}T16:00:00.000Z`, ['speaking'])
  answer(23, 13, 'done', `${D}T16:20:00.000Z`)
  offerRow(14, 'g-1234abcd-hello', `${D}T17:00:00.000Z`, ['g-1234abcd'])
  answer(24, 14, 'partly', `${D}T17:20:00.000Z`)
  // A generated Path's step offered and not done: never listed.
  offerRow(15, 'g-1234abcd-second', `${D}T18:00:00.000Z`, ['g-1234abcd'])
  answer(25, 15, 'no', `${D}T18:20:00.000Z`)
  offerRow(16, 'glass-of-water', `${D}T19:00:00.000Z`)
  put(store, 'offers', '17', D, { id: 17, day: D, block: 'evening', at: `${D}T23:00:00.000Z`, moveId: 'nap-ten', skippedAt: `${D}T23:01:00.000Z` })
  put(store, 'notes', '30', D, { id: 30, day: D, at: `${D}T21:00:00.000Z`, text: 'kept this thought' })
  put(store, 'pathMarks', '40', D, { id: 40, path: 'social', kind: 'milestone', day: D, note: 'A first hello', at: `${D}T20:00:00.000Z` })
  put(store, 'workouts', 'w1', null, { completedAt: `${D}T22:00:00.000Z`, elapsedSeconds: 2700, title: 'Lower body' }, OUTSIDE_APP)
  void store.writeBrainRow(GENERATED_STORE, 'g-1234abcd:1', D, { pathId: 'g-1234abcd', version: '1', path: { name: 'A small garden', what: 'RESEARCH-MARKER' }, reps: [{ id: 'g-1234abcd-hello', name: 'Water the bed', why: 'RESEARCH-MARKER' }, { id: 'g-1234abcd-second', name: 'Weed one row' }], cards: [{ id: 'c1', claim: 'RESEARCH-MARKER' }], results: ['RESEARCH-MARKER'] }, NOW.toISOString())
  put(store, 'pathVersions', '50', null, { id: 50, path: 'g-1234abcd', version: '1', hash: 'h', decision: 'started', reason: 'RESEARCH-MARKER', at: `${D}T12:00:00.000Z`, cards: [] })
  return store
}
const dayOf = (store: Mem, over: Partial<LookupCtx> = {}) => run(store, { lookup: 'day', date: D }, over)

describe('the exact-day lookup', () => {
  it('lists the day’s records in the order of their clock times, worded as when written', async () => {
    const r = await dayOf(richDay())
    expect(r).toMatchObject({ complete: true, notRead: 0 })
    expect(r.facts.map((x) => x.text)).toEqual([
      `${D}: the day: at the office; a daycare day, pickup at 17:15; a preferred study day; a day out among people`,
      `${D}: a day with her`,
      `${D}: a church day`,
      `${D}, 07:10: the morning check-in: mood “Flat — nothing wrong, nothing good”, sleep hours “5 to 6 hours”, sleep quality “Sound — slept through, mostly rested”; also caffeine 200 to 299 mg`,
      `${D}, 08:00: A ten-minute walk, now offered, done at 08:20`,
      `${D}, 09:00: Five minutes of prayer offered, done at 09:10`,
      `${D}, 10:00: a step on the Social Path: Eye contact with a stranger, not done at 10:30`,
      `${D}, 11:00: a step on the Speaking Path: Record one point, done at 11:20`,
      `${D}, 12:00: a step on your Path “A small garden”: Water the bed, partly done at 12:20`,
      `${D}, 14:00: A full glass of water offered, not answered`,
      `${D}, 15:00: on the Social Path: a milestone: A first hello`,
      `${D}, 16:00: you kept a note: “kept this thought”`,
      `${D}, 17:00: a workout finished: Lower body, 45 minutes`,
      `${D}, 00:30 (on 2026-11-11 by the calendar; filed under ${D}): the evening check-in: mood “Warm — quietly glad about things”, stress “Light — a little pressure, nothing urgent”; also a late or heavy dinner, a nap, something sweet, 20 minutes or more in nature, a shower missed, teeth not brushed`,
      `${D}, 00:30 (on 2026-11-11 by the calendar; filed under ${D}): at the evening check-in: felt close to God`,
      `${D}, 00:30 (on 2026-11-11 by the calendar; filed under ${D}): at the evening check-in: Zorblat marked`,
      `${D}, 00:30 (on 2026-11-11 by the calendar; filed under ${D}): at the evening check-in you marked your own chip “called a friend”`,
      `${D}, 00:30 (on 2026-11-11 by the calendar; filed under ${D}): at the evening check-in you wrote: “a long day at work”`,
    ])
    expect(ids(r.facts)).toEqual(r.facts.map((_, i) => `day.${D}.${i + 1}`))
    // Every clock time a line says is in its values, so an answer that says it is held to it.
    expect(r.facts[4].values).toEqual({ at: '08:00', answeredAt: '08:20', category: 'dayRecord' })
    expect(r.facts[12].values).toEqual({ at: '17:00', minutes: 45, category: 'dayRecord' })
    // A skipped offer and a generated step that was not done are not on the day.
    expect(texts(r.facts)).not.toMatch(/nap, alarm set|Weed one row/)
  })

  it('never serves anything of a generated Path but the name of a step that was done', async () => {
    const r = await dayOf(richDay())
    expect(texts(r.facts)).not.toContain('RESEARCH-MARKER')
    const steps = await run(richDay(), { lookup: 'pathSteps', from: D, to: D, limit: 50 })
    expect(steps.facts.map((x) => x.text)).toEqual([`${D}: a step on the Speaking Path: Record one point, done`, `${D}: a step on your Path “A small garden”: Water the bed, partly done`])
    expect(texts(steps.facts)).not.toContain('RESEARCH-MARKER')
    expect(steps.facts.every((x) => x.values.category === 'commitments')).toBe(true)
    expect((await run(richDay(), { lookup: 'pathSteps', from: D, to: D, limit: 50 }, { a: access(['commitments']) })).facts).toEqual([])
  })

  it('says home time for a day logged while traveling', async () => {
    const r = await dayOf(richDay({ away: true }))
    expect(r.facts[0].text).toBe(`${D}: the day: out of town, traveling; a daycare day, pickup at 17:15; a preferred study day; a day out among people`)
    expect(r.facts.find((x) => x.text.includes('the morning check-in'))?.text).toContain(`${D}, 07:10 (home time: logged while traveling): the morning check-in`)
  })

  it('reads each line under its own switch: off means absent, and the numbering leaves no gap', async () => {
    const has = async (off: string[], gates = OPEN, over: Partial<LookupCtx> = {}) => texts((await dayOf(richDay(), { a: access(off, gates), ...over })).facts)
    const all = await has([])
    for (const [off, gone] of [
      [['notes'], /you wrote|your own chip|you kept a note/],
      [['privateItems'], /Zorblat|a private item/],
      [['her'], /a day with her/],
      [['socialPath'], /the Social Path/],
      [['commitments'], /the Speaking Path|A small garden/],
      [['dayRecord'], /the day: at the office|the morning check-in|A ten-minute walk|a workout finished/],
    ] as const) {
      expect(all, String(off)).toMatch(gone)
      expect(await has([...off]), String(off)).not.toMatch(gone)
    }
    // Faith hidden: the church day, the chip, the faith practice; and nothing else moves.
    expect(all).toMatch(/a church day|felt close to God|Five minutes of prayer/)
    const hidden = await dayOf(richDay(), { a: access([], HIDDEN) })
    expect(texts(hidden.facts)).not.toMatch(/church|God|prayer/i)
    expect(hidden.facts).toHaveLength(15)
    expect(ids(hidden.facts)).toEqual(hidden.facts.map((_, i) => `day.${D}.${i + 1}`))
    // A note whose own words hold a faith word is left out whole while faith is hidden, as everywhere else.
    const store = richDay()
    put(store, 'notes', '31', D, { id: 31, day: D, at: `${D}T21:30:00.000Z`, text: 'church ran long' })
    expect(texts((await dayOf(store)).facts)).toContain('church ran long')
    expect(texts((await dayOf(store, { a: access([], HIDDEN) })).facts)).not.toContain('church ran long')
    // Names off: the private item is marked, and unnamed.
    expect(await has([], OPEN, { showPrivate: false })).toContain('at the evening check-in: a private item marked')
    expect(await has([], OPEN, { showPrivate: false })).not.toContain('Zorblat')
  })

  it('says a day with nothing this run may read, and never reads the journal', async () => {
    const store = richDay()
    put(store, 'journal', D, D, { day: D, text: 'JOURNAL-MARKER' })
    expect(texts((await dayOf(store)).facts)).not.toContain('JOURNAL-MARKER')
    expect(await run(store, { lookup: 'day', date: '2026-11-01' })).toMatchObject({ facts: [], note: 'nothing this run may read is recorded for 2026-11-01' })
  })

  it('has a line for every kind the record counts: a kind added later is covered here or this test fails', async () => {
    // Each kind the list holds, by the start of its id, with the words its line on the day carries. A kind with no entry
    // fails below: it must be given a line here, or marked left out with why.
    const LINES: readonly [RegExp, RegExp | 'leftOut'][] = [
      [/^sleep\./, /sleep (hours|quality) “/],
      [/^evening\./, /the evening check-in: /],
      [/^level\./, /check-in: /],
      [/^chip\.dinner$/, /a late or heavy dinner/],
      [/^chip\.nothingLanded$/, /nothing landed/],
      [/^chip\.hardToSeePoint$/, /hard to see the point/],
      [/^chip\.napped$/, /a nap/],
      [/^chip\.coolingOff$/, /something rattled you/],
      [/^chip\.bigSocial$/, /a big social event/],
      [/^chip\.closeToGod$/, /felt close to God/],
      [/^necessity\.missed$/, /a shower missed|a meal missed|teeth not brushed/],
      [/^teeth\.none$/, /teeth not brushed/],
      [/^nature$/, /20 minutes or more in nature/],
      [/^caffeine\./, /caffeine (under 100|100 to 199|200 to 299|300) ?mg?/],
      [/^context\.withHer$/, /a day with her|she was away/],
      [/^context\.office$/, /at the office/],
      [/^context\.church$/, /a church day|the Sabbath|the Third Day/],
      [/^context\.studyNight$/, /a preferred study day/],
      [/^context\.unwell$/, /a day unwell/],
      [/^context\.amongPeople$/, /a day out among people/],
      [/^context\.away$/, /out of town, traveling/],
      [/^workout$/, /a workout finished/],
      [/^move\./, / offered, /],
      [/^path\.social$/, /a step on the Social Path/],
      [/^path\.partner$/, /a step on the Partner Path/],
      [/^sweet$/, /something sweet/],
      [/^private\./, / marked/],
      [/^own\./, /your own chip “/],
    ]
    const lineFor = (id: string) => LINES.find(([kind]) => kind.test(id))?.[1]
    // The whole list, from a record that holds one of everything the list can hold.
    const everything = input({
      checkins: [checkin(300, 'morning', { answers: { sleepHours: 2, sleepQuality: 4 } }), checkin(300, 'evening', { extras: { caffeineShown: true } })],
      contexts: [context(300)],
      items: [ITEM],
      chips: [{ id: 'c1', label: 'called a friend', createdAt: moment(290, 9) } as never],
      offers: [offer(1, 300, 'walk-ten'), offer(2, 300, 'eye-contact-stranger', { paths: ['social'] as never }), offer(3, 300, 'eye-contact-stranger', { paths: ['partner'] as never })],
      outcomes: [outcome(1, 300, 'walk-ten', 'done'), outcome(2, 300, 'eye-contact-stranger', 'done'), outcome(3, 300, 'eye-contact-stranger', 'done')],
      workoutDays: [dayN(300)],
    })
    const kinds = kindsOf(everything).map((k) => k.id)
    expect(kinds.length).toBeGreaterThan(40)
    expect(kinds.filter((id) => lineFor(id) === undefined)).toEqual([])
    // On the rich day: every kind whose line the day should carry is there.
    const store = richDay({ away: true })
    put(store, 'offers', '18', D, { id: 18, day: D, block: 'morning', at: `${D}T15:10:00.000Z`, moveId: 'eye-contact-stranger', paths: ['partner'], skippedAt: null })
    put(store, 'checkins', '3', D, { id: 3, day: D, block: 'afternoon', startedAt: `${D}T18:00:00.000Z`, completedAt: `${D}T18:05:00.000Z`, answers: { mood: 2 }, extras: { nothingLanded: true, hardToSeePoint: true, coolingOff: true, bigSocial: true } })
    put(store, 'days', D, D, { day: D, atOffice: true, pickupTime: '17:15', withHer: true, studyNight: true, churchDay: true, amongPeople: true, unwell: true, awayFromHome: true })
    const day = texts((await dayOf(store)).facts)
    const missing = (text: string) => LINES.filter(([kind, line]) => line !== 'leftOut' && String(kind) !== String(/^context\.office$/) && !(line as RegExp).test(text)).map(([kind]) => String(kind))
    expect(missing(day)).toEqual([])
    // The probe that can say yes: take one line off the day, and its kind is found missing.
    expect(missing(day.replace(/something sweet/g, ''))).toEqual([String(/^sweet$/)])
    // A day at the office, and not away: the office line.
    expect(texts((await dayOf(richDay())).facts)).toMatch(/at the office/)
  })
})

describe('the range lookups', () => {
  it('list ordinary moves day by day with what was answered, a faith practice only while faith may be read', async () => {
    const r = await run(richDay(), { lookup: 'moves', from: D, to: D, limit: 50 })
    expect(r.facts.map((x) => x.text)).toEqual([`${D}: A ten-minute walk, now offered, done`, `${D}: Five minutes of prayer offered, done`, `${D}: A full glass of water offered, not answered`])
    expect(ids(r.facts)).toEqual([`moves.${D}.1`, `moves.${D}.2`, `moves.${D}.3`])
    expect(r.complete).toBe(true)
    const hidden = await run(richDay(), { lookup: 'moves', from: D, to: D, limit: 50 }, { a: access([], HIDDEN) })
    expect(texts(hidden.facts)).not.toContain('prayer')
    expect(hidden.facts).toHaveLength(2)
    // The lookup's own limit: what it leaves out is said.
    expect(await run(richDay(), { lookup: 'moves', from: D, to: D, limit: 2 })).toMatchObject({ complete: false })
    expect((await run(richDay(), { lookup: 'moves', from: D, to: D, limit: 2 })).facts).toHaveLength(2)
    expect((await run(richDay(), { lookup: 'moves', from: D, to: D, limit: 50 }, { a: access(['dayRecord']) })).facts).toEqual([])
  })

  it('list each finished workout under its day in the home zone', async () => {
    const store = richDay()
    // Finished at 23:30 in New York: the next day by the Worker's own clock, this day at home.
    put(store, 'workouts', 'w2', null, { completedAt: '2026-11-10T04:30:00.000Z', elapsedSeconds: 1800 }, OUTSIDE_APP)
    put(store, OUTSIDE_STORE, 'mine', null, { completedAt: `${D}T22:00:00.000Z`, title: 'NOT-THE-OTHER-APP' })
    // One before the days asked for, and one after them: neither is listed.
    put(store, 'workouts', 'w3', null, { completedAt: '2026-11-05T22:00:00.000Z', elapsedSeconds: 600, title: 'Before the range' }, OUTSIDE_APP)
    put(store, 'workouts', 'w4', null, { completedAt: '2026-11-11T22:00:00.000Z', elapsedSeconds: 600, title: 'After the range' }, OUTSIDE_APP)
    const r = await run(store, { lookup: 'workouts', from: '2026-11-09', to: D, limit: 50 })
    expect(r.facts.map((x) => x.text)).toEqual([`${D}: a workout finished: Lower body, 45 minutes`, '2026-11-09: a workout finished, 30 minutes'])
    expect(r.facts[0].values).toEqual({ minutes: 45, category: 'dayRecord' })
    expect(texts(r.facts)).not.toMatch(/the range|NOT-THE-OTHER-APP/)
    // Steps of a Path of your own keep to the days asked for too, and say when their own limit left some out.
    const steps = await run(richDay(), { lookup: 'pathSteps', from: D, to: D, limit: 1 })
    expect(steps.facts).toHaveLength(1)
    expect(steps.complete).toBe(false)
    expect((await run(richDay(), { lookup: 'pathSteps', from: D, to: D, limit: 2 })).complete).toBe(true)
  })

  it('list the Brain’s own past lines and reviews under its history’s switch, their numbers grounding nothing', async () => {
    const store = richDay()
    void store.writeBrief({ id: `${D}:brief`, day: D, kind: 'brief', text: 'Three walks this week, and 62 this morning.', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: `${D}T12:48:00.000Z`, factsDay: D, refusals: [], writer: 'claude' }, `${D}T12:48:00.000Z`)
    void store.writeBrief({ id: '2026-11-08:review', day: '2026-11-08', kind: 'review', text: '', parts: { held: 'the walks held', didNot: 'the study days slipped', change: 'one block on Tuesday' }, mode: 'review', factIds: [], cardIds: [], model: 'm', at: '2026-11-08T15:00:00.000Z', factsDay: '2026-11-08', refusals: [], writer: 'claude' }, '2026-11-08T15:00:00.000Z')
    put(store, 'briefLog', '60', D, { id: 60, day: D, text: 'the phone’s own line', situationId: 'x' })
    put(store, 'briefLog', '61', D, { id: 61, day: D, text: 'a withdrawn line', situationId: 'y', withdrawnAt: `${D}T18:00:00.000Z` })
    const r = await run(store, { lookup: 'lines', from: '2026-11-01', to: D, limit: 50 })
    expect(r.facts.map((x) => x.text)).toEqual([`${D}: the line said “Three walks this week, and 62 this morning.”`, `${D}: the phone said “the phone’s own line”`, '2026-11-08: the weekly review said: what held: “the walks held”; what did not: “the study days slipped”; one change: “one block on Tuesday”'])
    // No number of an earlier line is in a fact's values: earlier words are never grounds.
    expect(r.facts.every((x) => Object.values(x.values).every((v) => typeof v !== 'number'))).toBe(true)
    expect((await run(store, { lookup: 'lines', from: '2026-11-01', to: D, limit: 50 }, { a: access(['brainHistory']) })).facts).toEqual([])
  })

  it('give a day’s stored forecasts as predictions, how each scored, and how often a range has held', async () => {
    const store = memoryStore()
    put(store, 'forecasts', '1', D, { id: 1, day: D, block: 'evening', horizon: 1, madeOn: '2026-11-09', model: 'weekday', point: 61.4, lo: 48, hi: 74, whatIf: null })
    put(store, 'forecasts', '2', D, { id: 2, day: D, block: 'morning', horizon: 0, madeOn: D, model: 'weekday', point: 55, lo: 40, hi: 70, whatIf: null })
    put(store, 'forecastScores', '3', D, { id: 3, day: D, block: 'evening', horizon: 1, model: 'weekday', point: 61.4, lo: 48, hi: 74, actual: 79, error: 17.6, hit: false, scoredOn: D })
    put(store, 'forecastScores', '4', '2026-11-08', { id: 4, day: '2026-11-08', block: 'evening', horizon: 1, model: 'weekday', point: 60, lo: 45, hi: 75, actual: 62, error: 2, hit: true, scoredOn: '2026-11-08' })
    put(store, 'forecastScores', '5', '2026-11-07', { id: 5, day: '2026-11-07', block: 'evening', horizon: 1, model: 'weekday', point: 60, lo: 45, hi: 75, actual: 50, error: 10, hit: true, scoredOn: '2026-11-07' })
    const r = await run(store, { lookup: 'forecast', date: D })
    expect(r.facts.map((x) => x.text)).toEqual([
      `A forecast for the morning of ${D}, made on ${D} (the same day): expect about 55 out of 100, in a range of 40 to 70. A forecast is a prediction, never a finding.`,
      `A forecast for the evening of ${D}, made on 2026-11-09 (1 day ahead): expect about 61 out of 100, in a range of 48 to 74. It then read 79: outside the range. A forecast is a prediction, never a finding.`,
      'Of 3 forecasts scored so far, the range held for 2 (67 in 100).',
    ])
    expect(ids(r.facts)).toEqual([`forecast.${D}.morning.0`, `forecast.${D}.evening.1`, 'forecast.scorecard'])
    expect(r.facts[1].values).toEqual({ point: 61, lo: 48, hi: 74, horizon: 1, scale: 100, actual: 79, category: 'dayRecord' })
    expect(r.facts[2].values).toEqual({ scored: 3, hits: 2, pct: 67, scale: 100, category: 'dayRecord' })
    expect((await run(store, { lookup: 'forecast', date: '2026-11-11' })).note).toBe('no forecast is stored for 2026-11-11')
    expect((await run(store, { lookup: 'forecast', date: D }, { a: access(['dayRecord']) })).facts).toEqual([])
  })
})

describe('every lookup against every switch', () => {
  it('serves no fact of a category whose switch is off, whatever the lookup', async () => {
    const store = richDay()
    put(store, 'patterns', 'table', null, TABLE)
    // A line of the Brain's own, so its history has something to serve too.
    void store.writeBrief({ id: `${D}:brief`, day: D, kind: 'brief', text: 'A stand-in line.', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: `${D}T12:48:00.000Z`, factsDay: D, refusals: [], writer: 'claude' }, `${D}T12:48:00.000Z`)
    const queries: LookupQuery[] = [{ lookup: 'kinds' }, { lookup: 'pattern', kind: 'private.7' }, { lookup: 'pattern', kind: 'chip.dinner' }, { lookup: 'day', date: D }, { lookup: 'moves', from: D, to: D, limit: 50 }, { lookup: 'workouts', from: D, to: D, limit: 50 }, { lookup: 'pathSteps', from: D, to: D, limit: 50 }, { lookup: 'lines', from: D, to: D, limit: 50 }, { lookup: 'forecast', date: D }]
    // The probe that can say yes, first: with every switch on, the same lookups serve facts of these categories.
    const served = new Set((await Promise.all(queries.map((q) => run(store, q)))).flatMap((r) => r.facts.map((f) => String(f.values.category))))
    expect([...served].sort()).toEqual(['brainHistory', 'commitments', 'dayRecord', 'factSheet', 'faith', 'her', 'notes', 'privateItems', 'socialPath'])
    expect(BRAIN_SWITCHES).toHaveLength(14)
    let checked = 0
    for (const off of BRAIN_SWITCHES) {
      for (const q of queries) {
        const r = await run(store, q, { a: access([off]) })
        expect(r.facts.filter((f) => f.values.category === off), `${off} ${q.lookup}`).toEqual([])
        checked++
      }
      // And the switch took nothing it does not govern: every other category is still served.
      const still = new Set((await Promise.all(queries.map((q) => run(store, q, { a: access([off]) })))).flatMap((r) => r.facts.map((f) => String(f.values.category))))
      for (const c of served) if (c !== off && !(off === 'faith' && c === 'faith')) expect(still.has(c), `${c} with ${off} off`).toBe(true)
    }
    expect(checked).toBe(14 * 9)
    // And every fact a lookup serves names a category the layer knows.
    for (const q of queries) for (const f of (await run(store, q)).facts) expect((CATEGORIES as readonly string[]).includes(String(f.values.category)), f.id).toBe(true)
  })
})

describe('a read that was cut says so', () => {
  it('a category’s read of 501 rows is not whole, and says how many rows it did not read', async () => {
    const store = memoryStore()
    for (let i = 0; i < 501; i++) put(store, 'monthlyChecks', String(i), '2026-11-01', { month: '2026-11', answers: {} })
    const got = await readOnDemand(store, catalogue, access(), 'monthlyCheck', { from: '2026-10-01', to: DAY, limit: 50 }, DAY, 'run', 1, NOW, 64 * 1024)
    expect(got).toMatchObject({ complete: false, notRead: 1, linesLeftOut: 450 })
    // 500 rows are read whole from the database; the reader's own limit of 50 lines is what was left out.
    const fewer = memoryStore()
    for (let i = 0; i < 500; i++) put(fewer, 'monthlyChecks', String(i), '2026-11-01', { month: '2026-11', answers: {} })
    expect(await readOnDemand(fewer, catalogue, access(), 'monthlyCheck', { from: '2026-10-01', to: DAY, limit: 50 }, DAY, 'run', 1, NOW, 64 * 1024)).toMatchObject({ complete: false, notRead: 0, linesLeftOut: 450 })
    const whole = memoryStore()
    for (let i = 0; i < 20; i++) put(whole, 'monthlyChecks', String(i), '2026-11-01', { month: '2026-11', answers: {} })
    expect(await readOnDemand(whole, catalogue, access(), 'monthlyCheck', { from: '2026-10-01', to: DAY, limit: 50 }, DAY, 'run', 1, NOW, 64 * 1024)).toMatchObject({ complete: true, notRead: 0, linesLeftOut: 0, truncated: false })
  })

  it('a lookup whose read of the database was cut is not whole', async () => {
    const store = memoryStore()
    // 2,001 offers on the day, fifty of them ordinary moves: the lookup's own limit of a hundred is not reached, and the
    // read of the database is one row short of whole. Only that makes the answer not whole.
    for (let i = 0; i < 2001; i++) put(store, 'offers', String(i), D, { id: i, day: D, moveId: i < 50 ? 'walk-ten' : 'nothing', at: `${D}T13:00:00.000Z`, skippedAt: null })
    const r = await run(store, { lookup: 'moves', from: D, to: D, limit: 100 })
    expect(r.facts).toHaveLength(50)
    expect(r).toMatchObject({ complete: false, notRead: 1 })
    // The probe that can say yes: one offer fewer, and the same answer is whole.
    const whole = memoryStore()
    for (let i = 0; i < 2000; i++) put(whole, 'offers', String(i), D, { id: i, day: D, moveId: i < 50 ? 'walk-ten' : 'nothing', at: `${D}T13:00:00.000Z`, skippedAt: null })
    expect(await run(whole, { lookup: 'moves', from: D, to: D, limit: 100 })).toMatchObject({ complete: true, notRead: 0 })
  })
})

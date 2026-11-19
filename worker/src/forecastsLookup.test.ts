import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import { copy } from '../../src/copy'
import type { Fact } from '../../src/factTypes'
import { movedFact, runLookup, type LookupCtx, type LookupQuery } from './lookups'
import * as prompt from './prompt'
import { accessFor, factCategories, gatesFrom, type Catalogue } from './retrieval'
import { APP, memoryStore } from './turso'

// The lookup of stored forecasts, with what moved them (2026-11-14): beside each forecast the challenger moved, the
// points and the conditions, read under the switch of every one of them; the way the latest forecasts rest on; the
// day-ahead record as the Weekly View counts it; the moved forecasts' own record. Stand-in rows only.

const DAY = '2026-11-12'
const D = '2026-11-12'
const NOW = new Date('2026-11-12T20:00:00.000Z')
const catalogue: Catalogue = new Map()
type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: NOW.toISOString(), deleted: 0, synced_at: NOW.toISOString() })
const OPEN = gatesFrom({ hideFaith: false, privateInSelection: false })
const access = (off: string[] = []) => accessFor('ask', OPEN, readBrainPrefs({ switches: Object.fromEntries(off.map((k) => [k, false])) }))
const ctx = (store: Mem, over: Partial<LookupCtx> = {}): LookupCtx => ({ store, catalogue, a: access(), day: DAY, now: NOW, timeZone: 'America/New_York', showPrivate: true, question: '', ...over })
const run = (store: Mem, q: LookupQuery, over: Partial<LookupCtx> = {}) => runLookup(ctx(store, over), q)
const ids = (facts: readonly Fact[]) => facts.map((f) => f.id)
const Q: LookupQuery = { lookup: 'forecasts', date: D }

const row = (id: number, block: string, horizon: number, more: Record<string, unknown> = {}) => ({ id, day: D, block, horizon, madeOn: D, model: 'weekdayBlock', point: 49, lo: 40, hi: 58, whatIf: null, ...more })
const MOVED = { adj: -3.3, adjBy: ['sleep.short', 'private.7', 'noticed.raised-voice'] }

function store(moved: Record<string, unknown> = MOVED): Mem {
  const s = memoryStore()
  put(s, 'forecasts', '1', D, row(1, 'morning', 0, moved))
  put(s, 'forecasts', '2', D, row(2, 'evening', 1))
  put(s, 'privateItems', '7', null, { id: 7, name: 'Stand-in item' })
  return s
}
const movedOf = (facts: readonly Fact[]) => facts.find((f) => f.id === `forecasts.${D}.morning.0.moved`)

describe('the stored forecasts, with what moved them', () => {
  it('says beside a moved forecast how far it was moved and for what, and reads it under the switch of every condition', async () => {
    const r = await run(store(), Q)
    expect(ids(r.facts)).toEqual([`forecasts.${D}.morning.0`, `forecasts.${D}.morning.0.moved`, `forecasts.${D}.evening.1`, 'forecasts.way'])
    const m = movedOf(r.facts) as Fact
    expect(m.text).toBe('This forecast was set about 3 points lower than its way gave on its own, for what the record held the day before: whether the last night reported before the day was short; Stand-in item marked the evening before; the evening before’s note, which Claude noticed as “Raised my voice”. A forecast is moved by what went with the mornings before, never by a cause.')
    expect(m.values).toEqual({ points: 3, dir: 'lower', by: 'sleep.short|private.7|noticed.raised-voice', kinds: 'dayRecord|privateItems|notes', category: 'dayRecord' })
    // The stored forecast itself carries its way, the field the check of a difference reads.
    expect(r.facts[0].values.model).toBe('weekdayBlock')
    // A forecast moved higher says so: the direction is read from the row's own sign.
    const up = movedOf((await run(store({ adj: 2.4, adjBy: ['sleep.short'] }), Q)).facts) as Fact
    expect(up.values).toEqual({ points: 2, dir: 'higher', by: 'sleep.short', kinds: 'dayRecord', category: 'dayRecord' })
    expect(up.text).toContain('set about 2 points higher than its way gave')
    expect(factCategories(m, new Map())).toEqual(['dayRecord', 'privateItems', 'notes'])
    // The unmoved forecast has no such fact.
    expect(r.facts.some((f) => f.id === `forecasts.${D}.evening.1.moved`)).toBe(false)
  })

  it('names a private item only where names may be shown, and serves nothing of a moved forecast while one of its switches is off', async () => {
    const hidden = movedOf((await run(store(), Q, { showPrivate: false })).facts) as Fact
    expect(hidden.text).toContain('a private item marked the evening before')
    expect(hidden.text).not.toContain('Stand-in item')
    for (const off of ['privateItems', 'notes']) {
      const r = await run(store(), Q, { a: access([off]) })
      expect(movedOf(r.facts), off).toBeUndefined()
      // The forecast itself, a prediction of the day's record, is still served.
      expect(ids(r.facts)).toContain(`forecasts.${D}.morning.0`)
    }
    // A forecast moved by the church day is read under faith too, and by its words while faith is hidden.
    const church = movedOf((await run(store({ adj: 2, adjBy: ['night.churchDay'] }), Q)).facts) as Fact
    expect(factCategories(church, new Map())).toEqual(['dayRecord', 'faith'])
    expect(movedOf((await run(store({ adj: 2, adjBy: ['night.churchDay'] }), Q, { a: access(['faith']) })).facts)).toBeUndefined()
  })

  it('makes no fact of a condition the forecast does not know, with the read layer’s own closing set aside', () => {
    // The read layer closes an unknown kind too; this is the lookup's own guard, asked directly.
    expect(movedFact(`forecasts.${D}.morning.0`, { adj: -3, adjBy: ['sleep.short', 'night.unknown'] }, () => null)).toBeNull()
    expect(movedFact(`forecasts.${D}.morning.0`, { adj: -3, adjBy: ['sleep.short'] }, () => null)?.id).toBe(`forecasts.${D}.morning.0.moved`)
  })

  it('closes a kind the read layer does not name', () => {
    const f: Fact = { id: `forecasts.${D}.morning.0.moved`, tags: [], text: 'x', values: { category: 'dayRecord', kinds: 'dayRecord|bogus' } }
    expect(factCategories(f, new Map())).toEqual(['dayRecord', 'closed'])
  })

  it('tells both tiers of Ask the forecast’s one rule, once', () => {
    for (const tier of ['ask', 'deep'] as const) expect(prompt.askInstructions(tier, 450, null).split('\n').filter((line) => line === prompt.FORECAST_RULE)).toHaveLength(1)
    // It names the words the checker reads where the two differ, and the two cases it reads them in.
    expect(prompt.FORECAST_RULE).toContain('say so in one of these words: "differ", "disagree" or "does not match"')
    expect(prompt.FORECAST_RULE).toContain('pattern.level.low.weekday.* or pattern.level.high.weekday.*')
  })

  it('serves nothing of a condition the forecast does not know, and nothing for a row nothing moved', async () => {
    expect(movedOf((await run(store({ adj: -3, adjBy: ['sleep.short', 'night.unknown'] }), Q)).facts)).toBeUndefined()
    expect(movedOf((await run(store({ adj: 0, adjBy: ['sleep.short'] }), Q)).facts)).toBeUndefined()
    expect(movedOf((await run(store({ adj: -0.3, adjBy: ['sleep.short'] }), Q)).facts)?.text).toContain('set by less than a point than its way gave')
  })

  it('says which way the latest forecasts rest on, in the Weekly View’s own words, and whether it can tell weekdays apart', async () => {
    const s = store()
    put(s, 'forecasts', '9', '2026-11-19', { ...row(9, 'evening', 7), day: '2026-11-19', madeOn: '2026-11-12', model: 'sameBlock' })
    put(s, 'forecasts', '8', '2026-11-18', { ...row(8, 'evening', 7), day: '2026-11-18', madeOn: '2026-11-11', model: 'blend' })
    const way = (await run(s, Q)).facts.find((f) => f.id === 'forecasts.way') as Fact
    expect(way.text).toBe(`The latest forecasts, made on 2026-11-12, rest on ${copy.brief.models.sameBlock}, as the Weekly View names the way. That way cannot tell one weekday from another, so its days ahead come out alike.`)
    put(s, 'forecasts', '10', '2026-11-20', { ...row(10, 'evening', 7), day: '2026-11-20', madeOn: '2026-11-13', model: 'blend' })
    expect(((await run(s, Q)).facts.find((f) => f.id === 'forecasts.way') as Fact).text).toContain(`rest on ${copy.brief.models.blend}, as the Weekly View names the way. That way can tell one weekday from another.`)
  })

  it('gives the day-ahead record exactly as the Weekly View counts it, and the moved forecasts’ own once one is scored', async () => {
    const s = store()
    const score = (i: number, horizon: number, hit: boolean, day = `2026-10-${String(10 + i).padStart(2, '0')}`) => put(s, 'forecastScores', `s${horizon}.${i}`, day, { day, block: 'morning', horizon, model: 'weekdayBlock', point: 50, lo: 40, hi: 60, actual: hit ? 50 : 70, error: hit ? 0 : 20, hit, scoredOn: day })
    for (let i = 0; i < 19; i++) score(i, 1, i % 3 !== 0)
    for (let i = 0; i < 5; i++) score(i, 0, false)
    const few = (await run(s, Q)).facts.find((f) => f.id === 'forecasts.dayAhead') as Fact
    expect(few.text).toBe('Of 19 day-ahead forecasts scored so far, 12 landed inside their range. The Weekly View says how often they land once 20 are scored, and until then how the range is sized. This is the forecast’s own track record, from forecasts written before their outcomes.')
    expect(few.values).toEqual({ scored: 19, hits: 12, from: 20, category: 'dayRecord' })
    score(19, 1, true)
    const twenty = (await run(s, Q)).facts.find((f) => f.id === 'forecasts.dayAhead') as Fact
    expect(twenty.text).toBe('As the Weekly View counts it: of 20 day-ahead forecasts scored so far, 13 landed inside their range (65 percent). This is the forecast’s own track record, from forecasts written before their outcomes.')
    expect(twenty.values).toEqual({ scored: 20, hits: 13, pct: 65, scale: 100, category: 'dayRecord' })
    // No moved forecast is scored yet: no record of its own.
    expect((await run(s, Q)).facts.some((f) => f.id === 'forecasts.movedRecord')).toBe(false)
    put(s, 'forecastScores', 'moved', D, { day: D, block: 'morning', horizon: 0, model: 'weekdayBlock', point: 49, lo: 40, hi: 58, actual: 45, error: -4, hit: true, scoredOn: D })
    // A row that holds the field with no number in it is no moved forecast, even scored.
    put(s, 'forecasts', '3', D, row(3, 'afternoon', 0, { adj: null, adjBy: [] }))
    put(s, 'forecastScores', 'not', D, { day: D, block: 'afternoon', horizon: 0, model: 'weekdayBlock', point: 49, lo: 40, hi: 58, actual: 45, error: -4, hit: false, scoredOn: D })
    const moved = (await run(s, Q)).facts.find((f) => f.id === 'forecasts.movedRecord') as Fact
    expect(moved.text).toBe('Of 1 forecast moved by what the record held the day before and scored so far, the range held for 1 (100 in 100).')
    expect(moved.values).toEqual({ scored: 1, hits: 1, pct: 100, scale: 100, category: 'dayRecord' })
  })
})

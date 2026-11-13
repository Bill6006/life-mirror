import { describe, expect, it, vi } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import catalogueJson from '../../src/catalogue.json'
import type { Fact } from '../../src/factTypes'
import { NOTE_MOMENTS, NOTE_PAGE, NOTE_PAGES, NOTES_SERVED, parseLookupQuery, runLookup, type LookupCtx, type LookupQuery } from './lookups'
import { accessFor, factCategories, gatesFrom, type Catalogue } from './retrieval'
import { APP, memoryStore } from './turso'

// The notes searched for whole words (2026-11-13), on stand-in notes: how many notes hold the words, when those notes
// were written set beside when notes are written at all, and each note that holds them. A share, never a rate.

const TZ = 'America/New_York'
const DAY = '2026-11-12'
const NOW = new Date('2026-11-12T20:00:00.000Z')
const catalogue: Catalogue = new Map((catalogueJson as unknown as { moves: { id: string; name: string; family: string }[] }).moves.map((m) => [m.id, { name: m.name, family: m.family, tags: [] }])) as unknown as Catalogue

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, deleted = 0) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: NOW.toISOString(), deleted, synced_at: NOW.toISOString() })
const OPEN = gatesFrom({ hideFaith: false, privateInSelection: false })
const HIDDEN = gatesFrom({ hideFaith: true, privateInSelection: false })
const access = (off: string[] = [], gates = OPEN) => accessFor('ask', gates, readBrainPrefs({ switches: Object.fromEntries(off.map((k) => [k, false])) }))
const ctx = (store: Mem, over: Partial<LookupCtx> = {}): LookupCtx => ({ store, catalogue, a: access(), day: DAY, now: NOW, timeZone: TZ, showPrivate: true, question: '', ...over })
const run = (store: Mem, q: LookupQuery, over: Partial<LookupCtx> = {}) => runLookup(ctx(store, over), q)
const parse = (query: string) => parseLookupQuery(new URL(`https://w.test/claude/context?task=ask&day=${DAY}&${query}`), DAY)
const byId = (facts: readonly Fact[], id: string): Fact => facts.find((f) => f.id === id) as Fact
const ids = (facts: readonly Fact[]) => facts.map((f) => f.id)

/** Day n of the stand-in record: day 0 is Saturday 1 August 2026. */
const dayOf = (n: number): string => new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10)
const FROM = '2025-11-11'
const search = (words: string[], over: Partial<{ from: string; to: string }> = {}): LookupQuery => ({ lookup: 'noteWords', words, from: FROM, to: DAY, ...over })
let nextId = 1
const note = (store: Mem, n: number, block: string, text: string, id = String(nextId++)): string => {
  put(store, 'checkins', id, dayOf(n), { id: Number(id), day: dayOf(n), block, answers: {}, extras: { note: text } })
  return id
}

/** Twelve weeks, a note every morning and evening; what each note says is the caller's. */
function twelveWeeks(words: (n: number, block: string) => string): Mem {
  const store = memoryStore()
  for (let n = 0; n < 84; n++) for (const block of ['morning', 'evening']) note(store, n, block, words(n, block))
  return store
}
/** The words on Saturday evenings alone. */
const saturdays = () => twelveWeeks((n, block) => (n % 7 === 0 && block === 'evening' ? 'I yelled at the dog again' : 'a quiet one'))

describe('the note-words query', () => {
  it('takes the words, and searches the whole year unless it is told the days', () => {
    expect(parse('lookup=noteWords&q=yell,yelled')).toEqual({ ok: true, query: { lookup: 'noteWords', words: ['yell', 'yelled'], from: FROM, to: DAY } })
    expect(parse('lookup=noteWords&q=yelled%20at&from=2026-10-01&to=2026-10-31')).toEqual({ ok: true, query: { lookup: 'noteWords', words: ['yelled at'], from: '2026-10-01', to: '2026-10-31' } })
  })

  it('is refused without words, with a word the rule refuses, with another lookup’s parameter, and with days out of reach', () => {
    expect(parse('lookup=noteWords')).toEqual({ ok: false, reason: 'q: the words to search for' })
    expect(parse('lookup=noteWords&q=y')).toEqual({ ok: false, reason: 'each word or phrase is 2 to 40 characters' })
    expect(parse('lookup=noteWords&q=a%25b')).toEqual({ ok: false, reason: 'a word or phrase holds letters, digits, spaces, apostrophes and hyphens only' })
    expect(parse('lookup=noteWords&q=aa,bb,cc,dd,ee,ff')).toEqual({ ok: false, reason: 'at most 5 words or phrases in one search' })
    expect(parse('lookup=noteWords&q=yell&limit=5')).toEqual({ ok: false, reason: 'unknown parameter "limit" for the lookup noteWords' })
    expect(parse('lookup=noteWords&q=yell&kind=x')).toEqual({ ok: false, reason: 'unknown parameter "kind" for the lookup noteWords' })
    expect(parse('lookup=noteWords&q=yell&category=notes')).toEqual({ ok: false, reason: 'ask for a category or a lookup, never both' })
    expect(parse('lookup=noteWords&q=yell&to=2026-11-13')).toEqual({ ok: false, reason: 'to may not be after the task’s day' })
    expect(parse('lookup=noteWords&q=yell&from=2025-11-10')).toEqual({ ok: false, reason: 'from may reach back a year at most' })
    expect(parse('lookup=noteWords&q=yell&from=2026-11-02&to=2026-11-01')).toEqual({ ok: false, reason: 'from and to must be days, from before to' })
    // The days' reach, stated: a year and a day back from the task's day.
    expect(parse('lookup=noteWords&q=yell&from=2025-11-11')).toMatchObject({ ok: true })
  })
})

describe('whole words only', () => {
  it('counts a note that holds the word whole, and none that holds it inside a longer word', async () => {
    const store = memoryStore()
    const whole = [note(store, 1, 'evening', 'I yell at the tv'), note(store, 2, 'morning', 'Yell.'), note(store, 3, 'evening', 'so\nyell\nagain'), note(store, 4, 'morning', 'a (yell) in brackets')]
    for (const text of ['I yelled at him', 'yelling again', 'a yellow day', 'unyell', 'nothing of it']) note(store, 5, 'afternoon', text)
    const r = await run(store, search(['yell']))
    expect(byId(r.facts, 'noteWords.all').values).toMatchObject({ holding: 4, notes: 9, words: 'yell' })
    expect(ids(r.facts).filter((id) => id.startsWith('noteWords.note.'))).toHaveLength(whole.length)
    // The stem is not searched for the owner: "yelled" is its own word, asked for by name.
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1, notes: 9 })
    expect(byId((await run(store, search(['yell', 'yelled', 'yelling']))).facts, 'noteWords.all').values).toMatchObject({ holding: 6, notes: 9, words: 'yell|yelled|yelling' })
  })

  it('counts a note once however often it holds the words, and a phrase across a line break', async () => {
    const store = memoryStore()
    note(store, 1, 'evening', 'yell, yell, and then yell again')
    note(store, 2, 'evening', 'I yelled\nat him')
    note(store, 3, 'evening', 'I yelled, at no one')
    expect(byId((await run(store, search(['yell']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1, notes: 3 })
    expect(byId((await run(store, search(['yelled at']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1, notes: 3 })
    // Two of the words in one note: still one note.
    expect(byId((await run(store, search(['yelled', 'at']))).facts, 'noteWords.all').values).toMatchObject({ holding: 2, notes: 3 })
  })

  it('finds a word whatever its case, and one the database’s own search cannot match by its letters', async () => {
    const store = memoryStore()
    note(store, 1, 'evening', 'At the CAFÉ again')
    note(store, 2, 'evening', 'the ÉTÉ was long')
    note(store, 3, 'evening', 'YELLED')
    expect(byId((await run(store, search(['café']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1 })
    expect(byId((await run(store, search(['été']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1 })
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1 })
  })

  it('counts only notes: a check-in with no note, an empty note, and a word elsewhere in the record are nothing', async () => {
    const store = memoryStore()
    note(store, 1, 'evening', 'I yelled')
    note(store, 2, 'evening', '   ')
    note(store, 3, 'evening', '\n\t')
    put(store, 'checkins', '900', dayOf(4), { id: 900, day: dayOf(4), block: 'evening', answers: {}, extras: { yelled: true } })
    put(store, 'checkins', '901', dayOf(5), { id: 901, day: dayOf(5), block: 'yelled', answers: {}, extras: {} })
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1, notes: 1 })
  })
})

describe('what the search gives', () => {
  it('says how many notes hold the words of all the notes written, names the words and the notes, and what a note count is', async () => {
    const r = await run(saturdays(), search(['yelled']))
    const all = byId(r.facts, 'noteWords.all')
    const family = all.values.family as number
    expect(all.text).toBe(
      `Your notes from ${FROM} to ${DAY} were searched for the whole word “yelled”: 12 of the 168 notes written at check-ins hold it. This counts notes, a share of the times you wrote one, never how often the thing happened: a note shows when it was written, not when the thing happened. ${family} comparisons of when they were written were looked at. The notes: ${[77, 70, 63, 56, 49, 42, 35, 28, 21, 14, 7, 0].map((n) => `${dayOf(n)} evening`).join(', ')}.`,
    )
    expect(all.values).toEqual({ holding: 12, notes: 168, kept: 0, family, words: 'yelled', category: 'notes' })
    expect(factCategories(all, new Map())).toEqual(['notes'])
    expect(r).toMatchObject({ complete: true, notRead: 0 })
    // Each note that holds the words, the newest first, as the notes category words it; none of the others.
    const notes = r.facts.filter((f) => f.id.startsWith('noteWords.note.'))
    expect(notes).toHaveLength(12)
    expect(notes[0]).toMatchObject({ id: `noteWords.note.${dayOf(77)}.1`, text: `${dayOf(77)}: at the evening check-in you wrote: “I yelled at the dog again”`, values: { words: 'yelled', category: 'notes' } })
    expect(notes.every((f) => f.text.includes('yelled'))).toBe(true)
  })

  it('sets when the notes holding the words were written beside when notes are written at all, each with its standing', async () => {
    const r = await run(saturdays(), search(['yelled']))
    const sat = byId(r.facts, 'noteWords.weekday.6')
    const family = sat.values.family as number
    // Every weekday has 24 notes and two check-ins have 84: nine comparisons could be tested, and all were.
    expect(family).toBe(9)
    expect(sat.values).toMatchObject({ k: 12, n: 24, restK: 0, m: 144, holding: 12, notes: 168, standing: 'pattern', direction: 'higher', split: 'weekday', cell: '6', words: 'yelled', category: 'notes' })
    expect(sat.text).toBe(`A steady pattern: notes written on Saturdays held the words more often than notes written on other days (12 of the 24 notes written on Saturdays hold the words, against 0 of the 144 written on other days). The notes: ${[77, 70, 63, 56, 49, 42, 35, 28, 21, 14, 7, 0].map((n) => `${dayOf(n)} evening`).join(', ')}.`)
    // A weekday with none of them: its counts, and no pattern said of it.
    const mon = byId(r.facts, 'noteWords.weekday.1')
    expect(mon.values).toMatchObject({ k: 0, n: 24, restK: 12, m: 144, standing: 'noPattern' })
    expect(mon.text).toBe('No clear pattern yet: of the 12 notes that hold “yelled”, 0 were written on Mondays; of all 168 notes, 24 were written on Mondays.')
    // By the check-in: all twelve in the evening, 12 of 84 against 0 of 84, a gap under the size worth saying.
    expect(byId(r.facts, 'noteWords.checkin.evening').values).toMatchObject({ k: 12, n: 84, restK: 0, m: 84, standing: 'noPattern' })
    expect(byId(r.facts, 'noteWords.checkin.morning').values).toMatchObject({ k: 0, n: 84, restK: 12, m: 84 })
    // A check-in at which no note was written is not a cell.
    expect(ids(r.facts)).not.toContain('noteWords.checkin.afternoon')
    // Every number a fact says is in its values, for the one checker.
    for (const f of r.facts.filter((x) => !x.id.startsWith('noteWords.note.'))) {
      const said = (f.text.replace(/\d{4}-\d{2}-\d{2}/g, ' ').match(/\d+/g) ?? []).map(Number)
      const held = Object.values(f.values).filter((v): v is number => typeof v === 'number')
      for (const n of said) expect(held, `${f.id} says ${n}`).toContain(n)
    }
  })

  it('stands a check-in as a steady pattern when the share there is far from the rest', async () => {
    const store = twelveWeeks((n, block) => (block === 'evening' && n % 3 !== 0 ? 'yelled tonight' : 'a quiet one'))
    const evening = byId((await run(store, search(['yelled']))).facts, 'noteWords.checkin.evening')
    expect(evening.values).toMatchObject({ k: 56, n: 84, restK: 0, m: 84, standing: 'pattern', direction: 'higher' })
    expect(evening.text.startsWith('A steady pattern: notes written in the evening held the words more often than notes written at the other check-ins (56 of the 84 notes written in the evening hold the words, against 0 of the 84 written at the other check-ins).')).toBe(true)
  })

  it('answers too few to compare with the counts and what a comparison needs', async () => {
    const store = twelveWeeks((n, block) => (block === 'evening' && n < 3 ? 'yelled tonight' : 'a quiet one'))
    const r = await run(store, search(['yelled']))
    const all = byId(r.facts, 'noteWords.all')
    expect(all.values).toMatchObject({ holding: 3, notes: 168, family: 0, minSide: 8, minOccurrences: 5 })
    expect(all.text).toContain('3 of the 168 notes written at check-ins hold it.')
    expect(all.text).toContain('Too few to compare when they were written: a comparison needs at least 5 notes holding the words, and 8 notes on each side.')
    for (const f of r.facts.filter((x) => /^noteWords\.(weekday|checkin)\./.test(x.id))) expect(f.values.standing, f.id).toBe('tooFew')
    expect(byId(r.facts, 'noteWords.checkin.evening').text).toBe(`Too few to compare yet: of the 3 notes that hold “yelled”, 3 were written in the evening; of all 168 notes, 84 were written in the evening. The notes: ${[2, 1, 0].map((n) => `${dayOf(n)} evening`).join(', ')}.`)
  })

  it('says no note holds the words with the count alone, and no cell', async () => {
    const r = await run(saturdays(), search(['zebra']))
    expect(ids(r.facts)).toEqual(['noteWords.all'])
    expect(r.facts[0].text).toBe(`Your notes from ${FROM} to ${DAY} were searched for the whole word “zebra”: 0 of the 168 notes written at check-ins hold it. This counts notes, a share of the times you wrote one, never how often the thing happened: a note shows when it was written, not when the thing happened.`)
    expect(r.facts[0].values).toMatchObject({ holding: 0, notes: 168, family: 0 })
  })

  it('lists a kept note that holds the words, and keeps it out of the shares', async () => {
    const store = saturdays()
    put(store, 'notes', '30', dayOf(40), { id: 30, day: dayOf(40), at: `${dayOf(40)}T21:00:00.000Z`, text: 'I yelled more this month' })
    put(store, 'notes', '31', dayOf(41), { id: 31, day: dayOf(41), at: `${dayOf(41)}T21:00:00.000Z`, text: 'nothing of it' })
    const r = await run(store, search(['yelled']))
    const all = byId(r.facts, 'noteWords.all')
    expect(all.values).toMatchObject({ holding: 12, notes: 168, kept: 1 })
    expect(all.text).toContain('12 of the 168 notes written at check-ins hold it, and 1 of the notes you kept from a question.')
    expect(byId(r.facts, `noteWords.kept.${dayOf(40)}.1`)).toMatchObject({ text: `${dayOf(40)}: you kept a note: “I yelled more this month”`, values: { words: 'yelled', category: 'notes' } })
    expect(byId(r.facts, 'noteWords.weekday.6').values).toMatchObject({ k: 12, n: 24 })
  })

  it('searches only the days it was asked for', async () => {
    const r = await run(saturdays(), search(['yelled'], { from: dayOf(0), to: dayOf(13) }))
    expect(byId(r.facts, 'noteWords.all').values).toMatchObject({ holding: 2, notes: 28 })
    expect(byId(r.facts, 'noteWords.all').text).toContain(`Your notes from ${dayOf(0)} to ${dayOf(13)} were searched`)
  })

  it('calls nothing a pattern, on twenty stand-in records whose notes hold the words at random', async () => {
    let patterns = 0
    for (let seed = 1; seed <= 20; seed++) {
      let x = seed * 7919
      const coin = (): number => {
        x = (x * 16807) % 2147483647
        return x / 2147483647
      }
      const store = twelveWeeks(() => (coin() < 0.15 ? 'yelled a bit' : 'a quiet one'))
      const cells = (await run(store, search(['yelled']))).facts.filter((f) => /^noteWords\.(weekday|checkin)\./.test(f.id))
      expect(cells.length, `seed ${seed}`).toBe(9)
      patterns += cells.filter((f) => f.values.standing === 'pattern').length
    }
    // One family in twenty may show a pattern by chance alone; none did on these.
    expect(patterns).toBe(0)
  })

  it('costs little: a year of notes searched and compared in under three quarters of a second here', async () => {
    const store = memoryStore()
    for (let n = 0; n < 365; n++) for (const block of ['morning', 'afternoon', 'evening']) note(store, n - 262, block, (n * 7 + block.length) % 11 === 0 ? 'yelled a bit' : 'a quiet one')
    const t0 = performance.now()
    const r = await run(store, search(['yelled']))
    const ms = performance.now() - t0
    expect(byId(r.facts, 'noteWords.all').values).toMatchObject({ notes: 1095 })
    expect(byId(r.facts, 'noteWords.all').values.family).toBe(10)
    expect(ms).toBeLessThan(750)
  })
})

describe('the journal, the switches and faith', () => {
  it('never reads the journal: a word that is only there is in no note, and no read names its store', async () => {
    const store = saturdays()
    put(store, 'journal', '2026-10-01', '2026-10-01', { id: '2026-10-01', day: '2026-10-01', text: 'zebra zebra zebra, and I yelled' })
    const reads = vi.spyOn(store, 'readRecords')
    const counts = vi.spyOn(store, 'countRecords')
    const one = vi.spyOn(store, 'readRecord')
    const r = await run(store, search(['zebra', 'yelled']))
    expect(byId(r.facts, 'noteWords.all').values).toMatchObject({ holding: 12, notes: 168 })
    // The probe can say yes: the search did read, and what it read is named here.
    expect([...new Set(reads.mock.calls.map((c) => c[0]))].sort()).toEqual(['checkins', 'notes'])
    for (const spy of [reads, counts, one]) expect(spy.mock.calls.map((c) => c[0])).not.toContain('journal')
    expect(r.facts.map((f) => f.text).join(' ')).not.toContain('zebra zebra')
  })

  it('serves nothing with the notes switch off, and everything again with it on', async () => {
    const store = saturdays()
    expect((await run(store, search(['yelled']), { a: access(['notes']) })).facts).toEqual([])
    expect((await run(store, search(['yelled']))).facts.length).toBeGreaterThan(10)
    // Another switch off takes nothing from it.
    expect((await run(store, search(['yelled']), { a: access(['privateItems']) })).facts.length).toBeGreaterThan(10)
  })

  it('with faith hidden neither counts nor serves a note that holds a faith word, and refuses a search for one', async () => {
    const store = memoryStore()
    const plain = note(store, 1, 'evening', 'I yelled at the dog')
    note(store, 2, 'evening', 'I prayed and then yelled')
    note(store, 3, 'evening', 'a quiet one')
    // Faith may be read: both notes are counted, and the one with a faith word carries faith's tag.
    const open = await run(store, search(['yelled']))
    expect(byId(open.facts, 'noteWords.all').values).toMatchObject({ holding: 2, notes: 3 })
    expect(open.facts.filter((f) => f.tags.includes('faith')).map((f) => f.text)).toEqual([`${dayOf(2)}: at the evening check-in you wrote: “I prayed and then yelled”`])
    // Faith hidden: one note holds the words, and no fact holds a faith word.
    const hidden = await run(store, search(['yelled']), { a: access([], HIDDEN) })
    expect(byId(hidden.facts, 'noteWords.all').values).toMatchObject({ holding: 1, notes: 3 })
    expect(hidden.facts.filter((f) => f.id.startsWith('noteWords.note.'))).toHaveLength(1)
    expect(hidden.facts.map((f) => f.text).join(' ')).not.toMatch(/pray/i)
    expect(plain).toBeTruthy()
    // A faith word is not searched at all while faith is hidden.
    expect(await run(store, search(['prayed']), { a: access([], HIDDEN) })).toEqual({ facts: [], complete: true, notRead: 0, note: 'these words are not searched while faith is hidden' })
    expect(await run(store, search(['yelled', 'church']), { a: access([], HIDDEN) })).toMatchObject({ facts: [], note: 'these words are not searched while faith is hidden' })
    expect(byId((await run(store, search(['prayed']))).facts, 'noteWords.all').values).toMatchObject({ holding: 1 })
  })
})

describe('a note deleted or edited', () => {
  it('leaves the count at the next search', async () => {
    const store = saturdays()
    const extra = note(store, 30, 'afternoon', 'I yelled at lunch')
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 13, notes: 169 })
    // Edited: the same check-in, its note no longer holding the word.
    put(store, 'checkins', extra, dayOf(30), { id: Number(extra), day: dayOf(30), block: 'afternoon', answers: {}, extras: { note: 'a calm lunch' } })
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 12, notes: 169 })
    // Its note taken off: it is no longer a note at all.
    put(store, 'checkins', extra, dayOf(30), { id: Number(extra), day: dayOf(30), block: 'afternoon', answers: {}, extras: {} })
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 12, notes: 168 })
    // A check-in deleted: its note leaves both counts.
    const gone = note(store, 31, 'afternoon', 'I yelled again')
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 13, notes: 169 })
    put(store, 'checkins', gone, dayOf(31), { id: Number(gone), day: dayOf(31), block: 'afternoon', answers: {}, extras: { note: 'I yelled again' } }, 1)
    expect(byId((await run(store, search(['yelled']))).facts, 'noteWords.all').values).toMatchObject({ holding: 12, notes: 168 })
  })
})

describe('a search larger than a page', () => {
  it('reads on, page by page, until every note is counted, and says the newest are listed', async () => {
    const store = memoryStore()
    for (let n = 0; n < 150; n++) for (const block of ['morning', 'afternoon', 'evening']) note(store, n - 100, block, 'yelled once more')
    const r = await run(store, search(['yelled']))
    expect(byId(r.facts, 'noteWords.all').values).toMatchObject({ holding: 450, notes: 450, more: 438 })
    expect(byId(r.facts, 'noteWords.all').text).toContain(', and 438 more.')
    expect(r.facts.filter((f) => f.id.startsWith('noteWords.note.'))).toHaveLength(30)
    expect(r).toMatchObject({ complete: false, notRead: 0, note: 'the newest 30 of the notes that hold the words are listed; every one is counted' })
    // The sizes, stated as they are.
    expect([NOTE_PAGE, NOTE_PAGES, NOTE_MOMENTS, NOTES_SERVED]).toEqual([200, 10, 2000, 30])
  })

  it('says it stopped short when the notes holding the words outrun its pages, and how many rows it did not read', async () => {
    const store = memoryStore()
    for (let n = 0; n < 300; n++) for (let i = 0; i < 7; i++) note(store, n - 260, ['morning', 'afternoon', 'evening'][i % 3], 'yelled once more')
    const r = await run(store, search(['yelled']))
    expect(r.complete).toBe(false)
    expect(r.notRead).toBeGreaterThan(0)
    expect(r.note).toBe('the search stopped before every note was read')
    // What it counted is what it read, never more.
    expect(byId(r.facts, 'noteWords.all').values.holding as number).toBeLessThan(2100)
  })

  it('says it stopped short when more check-ins hold a note than it counts among', async () => {
    const store = memoryStore()
    for (let n = 0; n < 300; n++) for (let i = 0; i < 7; i++) note(store, n - 260, ['morning', 'afternoon', 'evening'][i % 3], n === 5 && i === 0 ? 'yelled once' : 'a quiet one')
    const r = await run(store, search(['yelled']))
    expect(byId(r.facts, 'noteWords.all').values).toMatchObject({ notes: 2000 })
    expect(r).toMatchObject({ complete: false, note: 'the search stopped before every note was read' })
  })
})

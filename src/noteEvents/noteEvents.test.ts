import { afterEach, describe, expect, it } from 'vitest'
import { kindsOf, NOTICED_MIN } from '../counted/kinds'
import { patternTable } from '../counted/table'
import { checkin, context, day, input } from '../counted/testing'
import { countedNotices, noticedOf, type NoteKept, type NoteOfCheckin } from './join'
import { FORGET_ID, NOTE_EVENTS_STORE, noteEventOf, wrongIdOf, type NoteEvent, type NoteMark } from './shared'
import { EVENT_TYPES, eventTypeFaults, eventTypeOf, eventTypes, setEventTypesForTests, STAND_IN_TYPES, STAND_IN_TYPES_KEY, type EventType } from './types'

// What is noticed in notes (2026-11-13), on stand-in types and stand-in notes: the one list of event types, the row
// the Worker will write, and the join that decides on the phone which events stand and which count.

const TYPES: readonly EventType[] = [
  { id: 'raised-voice', label: 'Raised my voice', definition: 'A stand-in definition.', was: ['yelled', 'shouted'] },
  { id: 'late-screen', label: 'A late screen', definition: 'Another stand-in definition.' },
]

afterEach(() => setEventTypesForTests(null))

describe('the one list of event types', () => {
  it('holds the six first types, each a general behaviour with what counts as one, and no fault', () => {
    expect(EVENT_TYPES.map((t) => [t.id, t.label])).toEqual([
      ['raised-voice', 'Raised my voice'],
      ['argument', 'An argument'],
      ['up-late', 'Up late'],
      ['skipped-plan', 'Skipped a plan'],
      ['gave-in', 'Gave in to an urge'],
      ['pain-or-illness', 'Pain or illness'],
    ])
    for (const t of EVENT_TYPES) expect(t.definition, t.id).toMatch(/^The note says you .+\.$/)
    expect(eventTypeOf('raised-voice')?.definition).toBe('The note says you yelled, shouted or raised your voice at someone.')
    expect(eventTypeFaults()).toEqual([])
    expect(eventTypes()).toEqual(EVENT_TYPES)
    // No type has an earlier id yet, and an id no type knows is no type.
    expect(EVENT_TYPES.some((t) => t.was?.length)).toBe(false)
    expect(eventTypeOf('yelled')).toBeNull()
  })

  it('reads an event stored under an earlier id as the type it is today: a rename merges, never splits', () => {
    expect(eventTypeOf('raised-voice', TYPES)?.id).toBe('raised-voice')
    expect(eventTypeOf('yelled', TYPES)?.id).toBe('raised-voice')
    expect(eventTypeOf('shouted', TYPES)?.id).toBe('raised-voice')
    expect(eventTypeOf('late-screen', TYPES)?.label).toBe('A late screen')
    // An id no type knows, now or before, is no type.
    expect(eventTypeOf('whispered', TYPES)).toBeNull()
    expect(eventTypeOf('', TYPES)).toBeNull()
  })

  it('says what is wrong with a list: an id two types answer to, a malformed id, a type with no label or definition', () => {
    expect(eventTypeFaults(TYPES)).toEqual([])
    expect(eventTypeFaults(STAND_IN_TYPES)).toEqual([])
    // An earlier id that another type now uses would hand one stored event to two types.
    expect(eventTypeFaults([...TYPES, { id: 'yelled', label: 'Yelled', definition: 'x' }])).toEqual(['yelled: named by raised-voice and by yelled'])
    expect(eventTypeFaults([TYPES[0], { id: 'quiet', label: 'Quiet', definition: 'x', was: ['shouted'] }])).toEqual(['shouted: named by raised-voice and by quiet'])
    expect(eventTypeFaults([{ id: 'twice', label: 'a', definition: 'b' }, { id: 'twice', label: 'c', definition: 'd' }])).toEqual(['twice: named by twice and by twice'])
    expect(eventTypeFaults([{ id: 'Raised Voice', label: 'a', definition: 'b' }])).toEqual(['Raised Voice: an id is lower-case letters and digits, hyphens between'])
    expect(eventTypeFaults([{ id: 'ok', label: ' ', definition: '' }])).toEqual(['ok: no label', 'ok: no definition'])
  })

  it('is read with two stand-in types beside it only by an automated browser holding the test key', () => {
    const g = globalThis as { navigator?: unknown; localStorage?: unknown }
    const before = { navigator: Object.getOwnPropertyDescriptor(g, 'navigator'), localStorage: Object.getOwnPropertyDescriptor(g, 'localStorage') }
    const set = (webdriver: boolean, key: string | null) => {
      Object.defineProperty(g, 'navigator', { configurable: true, value: { webdriver } })
      Object.defineProperty(g, 'localStorage', { configurable: true, value: { getItem: (k: string) => (k === STAND_IN_TYPES_KEY ? key : null) } })
    }
    try {
      set(true, '1')
      expect(eventTypes().map((t) => t.id)).toEqual(['raised-voice', 'argument', 'up-late', 'skipped-plan', 'gave-in', 'pain-or-illness', 'stand-in-one', 'stand-in-two'])
      // A browser in a hand is not automated: the key opens nothing there. Nor does an automated one without the key.
      set(false, '1')
      expect(eventTypes()).toEqual(EVENT_TYPES)
      set(true, null)
      expect(eventTypes()).toEqual(EVENT_TYPES)
      set(true, '0')
      expect(eventTypes()).toEqual(EVENT_TYPES)
      expect(STAND_IN_TYPES_KEY).toBe('life-mirror.preview.noticed')
    } finally {
      for (const name of ['navigator', 'localStorage'] as const) {
        if (before[name]) Object.defineProperty(g, name, before[name] as PropertyDescriptor)
        else delete g[name]
      }
    }
  })
})

describe('a note event’s row', () => {
  const body = { type: 'raised-voice', note: { store: 'checkins', id: '12', day: '2026-11-07', block: 'evening' }, quote: 'I yelled at the dog', noticedAt: '2026-12-01T10:00:00.000Z', method: 'month-1' }

  it('is read whole, from the row’s words or from the object, its note’s id as a word either way', () => {
    const want: NoteEvent = { id: 'e1', type: 'raised-voice', note: { store: 'checkins', id: '12', day: '2026-11-07', block: 'evening' }, quote: 'I yelled at the dog', noticedAt: '2026-12-01T10:00:00.000Z', method: 'month-1' }
    expect(noteEventOf('e1', body)).toEqual(want)
    expect(noteEventOf('e1', JSON.stringify(body))).toEqual(want)
    expect(noteEventOf('e1', { ...body, note: { ...body.note, id: 12 } })).toEqual(want)
    // A kept note has no check-in.
    expect(noteEventOf('e2', { ...body, note: { store: 'notes', id: '30', day: '2026-11-07' } })).toMatchObject({ note: { store: 'notes', id: '30', day: '2026-11-07' } })
    expect(NOTE_EVENTS_STORE).toBe('noteEvents')
  })

  it('is not kept when any part is missing or malformed: nothing half-read counts', () => {
    const bad: unknown[] = [null, 'not json', '[]', 7, { ...body, type: '' }, { ...body, quote: '   ' }, { ...body, quote: undefined }, { ...body, noticedAt: 'yesterday' }, { ...body, method: 5 }, { ...body, note: null }, { ...body, note: { ...body.note, store: 'journal' } }, { ...body, note: { ...body.note, id: '' } }, { ...body, note: { ...body.note, day: '7 Nov' } }]
    for (const b of bad) expect(noteEventOf('e1', b), JSON.stringify(b)).toBeNull()
    expect(noteEventOf('', body)).toBeNull()
    // An unknown check-in name is dropped, the event kept.
    expect(noteEventOf('e1', { ...body, note: { ...body.note, block: 'night' } })?.note).toEqual({ store: 'checkins', id: '12', day: '2026-11-07' })
  })
})

// ─── The join ────────────────────────────────────────────────────────────────────────────────────────

const C = (id: number, n: number, note?: string): NoteOfCheckin => ({ id, day: day(n), block: 'evening', ...(note === undefined ? {} : { extras: { note } }) })
const E = (id: string, checkinId: number, quote: string, over: Partial<NoteEvent> = {}): NoteEvent => ({ id, type: 'raised-voice', note: { store: 'checkins', id: String(checkinId), day: day(checkinId), block: 'evening' }, quote, noticedAt: '2026-03-01T10:00:00.000Z', method: 'month-1', ...over })
const wrong = (eventId: string): NoteMark => ({ id: wrongIdOf(eventId), kind: 'wrong', at: '2026-03-02T10:00:00.000Z', updatedAt: '2026-03-02T10:00:00.000Z' })
const forget = (at: string): NoteMark => ({ id: FORGET_ID, kind: 'forget', at, updatedAt: at })
const CHECKINS = [C(1, 1, 'I yelled at the dog'), C(2, 2, 'yelled again, then slept'), C(3, 3, 'a quiet one'), C(4, 4)]
const KEPT: NoteKept[] = [{ id: 30, day: day(5), text: 'I yelled more this month' }]
const join = (events: NoteEvent[], marks: NoteMark[] = [], checkins = CHECKINS, kept = KEPT) => noticedOf({ events, marks, checkins, kept, types: TYPES })

describe('what stands, of what was noticed', () => {
  it('is an event whose type is known, whose note is in the record and still holds the quoted words', () => {
    const all = join([E('a', 1, 'yelled at the dog'), E('b', 2, 'yelled again')])
    expect(all.map((n) => [n.event.id, n.type.id, n.wrong, n.checkinId])).toEqual([
      ['b', 'raised-voice', false, 2],
      ['a', 'raised-voice', false, 1],
    ])
    expect(countedNotices(all)).toEqual([
      { type: 'raised-voice', label: 'Raised my voice', checkinId: 2 },
      { type: 'raised-voice', label: 'Raised my voice', checkinId: 1 },
    ])
  })

  it('drops an event of a type the list does not know', () => {
    expect(join([E('a', 1, 'yelled at the dog', { type: 'whispered' })])).toEqual([])
    // The same event under a known type stands: the type alone decided.
    expect(join([E('a', 1, 'yelled at the dog')])).toHaveLength(1)
  })

  it('drops an event whose note is gone from the record', () => {
    expect(join([E('a', 9, 'yelled at the dog')])).toEqual([])
    expect(join([E('a', 1, 'yelled at the dog')], [], CHECKINS.filter((c) => c.id !== 1))).toEqual([])
    // A check-in that is there but holds no note any more.
    expect(join([E('a', 4, 'anything')])).toEqual([])
  })

  it('drops an event whose note no longer holds the quoted words, exactly', () => {
    expect(join([E('a', 3, 'yelled at the dog')])).toEqual([])
    // Edited: one letter's case, or a word changed, and the words are no longer there.
    expect(join([E('a', 1, 'Yelled at the dog')])).toEqual([])
    expect(join([E('a', 1, 'yelled at the cat')])).toEqual([])
    expect(join([E('a', 1, 'I yelled at the dog')])).toHaveLength(1)
    // A quote of spaces alone is no quote.
    expect(join([E('a', 1, '   ')])).toEqual([])
  })

  it('drops everything noticed up to the forget moment, and nothing noticed after it', () => {
    const events = [E('a', 1, 'yelled at the dog', { noticedAt: '2026-03-01T10:00:00.000Z' }), E('b', 2, 'yelled again', { noticedAt: '2026-04-01T10:00:00.000Z' })]
    expect(join(events, [forget('2026-03-15T00:00:00.000Z')]).map((n) => n.event.id)).toEqual(['b'])
    // Noticed at the very moment is forgotten with the rest.
    expect(join(events, [forget('2026-04-01T10:00:00.000Z')])).toEqual([])
    expect(join(events, [forget('2026-02-01T00:00:00.000Z')])).toHaveLength(2)
    expect(FORGET_ID).toBe('forget')
  })

  it('keeps an event marked wrong in view, so the mark can be undone, and out of every count', () => {
    const all = join([E('a', 1, 'yelled at the dog'), E('b', 2, 'yelled again')], [wrong('a')])
    expect(all.map((n) => [n.event.id, n.wrong])).toEqual([
      ['b', false],
      ['a', true],
    ])
    expect(countedNotices(all).map((n) => n.checkinId)).toEqual([2])
    expect(wrongIdOf('a')).toBe('event:a')
    // A mark on another event marks nothing here.
    expect(countedNotices(join([E('a', 1, 'yelled at the dog')], [wrong('z')]))).toHaveLength(1)
  })

  it('shows an event from a kept note and counts it nowhere: a kept note was written at no check-in', () => {
    const all = join([E('k', 30, 'yelled more this month', { note: { store: 'notes', id: '30', day: day(5) } })])
    expect(all.map((n) => [n.event.id, n.checkinId])).toEqual([['k', null]])
    expect(countedNotices(all)).toEqual([])
    // The kept note edited: it stands no more.
    expect(join([E('k', 30, 'yelled more this month', { note: { store: 'notes', id: '30', day: day(5) } })], [], CHECKINS, [{ id: 30, day: day(5), text: 'calmer this month' }])).toEqual([])
  })

  it('counts events stored under a type’s earlier ids as that one type', () => {
    const all = join([E('a', 1, 'yelled at the dog', { type: 'yelled' }), E('b', 2, 'yelled again', { type: 'shouted' })])
    expect(countedNotices(all).map((n) => n.type)).toEqual(['raised-voice', 'raised-voice'])
  })

  it('reads the list it is given, or the one list: a type only the given list knows stands under it alone', () => {
    const events = [E('a', 1, 'yelled at the dog', { type: 'late-screen' })]
    expect(noticedOf({ events, marks: [], checkins: CHECKINS, kept: KEPT })).toEqual([])
    setEventTypesForTests(TYPES)
    expect(noticedOf({ events, marks: [], checkins: CHECKINS, kept: KEPT })).toHaveLength(1)
    // And a type the one list knows stands with no list given.
    setEventTypesForTests(null)
    expect(noticedOf({ events: [E('b', 1, 'yelled at the dog', { type: 'raised-voice' })], marks: [], checkins: CHECKINS, kept: KEPT })).toHaveLength(1)
  })
})

// ─── Event types as kinds ────────────────────────────────────────────────────────────────────────────

describe('an event type as a kind', () => {
  // Eight weeks of evenings, a note on every other day; the thing noticed on Saturdays' notes.
  const SPAN = 56
  const A = 250
  const noted = (n: number): boolean => n % 2 === 0 || new Date(2026, 0, 1 + n).getDay() === 6
  const checkins = Array.from({ length: SPAN }, (_, i) => ({ ...checkin(A + i, 'evening', { extras: noted(A + i) ? { note: 'a note of the day' } : {} }), id: 1000 + i }))
  const contexts = Array.from({ length: SPAN }, (_, i) => context(A + i))
  const saturdays = checkins.filter((c) => new Date(2026, 0, 1 + A + (c.id - 1000)).getDay() === 6)
  const notices = (ids: readonly number[], type = 'raised-voice', label = 'Raised my voice') => ids.map((checkinId) => ({ type, label, checkinId }))

  it('needs five standing events: under five it is no kind', () => {
    expect(NOTICED_MIN).toBe(5)
    const four = kindsOf(input({ checkins, contexts, noticed: notices(saturdays.slice(0, 4).map((c) => c.id)) }))
    expect(four.some((k) => k.id.startsWith('noticed.'))).toBe(false)
    const five = kindsOf(input({ checkins, contexts, noticed: notices(saturdays.slice(0, 5).map((c) => c.id)) }))
    expect(five.filter((k) => k.id.startsWith('noticed.')).map((k) => k.id)).toEqual(['noticed.raised-voice'])
    // The same check-in noticed twice is one occasion, not two.
    const twice = kindsOf(input({ checkins, contexts, noticed: notices([1000, 1000, 1002, 1002, 1004]) }))
    expect(twice.some((k) => k.id.startsWith('noticed.'))).toBe(false)
    // With nothing noticed the list is the list it was.
    expect(kindsOf(input({ checkins, contexts })).map((k) => k.id)).toEqual(kindsOf(input({ checkins, contexts, noticed: [] })).map((k) => k.id))
  })

  it('is labelled as Claude’s, private, read under the notes switch, and known only where a note was written', () => {
    const kind = kindsOf(input({ checkins, contexts, noticed: notices(saturdays.map((c) => c.id)) })).find((k) => k.id === 'noticed.raised-voice')
    expect(kind).toMatchObject({ label: 'Claude noticed in a note: Raised my voice (counted among the check-ins where you wrote a note)', unit: 'checkin', category: 'notes', private: true })
    // Private: the Weekly View's best days are given no private kind (weekly.test.ts states it), so it is never named there.
    const table = patternTable(input({ checkins, contexts, noticed: notices(saturdays.map((c) => c.id)) }), day(A + SPAN))
    const entry = [...table.kinds, ...table.untested].find((k) => k.kind === 'noticed.raised-voice')
    // A check-in with no note is unknown, never "no": the occasions are the check-ins with a note alone.
    expect(entry).toMatchObject({ known: checkins.filter((c) => c.extras?.note).length, occurrences: saturdays.length })
    expect(entry?.known).toBeLessThan(SPAN)
    expect(saturdays).toHaveLength(8)
  })

  it('names two types as two kinds, each by its own events', () => {
    const kinds = kindsOf(input({ checkins, contexts, noticed: [...notices(saturdays.map((c) => c.id)), ...notices([1000, 1002, 1004, 1006, 1008], 'late-screen', 'A late screen')] }))
    expect(kinds.filter((k) => k.id.startsWith('noticed.')).map((k) => k.id)).toEqual(['noticed.late-screen', 'noticed.raised-voice'])
  })
})

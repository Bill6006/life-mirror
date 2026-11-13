import { describe, expect, it } from 'vitest'
import type { Fact } from '../../src/factTypes'
import type { EventType } from '../../src/noteEvents/types'
import { monthSpan, type MonthSpan } from './month'
import { checkMonth, dayOfLine, EVENTS_MOST, MONTH_CAUSE, noteWordsOfLine, OBSERVATION_LINES, QUOTE_MOST, type MonthCheckInput } from './monthCheck'

// The check on a month's answer (2026-11-13), on stand-in lines: an observation is traced to the lines it cites, the
// Worker lists its days and kinds of record, and every reason is given at once.

const line = (id: string, text: string, category: string, values: Record<string, number | string | null> = {}, faith = false): Fact => ({ id, tags: faith ? ['faith'] : [], text, values: { ...values, category } })
const FACTS: Fact[] = [
  line('day.2026-09-30.1', '2026-09-30: the day: at home', 'dayRecord'),
  line('day.2026-10-03.1', '2026-10-03: the day: at the office', 'dayRecord'),
  line('day.2026-10-03.2', '2026-10-03, 21:30: at the evening check-in you wrote: “I raised my voice at the dog again, twice.”', 'notes', { at: '21:30' }),
  line('day.2026-10-04.1', '2026-10-04, 08:10: a workout finished: Run, 30 minutes', 'dayRecord', { at: '08:10', minutes: 30 }),
  line('day.2026-10-09.1', '2026-10-09, 21:40: at the evening check-in you wrote: “Up late again.”', 'notes', { at: '21:40' }),
  line('day.2026-10-11.1', '2026-10-11: went to church', 'faith', {}, true),
  line('day.2026-10-12.1', '2026-10-12, 09:00: A stand-in prayer offered, done', 'dayRecord', { at: '09:00' }, true),
  line('day.2026-10-15.1', '2026-10-15, 20:00: you kept a note: “I skip the gym when work runs late.”', 'notes', { at: '20:00' }),
  line('day.2026-11-01.1', '2026-11-01, 21:00: at the evening check-in you wrote: “A stand-in note outside the month.”', 'notes', { at: '21:00' }),
]
const SPAN = monthSpan('2026-10-01') as MonthSpan
const TYPES: EventType[] = [
  { id: 'raised-voice', label: 'Raised my voice', definition: 'The note says you raised your voice at someone.', was: ['yelled'] },
  { id: 'up-late', label: 'Up late', definition: 'The note says you stayed up later than you meant to.' },
]
const X: MonthCheckInput = { facts: FACTS, span: SPAN, surface: { names: [], bears: false }, types: TYPES }
const obs = (text: string, factIds: string[], over: Record<string, unknown> = {}) => ({ text, factIds, ...over })
const GOOD = {
  recorded: [obs('You wrote notes in the evening, and finished a run of 30 minutes.', ['day.2026-10-03.2', 'day.2026-10-09.1', 'day.2026-10-04.1'])],
  noticed: [obs('The late night came soon after the evening you raised your voice.', ['day.2026-10-03.2', 'day.2026-10-09.1'], { follow: { kind: 'sleep.short', split: 'weekday', cell: '6' } })],
  events: [{ type: 'raised-voice', factId: 'day.2026-10-03.2', quote: 'I raised my voice at the dog again' }],
}
const check = (answer: unknown, x: MonthCheckInput = X) => checkMonth(answer, x)
const reason = (answer: unknown, x: MonthCheckInput = X): string => {
  const r = check(answer, x)
  return r.ok ? '' : r.reason
}
const withRecorded = (o: unknown) => ({ ...GOOD, recorded: [o] })

describe('a month’s answer that keeps every rule', () => {
  it('passes, and the Worker lists each observation’s days and kinds of record from the lines it cites', () => {
    const r = check(GOOD)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.recorded).toEqual([{ text: GOOD.recorded[0].text, days: ['2026-10-03', '2026-10-04', '2026-10-09'], kinds: ['dayRecord', 'notes'], factIds: ['day.2026-10-03.2', 'day.2026-10-09.1', 'day.2026-10-04.1'] }])
    expect(r.value.noticed[0]).toMatchObject({ days: ['2026-10-03', '2026-10-09'], kinds: ['notes'], follow: { kind: 'sleep.short', split: 'weekday', cell: '6' } })
    expect(r.value.events).toEqual([{ type: 'raised-voice', factId: 'day.2026-10-03.2', day: '2026-10-03', quote: 'I raised my voice at the dog again' }])
  })

  it('takes days and kinds from the lines, never from the answer: what the run says of them is not read', () => {
    const r = check(withRecorded(obs('You went to church.', ['day.2026-10-11.1'], { days: ['2026-10-30'], kinds: ['dayRecord'] })))
    expect(r.ok && r.value.recorded[0]).toMatchObject({ days: ['2026-10-11'], kinds: ['faith'] })
  })

  it('carries faith’s tag where a cited line carries it, whatever kind that line is read under', () => {
    const faith = check(withRecorded(obs('A stand-in prayer was done.', ['day.2026-10-12.1'])))
    expect(faith.ok && faith.value.recorded[0]).toMatchObject({ kinds: ['dayRecord'], faith: true })
    const none = check(GOOD)
    expect(none.ok && none.value.recorded[0]).not.toHaveProperty('faith')
  })

  it('may leave the events out, and may say nothing under one of its parts', () => {
    expect(check({ recorded: GOOD.recorded, noticed: [] }).ok).toBe(true)
    expect(check({ recorded: [], noticed: [obs('The late night came after a loud evening.', ['day.2026-10-09.1'])], events: null }).ok).toBe(true)
  })
})

describe('an answer of the wrong shape', () => {
  it('is refused: no object, a part missing, events that are no list, and nothing said at all', () => {
    expect(reason('words')).toBe('not an object')
    expect(reason({ recorded: [] })).toBe('the answer has two parts, "recorded" and "noticed", each a list')
    expect(reason({ ...GOOD, events: 'none' })).toBe('"events" is a list, or left out')
    expect(reason({ recorded: [], noticed: [] })).toBe('no observation: a write-up says at least one thing')
  })

  it('is refused past ten observations recorded, eight noticed, or sixty events', () => {
    const one = obs('You went to the office.', ['day.2026-10-03.1'])
    expect(reason({ recorded: Array(11).fill(one), noticed: [] })).toBe('11 observations under "you recorded"; at most 10')
    expect(check({ recorded: Array(10).fill(one), noticed: [] }).ok).toBe(true)
    expect(reason({ recorded: [], noticed: Array(9).fill(one) })).toBe('9 observations under "Claude noticed"; at most 8')
    expect(EVENTS_MOST).toBe(60)
    expect(reason({ ...GOOD, events: Array(61).fill(GOOD.events[0]) })).toBe('61 events; at most 60')
  })
})

describe('an observation that cannot be traced', () => {
  it('is refused with no words, and with no line cited', () => {
    expect(reason(withRecorded(obs('  ', ['day.2026-10-03.1'])))).toBe('you recorded 1: has no words')
    expect(reason(withRecorded(obs('You went to the office.', [])))).toBe('you recorded 1: cites no line: an observation lists the lines it came from')
    expect(reason(withRecorded({ text: 'You went to the office.' }))).toBe('you recorded 1: cites no line: an observation lists the lines it came from')
  })

  it('is refused when it cites a line the month’s read did not serve', () => {
    expect(reason(withRecorded(obs('You went to the office.', ['day.2026-10-03.1', 'day.2026-10-20.4'])))).toBe('you recorded 1: cites a line this month\'s read did not serve: day.2026-10-20.4')
  })

  it('is refused when it rests only on days beside the month, and passes with one line inside it', () => {
    expect(reason(withRecorded(obs('You were at home.', ['day.2026-09-30.1'])))).toBe('you recorded 1: rests only on days outside 2026-10: cite at least one line inside the month')
    const both = check(withRecorded(obs('You were at home, then at the office.', ['day.2026-09-30.1', 'day.2026-10-03.1'])))
    expect(both.ok && both.value.recorded[0].days).toEqual(['2026-09-30', '2026-10-03'])
  })

  it('is refused past fifty words, and past forty lines', () => {
    expect(reason(withRecorded(obs(Array(51).fill('calm').join(' '), ['day.2026-10-03.1'])))).toBe('you recorded 1: 51 words; at most 50')
    expect(check(withRecorded(obs(Array(50).fill('calm').join(' '), ['day.2026-10-03.1']))).ok).toBe(true)
    expect(OBSERVATION_LINES).toBe(40)
    const many = Array.from({ length: 41 }, (_, i) => line(`day.2026-10-20.${i + 1}`, `2026-10-20: a stand-in line`, 'dayRecord'))
    expect(reason(withRecorded(obs('A day of stand-in lines.', many.map((f) => f.id))), { ...X, facts: [...FACTS, ...many] })).toBe('you recorded 1: cites 41 lines; at most 40')
  })
})

describe('an observation’s numbers', () => {
  it('pass when a cited line says them, and are refused when none does', () => {
    expect(check(withRecorded(obs('You finished a run of 30 minutes.', ['day.2026-10-04.1']))).ok).toBe(true)
    expect(reason(withRecorded(obs('You finished a run of 45 minutes.', ['day.2026-10-04.1'])))).toBe('you recorded 1: the number 45 is not in the cited facts')
    // The line that says 30 is not cited: the number rests on nothing.
    expect(reason(withRecorded(obs('You finished a run of 30 minutes.', ['day.2026-10-03.1'])))).toBe('you recorded 1: the number 30 is not in the cited facts')
  })

  it('may be the count of the days cited, or of the lines cited, and no other count', () => {
    const three = ['day.2026-10-03.1', 'day.2026-10-03.2', 'day.2026-10-09.1']
    // Three lines on two days.
    expect(check(withRecorded(obs('You wrote on 2 days.', three))).ok).toBe(true)
    expect(check(withRecorded(obs('These are 3 lines of your record.', three))).ok).toBe(true)
    expect(reason(withRecorded(obs('You wrote on 4 days.', three)))).toBe('you recorded 1: the number 4 is not in the cited facts')
  })
})

describe('a cause', () => {
  it('is never claimed: a month’s read holds no test', () => {
    const ids = ['day.2026-10-03.2', 'day.2026-10-09.1']
    expect(reason({ ...GOOD, noticed: [obs('You were up late because you raised your voice.', ids)] })).toBe('Claude noticed 1: says "because": a month\'s read holds no test, so no cause is claimed; say what went with what')
    expect(reason({ ...GOOD, noticed: [obs('The loud evening caused the late night.', ids)] })).toContain('says "caused"')
    expect(reason({ ...GOOD, noticed: [obs('The loud evening led to the late night.', ids)] })).toContain('says "led to"')
    expect(reason(withRecorded(obs('The run affected the evening.', ['day.2026-10-04.1'])))).toContain('says "affected"')
    expect(MONTH_CAUSE.test('The late night came after the loud evening.')).toBe(false)
  })
})

describe('the surface rules', () => {
  it('hold in a write-up as on every surface: a private name, and dating from what did not happen', () => {
    expect(reason(withRecorded(obs('You marked Standin on one evening.', ['day.2026-10-03.2'])), { ...X, surface: { names: ['Standin'], bears: false } })).toBe('you recorded 1: names a private item while "Show private items by name outside this screen" is off')
    expect(reason(withRecorded(obs('You had no dates this month.', ['day.2026-10-03.1'])))).toBe('you recorded 1: speaks of dating from what did not happen')
  })
})

describe('a pattern to follow', () => {
  it('is kept on what Claude noticed, with its kind, split and cell', () => {
    const r = check(GOOD)
    expect(r.ok && r.value.noticed[0].follow).toEqual({ kind: 'sleep.short', split: 'weekday', cell: '6' })
    expect(r.ok && r.value.recorded[0]).not.toHaveProperty('follow')
  })

  it('is refused on what was recorded, and when it does not name all three', () => {
    expect(reason(withRecorded(obs('You went to the office.', ['day.2026-10-03.1'], { follow: { kind: 'sleep.short', split: 'weekday', cell: '6' } })))).toBe('you recorded 1: asks to be followed: only what Claude noticed is followed')
    const ids = ['day.2026-10-09.1']
    for (const follow of [{ kind: 'sleep.short', split: 'weekday' }, { kind: 'sleep short', split: 'weekday', cell: '6' }, 'sleep.short', { kind: 'sleep.short', split: '', cell: '6' }]) {
      expect(reason({ ...GOOD, noticed: [obs('The late night came after a loud evening.', ids, { follow })] }), JSON.stringify(follow)).toBe('Claude noticed 1: names a pattern to follow without a kind, a split and a cell from the pattern table')
    }
  })
})

describe('the length of a write-up', () => {
  it('is four thousand bytes of words at most, over both parts together', () => {
    const long = Array(50).fill('calmcalmc').join(' ')
    const one = obs(long, ['day.2026-10-03.1'])
    expect(check({ recorded: Array(4).fill(one), noticed: Array(4).fill(one) }).ok).toBe(true)
    expect(reason({ recorded: Array(5).fill(one), noticed: Array(4).fill(one) })).toBe('4491 bytes of words in all; at most 4000')
  })
})

describe('an event', () => {
  const withEvent = (e: unknown) => ({ ...GOOD, events: [e] })

  it('is kept under its type’s name today, with the note’s line and the words quoted', () => {
    const r = check(withEvent({ type: 'yelled', factId: 'day.2026-10-03.2', quote: 'raised my voice' }))
    expect(r.ok && r.value.events).toEqual([{ type: 'raised-voice', factId: 'day.2026-10-03.2', day: '2026-10-03', quote: 'raised my voice' }])
    // A note kept from a question is a note too.
    const kept = check(withEvent({ type: 'up-late', factId: 'day.2026-10-15.1', quote: 'work runs late' }))
    expect(kept.ok && kept.value.events[0]).toMatchObject({ factId: 'day.2026-10-15.1', day: '2026-10-15' })
  })

  it('is refused under a type the list does not hold', () => {
    expect(reason(withEvent({ type: 'no-such-type', factId: 'day.2026-10-03.2', quote: 'raised my voice' }))).toBe('event 1: names a type the list of event types does not hold')
  })

  it('is refused when its line is not a note’s, was not served, or lies outside the month', () => {
    expect(reason(withEvent({ type: 'up-late', factId: 'day.2026-10-04.1', quote: 'Run' }))).toBe('event 1: does not name the line of a note this month’s read served')
    expect(reason(withEvent({ type: 'up-late', factId: 'day.2026-10-22.1', quote: 'late' }))).toBe('event 1: does not name the line of a note this month’s read served')
    expect(reason(withEvent({ type: 'up-late', factId: 'day.2026-11-01.1', quote: 'A stand-in note' }))).toBe('event 1: names a note outside 2026-10')
  })

  it('is refused unless the note holds the quoted words exactly', () => {
    expect(reason(withEvent({ type: 'raised-voice', factId: 'day.2026-10-03.2', quote: 'i raised my voice' }))).toBe('event 1: quotes words the note does not hold exactly as quoted')
    expect(reason(withEvent({ type: 'raised-voice', factId: 'day.2026-10-03.2', quote: 'I yelled at the dog' }))).toBe('event 1: quotes words the note does not hold exactly as quoted')
    // Words that stand in the line but not in the note itself: the line's own "you wrote" is not the owner's.
    expect(reason(withEvent({ type: 'raised-voice', factId: 'day.2026-10-03.2', quote: 'you wrote' }))).toBe('event 1: quotes words the note does not hold exactly as quoted')
    expect(reason(withEvent({ type: 'raised-voice', factId: 'day.2026-10-03.2', quote: '  ' }))).toBe('event 1: quotes no words')
    expect(QUOTE_MOST).toBe(300)
    const longNote = line('day.2026-10-21.1', `2026-10-21, 21:00: at the evening check-in you wrote: “${'word '.repeat(80)}”`, 'notes')
    expect(reason(withEvent({ type: 'up-late', factId: 'day.2026-10-21.1', quote: 'word '.repeat(61) }), { ...X, facts: [...FACTS, longNote] })).toBe('event 1: quotes 305 characters; at most 300')
  })

  it('tagged twice on one note with one type is one event; two types on one note are two', () => {
    const e = { type: 'raised-voice', factId: 'day.2026-10-03.2', quote: 'raised my voice' }
    const r = check({ ...GOOD, events: [e, { ...e, type: 'yelled', quote: 'twice' }, { type: 'up-late', factId: 'day.2026-10-03.2', quote: 'again' }] })
    expect(r.ok && r.value.events.map((x) => [x.type, x.quote])).toEqual([['raised-voice', 'raised my voice'], ['up-late', 'again']])
  })
})

describe('every reason', () => {
  it('is given at once, each with where it stands', () => {
    const r = reason({
      recorded: [obs('You finished a run of 45 minutes.', ['day.2026-10-04.1']), obs('You went to the office.', ['day.2026-10-03.1'])],
      noticed: [obs('The loud evening caused the late night.', ['day.2026-10-20.9'])],
      events: [{ type: 'no-such-type', factId: 'day.2026-10-03.2', quote: 'raised my voice' }],
    })
    expect(r).toBe(
      'you recorded 1: the number 45 is not in the cited facts; and Claude noticed 1: cites a line this month\'s read did not serve: day.2026-10-20.9; says "caused": a month\'s read holds no test, so no cause is claimed; say what went with what; and event 1: names a type the list of event types does not hold',
    )
  })
})

describe('a line', () => {
  it('gives its day from its id, and a note’s own words from a note’s line alone', () => {
    expect(dayOfLine('day.2026-10-03.2')).toBe('2026-10-03')
    expect(dayOfLine('pattern.sleep.short.all')).toBeNull()
    expect(noteWordsOfLine(FACTS[2])).toBe('I raised my voice at the dog again, twice.')
    expect(noteWordsOfLine(FACTS[7])).toBe('I skip the gym when work runs late.')
    expect(noteWordsOfLine(FACTS[3])).toBeNull()
    // A line of another kind whose words happen to say "you wrote" is not a note.
    expect(noteWordsOfLine(line('day.2026-10-05.1', '2026-10-05: a move named you wrote: “x”', 'dayRecord'))).toBeNull()
  })
})

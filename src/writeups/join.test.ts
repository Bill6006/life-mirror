import { describe, expect, it } from 'vitest'
import { FORGET_ID, type NoteMark } from '../noteEvents/shared'
import { followedPatterns, forgetMoment, shownWriteUps, type WriteUpsInput } from './join'
import { obsMarkIdOf, type Observation, type WriteUp } from './shared'

// What of the monthly write-ups is shown and what counts (2026-11-13), on stand-in write-ups: each condition alone.

const FP = 'a'.repeat(64)
const followed = { kind: 'sleep.short', split: 'weekday', cell: '6', k: 4, n: 9, restK: 6, m: 40 }
const R1: Observation = { text: 'You wrote a note on most evenings.', days: ['2026-10-03', '2026-10-09'], kinds: ['notes'] }
const R2: Observation = { text: 'You went to church each Sunday.', days: ['2026-10-04'], kinds: ['faith'] }
const N1: Observation = { text: 'Short nights went with the days you skipped a plan.', days: ['2026-10-04', '2026-10-11'], kinds: ['dayRecord'], followed }
const N2: Observation = { text: 'A stand-in prayer went with calmer evenings.', days: ['2026-10-12'], kinds: ['dayRecord'], faith: true }
const writeUp = (month: string, reading: number, at: string, over: Partial<WriteUp> = {}): WriteUp => ({ id: `${month}:${reading}`, month, reading, at, day: at.slice(0, 10), method: 1, model: 'stand-in', builtFrom: { counts: { days: 37 }, parts: 1, lines: 120, fingerprint: FP }, recorded: [R1, R2], noticed: [N1, N2], ...over })
const OCT = writeUp('2026-10', 1, '2026-11-13T22:00:00.000Z')
const SEP = writeUp('2026-09', 1, '2026-11-13T21:00:00.000Z', { recorded: [{ text: 'A stand-in September.', days: ['2026-09-20'], kinds: ['dayRecord'] }], noticed: [] })
const DAYS = new Set(['2026-09-20', '2026-10-03', '2026-10-04', '2026-10-09', '2026-10-11', '2026-10-12'])
const input = (over: Partial<WriteUpsInput> = {}): WriteUpsInput => ({ writeups: [OCT], marks: [], days: DAYS, kindOn: () => true, faithShown: true, hiddenNames: [], ...over })
const wrongMark = (id: string): NoteMark => ({ id, kind: 'wrong', at: '2026-11-14T10:00:00.000Z', updatedAt: '2026-11-14T10:00:00.000Z' })
const forget = (at: string): NoteMark => ({ id: FORGET_ID, kind: 'forget', at, updatedAt: at })
const texts = (x: WriteUpsInput) => shownWriteUps(x).map((m) => [m.month, m.newest.recorded.map((o) => o.text), m.newest.noticed.map((o) => o.text)])

describe('what is shown of a write-up', () => {
  it('is every observation, in its part and its place, while nothing hides one', () => {
    const [m] = shownWriteUps(input())
    expect(m.month).toBe('2026-10')
    expect(m.newest).toMatchObject({ id: '2026-10:1', reading: 1, day: '2026-11-13' })
    expect(m.newest.recorded.map((o) => [o.part, o.place, o.text, o.wrong])).toEqual([['recorded', 1, R1.text, false], ['recorded', 2, R2.text, false]])
    expect(m.newest.noticed.map((o) => [o.part, o.place, o.wrong])).toEqual([['noticed', 1, false], ['noticed', 2, false]])
    expect(m.newest.noticed[0].followed).toEqual(followed)
    expect(m.newest.recorded[0].markId).toBe('obs:2026-10:1:recorded:1')
    expect(m.earlier).toEqual([])
  })

  it('leaves out an observation at once when a day it cites holds no record any more', () => {
    const days = new Set([...DAYS].filter((d) => d !== '2026-10-11'))
    expect(texts(input({ days }))).toEqual([['2026-10', [R1.text, R2.text], [N2.text]]])
    // The one left keeps its own place: its mark's id does not move.
    expect(shownWriteUps(input({ days }))[0].newest.noticed[0]).toMatchObject({ place: 2, markId: 'obs:2026-10:1:noticed:2' })
  })

  it('leaves out an observation while a kind of record it drew on is switched off', () => {
    expect(texts(input({ kindOn: (k) => k !== 'notes' }))).toEqual([['2026-10', [R2.text], [N1.text, N2.text]]])
  })

  it('leaves out what drew on faith while faith is hidden: by its kind, and by a line’s tag', () => {
    expect(texts(input({ faithShown: false }))).toEqual([['2026-10', [R1.text], [N1.text]]])
  })

  it('leaves out an observation that names a private item while names may not be shown', () => {
    const named = { ...OCT, recorded: [R1, { text: 'You marked Standin on two evenings.', days: ['2026-10-03'], kinds: ['privateItems'] }] }
    expect(texts(input({ writeups: [named] }))[0][1]).toHaveLength(2)
    expect(texts(input({ writeups: [named], hiddenNames: ['Standin'] }))[0][1]).toEqual([R1.text])
    // A whole word only: a longer word that holds the name is not the name.
    expect(texts(input({ writeups: [{ ...OCT, recorded: [{ ...R1, text: 'The Standings moved.' }] }], hiddenNames: ['Standin'] }))[0][1]).toEqual(['The Standings moved.'])
  })

  it('keeps one marked wrong in view with its mark, so the mark can be taken back', () => {
    const marks = [wrongMark(obsMarkIdOf('2026-10:1', 'noticed', 1))]
    const [m] = shownWriteUps(input({ marks }))
    expect(m.newest.noticed.map((o) => o.wrong)).toEqual([true, false])
    expect(m.newest.recorded.map((o) => o.wrong)).toEqual([false, false])
  })

  it('does not list a write-up with nothing left to show', () => {
    expect(shownWriteUps(input({ days: new Set() }))).toEqual([])
    expect(shownWriteUps(input({ kindOn: () => false }))).toEqual([])
  })
})

describe('the forget moment', () => {
  it('hides every write-up written up to it, and none written after it', () => {
    expect(shownWriteUps(input({ marks: [forget('2026-11-13T22:00:00.000Z')] }))).toEqual([])
    expect(shownWriteUps(input({ marks: [forget('2026-11-13T21:59:59.000Z')] }))).toHaveLength(1)
    const later = writeUp('2026-10', 2, '2026-11-20T10:00:00.000Z')
    const shown = shownWriteUps(input({ writeups: [OCT, later], marks: [forget('2026-11-15T00:00:00.000Z')] }))
    expect(shown.map((m) => [m.newest.id, m.earlier.length])).toEqual([['2026-10:2', 0]])
  })

  it('is read from the forget record alone, and an unreadable moment forgets nothing', () => {
    expect(forgetMoment([wrongMark('obs:2026-10:1:noticed:1')])).toBeNull()
    expect(forgetMoment([forget('2026-11-15T00:00:00.000Z')])).toBe('2026-11-15T00:00:00.000Z')
    expect(forgetMoment([forget('some day')])).toBeNull()
    expect(forgetMoment([{ ...forget('2026-11-15T00:00:00.000Z'), kind: 'wrong' }])).toBeNull()
  })
})

describe('the months', () => {
  it('are listed the newest first', () => {
    expect(shownWriteUps(input({ writeups: [SEP, OCT] })).map((m) => m.month)).toEqual(['2026-10', '2026-09'])
    expect(shownWriteUps(input({ writeups: [OCT, SEP] })).map((m) => m.month)).toEqual(['2026-10', '2026-09'])
  })

  it('show a month’s newest reading, with the earlier ones beside it and never over it', () => {
    const second = writeUp('2026-10', 2, '2026-11-20T10:00:00.000Z', { recorded: [R1], noticed: [] })
    const third = writeUp('2026-10', 3, '2026-11-25T10:00:00.000Z', { recorded: [R2], noticed: [] })
    const [m] = shownWriteUps(input({ writeups: [second, OCT, third] }))
    expect(m.newest.id).toBe('2026-10:3')
    expect(m.earlier.map((w) => w.id)).toEqual(['2026-10:2', '2026-10:1'])
    // The first reading is whole beside the others: nothing was written over it.
    expect(m.earlier[1].recorded.map((o) => o.text)).toEqual([R1.text, R2.text])
  })

  it('fall back to an earlier reading when the newest has nothing left to show', () => {
    const second = writeUp('2026-10', 2, '2026-11-20T10:00:00.000Z', { recorded: [{ text: 'A day since deleted.', days: ['2026-10-30'], kinds: ['dayRecord'] }], noticed: [] })
    const [m] = shownWriteUps(input({ writeups: [OCT, second] }))
    expect(m.newest.id).toBe('2026-10:1')
    expect(m.earlier).toEqual([])
  })
})

describe('the followed patterns that count', () => {
  it('are those of what Claude noticed in a month’s newest reading, each with the day it was noticed', () => {
    expect(followedPatterns(shownWriteUps(input()))).toEqual([{ ...followed, markId: 'obs:2026-10:1:noticed:1', month: '2026-10', noticedOn: '2026-11-13', text: N1.text }])
  })

  it('leave out one marked wrong, at once', () => {
    expect(followedPatterns(shownWriteUps(input({ marks: [wrongMark('obs:2026-10:1:noticed:1')] })))).toEqual([])
    // A mark on another observation leaves it counting.
    expect(followedPatterns(shownWriteUps(input({ marks: [wrongMark('obs:2026-10:1:noticed:2')] })))).toHaveLength(1)
  })

  it('leave out one whose observation is hidden: a deleted day, a switch, the forget moment', () => {
    expect(followedPatterns(shownWriteUps(input({ days: new Set([...DAYS].filter((d) => d !== '2026-10-11')) })))).toEqual([])
    expect(followedPatterns(shownWriteUps(input({ kindOn: (k) => k !== 'dayRecord' })))).toEqual([])
    expect(followedPatterns(shownWriteUps(input({ marks: [forget('2026-11-14T00:00:00.000Z')] })))).toEqual([])
  })

  it('are not taken from an earlier reading: the newest reading alone is followed', () => {
    const second = writeUp('2026-10', 2, '2026-11-20T10:00:00.000Z', { noticed: [{ ...N1, followed: { ...followed, cell: '0' } }] })
    const got = followedPatterns(shownWriteUps(input({ writeups: [OCT, second] })))
    expect(got.map((f) => [f.cell, f.noticedOn])).toEqual([['0', '2026-11-20']])
  })
})

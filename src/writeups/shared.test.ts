import { describe, expect, it } from 'vitest'
import { NOTICED_MOST, OBSERVATION_WORDS, obsMarkIdOf, RECORDED_MOST, WRITEUP_BYTES, WRITEUP_METHOD, writeUpIdOf, writeUpOf, WRITEUPS_STORE, type WriteUp } from './shared'

// A month's write-up as the Worker stores it (2026-11-13), on a stand-in row: read whole or not at all.

const FP = 'a'.repeat(64)
const recorded = { text: 'You wrote a note on seven evenings.', days: ['2026-10-03', '2026-10-09'], kinds: ['notes'] }
const noticed = { text: 'Short nights came before the days you skipped a plan.', days: ['2026-10-04', '2026-10-11'], kinds: ['dayRecord'], followed: { kind: 'sleep.short', split: 'weekday', cell: '6', k: 4, n: 9, restK: 6, m: 40 } }
const body = { month: '2026-10', reading: 1, at: '2026-11-13T22:00:00.000Z', day: '2026-11-13', method: 1, model: 'claude-opus', builtFrom: { counts: { days: 37, checkins: 74 }, parts: 2, lines: 124, fingerprint: FP }, recorded: [recorded], noticed: [noticed] }
const ID = '2026-10:1'

describe('a write-up’s row', () => {
  it('is read whole, from the row’s words or from the object', () => {
    const want: WriteUp = { id: ID, ...body, recorded: [recorded], noticed: [noticed] }
    expect(writeUpOf(ID, body)).toEqual(want)
    expect(writeUpOf(ID, JSON.stringify(body))).toEqual(want)
    expect(WRITEUPS_STORE).toBe('writeups')
  })

  it('carries faith’s tag on an observation only where the row sets it', () => {
    expect(writeUpOf(ID, { ...body, recorded: [{ ...recorded, faith: true }] })?.recorded[0]).toEqual({ ...recorded, faith: true })
    expect(writeUpOf(ID, { ...body, recorded: [{ ...recorded, faith: 'yes' }] })?.recorded[0]).toEqual(recorded)
    expect(writeUpOf(ID, body)?.recorded[0]).not.toHaveProperty('faith')
  })

  it('is not read when any part is missing or malformed: nothing half-read is shown', () => {
    const bad: [string, unknown][] = [
      ['null', null],
      ['not json', 'not json'],
      ['a list', '[]'],
      ['no month', { ...body, month: undefined }],
      ['a month that does not exist', { ...body, month: '2026-13' }],
      ['a reading of zero', { ...body, reading: 0 }],
      ['a reading that is no whole number', { ...body, reading: 1.5 }],
      ['when it was written, unreadable', { ...body, at: 'yesterday' }],
      ['no day', { ...body, day: '13 November' }],
      ['no method', { ...body, method: 0 }],
      ['no model', { ...body, model: '' }],
      ['nothing it was built from', { ...body, builtFrom: null }],
      ['a count that is no count', { ...body, builtFrom: { ...body.builtFrom, counts: { days: -1 } } }],
      ['no parts', { ...body, builtFrom: { ...body.builtFrom, parts: 0 } }],
      ['no count of lines', { ...body, builtFrom: { ...body.builtFrom, lines: undefined } }],
      ['a fingerprint of the wrong shape', { ...body, builtFrom: { ...body.builtFrom, fingerprint: 'abc' } }],
      ['no part for what was recorded', { ...body, recorded: undefined }],
      ['no part for what Claude noticed', { ...body, noticed: 'none' }],
      ['an observation with no words', { ...body, recorded: [{ ...recorded, text: '  ' }] }],
      ['an observation with no days', { ...body, recorded: [{ ...recorded, days: [] }] }],
      ['an observation with a day that is no day', { ...body, noticed: [{ ...noticed, days: ['2026-10-04', 'Saturday'] }] }],
      ['an observation with no kinds of record', { ...body, recorded: [{ ...recorded, kinds: [] }] }],
      ['a followed pattern with no cell', { ...body, noticed: [{ ...noticed, followed: { ...noticed.followed, cell: '' } }] }],
      ['a followed pattern counting more than it has', { ...body, noticed: [{ ...noticed, followed: { ...noticed.followed, k: 10 } }] }],
      ['a followed pattern counting more elsewhere than there is', { ...body, noticed: [{ ...noticed, followed: { ...noticed.followed, restK: 41 } }] }],
      ['a followed pattern with a count that is no count', { ...body, noticed: [{ ...noticed, followed: { ...noticed.followed, n: '9' } }] }],
      ['what was recorded, followed', { ...body, recorded: [{ ...recorded, followed: noticed.followed }] }],
    ]
    for (const [name, b] of bad) expect(writeUpOf(ID, b), name).toBeNull()
    // Under the id each would itself make, so the id's own rule is not what refuses them.
    expect(writeUpOf('2026-13:1', { ...body, month: '2026-13' }), 'a month that does not exist, under its own id').toBeNull()
    expect(writeUpOf('2026-10:0', { ...body, reading: 0 }), 'a reading of zero, under its own id').toBeNull()
    // The probe that can say yes: the same row untouched is read.
    expect(writeUpOf(ID, body)).not.toBeNull()
  })

  it('says when its lines were built where the row does, and is read without it where the row does not or says it unreadably', () => {
    const built = '2026-11-13T21:55:00.000Z'
    expect(writeUpOf(ID, { ...body, builtFrom: { ...body.builtFrom, builtAt: built } })?.builtFrom.builtAt).toBe(built)
    expect(writeUpOf(ID, body)?.builtFrom).not.toHaveProperty('builtAt')
    expect(writeUpOf(ID, { ...body, builtFrom: { ...body.builtFrom, builtAt: 'last night' } })?.builtFrom).not.toHaveProperty('builtAt')
  })

  it('is not read under an id that is not its month and its reading', () => {
    expect(writeUpOf('', body)).toBeNull()
    expect(writeUpOf('2026-10:2', body)).toBeNull()
    expect(writeUpOf('2026-09:1', body)).toBeNull()
    expect(writeUpOf('2026-10:2', { ...body, reading: 2 })?.reading).toBe(2)
  })

  it('reads a month with nothing under one of its parts', () => {
    expect(writeUpOf(ID, { ...body, noticed: [] })).toMatchObject({ recorded: [recorded], noticed: [] })
    expect(writeUpOf(ID, { ...body, recorded: [], noticed: [] })).toMatchObject({ recorded: [], noticed: [] })
  })
})

describe('the ids', () => {
  it('name a month’s reading, and an observation by its write-up, its part and its place', () => {
    expect(writeUpIdOf('2026-10', 1)).toBe('2026-10:1')
    expect(writeUpIdOf('2026-10', 2)).toBe('2026-10:2')
    expect(obsMarkIdOf('2026-10:1', 'recorded', 1)).toBe('obs:2026-10:1:recorded:1')
    expect(obsMarkIdOf('2026-10:1', 'noticed', 3)).toBe('obs:2026-10:1:noticed:3')
  })
})

describe('the limits a write-up is written under', () => {
  it('are ten observations recorded and eight noticed, fifty words each, four thousand bytes in all, under method one', () => {
    expect([RECORDED_MOST, NOTICED_MOST, OBSERVATION_WORDS, WRITEUP_BYTES, WRITEUP_METHOD]).toEqual([10, 8, 50, 4000, 1])
  })
})

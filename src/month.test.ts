import { describe, expect, it } from 'vitest'
import { keyFor } from './aims'
import { addDays } from './blocks'
import type { Aim, CheckIn, Intention, Offer, Outcome } from './db'
import { daysOfMonth, firstReviewDay, monthAgo, monthAgoToday, MONTH_MIN_ANSWERS, MONTH_MIN_DAYS, monthReview, type MonthInput } from './month'
import type { Position } from './readings'

// The record shown back by the month (stage 3, group 4): a month ago today, and the last full month's
// review. Counts and averages from the record alone, each with what it rests on; nothing grades.

/** A check-in whose six readings sit at one level (the down readings mirrored), so its reading out of 100 is known. */
function at(day: string, block: CheckIn['block'], p: Position, note?: string): CheckIn {
  const q = (6 - p) as Position
  return { day, block, answers: { mood: p, energy: p, focus: p, stress: q, overwhelm: q, irritation: q }, startedAt: `${day}T12:00:00.000Z`, completedAt: `${day}T12:01:00.000Z`, updatedAt: `${day}T12:01:00.000Z`, activeMs: 1, ...(note ? { extras: { note } } : {}) }
}
let nextId = 1
function offer(day: string, moveId: string, kind: Offer['kind'] = 'block', over: Partial<Offer> = {}): Offer {
  return { id: nextId++, kind, day, block: 'evening', at: `${day}T18:00:00.000Z`, situationKey: 'evening:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: `${day}T19:00:00.000Z`, ...over }
}
const done = (o: Offer, outcome: Outcome['outcome'] = 'done'): Outcome => ({ offerId: o.id as number, moveId: o.moveId, day: o.day, block: 'evening', at: `${o.day}T20:00:00.000Z`, outcome, why: null, passiveOutcome: null })

describe('a month ago today', () => {
  it('is the same date a month back, or that month’s last day when it has none', () => {
    expect(monthAgo('2026-10-17')).toBe('2026-09-17')
    expect(monthAgo('2026-03-31')).toBe('2026-02-28')
    expect(monthAgo('2028-03-30')).toBe('2028-02-29')
    expect(monthAgo('2026-01-15')).toBe('2025-12-15')
    expect(daysOfMonth('2026-02')).toHaveLength(28)
  })

  it('shows what the record holds of that day: its reading, its notes, what was done and a workout', () => {
    const offers = [offer('2026-09-17', 'walk-ten'), offer('2026-09-17', 'low-pressure-conversation', 'step', { paths: ['partner'] }), offer('2026-09-17', 'five-minutes-prayer'), offer('2026-09-18', 'green-walk')]
    const r = { offers, outcomes: offers.map((o) => done(o)), hideFaith: false }
    const day = monthAgoToday('2026-10-17', [at('2026-09-17', 'morning', 3), at('2026-09-17', 'evening', 5, 'a good talk')], r, [{ day: '2026-09-17' }])
    expect(day).toMatchObject({ day: '2026-09-17', value: 75, band: 'solid', blocks: [], notes: [{ block: 'evening', note: 'a good talk' }], done: ['A ten-minute walk, now', 'Five minutes of prayer'], workout: true })
    // The faith family hidden leaves its moves out; the Partner path's own steps are never here.
    expect(monthAgoToday('2026-10-17', [at('2026-09-17', 'morning', 3)], { ...r, hideFaith: true }, [])?.done).toEqual(['A ten-minute walk, now'])
    // One block logged: its own reading, the day having none.
    expect(monthAgoToday('2026-10-17', [at('2026-09-17', 'evening', 1)], { offers: [], outcomes: [], hideFaith: false }, [])).toMatchObject({ value: null, blocks: [{ block: 'evening', value: 0 }] })
  })

  it('is nothing when the record holds nothing of that day', () => {
    expect(monthAgoToday('2026-10-17', [at('2026-09-16', 'evening', 4)], { offers: [], outcomes: [], hideFaith: false }, [{ day: '2026-09-18' }])).toBeNull()
  })
})

describe('the month', () => {
  const LEARN = { id: 3, kind: 'certification', stepMoveId: null, name: 'Veltish', createdAt: '2026-08-01T12:00:00.000Z', archivedAt: null } as Aim
  const PRAY = { id: 5, kind: 'practice', stepMoveId: 'five-minutes-prayer', createdAt: '2026-08-01T12:00:00.000Z', archivedAt: null } as Aim
  const PAUSED = { id: 6, kind: 'practice', stepMoveId: 'walk-ten', createdAt: '2026-08-01T12:00:00.000Z', archivedAt: null, pausedAt: '2026-09-01T12:00:00.000Z' } as Aim
  const input = (over: Partial<MonthInput>): MonthInput => ({ checkins: [], offers: [], outcomes: [], aims: [], skills: [], intentions: [], outside: [], hideFaith: false, nameOf: (a) => a.name ?? 'Five minutes of prayer', ...over })

  it('waits for a month of record to end, and says when its first review comes', () => {
    expect(monthReview('2026-10-17', input({ checkins: [at('2026-10-02', 'evening', 3)] }))).toBeNull()
    expect(monthReview('2026-10-17', input({}))).toBeNull()
    expect(firstReviewDay('2026-10-02')).toBe('2026-11-01')
    expect(firstReviewDay('2026-01-31')).toBe('2026-02-01')
  })

  it('reviews the last full month: check-ins, the day reading against the month before, its highest and lowest days', () => {
    const checkins: CheckIn[] = []
    for (const day of daysOfMonth('2026-08').slice(0, 10)) checkins.push(at(day, 'morning', 2), at(day, 'evening', 2))
    for (const day of daysOfMonth('2026-09')) checkins.push(at(day, 'morning', 3), at(day, 'evening', day === '2026-09-09' ? 5 : 3))
    checkins.push(at('2026-09-30', 'afternoon', 1))
    const r = monthReview('2026-10-17', input({ checkins }))
    expect(r).toMatchObject({ month: '2026-09', from: null, days: 30, checkins: { completed: 61, days: 30 } })
    // (28 × 50 + 75 + 33.3) / 30 = 50.3: the 9th's evening at the top, the 30th's afternoon at the bottom.
    expect(r?.reading).toEqual({ mean: 50.3, days: 30, before: { mean: 25, days: 10 }, high: { day: '2026-09-09', value: 75 }, low: { day: '2026-09-30', value: 33.3 } })
    // Every reading rose a step, each said in its own direction.
    expect(r?.moved.map((m) => [m.reading, m.delta])).toEqual(expect.arrayContaining([['mood', expect.any(Number)], ['stress', expect.any(Number)]]))
    expect(r?.moved.every((m) => m.delta > 0)).toBe(true)
  })

  it('says it has too few days rather than an average, and what moved only with enough answers each month', () => {
    // Six days of record: one short of the seven an average needs.
    expect(MONTH_MIN_DAYS).toBe(7)
    const checkins = daysOfMonth('2026-09').slice(0, 6).flatMap((day) => [at(day, 'morning', 3), at(day, 'evening', 3)])
    const r = monthReview('2026-10-17', input({ checkins }))
    expect(r?.reading).toMatchObject({ mean: null, days: 6, before: null, high: null, low: null })
    expect(r?.moved).toEqual([])
    expect(MONTH_MIN_ANSWERS).toBe(7)
    // A record begun inside the month says so; one begun on its first day covers it whole.
    expect(r?.from).toBeNull()
    expect(monthReview('2026-10-17', input({ checkins: [at('2026-09-12', 'evening', 3)] }))?.from).toBe('2026-09-12')
  })

  it('counts each commitment’s sessions done and plans started, a faith practice offered and never counted, a paused one left out', () => {
    const sessions = ['2026-09-02', '2026-09-03', '2026-09-20'].map((day) => offer(day, 'skill:1', 'step', { situationKey: keyFor(LEARN) }))
    const prayed = offer('2026-09-04', 'five-minutes-prayer', 'step', { situationKey: keyFor(PRAY) })
    const plans: Intention[] = [
      { id: 1, aimId: 3, day: '2026-09-02', cue: 'nextCheckIn', time: '13:00', setAt: '2026-09-02T09:00:00.000Z', offerId: sessions[0].id as number },
      { id: 2, aimId: 3, day: '2026-09-10', cue: 'afterBedtime', time: '20:00', setAt: '2026-09-10T09:00:00.000Z', offerId: null },
      { id: 3, aimId: 5, day: '2026-09-04', cue: 'nextCheckIn', time: '13:00', setAt: '2026-09-04T09:00:00.000Z', offerId: prayed.id as number },
    ]
    const r = monthReview('2026-10-17', input({ checkins: [at('2026-09-01', 'evening', 3)], aims: [LEARN, PRAY, PAUSED], offers: [...sessions, prayed], outcomes: [done(sessions[0]), done(sessions[1], 'partly'), done(sessions[2], 'no'), done(prayed)], intentions: plans }))
    expect(r?.commitments).toEqual([
      { name: 'Veltish', learning: true, faith: false, done: 2, planned: 2, kept: 1 },
      { name: 'Five minutes of prayer', learning: false, faith: true, done: 0, planned: 0, kept: 0 },
    ])
  })

  it('counts the moves done and the three done most, never the Partner path’s own, nor the faith family’s while hidden', () => {
    const moves = [
      ...['2026-09-01', '2026-09-02', '2026-09-03'].map((d) => offer(d, 'walk-ten')),
      ...['2026-09-04', '2026-09-05'].map((d) => offer(d, 'green-walk')),
      offer('2026-09-06', 'glass-of-water'),
      offer('2026-09-07', 'cyclic-sigh'),
      offer('2026-09-08', 'gratitude-three'),
      offer('2026-09-09', 'low-pressure-conversation', 'block', { paths: ['partner'] }),
      offer('2026-10-01', 'walk-ten'),
    ]
    const notDone = offer('2026-09-10', 'walk-ten')
    const base = input({ checkins: [at('2026-09-01', 'evening', 3, 'one line'), at('2026-09-02', 'evening', 3, '  ')], offers: [...moves, notDone], outcomes: [...moves.map((o) => done(o)), done(notDone, 'no')], outside: [{ day: '2026-09-03' }, { day: '2026-09-03' }, { day: '2026-09-12' }, { day: '2026-10-02' }] })
    const r = monthReview('2026-10-17', base)
    expect(r?.moves).toEqual({ done: 8, most: [{ name: 'A ten-minute walk, now', n: 3 }, { name: 'Walk somewhere green', n: 2 }, { name: 'A full glass of water', n: 1 }] })
    expect(monthReview('2026-10-17', { ...base, hideFaith: true })?.moves.done).toBe(7)
    expect(r).toMatchObject({ workoutDays: 2, notes: 1 })
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
  })
})

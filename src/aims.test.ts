import { describe, expect, it } from 'vitest'
import { becoming, blockedBy, EMPTY_LADDER_STEP, followThrough, stepChoices, stepFor, unblockFor } from './aims'
import { moveById, OBSERVED_ONLY, PASSIVE } from './catalogue'
import type { Aim, Offer, Outcome, RungMark, Skill, StudyNight, Win } from './db'

const aim = (kind: Aim['kind'], stepMoveId: string | null = null): Aim => ({ id: 1, kind, stepMoveId, createdAt: '', archivedAt: null })
const skill = (id: number, name: string): Skill => ({ id, name, order: id, createdAt: '', archivedAt: null })
const mark = (skillId: number, rung: number, at: string): RungMark => ({ skillId, rung, at, via: 'tap' })
const offer = (id: number, kind: Offer['kind'], moveId: string, day: string, at: string, situationKey: string, skippedAt: string | null = null): Offer => ({
  id,
  kind,
  day,
  block: 'evening',
  at,
  situationKey,
  target: 'focus',
  stance: '',
  band: '',
  reading: 0,
  moveId,
  cardId: null,
  candidates: [moveId],
  coinFlip: false,
  passiveId: null,
  whyNot: null,
  skippedAt,
  closedAt: null,
})
const outcome = (offerId: number, moveId: string, result: Outcome['outcome'], why: Outcome['why'] = null): Outcome => ({ offerId, moveId, day: '2026-09-08', block: 'morning', at: '', outcome: result, why, passiveOutcome: null })

describe('a commitment and its protected step', () => {
  it('pre-fills the certification from the ladder, and from the catalogue while the ladder is empty', () => {
    expect(stepFor(aim('certification'), [], []).id).toBe(EMPTY_LADDER_STEP)
    const skills = [skill(1, 'Subnetting')]
    expect(stepFor(aim('certification'), skills, []).name).toBe('Subnetting · watch or read it')
    expect(stepFor(aim('certification'), skills, [mark(1, 2, '2026-09-01T10:00:00Z')]).name).toBe('Subnetting · build it once')
  })

  it('takes a person or a practice step from the catalogue, never bedtime, never a passive item', () => {
    expect(stepFor(aim('person', 'call-not-text'), [], []).name).toBe(moveById('call-not-text').name)
    for (const kind of ['person', 'practice'] as const) {
      const choices = stepChoices(kind)
      expect(choices.length).toBeGreaterThan(2)
      for (const m of choices) {
        expect(OBSERVED_ONLY.has(m.id)).toBe(false)
        expect(PASSIVE.has(m.id)).toBe(false)
      }
    }
    expect(stepChoices('person').every((m) => m.family === 'people')).toBe(true)
    expect(stepChoices('practice').some((m) => m.family === 'faith')).toBe(true)
  })
})

describe('unblock, never downgrade', () => {
  const a = aim('certification')
  const noStep = offer(1, 'step', 'rung:1:2', '2026-09-07', '2026-09-07T19:00:00Z', 'aim:certification')

  it('reads the block from the last step, clears it on a later start, and never from an unblock offer', () => {
    expect(blockedBy(a, [], [], [])).toBeNull()
    expect(blockedBy(a, [noStep], [outcome(1, 'rung:1:2', 'no', 'noTime')], [])).toBe('noTime')
    expect(blockedBy(a, [noStep], [outcome(1, 'rung:1:2', 'no')], [])).toBe('unsaid')
    expect(blockedBy(a, [noStep], [outcome(1, 'rung:1:2', 'done')], [])).toBeNull()
    const later = offer(2, 'step', 'rung:1:2', '2026-09-08', '2026-09-08T19:00:00Z', 'aim:certification')
    expect(blockedBy(a, [noStep, later], [outcome(1, 'rung:1:2', 'no', 'noTime')], [])).toBeNull()
    const unblock = offer(3, 'unblock', 'two-minute-rule', '2026-09-08', '2026-09-08T20:00:00Z', 'aim:certification:unblock')
    expect(blockedBy(a, [noStep, unblock], [outcome(1, 'rung:1:2', 'no', 'noTime')], [])).toBe('noTime')
  })

  it('reads a study night that was not now, with its reason', () => {
    const night = offer(4, 'study', 'focused-block', '2026-09-07', '2026-09-07T20:00:00Z', 'study:evening', '2026-09-07T20:00:00Z')
    const record: StudyNight = { day: '2026-09-07', weekday: 1, offerId: 4, offeredMoveId: 'focused-block', decision: 'notNow', reason: 'tired', supported: true, evidence: null, smallerMoveId: null, at: '' }
    expect(blockedBy(a, [night], [], [record])).toBe('tired')
    expect(blockedBy(aim('person', 'call-not-text'), [night], [], [record])).toBeNull()
  })

  it('offers the finishing move that removes the obstacle', () => {
    expect(unblockFor('noTime').family).toBe('finishing')
    expect(unblockFor('didntWant').id).toBe('smallest-next-step')
    expect(unblockFor('tooMuch').id).toBe('finish-one-thing')
    expect(unblockFor('tired').family).toBe('finishing')
    expect(unblockFor('unsaid').family).toBe('finishing')
  })
})

describe('counts only', () => {
  const offers = [
    offer(1, 'block', 'walk-ten', '2026-09-07', '2026-09-07T14:00:00Z', 'afternoon:mood'),
    offer(2, 'block', 'nothing', '2026-09-07', '2026-09-07T19:00:00Z', 'evening:mood'),
    offer(3, 'step', 'study-plan-next', '2026-09-07', '2026-09-07T19:30:00Z', 'aim:certification'),
    offer(4, 'study', 'rung:1:1', '2026-09-08', '2026-09-08T20:00:00Z', 'study:evening'),
    offer(5, 'step', 'call-not-text', '2026-09-08', '2026-09-08T21:00:00Z', 'aim:person'),
    offer(6, 'block', 'one-verse', '2026-09-09', '2026-09-09T08:00:00Z', 'morning:mood', '2026-09-09T08:01:00Z'),
  ]
  const outcomes = [outcome(1, 'walk-ten', 'partly'), outcome(2, 'nothing', 'done'), outcome(3, 'study-plan-next', 'done'), outcome(4, 'rung:1:1', 'done'), outcome(5, 'call-not-text', 'no', 'didntWant')]
  const wins: Win[] = [
    { forDay: '2026-09-08', setOn: '2026-09-07', text: 'One line', outcome: 'done', answeredAt: '', updatedAt: '' },
    { forDay: '2026-09-09', setOn: '2026-09-08', text: 'Another', outcome: null, answeredAt: null, updatedAt: '' },
  ]

  it('tallies follow-through as started and finished across moves, steps and minimum wins', () => {
    const f = followThrough(offers, outcomes, wins)
    expect(f.moves).toEqual({ started: 1, finished: 0 })
    expect(f.steps).toEqual({ started: 3, finished: 2 })
    expect(f.wins).toEqual({ started: 2, finished: 1 })
    expect(f.all).toEqual({ started: 6, finished: 3 })
  })

  it('dates what was marked done under the direction sentence, and counts nothing for partly or no', () => {
    const b = becoming(offers, outcomes)
    expect(b.study).toEqual({ n: 2, last: '2026-09-08' })
    expect(b.conversations).toEqual({ n: 0, last: null })
    expect(b.faith).toEqual({ n: 0, last: null })
    expect(b.timeWithHer).toEqual({ n: 0, last: null })
  })
})

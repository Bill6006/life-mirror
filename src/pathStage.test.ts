import { describe, expect, it } from 'vitest'
import { moveById, pathReps, paths, type Path, type SettingKind } from './catalogue'
import type { Offer } from './db'
import { COACH_BLOCK_KEYS } from './factTypes'
import { coachBlock, countsByRep, eligibility, meetsRule, pathEntries, pathToday, pickRep, refusalsInARow, seeded, settingFor, stageOf, type PathEntry, type RepAnswer } from './pathStage'

// The path's stage and its pick (Part 24), against fixtures: the stage moves on coverage and on
// nothing less, a deleted answer recomputes it, two refusals bring the smallest version, a quiet
// stretch brings the stage below back while the stage stands, and today's shape alone decides
// whether an in-person rep may be the day's.

const social = paths.find((p) => p.id === 'social') as Path
let n = 0
function entry(moveId: string, day: string, setting: SettingKind, outcome: RepAnswer | null = 'done'): PathEntry {
  n++
  return { offerId: n, moveId, day, at: `${day}T10:${String(n % 60).padStart(2, '0')}:00.000Z`, setting, chosenBy: 'app', rule: 'rotate', outcome }
}
/** Six stage-1 reps over three weeks: three different reps, two kinds of setting. */
function stageOneMet(): PathEntry[] {
  return [
    entry('eye-contact-stranger', '2026-09-01', 'errand'),
    entry('attention-outward', '2026-09-03', 'group'),
    entry('greet-by-name', '2026-09-05', 'recurring'),
    entry('eye-contact-stranger', '2026-09-08', 'errand'),
    entry('attention-outward', '2026-09-12', 'recurring'),
    entry('greet-by-name', '2026-09-15', 'recurring'),
  ]
}

describe('the stage, from the record alone', () => {
  it('moves on coverage: six of its reps within six weeks, three different, two kinds of setting', () => {
    const s = stageOf(social, stageOneMet(), '2026-09-20')
    expect(s.stage).toBe(2)
    expect(s.reached).toEqual([{ stage: 2, day: '2026-09-15', by: 'rule' }])
    expect(stageOf(social, stageOneMet().slice(0, 5), '2026-09-20').stage).toBe(1)
  })

  it('does not move on one kind of setting alone, or on too few different reps, however many reps', () => {
    const one = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'].map((d, k) => entry(['eye-contact-stranger', 'attention-outward', 'greet-by-name'][k % 3], d, 'recurring'))
    expect(stageOf(social, one, '2026-09-20').stage).toBe(1)
    const two = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'].map((d, k) => entry(['eye-contact-stranger', 'attention-outward'][k % 2], d, k % 2 ? 'group' : 'errand'))
    expect(stageOf(social, two, '2026-09-20').stage).toBe(1)
  })

  it('counts only reps within the rule’s weeks, and only done ones', () => {
    const spread = stageOneMet().map((e, k) => (k >= 3 ? { ...e, day: `2026-10-${String(20 + k).padStart(2, '0')}` } : e))
    expect(stageOf(social, spread, '2026-10-30').stage).toBe(1)
    const partly = stageOneMet().map((e, k) => (k === 5 ? { ...e, outcome: 'partly' as const } : e))
    expect(stageOf(social, partly, '2026-09-20').stage).toBe(1)
  })

  it('recomputes when an answer is deleted (Rule 13)', () => {
    const met = stageOneMet()
    expect(stageOf(social, met, '2026-09-20').stage).toBe(2)
    expect(stageOf(social, met.map((e, k) => (k === 2 ? { ...e, outcome: null } : e)), '2026-09-20').stage).toBe(1)
  })

  it('is never moved by a solo, remote or warm-up rep, however many', () => {
    const warm = Array.from({ length: 12 }, (_, k) => entry(k % 2 ? 'message-a-friend' : 'liking-gap-note', `2026-09-${String(16 + k).padStart(2, '0')}`, k % 2 ? 'remote' : 'solo'))
    expect(stageOf(social, [...stageOneMet(), ...warm], '2026-09-30').stage).toBe(2)
  })

  it('brings the stage below back after four quiet weeks, while the stage stands', () => {
    const met = stageOneMet()
    expect(stageOf(social, met, '2026-10-12')).toMatchObject({ stage: 2, reentry: false })
    const quiet = stageOf(social, met, '2026-10-13')
    expect(quiet).toMatchObject({ stage: 2, reentry: true, lastDone: '2026-09-15' })
    const e = eligibility({ path: social, state: quiet, around: true, yesterday: null, doneToday: new Set() })
    expect(e.stage).toBe(1)
    expect(e.stageReps.map((m) => m.id).sort()).toEqual(pathReps('social', 1).map((m) => m.id).sort())
  })

  it('states the rule the plan names, checked the same way everywhere', () => {
    expect(meetsRule(stageOneMet(), social.rule)).toBe(true)
    expect(meetsRule(stageOneMet().slice(1), social.rule)).toBe(false)
  })
})

describe('what fits now, by today’s shape alone', () => {
  const state = stageOf(social, [], '2026-09-20')

  it('offers no in-person rep in a block nobody is around for, and still lists every rep of the stage for Change', () => {
    const home = eligibility({ path: social, state, around: false, yesterday: null, doneToday: new Set() })
    expect(home.eligible).toEqual([])
    expect(home.nobodyAround).toBe(true)
    expect(home.stageReps.map((m) => m.id).sort()).toEqual(['attention-outward', 'eye-contact-stranger', 'greet-by-name'])
    expect(pickRep(social, home.eligible, [], '2026-09-20', 0.5)).toBeNull()
    const office = eligibility({ path: social, state, around: true, yesterday: null, doneToday: new Set() })
    expect(office.eligible.map((m) => m.id).sort()).toEqual(['attention-outward', 'eye-contact-stranger', 'greet-by-name'])
  })

  it('offers a warm-up when only reps with nobody around fit, and it moves no stage', () => {
    const third = { stage: 3, reached: [], reentry: false, lastDone: null }
    const home = eligibility({ path: social, state: third, around: false, yesterday: null, doneToday: new Set() })
    expect(home.eligible.map((m) => m.id).sort()).toEqual(['call-not-text', 'liking-gap-note', 'message-a-friend', 'thank-you-note'])
    const pick = pickRep(social, home.eligible, [], '2026-09-20', 0.1)
    expect(pick && moveById(pick.moveId).path?.social?.advances).toBe(false)
  })

  it('leaves out yesterday’s rep and a rep done today', () => {
    const e = eligibility({ path: social, state, around: true, yesterday: 'greet-by-name', doneToday: new Set(['eye-contact-stranger']) })
    expect(e.eligible.map((m) => m.id)).toEqual(['attention-outward'])
  })
})

describe('the app’s pick, and where it is meant to happen', () => {
  const eligible = pathReps('social', 1)

  it('rotates toward the rep least recently done', () => {
    const record = [entry('eye-contact-stranger', '2026-09-10', 'errand'), entry('attention-outward', '2026-09-12', 'group'), entry('greet-by-name', '2026-09-14', 'recurring')]
    expect(pickRep(social, eligible, record, '2026-09-20', 0.9)).toMatchObject({ moveId: 'eye-contact-stranger', rule: 'rotate', propensities: { 'eye-contact-stranger': 1 } })
  })

  it('draws a tie with equal chances, kept with the offer, and the same seed draws the same rep', () => {
    const a = pickRep(social, eligible, [], '2026-09-20', seeded('7|2026-09-20|morning'))
    const b = pickRep(social, eligible, [], '2026-09-20', seeded('7|2026-09-20|morning'))
    expect(a).toEqual(b)
    expect(a?.rule).toBe('draw')
    expect(Object.values(a?.propensities ?? {}).reduce((s, p) => s + p, 0)).toBeCloseTo(1)
    for (const p of Object.values(a?.propensities ?? {})) expect(p).toBeCloseTo(1 / 3)
    const seen = new Set([0.05, 0.4, 0.8].map((d) => pickRep(social, eligible, [], '2026-09-20', d)?.moveId))
    expect(seen.size).toBe(3)
  })

  it('offers the smallest version of the stage after two No answers in a row, and not after a Done', () => {
    const noNo = [entry('eye-contact-stranger', '2026-09-18', 'errand', 'no'), entry('attention-outward', '2026-09-19', 'group', 'no')]
    expect(refusalsInARow(noNo)).toBe(2)
    const smaller = pickRep(social, pathReps('social', 2), noNo, '2026-09-20', 0.5)
    expect(smaller).toMatchObject({ rule: 'smaller', moveId: 'ask-follow-up' })
    const broken = [...noNo, entry('greet-by-name', '2026-09-19', 'recurring', 'done')]
    expect(refusalsInARow(broken)).toBe(0)
    expect(pickRep(social, pathReps('social', 2), broken, '2026-09-20', 0.5)?.rule).not.toBe('smaller')
    // A step not yet answered neither counts nor breaks the run.
    expect(refusalsInARow([...noNo, entry('greet-by-name', '2026-09-20', 'recurring', null)])).toBe(2)
  })

  it('rotates the setting toward the kind used least lately, among the kinds the rep can happen in', () => {
    const errands = [entry('eye-contact-stranger', '2026-09-15', 'errand'), entry('eye-contact-stranger', '2026-09-16', 'errand')]
    expect(settingFor(moveById('eye-contact-stranger'), social, errands, '2026-09-20')).toBe('recurring')
    expect(settingFor(moveById('eye-contact-stranger'), social, [], '2026-09-20')).toBe('errand')
    expect(settingFor(moveById('message-a-friend'), social, errands, '2026-09-20')).toBe('remote')
  })
})

describe('the record, the card’s counts and the coach block', () => {
  const offer = (o: Partial<Offer>): Offer => ({ kind: 'step', day: '2026-09-15', block: 'morning', at: '2026-09-15T08:00:00.000Z', situationKey: 'aim:path:social', target: 'mood', stance: '', band: '', reading: 0, moveId: 'greet-by-name', cardId: null, candidates: [], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, ...o })

  it('reads a path’s steps by the paths they count for, and a converted person’s steps as its own', () => {
    const offers = [offer({ id: 1, paths: ['social'], setting: 'recurring', chosenBy: 'app', rule: 'draw' }), offer({ id: 2, situationKey: 'aim:person', moveId: 'message-a-friend', day: '2026-09-01', at: '2026-09-01T09:00:00.000Z' }), offer({ id: 3, kind: 'block', situationKey: 'morning:mood', moveId: 'eye-contact-stranger' })]
    const outcomes = [{ id: 1, offerId: 1, moveId: 'greet-by-name', day: '2026-09-15', block: 'afternoon' as const, at: '', outcome: 'done' as const, why: null, passiveOutcome: null }]
    expect(pathEntries('social', offers, outcomes).map((e) => e.offerId)).toEqual([1])
    const converted = pathEntries('social', offers, outcomes, true)
    expect(converted.map((e) => [e.offerId, e.setting, e.chosenBy])).toEqual([
      [2, 'remote', 'you'],
      [1, 'recurring', 'app'],
    ])
  })

  it('counts by rep his own acts only, with the last two answers', () => {
    const record = [entry('greet-by-name', '2026-09-10', 'recurring', 'done'), entry('greet-by-name', '2026-09-12', 'errand', 'no'), entry('greet-by-name', '2026-09-14', 'recurring', 'partly')]
    expect(countsByRep(record)).toEqual([{ moveId: 'greet-by-name', offered: 3, drawn: 0, done: 1, partly: 1, no: 1, last: ['partly', 'no'], settings: ['recurring'] }])
  })

  it('writes the coach block by allowlist: exactly the contract’s keys, with no tier-2 or reading key', () => {
    const aim = { id: 7, kind: 'path' as const, path: 'social' as const, stepMoveId: null, createdAt: '2026-09-01T00:00:00.000Z', archivedAt: null }
    const ctx = { atOffice: false, churchDay: false, pickupTime: null }
    const view = pathToday({ aim, offers: [], outcomes: [], ctx, day: '2026-09-20', block: 'evening' })
    const block = coachBlock([view], ctx, '2026-09-20', 'evening')
    expect(Object.keys(block ?? {})).toEqual([...COACH_BLOCK_KEYS])
    for (const k of Object.keys(block ?? {})) expect(k).not.toMatch(/tier|carried|context|seen|history|reading/i)
    expect(block).toMatchObject({ day: '2026-09-20', block: 'evening', ineligibleReason: expect.stringContaining('Nobody is around'), stages: [{ path: 'social', stage: 1, name: 'Presence', reentry: false }], eligible: [{ path: 'social', ids: [] }], dateDay: false })
    expect(block?.perRep.map((r) => r.id).sort()).toEqual(['attention-outward', 'eye-contact-stranger', 'greet-by-name'])
    expect(coachBlock([], ctx, '2026-09-20', 'evening')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import type { Block } from './blocks'
import { moveById, pathReps, paths, type Path, type SettingKind } from './catalogue'
import type { CheckIn, Offer } from './db'
import { COACH_BLOCK_KEYS } from './factTypes'
import { isComparable, repComparisons } from './pathLearning'
import { CHANCE_CEILING, CHANCE_FLOOR, clipChances, coachBlock, countsByRep, drawChances, eligibility, meetsRule, pathEntries, pathToday, pickRep, refusalsInARow, seeded, settingFor, stageOf, whyThisRep, type PathEntry, type RepAnswer } from './pathStage'

// The path's stage and its pick (Parts 24 and 25), against fixtures: the stage moves on coverage
// and on nothing less, a deleted answer recomputes it, two refusals bring the smallest version, a
// quiet stretch brings the stage below back while the stage stands, and today's shape alone
// decides whether an in-person rep may be the day's. The pick is a draw whose chances are kept,
// lean only after ten draws in the stage, stay between 0.1 and 0.8 and sum to one; only what
// chance decided is compared.

const social = paths.find((p) => p.id === 'social') as Path
let n = 0
function entry(moveId: string, day: string, setting: SettingKind, outcome: RepAnswer | null = 'done', extra: Partial<PathEntry> = {}): PathEntry {
  n++
  return { offerId: n, moveId, day, at: `${day}T10:${String(n % 60).padStart(2, '0')}:00.000Z`, setting, chosenBy: 'app', rule: 'only', outcome, stage: 1, block: 'morning', chances: null, ...extra }
}
/** A check-in whose reading reads high (good) or low (hard), for the next-block comparisons. */
function checkin(day: string, block: Block, good: boolean): CheckIn {
  const up = good ? 5 : 1
  const down = good ? 1 : 5
  const answers = { mood: up, energy: up, focus: up, irritation: down, stress: down, overwhelm: down, hunger: 3 } as CheckIn['answers']
  return { day, block, asked: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'], startedAt: `${day}T13:00:00.000Z`, completedAt: `${day}T13:02:00.000Z`, updatedAt: `${day}T13:02:00.000Z`, answers, activeMs: 60_000 }
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

  it('draws among every rep that fits, the same chance each until the stage has had ten draws; one rep that fits is that rep', () => {
    const record = [entry('eye-contact-stranger', '2026-09-10', 'errand'), entry('attention-outward', '2026-09-12', 'group'), entry('greet-by-name', '2026-09-14', 'recurring')]
    const pick = pickRep(social, eligible, record, '2026-09-20', 0.9)
    expect(pick).toMatchObject({ rule: 'draw', leaning: false, candidates: eligible.map((m) => m.id) })
    for (const c of Object.values(pick?.propensities ?? {})) expect(c).toBeCloseTo(1 / 3)
    expect(pickRep(social, eligible.slice(0, 1), record, '2026-09-20', 0.9)).toMatchObject({ rule: 'only', propensities: { [eligible[0].id]: 1 } })
  })

  it('keeps every chance with the offer, and the same seed draws the same rep', () => {
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

describe('honest learning on the path (Part 25)', () => {
  const eligible = pathReps('social', 1)
  const equal = { 'eye-contact-stranger': 1 / 3, 'attention-outward': 1 / 3, 'greet-by-name': 1 / 3 }
  const drawn = (moveId: string, day: string, outcome: RepAnswer | null) => entry(moveId, day, 'recurring', outcome, { rule: 'draw', stage: 1, block: 'morning', chances: equal })

  it('holds every chance between the floor and the ceiling, summing to one, whatever the weights', () => {
    const cases: Record<string, number>[] = [{ a: 100, b: 1, c: 1 }, { a: 1, b: 1000 }, { a: 1, b: 1, c: 1, d: 1, e: 1000 }, { a: 0, b: 0, c: 5 }, { a: 2, b: 3 }]
    for (const w of cases) {
      const cs = Object.values(clipChances(w))
      expect(cs.reduce((t, c) => t + c, 0)).toBeCloseTo(1, 9)
      for (const c of cs) {
        expect(c).toBeGreaterThanOrEqual(CHANCE_FLOOR - 1e-9)
        expect(c).toBeLessThanOrEqual(CHANCE_CEILING + 1e-9)
      }
    }
    // Two reps: the favourite at the ceiling and the other the rest. Five with one heavy: the four at the floor, the heavy one the rest.
    expect(clipChances({ a: 1, b: 1000 }).a).toBeCloseTo(0.2, 9)
    expect(clipChances({ a: 1, b: 1, c: 1, d: 1, e: 1000 }).e).toBeCloseTo(0.6, 9)
    // Inside the bounds the weights keep their proportions.
    const inside = clipChances({ a: 2, b: 3 })
    expect(inside.b / inside.a).toBeCloseTo(1.5, 9)
  })

  it('leans toward the reps he completes only after ten draws in the stage, and says so', () => {
    const reps = ['eye-contact-stranger', 'attention-outward', 'greet-by-name']
    const nine = reps.flatMap((id, r) => [0, 1, 2].map((k) => drawn(id, `2026-09-${String(10 + r * 3 + k).padStart(2, '0')}`, r === 0 ? 'done' : 'no')))
    expect(drawChances(eligible, nine, 1).leaning).toBe(false)
    const ten = [...nine, drawn('eye-contact-stranger', '2026-09-19', 'done')]
    const { chances, leaning } = drawChances(eligible, ten, 1)
    expect(leaning).toBe(true)
    expect(chances['eye-contact-stranger']).toBeGreaterThan(chances['attention-outward'])
    expect(Object.values(chances).reduce((t, c) => t + c, 0)).toBeCloseTo(1, 9)
    for (const c of Object.values(chances)) expect(c).toBeGreaterThanOrEqual(CHANCE_FLOOR - 1e-9)
    // Draws among another stage's reps do not count toward this one's ten.
    expect(drawChances(eligible, ten.map((e) => ({ ...e, stage: 2 })), 1).leaning).toBe(false)
    const pick = pickRep(social, eligible, ten, '2026-09-20', 0.5, 1)
    expect(pick?.leaning).toBe(true)
    expect(Object.values(pick?.propensities ?? {}).reduce((t, c) => t + c, 0)).toBeCloseTo(1, 9)
    expect(whyThisRep(pick as NonNullable<typeof pick>)).toContain('leaning toward the ones you complete')
  })

  it('says in one line which rule chose the rep, and where when the rep can happen in more than one kind of setting', () => {
    const noNo = [entry('eye-contact-stranger', '2026-09-18', 'errand', 'no'), entry('attention-outward', '2026-09-19', 'group', 'no')]
    const smaller = pickRep(social, eligible, noNo, '2026-09-20', 0.5)
    expect(smaller?.rule).toBe('smaller')
    expect(whyThisRep(smaller as NonNullable<typeof smaller>)).toMatch(/^The smallest version of this stage, after two No answers in a row\. Where: /)
    const errands = [entry('eye-contact-stranger', '2026-09-15', 'errand'), entry('eye-contact-stranger', '2026-09-16', 'errand')]
    const only = pickRep(social, [moveById('eye-contact-stranger')], errands, '2026-09-20', 0.5)
    expect(only).toMatchObject({ rule: 'only', setting: 'recurring' })
    expect(whyThisRep(only as NonNullable<typeof only>)).toBe('The one rep of this stage that fits now. Where: a recurring place, the kind of setting used least in the last six weeks.')
    const remote = pickRep(social, [moveById('message-a-friend')], [], '2026-09-20', 0.5)
    expect(whyThisRep(remote as NonNullable<typeof remote>)).toBe('The one rep of this stage that fits now.')
    expect(whyThisRep({ ...(only as NonNullable<typeof only>), rule: 'you', chosenBy: 'you' })).toBe('Your pick, through Change.')
    const drawnPick = pickRep(social, eligible, [], '2026-09-20', 0.5)
    expect(whyThisRep(drawnPick as NonNullable<typeof drawnPick>)).toMatch(/^Drawn at random among the 3 reps that fit now/)
  })

  it('compares only what chance decided, like for like: picks by you and by a rule are counted, never compared', () => {
    const days = Array.from({ length: 14 }, (_, k) => `2026-09-${String(1 + k).padStart(2, '0')}`)
    const record = days.map((d, k) => drawn(k % 2 === 0 ? 'eye-contact-stranger' : k % 4 === 1 ? 'attention-outward' : 'greet-by-name', d, 'done'))
    const yours = days.slice(0, 6).map((d) => entry('eye-contact-stranger', d, 'recurring', 'done', { rule: 'you', chosenBy: 'you' }))
    const rules = days.slice(0, 6).map((d) => entry('eye-contact-stranger', d, 'recurring', 'done', { rule: 'smaller' }))
    // The afternoon after each morning's draw reads high after eye contact and low after the others.
    const checkins = days.map((d, k) => checkin(d, 'afternoon', k % 2 === 0))
    const eye = repComparisons([...record, ...yours, ...rules], checkins).find((r) => r.moveId === 'eye-contact-stranger')
    expect(eye).toMatchObject({ n: 7, m: 7, tier: 'promising' })
    expect(eye?.diff).toBeGreaterThan(0)
    expect(isComparable(yours[0])).toBe(false)
    expect(isComparable(rules[0])).toBe(false)
    // Below five a side, no difference is said.
    for (const r of repComparisons(record.slice(0, 6), checkins)) expect(r).toMatchObject({ diff: null, tier: 'little' })
  })
})

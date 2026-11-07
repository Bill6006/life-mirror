import { describe, expect, it } from 'vitest'
import { findPath, moveById, type Path, type PathId } from './catalogue'
import type { Aim, Offer, Outcome } from './db'
import { adaptedOf, CANT_YET, keyOf, NO_CHANCE, proposalsOf, SPACING, TOO_MUCH, UNADAPTED, type AdaptRep, type PathAdaptation, type ProposalInput } from './pathAdapt'
import { checksDue } from './pathMeasure'
import { pathToday, pickRep, setAsideBy, settingFor, whyThisRep, type PathTodayInput } from './pathStage'

// The fast loop (P6, 2026-11-07): the runtime reads only the applied rows of a Path's own log; a proposal comes from the
// record's own counts, never twice for one change applied, and a declined one only on answers after Not now; every
// rule over its grid, at its threshold and one short of it.

const speaking = findPath('speaking') as Path
const social = findPath('social') as Path

let n = 0
function row(path: string, kind: PathAdaptation['kind'], target: Partial<PathAdaptation> = {}, state: PathAdaptation['state'] = 'applied', at = '2026-11-01T09:00:00.000Z'): PathAdaptation {
  n++
  const r = { id: n, at, day: at.slice(0, 10), path, version: '1', hash: 'h', kind, origin: 'preference' as const, why: 'w', state, stateAt: at, ...target }
  return { ...r, key: keyOf(r) }
}

function rep(moveId: string, day: string, outcome: AdaptRep['outcome'], extra: Partial<AdaptRep> = {}): AdaptRep {
  n++
  return { offerId: n, moveId, day, at: `${day}T${String(8 + (n % 12)).padStart(2, '0')}:00:00.000Z`, strand: 'nerves', stage: 1, outcome, ...extra }
}

function input(reps: AdaptRep[], extra: Partial<ProposalInput> = {}): ProposalInput {
  return { path: 'speaking', reps, rows: [], today: '2026-11-20', strands: [{ strand: 'nerves', stage: 1 }], floorLost: () => false, belowBack: () => false, ...extra }
}

describe('the runtime reads only applied rows of the Path’s own log', () => {
  it('ignores another Path’s rows, declined proposals and undone changes', () => {
    expect(adaptedOf('speaking', [])).toBe(UNADAPTED)
    expect(adaptedOf('speaking', [row('social', 'setAside', { rep: 'greet-by-name' }), row('speaking', 'setAside', { rep: 'read-aloud' }, 'declined'), row('speaking', 'prefer', { rep: 'read-aloud' }, 'undone')])).toBe(UNADAPTED)
    const a = adaptedOf('speaking', [row('speaking', 'setAside', { rep: 'read-aloud' }), row('speaking', 'noSetting', { setting: 'group' }), row('speaking', 'stepDown', { strand: 'nerves', stage: 2 })])
    expect([...a.setAside]).toEqual(['read-aloud'])
    expect([...a.noSettings]).toEqual(['group'])
    expect(a.stepDown).toEqual([{ strand: 'nerves', stage: 2 }])
  })

  it('lets a rep set aside outrank a preference for it', () => {
    const a = adaptedOf('speaking', [row('speaking', 'prefer', { rep: 'read-aloud' }), row('speaking', 'setAside', { rep: 'read-aloud' })])
    expect(a.prefer.has('read-aloud')).toBe(false)
    expect(a.setAside.has('read-aloud')).toBe(true)
  })
})

describe('feasibility: no chance on three of a rep’s last four answered steps', () => {
  const noChance = (k: number) => Array.from({ length: 4 }, (_, i) => rep('sp-n-one-question', `2026-11-${String(10 + i).padStart(2, '0')}`, 'no', i < k ? { pathWhy: 'noChance' } : { pathWhy: 'cantYet' }))
  it('proposes setting it aside at three, never at two', () => {
    const p = proposalsOf(input(noChance(3)))
    expect(p.map((x) => [x.kind, x.rep, x.origin, x.counts.noChance, x.counts.of])).toEqual([['setAside', 'sp-n-one-question', 'feasibility', NO_CHANCE.at, NO_CHANCE.of]])
    expect(proposalsOf(input(noChance(2))).filter((x) => x.kind === 'setAside')).toEqual([])
  })
  it('reads the measured Path’s chance question the same way, and three answers are too few', () => {
    const chance = Array.from({ length: 4 }, (_, i) => rep('sp-n-one-question', `2026-11-1${i}`, 'partly', { chance: false }))
    expect(proposalsOf(input(chance)).map((x) => x.kind)).toContain('setAside')
    expect(proposalsOf(input(chance.slice(1))).map((x) => x.kind)).not.toContain('setAside')
  })
  it('never proposes what would leave the stage short of its floor, or a rep already set aside', () => {
    expect(proposalsOf(input(noChance(4), { floorLost: () => true })).filter((x) => x.kind === 'setAside')).toEqual([])
    expect(proposalsOf(input(noChance(4), { rows: [row('speaking', 'setAside', { rep: 'sp-n-one-question' })] })).filter((x) => x.kind === 'setAside')).toEqual([])
  })
  it('after Not now, counts only answers after it', () => {
    const declined = row('speaking', 'setAside', { rep: 'sp-n-one-question' }, 'declined', '2026-11-12T23:00:00.000Z')
    expect(proposalsOf(input(noChance(4), { rows: [declined] })).filter((x) => x.kind === 'setAside')).toEqual([])
    const later = [...noChance(4), ...Array.from({ length: 4 }, (_, i) => rep('sp-n-one-question', `2026-11-1${5 + i}`, 'no', { pathWhy: 'noChance' }))]
    expect(proposalsOf(input(later, { rows: [declined] })).filter((x) => x.kind === 'setAside')).toHaveLength(1)
  })
})

describe('step-down: can’t do it yet twice within three weeks on a stage’s reps', () => {
  const at = (stage: number, days: string[]) => days.map((d) => rep('sp-n-speak-early', d, 'no', { stage, pathWhy: 'cantYet' }))
  const two = { strands: [{ strand: 'nerves', stage: 2 }] }
  it('proposes the stage below’s reps back beside it', () => {
    const p = proposalsOf(input(at(2, ['2026-11-05', '2026-11-18']), two))
    expect(p.map((x) => [x.kind, x.strand, x.stage, x.origin, x.counts.cantYet])).toEqual([['stepDown', 'nerves', 2, 'longitudinal', CANT_YET.times]])
  })
  it('not once, not spread over more than three weeks, not on the first stage, not when those reps are back already', () => {
    expect(proposalsOf(input(at(2, ['2026-11-18']), two))).toEqual([])
    expect(proposalsOf(input(at(2, ['2026-10-25', '2026-11-18']), two))).toEqual([])
    expect(proposalsOf(input(at(1, ['2026-11-05', '2026-11-18'])))).toEqual([])
    expect(proposalsOf(input(at(2, ['2026-11-05', '2026-11-18']), { ...two, belowBack: () => true }))).toEqual([])
  })
})

describe('the smaller version first: hard on three of four done, or a No for no time on three of four answered', () => {
  const done = (efforts: number[]) => efforts.map((e, i) => rep('sp-n-eyes-up', `2026-11-1${i}`, 'done', { effort: e as AdaptRep['effort'] }))
  it('proposes it on three hard of the last four done, never on two', () => {
    const p = proposalsOf(input(done([4, 5, 2, 4])))
    expect(p.map((x) => [x.kind, x.stage, x.counts.hard, x.counts.of])).toEqual([['smallerFirst', 1, TOO_MUCH.at, TOO_MUCH.of]])
    expect(proposalsOf(input(done([4, 5, 2, 3])))).toEqual([])
    expect(proposalsOf(input(done([5, 5, 5])))).toEqual([])
  })
  it('proposes it on three Nos for no time of the last four answered (the burden), never on two', () => {
    const noTime = (k: number) => Array.from({ length: 4 }, (_, i) => rep('sp-n-eyes-up', `2026-11-1${i}`, 'no', { why: i < k ? 'noTime' : 'didntWant' }))
    expect(proposalsOf(input(noTime(3))).map((x) => [x.kind, x.counts.noTime])).toEqual([['smallerFirst', 3]])
    expect(proposalsOf(input(noTime(2)))).toEqual([])
  })
})

describe('check-again spacing: half as late again after a pass, half as soon after a miss', () => {
  const strands = [{ strand: 'speaking', stage: 3 }]
  it('lengthens after a pass, up to a year, and shortens after a miss, to three weeks at least', () => {
    const passed = proposalsOf(input([], { strands, checks: [{ strand: 'speaking', stage: 2, day: '2026-11-01', passed: true, next: 60 }] }))
    expect(passed.map((x) => [x.kind, x.stage, x.after, x.every])).toEqual([['spacing', 2, '2026-11-01', 90]])
    const capped = proposalsOf(input([], { strands, checks: [{ strand: 'speaking', stage: 2, day: '2026-11-01', passed: true, next: 300 }] }))
    expect(capped[0].every).toBe(SPACING.most)
    const missed = proposalsOf(input([], { strands, checks: [{ strand: 'speaking', stage: 2, day: '2026-11-01', passed: false, next: 30 }] }))
    expect(missed[0].every).toBe(SPACING.least)
    expect(proposalsOf(input([], { strands, checks: [{ strand: 'speaking', stage: 2, day: '2026-11-01', passed: false, next: 60 }] }))[0].every).toBe(30)
  })
  it('restarts the checks from the check it follows, every so many days', () => {
    const plan = { at: [30, 90], every: 180 }
    expect(checksDue('2026-01-01', plan, '2026-06-01')).toEqual(['2026-01-31', '2026-04-01', '2026-09-28'])
    expect(checksDue('2026-01-01', plan, '2026-06-01', [{ after: '2026-01-31', every: 90 }])).toEqual(['2026-01-31', '2026-05-01', '2026-07-30'])
  })
})

describe('a proposal applied is never proposed again', () => {
  it('by its key', () => {
    const done = [4, 5, 5, 4].map((e, i) => rep('sp-n-eyes-up', `2026-11-1${i}`, 'done', { effort: e as AdaptRep['effort'] }))
    expect(proposalsOf(input(done, { rows: [row('speaking', 'smallerFirst', { strand: 'nerves', stage: 1 })] }))).toEqual([])
  })
})

// The engine with the rows: only what a change says changes.
let id = 0
function step(moveId: string, day: string, paths: PathId[], extra: Partial<Offer> = {}): Offer {
  id++
  return { id, kind: 'step', day, block: 'morning', at: `${day}T09:${String(id % 60).padStart(2, '0')}:00.000Z`, situationKey: `aim:path:${paths[0]}`, target: 'mood', stance: '', band: '', reading: 0, moveId, minutes: 5, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, chosenBy: 'app', paths, setting: 'group', rule: 'only', stage: 1, skippedAt: null, closedAt: null, ...extra }
}
function answer(o: Offer, outcome: Outcome['outcome'], extra: Partial<Outcome> = {}): Outcome {
  return { offerId: o.id as number, moveId: o.moveId, day: o.day, block: o.block, at: `${o.day}T20:00:00.000Z`, outcome, why: null, passiveOutcome: null, ...extra }
}
const nervesAim: Aim = { id: 7, kind: 'path', path: 'speaking', stepMoveId: null, pausedAt: null, createdAt: '2026-11-01T08:00:00.000Z', archivedAt: null, strands: ['nerves'] }
const base = (extra: Partial<PathTodayInput> = {}): PathTodayInput => ({ aim: nervesAim, offers: [], outcomes: [], ctx: null, day: '2026-11-20', block: 'morning', ...extra })

describe('the Path with your changes', () => {
  it('runs exactly as before with no row of its own applied', () => {
    const before = pathToday(base())
    const after = pathToday(base({ adaptations: [row('social', 'setAside', { rep: 'greet-by-name' }), row('speaking', 'setAside', { rep: 'sp-n-one-question' }, 'undone'), row('speaking', 'prefer', { rep: 'sp-n-eyes-up' }, 'declined')] }))
    expect(after).toEqual(before)
  })

  it('never offers a rep you set aside, nor one needing only a kind of setting you don’t have', () => {
    const before = pathToday(base())
    expect(before.elig.stageReps.map((m) => m.id)).toContain('sp-n-one-question')
    const aside = pathToday(base({ adaptations: [row('speaking', 'setAside', { rep: 'sp-n-one-question' })] }))
    expect(aside.elig.stageReps.map((m) => m.id)).not.toContain('sp-n-one-question')
    expect(aside.elig.eligible.map((m) => m.id)).not.toContain('sp-n-one-question')
    const a = adaptedOf('speaking', [row('speaking', 'noSetting', { setting: 'solo' })])
    expect(setAsideBy(a, moveById('read-aloud'))).toBe(true)
    expect(setAsideBy(a, moveById('sp-n-one-question'))).toBe(false)
    expect(settingFor(moveById('sp-n-one-question'), speaking, [], '2026-11-20', false, new Set(['recurring']))).toBe('group')
    expect(settingFor(moveById('sp-n-one-question'), speaking, [], '2026-11-20', false, new Set(['group', 'recurring']))).toBe('group')
  })

  it('leans a draw toward a rep you prefer, every chance kept and within its bounds', () => {
    const reps = ['sp-n-one-question', 'sp-n-eyes-up', 'sp-n-no-lines'].map(moveById)
    const even = pickRep(speaking, reps, [], '2026-11-20', 0.5, -1)
    const leaned = pickRep(speaking, reps, [], '2026-11-20', 0.5, -1, false, { prefer: new Set(['sp-n-eyes-up']) })
    expect(even?.preferred).toBeUndefined()
    expect(leaned?.preferred).toBe(true)
    const ps = leaned?.propensities ?? {}
    expect(Object.values(ps).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9)
    expect(ps['sp-n-eyes-up']).toBeCloseTo(0.5, 9)
    expect(ps['sp-n-one-question']).toBeCloseTo(0.25, 9)
    expect(whyThisRep(leaned!, speaking)).toContain('the one you prefer')
    // Every rep preferred, or none, leans nothing.
    expect(pickRep(speaking, reps, [], '2026-11-20', 0.5, -1, false, { prefer: new Set(reps.map((m) => m.id)) })?.preferred).toBeUndefined()
  })

  it('offers the smaller version first after a rep of the stage you marked hard, and the usual pick after an easy one', () => {
    const rows = [row('speaking', 'smallerFirst', { strand: 'nerves', stage: 1 }, 'applied', '2026-11-10T08:00:00.000Z')]
    const o = step('sp-n-eyes-up', '2026-11-19', ['speaking'])
    const hard = pathToday(base({ offers: [o], outcomes: [answer(o, 'done', { effort: 5 })], adaptations: rows }))
    expect(hard.pick?.rule).toBe('smaller')
    expect(hard.pick?.first).toBe(true)
    expect(hard.pick?.moveId).toBe('sp-n-one-question')
    expect(whyThisRep(hard.pick!, speaking)).toContain('as you chose')
    const easy = pathToday(base({ offers: [o], outcomes: [answer(o, 'done', { effort: 2 })], adaptations: rows }))
    expect(easy.pick?.first).toBeUndefined()
    // Before the change, a hard rep brings nothing.
    expect(pathToday(base({ offers: [o], outcomes: [answer(o, 'done', { effort: 5 })] })).pick?.first).toBeUndefined()
  })

  it('brings the stage below’s reps back beside the stage a step-down was taken on, while the strand stands there', () => {
    const socialAim: Aim = { id: 8, kind: 'path', path: 'social', stepMoveId: null, pausedAt: null, createdAt: '2026-09-01T08:00:00.000Z', archivedAt: null }
    const met = [['eye-contact-stranger', '2026-09-01', 'errand'], ['attention-outward', '2026-09-03', 'group'], ['greet-by-name', '2026-09-05', 'recurring'], ['eye-contact-stranger', '2026-09-08', 'errand'], ['attention-outward', '2026-09-12', 'recurring'], ['greet-by-name', '2026-09-15', 'recurring']].map(([m, d, s]) => step(m, d, ['social'], { setting: s as Offer['setting'], situationKey: 'aim:path:social' }))
    const i: PathTodayInput = { aim: socialAim, offers: met, outcomes: met.map((o) => answer(o, 'done')), ctx: null, day: '2026-09-20', block: 'morning' }
    const plain = pathToday(i)
    expect(plain.state.stage).toBe(2)
    expect(plain.elig.stageReps.some((m) => m.path?.social?.stage === 1)).toBe(false)
    const down = pathToday({ ...i, adaptations: [row('social', 'stepDown', { strand: '', stage: 2 })] })
    expect(down.elig.stageReps.some((m) => m.path?.social?.stage === 1)).toBe(true)
    expect(social.id).toBe('social')
  })
})

import { describe, expect, it } from 'vitest'
import { moreConservative, triageGoal, type Triage } from './pathTriage'

// Triage by rules alone (P5, 2026-11-06): the stress set's goals that rules decide, routed as frozen in the plan
// before any run, and the near-misses that must not trip a list. A model's triage may only move a goal toward
// refusal, never away from it.

const route = (goal: string, also: readonly string[] = []): Pick<Triage, 'route' | 'to' | 'kind' | 'practice'> => {
  const t = triageGoal(goal, also)
  return { route: t.route, ...(t.to ? { to: t.to } : {}), ...(t.kind ? { kind: t.kind } : {}), ...(t.practice !== undefined ? { practice: t.practice } : {}) }
}

describe('the stress set, routed as frozen before any run', () => {
  it('lets the clear, the habit, the mixed skill and fear, the weakly researched and the hard to measure through to the generator', () => {
    expect(route('Get comfortable cooking dinner from scratch on weeknights')).toEqual({ route: 'fits' })
    expect(route('Floss every night')).toEqual({ route: 'fits' })
    expect(route('Stop freezing when I have to call people on the phone')).toEqual({ route: 'fits' })
    expect(route('Get better at improv comedy')).toEqual({ route: 'fits' })
    expect(route('Be more present with my kids')).toEqual({ route: 'fits' })
  })

  it('sends a goal something already covers to it', () => {
    expect(route('Make more friends')).toEqual({ route: 'existing', to: 'social' })
    expect(route('Learn to read sheet music')).toEqual({ route: 'existing', to: 'learning' })
    expect(route('Start running')).toEqual({ route: 'existing', to: 'workout' })
    expect(route('Get better at public speaking')).toEqual({ route: 'existing', to: 'speaking' })
    expect(route('Find a girlfriend')).toEqual({ route: 'existing', to: 'partner' })
  })

  it('asks back on a vague goal, refuses one aimed at someone else, and redirects a risky one with no Path', () => {
    expect(route('Be better')).toEqual({ route: 'unclear' })
    expect(route('Get my life together')).toEqual({ route: 'unclear' })
    expect(route('Get my ex to want me back')).toEqual({ route: 'refuse', kind: 'others' })
    expect(route('Lose 10 pounds in two weeks')).toEqual({ route: 'redirect', kind: 'eating', practice: false })
  })
})

describe('the closed lists', () => {
  it('refuse coercion, deception, monitoring and the illegal, wherever the words fall', () => {
    expect(route('Learn to guilt-trip my brother into helping').route).toBe('refuse')
    expect(route('Persuade people without them knowing')).toEqual({ route: 'refuse', kind: 'deception' })
    expect(route('Check her phone without asking')).toEqual({ route: 'refuse', kind: 'monitoring' })
    expect(route('Get better at shoplifting')).toEqual({ route: 'refuse', kind: 'illegal' })
    // Read in the why and anything off-limits too.
    expect(route('Get better at texting', ['so I can pressure her into seeing me']).route).toBe('refuse')
  })

  it('redirect risk to yourself with no Path, and a clinical word with practice allowed beside the help', () => {
    expect(route('Stop wanting to hurt myself')).toEqual({ route: 'redirect', kind: 'selfHarm', practice: false })
    expect(route('Stop taking my antidepressants')).toEqual({ route: 'redirect', kind: 'medication', practice: false })
    expect(route('Quit drinking')).toEqual({ route: 'redirect', kind: 'medication', practice: false })
    expect(route('Leave my abusive partner')).toEqual({ route: 'redirect', kind: 'abuse', practice: false })
    expect(route('Overcome my social anxiety')).toEqual({ route: 'redirect', kind: 'clinical', practice: true })
    expect(route('Cure my insomnia')).toEqual({ route: 'redirect', kind: 'clinical', practice: true })
  })

  it('call a one-off task not a Path, unless it repeats', () => {
    expect(route('Book a dentist appointment')).toEqual({ route: 'notAPath' })
    expect(route('File my taxes')).toEqual({ route: 'notAPath' })
    expect(route('Call my mom every Sunday')).toEqual({ route: 'fits' })
  })

  it('never trip on near-misses', () => {
    expect(route('Cut down on sugar')).toEqual({ route: 'fits' })
    expect(route('Persuade my team to adopt the new process')).toEqual({ route: 'fits' })
    expect(route('Speak up when I disagree with my boss')).toEqual({ route: 'fits' })
    expect(route('Get better at making coffee')).toEqual({ route: 'fits' })
    expect(route('Be more patient with my daughter')).toEqual({ route: 'fits' })
  })
})

describe('a model’s triage', () => {
  it('may move a goal only toward refusal, never away from it', () => {
    expect(moreConservative('fits', 'refuse')).toBe('refuse')
    expect(moreConservative('refuse', 'fits')).toBe('refuse')
    expect(moreConservative('redirect', 'existing')).toBe('redirect')
    expect(moreConservative('unclear', 'fits')).toBe('unclear')
  })
})

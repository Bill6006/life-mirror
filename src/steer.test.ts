import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { pathReps, paths, type Path, type SettingKind } from './catalogue'
import { db, type Aim, type CheckIn } from './db'
import { resumePath } from './pathFlow'
import { ofSteer, pathToday, type PathEntry, pickRep, settingFor, socialEnergyOn, steeredPick, steerOf, whyThisRep } from './pathStage'

// Stage 3, item 5, part 3: this morning's Social energy steers the People row. Low (Empty or Low) draws among the reps
// that are a call or a message, high (Up for it or Drawn out) among the reps in person, when one of its kind fits;
// otherwise, and with no answer today, the draw is as it was. The steer narrows the candidates before the draw, so each
// chance is still recorded; it never touches the stage; the path's own rules stand.

const social = paths.find((p) => p.id === 'social') as Path
const DAY = '2026-09-18'
const stage3 = pathReps('social', 3)
const no = (moveId: string, k: number): PathEntry => ({ offerId: k, moveId, day: `2026-09-1${k}`, at: '', setting: 'oneToOne' as SettingKind, chosenBy: 'app', rule: 'draw', outcome: 'no', stage: 3, block: 'evening', chances: null })

describe('Social energy read as a steer', () => {
  it('reads Empty and Low as toward a call or a message, Up for it and Drawn out as toward in person, the middle and no answer as none', () => {
    expect([1, 2, 3, 4, 5].map(steerOf)).toEqual(['remote', 'remote', null, 'inPerson', 'inPerson'])
    expect(steerOf(null)).toBeNull()
    expect(steerOf(undefined)).toBeNull()
  })

  it('takes this morning’s answer alone', () => {
    const ci = (day: string, block: CheckIn['block'], socialEnergy: number): CheckIn => ({ day, block, answers: { socialEnergy } as CheckIn['answers'], startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 0 })
    expect(socialEnergyOn([ci(DAY, 'afternoon', 1), ci('2026-09-17', 'morning', 5), ci(DAY, 'morning', 2)], DAY)).toBe(2)
    expect(socialEnergyOn([ci(DAY, 'afternoon', 1)], DAY)).toBeNull()
  })
})

describe('the steered draw', () => {
  const remote = stage3.filter((m) => ofSteer(m, 'remote')).map((m) => m.id)
  const inPerson = stage3.filter((m) => ofSteer(m, 'inPerson')).map((m) => m.id)

  it('holds both kinds at stage 3, the messages without a company field among the calls and messages', () => {
    expect(remote).toEqual(expect.arrayContaining(['message-a-friend', 'call-not-text', 'thank-you-note']))
    expect(inPerson.length).toBeGreaterThan(1)
    expect(remote.some((id) => inPerson.includes(id))).toBe(false)
  })

  it('draws among the calls and messages on a low morning, each chance kept, the setting a call or a message', () => {
    for (const draw of [0.05, 0.5, 0.95]) {
      const pick = steeredPick(social, stage3, 'remote', [], DAY, draw, 3, false)
      expect(pick).toMatchObject({ rule: 'draw', steer: 'remote', setting: 'remote' })
      expect([...(pick?.candidates ?? [])].sort()).toEqual([...remote].sort())
      expect(Object.values(pick?.propensities ?? {}).reduce((s, p) => s + p, 0)).toBeCloseTo(1)
    }
  })

  it('draws among the reps in person on a high morning, never in a call', () => {
    for (const draw of [0.05, 0.5, 0.95]) {
      const pick = steeredPick(social, stage3, 'inPerson', [], DAY, draw, 3, false)
      expect(pick).toMatchObject({ rule: 'draw', steer: 'inPerson' })
      expect([...(pick?.candidates ?? [])].sort()).toEqual([...inPerson].sort())
      expect(['remote', 'solo']).not.toContain(pick?.setting)
    }
  })

  it('leaves the draw as it was with no steer, and where nothing of its kind fits', () => {
    expect(steeredPick(social, stage3, null, [], DAY, 0.5, 3, false)).toEqual(pickRep(social, stage3, [], DAY, 0.5, 3, false))
    const stage1 = pathReps('social', 1)
    // Stage 1 holds no call or message, and every one of its reps is in person already: neither steer changes it.
    expect(steeredPick(social, stage1, 'remote', [], DAY, 0.5, 1, false)).toEqual(pickRep(social, stage1, [], DAY, 0.5, 1, false))
    expect(steeredPick(social, stage1, 'inPerson', [], DAY, 0.5, 1, false)).toEqual(pickRep(social, stage1, [], DAY, 0.5, 1, false))
  })

  it('lets the path’s own rules stand: the smaller version after two No answers, and the one rep that fits', () => {
    const refused = [no(stage3[0].id, 1), no(stage3[1].id, 2)]
    const smaller = steeredPick(social, stage3, 'remote', refused, DAY, 0.5, 3, false)
    expect(smaller).toEqual(pickRep(social, stage3, refused, DAY, 0.5, 3, false))
    expect(smaller?.rule).toBe('smaller')
    expect(smaller?.steer).toBeUndefined()
    const only = steeredPick(social, [stage3[0]], 'remote', [], DAY, 0.5, 3, false)
    expect(only?.rule).toBe('only')
    expect(only?.steer).toBeUndefined()
  })

  it('says the steer in Why this rep, among the reps it kept', () => {
    const pick = steeredPick(social, stage3, 'remote', [], DAY, 0.5, 3, false)
    expect(pick && whyThisRep(pick)).toBe(`Social energy read low this morning, so today’s rep came from the calls and messages that fit. Drawn at random among those ${remote.length}, each with the same chance, kept with the step.`)
  })
})

describe('a rep with more than one kind of setting', () => {
  const partner = paths.find((p) => p.id === 'partner') as Path
  const done = (moveId: string, setting: SettingKind, k: number): PathEntry => ({ offerId: k, moveId, day: `2026-09-1${k}`, at: '', setting, chosenBy: 'app', rule: 'draw', outcome: 'done', stage: 1, block: 'evening', chances: null })

  it('is done as a call or a message toward one, when it reaches someone remotely', () => {
    const stage1 = pathReps('partner', 1)
    const intro = stage1.find((m) => m.id === 'ask-for-an-introduction')
    expect(intro && [intro.with, intro.settings]).toEqual(['remote', ['remote', 'oneToOne']])
    // The probe that could have said yes: with a call used lately, one to one is the kind of setting it would take.
    const lately = [done('ask-for-an-introduction', 'remote', 1)]
    expect(intro && settingFor(intro, partner, lately, DAY)).toBe('oneToOne')
    expect(steeredPick(partner, stage1, 'remote', lately, DAY, 0.5, 1, false)).toMatchObject({ moveId: 'ask-for-an-introduction', setting: 'remote', steer: 'remote' })
  })

  it('stays in person toward in person, and a rep that needs someone there is never offered as a call', () => {
    const stage4 = pathReps('partner', 4)
    const kept = stage4.filter((m) => ofSteer(m, 'inPerson'))
    expect(kept.length).toBeGreaterThan(1)
    expect(kept.length).toBeLessThan(stage4.length)
    expect(stage4.filter((m) => m.with === 'adult' && (m.settings ?? []).includes('remote')).every((m) => !ofSteer(m, 'remote'))).toBe(true)
    for (const draw of [0.05, 0.35, 0.65, 0.95]) {
      const pick = steeredPick(partner, stage4, 'inPerson', [], DAY, draw, 4, false)
      expect(pick?.steer).toBe('inPerson')
      expect(kept.map((m) => m.id)).toContain(pick?.moveId)
      expect(['remote', 'solo']).not.toContain(pick?.setting)
    }
  })

  it('says a steered pick that was the one of its kind', () => {
    const pick = steeredPick(partner, pathReps('partner', 1), 'remote', [], DAY, 0.5, 1, false)
    expect(pick && whyThisRep(pick)).toBe('Social energy read low this morning, so today’s rep came from the calls and messages that fit. The one of them that fits now.')
  })
})

describe('the steer kept with the step', () => {
  it('is written on the offer when the rep is started, and absent when nothing steered', async () => {
    await db.delete()
    await db.open()
    const aim: Aim = { id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-09-01T08:00:00.000Z', archivedAt: null }
    const steered = steeredPick(social, stage3, 'remote', [], DAY, 0.5, 3, false)
    const plain = pickRep(social, stage3, [], DAY, 0.5, 3, false)
    if (!steered || !plain) throw new Error('no pick')
    const a = await resumePath(aim, steered, 3, new Date(2026, 8, 18, 19, 0))
    const b = await resumePath(aim, plain, 3, new Date(2026, 8, 19, 19, 0))
    expect((await db.offers.get(a.id as number))?.steer).toBe('remote')
    expect((await db.offers.get(b.id as number))).not.toHaveProperty('steer')
  })
})

describe('the steer on the People row', () => {
  const aim: Aim = { id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-09-01T08:00:00.000Z', archivedAt: null }
  const view = (socialEnergy: number | null) => pathToday({ aim, offers: [], outcomes: [], ctx: null, day: DAY, block: 'evening', socialEnergy })

  it('never touches the stage', () => {
    expect(view(1).state).toEqual(view(null).state)
    expect(view(5).state).toEqual(view(null).state)
  })

  it('reads this morning’s Social energy into the day’s draw', () => {
    // The Partner path's first stage holds one rep that reaches someone remotely: a low morning draws it.
    const partnerAim: Aim = { ...aim, path: 'partner' }
    const today = (socialEnergy: number | null) => pathToday({ aim: partnerAim, offers: [], outcomes: [], ctx: null, day: DAY, block: 'evening', socialEnergy })
    expect(today(1).pick).toMatchObject({ moveId: 'ask-for-an-introduction', setting: 'remote', steer: 'remote' })
    expect(today(null).pick?.steer).toBeUndefined()
    expect(today(null).pick?.candidates.length).toBeGreaterThan(1)
  })
})

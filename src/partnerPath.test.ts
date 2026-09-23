import 'fake-indexeddb/auto'
import { liveQuery } from 'dexie'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeAims, planAim } from './aimFlow'
import { addDays } from './blocks'
import { chooseAndLog, coachFor, factSheet, offTheRow, todaysLine } from './brainFlow'
import { validateOutput } from './brainShared'
import { moveById, paths, type Path, type PathId } from './catalogue'
import { SYNCED_STORES } from './cloudOutbox'
import { copy } from './copy'
import { db, ensureDayContext, getSettings, setDayContext, type Aim, type CheckIn, type Offer, type Outcome, type PathMark } from './db'
import { buildExport, partnerOwn, type AimsData, type RecordsData } from './export'
import type { FactSheet } from './factTypes'
import { actOpensAt, addMilestone, addPathAim, checkPromptShown, checkShowsHelp, recordBeforeDeciding, reflectionPromptShown, declareDate, declareStage, deleteMark, monthlyChecks, pathMarks, reflections, resumePath, saveMonthlyCheck, saveReflection, setPathPick } from './pathFlow'
import { countsByRep, declaredStage, HARD_POSITION, lightOnlyDay, partnerOnly, pathEntries, pathKey, pathToday, peopleRow, whyThisRep, type PathTodayInput } from './pathStage'
import { DEFAULT_SETTINGS } from './settings'
import { rankLines } from './situations'

// The Partner path wired (Part 27): separate in Aims, one row on Now. The slot rule gives a
// Partner-only rep at most two days in seven, a rep both paths hold counts once for each, your pick
// through Change is the row's; a declaration moves the stage and is undone by deleting it; a date
// rep fits only on a declared date day; the online channel only while on and under its bound; a
// hard day brings light reps alone. The sheet carries the path only as the date-day fact, the
// phone's own engine writes no line about it, the validator refuses outcome words on a path's
// line, and its record is stored, synced and exported only when ticked.

const DAY = '2026-09-23'
const MORNING = new Date(2026, 8, 23, 9, 0)
const office = { atOffice: true, churchDay: false, pickupTime: null }
const partnerPath = paths.find((p) => p.id === 'partner') as Path

const socialAim: Aim = { id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-09-01T00:00:00.000Z', archivedAt: null }
const partnerAim: Aim = { id: 2, kind: 'path', path: 'partner', stepMoveId: null, createdAt: '2026-09-01T00:00:00.000Z', archivedAt: null }

let seq = 100
function stepOffer(moveId: string, day: string, on: PathId[], extra: Partial<Offer> = {}): Offer {
  seq++
  return { id: seq, kind: 'step', day, block: 'morning', at: `${day}T15:00:00.000Z`, situationKey: pathKey(on.includes('social') ? 'social' : 'partner'), target: 'mood', stance: '', band: '', reading: 0, moveId, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, chosenBy: 'app', paths: on, setting: 'recurring', rule: 'only', stage: 1, ...extra }
}
function mark(kind: PathMark['kind'], day: string, extra: Partial<PathMark> = {}): PathMark {
  seq++
  return { id: seq, path: 'partner', kind, day, at: `${day}T15:00:00.000Z`, ...extra }
}
function view(aim: Aim, offers: Offer[] = [], extra: Partial<PathTodayInput> = {}) {
  return pathToday({ aim, offers, outcomes: [], ctx: office, day: DAY, block: 'morning', ...extra })
}
/** Two days of the last seven on which a Partner-only rep was offered. */
const twoDays = () => [stepOffer('re-engage-someone', addDays(DAY, -2), ['partner']), stepOffer('ask-for-an-introduction', addDays(DAY, -4), ['partner'])]

describe('one People row between two paths', () => {
  it('gives the row to a Partner-only rep while fewer than two of the last seven days had one, then to Social', () => {
    const row = peopleRow(view(socialAim), view(partnerAim), DAY, 0.5)
    expect(row?.view.path.id).toBe('partner')
    expect(partnerOnly(row?.pick?.moveId ?? '')).toBe(true)
    expect(row?.paths).toEqual(['partner'])
    // Why this rep says the slot rule in the same line.
    expect(whyThisRep(row!.pick!)).toMatch(/^A turn for the reps only the Partner path holds, which take the People row on at most two days in seven. /)
    const two = twoDays()
    expect(peopleRow(view(socialAim, two), view(partnerAim, two), DAY, 0.5)?.view.path.id).toBe('social')
    // The bound counts days: two reps on one day are one day of the two.
    const oneDay = [stepOffer('re-engage-someone', addDays(DAY, -2), ['partner']), stepOffer('ask-for-an-introduction', addDays(DAY, -2), ['partner'])]
    expect(peopleRow(view(socialAim, oneDay), view(partnerAim, oneDay), DAY, 0.5)?.view.path.id).toBe('partner')
    // A week ago and before is outside the seven days.
    const old = [stepOffer('re-engage-someone', addDays(DAY, -7), ['partner']), stepOffer('ask-for-an-introduction', addDays(DAY, -9), ['partner'])]
    expect(peopleRow(view(socialAim, old), view(partnerAim, old), DAY, 0.5)?.view.path.id).toBe('partner')
  })

  it('labels a rep both paths hold as counting for both, and its one step counts once for each', () => {
    const social = view({ ...socialAim, pick: { day: DAY, moveId: 'greet-by-name', at: `${DAY}T14:00:00.000Z` } })
    const row = peopleRow(social, view(partnerAim), DAY, 0.5)
    expect(row?.pick?.moveId).toBe('greet-by-name')
    expect(row?.paths).toEqual(['social', 'partner'])
    const step = stepOffer('greet-by-name', DAY, ['social', 'partner'])
    const done: Outcome = { offerId: step.id as number, moveId: 'greet-by-name', day: DAY, block: 'morning', at: `${DAY}T16:00:00.000Z`, outcome: 'done', why: null, passiveOutcome: null }
    for (const p of ['social', 'partner'] as const) expect(countsByRep(pathEntries(p, [step], [done])).find((c) => c.moveId === 'greet-by-name'), p).toMatchObject({ done: 1 })
  })

  it('gives the row to your pick through Change, the later of two, whatever the bound', () => {
    const early = view({ ...socialAim, pick: { day: DAY, moveId: 'attention-outward', at: `${DAY}T14:00:00.000Z` } })
    const partner = view({ ...partnerAim, pick: { day: DAY, moveId: 're-engage-someone', at: `${DAY}T15:00:00.000Z` } }, twoDays())
    expect(peopleRow(early, partner, DAY, 0.5)).toMatchObject({ view: { path: { id: 'partner' } }, pick: { moveId: 're-engage-someone', rule: 'you' } })
    const late = view({ ...socialAim, pick: { day: DAY, moveId: 'attention-outward', at: `${DAY}T16:00:00.000Z` } })
    expect(peopleRow(late, partner, DAY, 0.5)?.pick?.moveId).toBe('attention-outward')
  })

  it('offers the reps it shares with Social when the Partner path is alone and past its bound, and nothing with no path on', () => {
    const row = peopleRow(null, view(partnerAim, twoDays()), DAY, 0.5)
    expect(row?.view.path.id).toBe('partner')
    expect(row?.pick).not.toBeNull()
    expect(partnerOnly(row?.pick?.moveId ?? 're-engage-someone')).toBe(false)
    expect(whyThisRep(row!.pick!)).toContain('have had their two days this week')
    // Social's own pick carries no turn.
    expect(whyThisRep(peopleRow(view(socialAim, twoDays()), view(partnerAim, twoDays()), DAY, 0.5)!.pick!)).not.toContain('Partner')
    expect(peopleRow(null, null, DAY, 0.5)).toBeNull()
  })
})

describe('what fits on the Partner path', () => {
  it('moves the stage by your word, and back when the declaration is deleted (Rule 13)', () => {
    const marks = [mark('stage', '2026-09-20', { stage: 5 })]
    expect(view(partnerAim, [], { marks }).state).toMatchObject({ stage: 5, reached: [{ stage: 5, day: '2026-09-20', by: 'declared' }] })
    expect(view(partnerAim, [], { marks: [] }).state.stage).toBe(1)
    // A date declared today, for any of the next days, moves the path to Dating today.
    expect(declaredStage(partnerPath, [mark('date', addDays(DAY, 4), { at: `${DAY}T12:00:00.000Z` })], DAY)?.stage).toBe(4)
    // A declaration dated after today counts for nothing yet.
    expect(declaredStage(partnerPath, [mark('stage', DAY, { stage: 6, at: '2026-09-25T12:00:00.000Z' })], DAY)).toBeNull()
  })

  it('offers a rep about your conduct on a date on a declared date day, and on no other; the rest of Dating fits any day', () => {
    const DATE_REPS = ['date-ask-and-listen', 'date-attention', 'date-end-clearly', 'date-share-something-real']
    const ANY_DAY = ['reappraise-a-conflict', 'talk-ordinary-week', 'talk-working-toward', 'talk-your-people', 'thank-them-specifically']
    const dated = [mark('date', addDays(DAY, -3))]
    const off = view(partnerAim, [], { marks: dated, ctx: null, block: 'evening' })
    expect(off.state.stage).toBe(4)
    expect(off.dateDay).toBe(false)
    expect(off.elig.stageReps.map((m) => m.id)).toContain('date-attention')
    expect(off.elig.eligible.map((m) => m.id).sort()).toEqual(ANY_DAY)
    const on = view(partnerAim, [], { marks: [...dated, mark('date', DAY)], ctx: null, block: 'evening' })
    expect(on.dateDay).toBe(true)
    expect(on.elig.eligible.map((m) => m.id).sort()).toEqual([...DATE_REPS, ...ANY_DAY].sort())
  })

  it('keeps the weightier talks out of the app’s picks until the lighter ones are done, while Change lists them all', () => {
    const dated = [mark('date', addDays(DAY, -3))]
    const LIGHTER = ['talk-ordinary-week', 'talk-working-toward', 'talk-your-people']
    const WEIGHTIER = ['talk-children-family', 'talk-faith', 'talk-work-money-home']
    const fresh = view(partnerAim, [], { marks: dated })
    for (const id of WEIGHTIER) {
      expect(fresh.elig.stageReps.map((m) => m.id), id).toContain(id)
      expect(fresh.elig.eligible.map((m) => m.id), id).not.toContain(id)
    }
    // Two of three lighter talks done, one partly: the weightier ones join; with one missing, they wait.
    const talked = (ids: string[], outcome: Outcome['outcome'] = 'done') => {
      const offers = ids.map((id, k) => stepOffer(id, addDays(DAY, -10 + k), ['partner'], { stage: 4 }))
      const outcomes: Outcome[] = offers.map((o) => ({ offerId: o.id as number, moveId: o.moveId, day: o.day, block: 'morning', at: `${o.day}T16:00:00.000Z`, outcome, why: null, passiveOutcome: null }))
      return { offers, outcomes }
    }
    const two = talked(LIGHTER.slice(0, 2))
    const waiting = pathToday({ aim: partnerAim, offers: two.offers, outcomes: two.outcomes, ctx: office, day: DAY, block: 'morning', marks: dated })
    expect(waiting.elig.eligible.some((m) => WEIGHTIER.includes(m.id))).toBe(false)
    const all = talked(LIGHTER)
    const partly = talked([LIGHTER[2]], 'partly')
    const open = pathToday({ aim: partnerAim, offers: [...two.offers, ...partly.offers], outcomes: [...two.outcomes, ...partly.outcomes], ctx: office, day: DAY, block: 'morning', marks: dated })
    expect(open.elig.eligible.map((m) => m.id)).toEqual(expect.arrayContaining(WEIGHTIER))
    expect(pathToday({ aim: partnerAim, offers: all.offers, outcomes: all.outcomes, ctx: office, day: DAY, block: 'morning', marks: dated }).elig.eligible.map((m) => m.id)).toEqual(expect.arrayContaining(WEIGHTIER))
    // Your pick through Change reaches a weightier talk at once.
    const picked = view({ ...partnerAim, pick: { day: DAY, moveId: 'talk-children-family', at: `${DAY}T10:00:00.000Z` } }, [], { marks: dated })
    expect(picked.pick).toMatchObject({ moveId: 'talk-children-family', rule: 'you' })
  })

  it('hides a faith talk everywhere while the faith family is hidden, your own pick included (Rule 10)', () => {
    const dated = [mark('date', addDays(DAY, -3))]
    const shown = view(partnerAim, [], { marks: dated })
    expect(shown.elig.stageReps.map((m) => m.id)).toContain('talk-faith')
    const hidden = view(partnerAim, [], { marks: dated, faithHidden: true })
    expect(hidden.elig.stageReps.map((m) => m.id)).not.toContain('talk-faith')
    expect(hidden.faithHidden).toBe(true)
    const deciding = [mark('stage', '2026-09-20', { stage: 5 })]
    expect(view(partnerAim, [], { marks: deciding }).elig.stageReps.map((m) => m.id)).toContain('plan-faith-at-home')
    expect(view(partnerAim, [], { marks: deciding, faithHidden: true }).elig.stageReps.map((m) => m.id)).not.toContain('plan-faith-at-home')
    const pickedFaith = { ...partnerAim, pick: { day: DAY, moveId: 'talk-faith', at: `${DAY}T10:00:00.000Z` } }
    expect(view(pickedFaith, [], { marks: dated }).pick?.moveId).toBe('talk-faith')
    expect(view(pickedFaith, [], { marks: dated, faithHidden: true }).pick?.moveId).not.toBe('talk-faith')
  })

  it('offers thanks and reappraisal from Dating through Keeping, and planning talks at Deciding', () => {
    for (const stage of [4, 5, 6, 7]) {
      const at = view(partnerAim, [], { marks: [mark('stage', '2026-09-20', { stage })], ctx: null, block: 'evening' })
      expect(at.elig.stageReps.map((m) => m.id), String(stage)).toEqual(expect.arrayContaining(['thank-them-specifically', 'reappraise-a-conflict']))
    }
    const deciding = view(partnerAim, [], { marks: [mark('stage', '2026-09-20', { stage: 5 })], ctx: null, block: 'evening' })
    expect(deciding.elig.eligible.map((m) => m.id)).toEqual(expect.arrayContaining(['plan-money-together', 'plan-a-week-together', 'plan-parenting-roles']))
  })

  it('does not place the reps you do with a partner by who else is around', () => {
    const building = view(partnerAim, [], { marks: [mark('stage', '2026-09-20', { stage: 6 })], ctx: null, block: 'evening' })
    expect(building.state.stage).toBe(6)
    expect(building.elig.eligible.map((m) => m.id).sort()).toEqual(['reappraise-a-conflict', 'respond-to-good-news', 'something-new-together', 'thank-them-specifically'])
    expect(building.elig.nobodyAround).toBe(false)
  })

  it('offers the online channel’s reps only while it is on, and no more than two in seven days', () => {
    expect(view(partnerAim).elig.stageReps.some((m) => m.channel === 'online')).toBe(false)
    const on = view(partnerAim, [], { online: true })
    expect(on.elig.eligible.map((m) => m.id)).toEqual(expect.arrayContaining(['online-honest-profile', 'online-timeboxed-browse']))
    const two = [stepOffer('online-timeboxed-browse', addDays(DAY, -2), ['partner']), stepOffer('online-honest-profile', addDays(DAY, -3), ['partner'])]
    const bounded = view(partnerAim, two, { online: true })
    expect(bounded.elig.stageReps.some((m) => m.channel === 'online')).toBe(true)
    expect(bounded.elig.eligible.some((m) => m.channel === 'online')).toBe(false)
  })

  it('offers light reps alone on a day the record reads high stress or overwhelm, on the Partner path only', () => {
    const hard = view(partnerAim, [], { lightOnly: true })
    expect(hard.elig.eligible.length).toBeGreaterThan(0)
    for (const m of hard.elig.eligible) expect(m.effort, m.id).toBe('low')
    expect(view(partnerAim).elig.eligible.some((m) => m.effort !== 'low')).toBe(true)
    expect(view(socialAim, [], { lightOnly: true }).elig.eligible.map((m) => m.id)).toEqual(view(socialAim).elig.eligible.map((m) => m.id))
    const ci = (block: CheckIn['block'], answers: CheckIn['answers'], day = DAY) => ({ day, block, answers })
    expect(lightOnlyDay([ci('morning', { stress: HARD_POSITION })], DAY)).toBe(true)
    expect(lightOnlyDay([ci('morning', { stress: 3 })], DAY)).toBe(false)
    expect(lightOnlyDay([ci('morning', { stress: 5 }), ci('afternoon', { stress: 2 })], DAY)).toBe(false)
    expect(lightOnlyDay([ci('morning', { stress: 2, overwhelm: 4 })], DAY)).toBe(true)
    expect(lightOnlyDay([ci('morning', { stress: 5 }, '2026-09-22')], DAY)).toBe(false)
  })
})

describe('the Partner path on the phone', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('keeps every declaration dated, one date a day, and undoes one by deleting it; an engagement needs nothing first', async () => {
    await declareStage('partner', 5, MORNING)
    await declareDate('partner', DAY, MORNING)
    await declareDate('partner', DAY, MORNING)
    await addMilestone('partner', copy.partnerNotes.steps.engagement, MORNING)
    await addMilestone('partner', '   ', MORNING)
    const marks = await pathMarks('partner')
    expect(marks.map((m) => [m.kind, m.day, m.stage ?? null, m.note ?? null])).toEqual([
      ['stage', DAY, 5, null],
      ['date', DAY, null, null],
      ['milestone', DAY, null, 'We got engaged'],
    ])
    // Nothing gated the engagement: no reflection, no check and no course exists.
    expect(await db.reflections.count()).toBe(0)
    expect(await db.monthlyChecks.count()).toBe(0)
    await deleteMark(marks[0].id as number)
    expect((await pathMarks('partner')).map((m) => m.kind)).toEqual(['date', 'milestone'])
  })

  it('keeps notes whole: each values part and each step’s note rewritten in place, a reflection new each time, an empty note removed', async () => {
    await saveReflection('partner', 'values', 'Kindness first', { part: 'nonNegotiables' }, MORNING)
    await saveReflection('partner', 'values', 'Kindness and honesty', { part: 'nonNegotiables' }, MORNING)
    await saveReflection('partner', 'values', 'Someone who laughs easily', { part: 'preferences' }, MORNING)
    await saveReflection('partner', 'values', 'Patient, and on time', { part: 'partnerIWantToBe' }, MORNING)
    await saveReflection('partner', 'decide', 'Why now', { step: 'exclusive' }, MORNING)
    await saveReflection('partner', 'decide', 'Not yet', { step: 'movingIn' }, MORNING)
    await saveReflection('partner', 'decide', 'Not until it is steady', { step: 'child' }, MORNING)
    await saveReflection('partner', 'reflection', 'A good walk', {}, MORNING)
    await saveReflection('partner', 'reflection', 'A good walk', {}, MORNING)
    const all = await reflections('partner')
    expect(all.filter((r) => r.kind === 'values').map((r) => [r.part, r.text])).toEqual([
      ['nonNegotiables', 'Kindness and honesty'],
      ['preferences', 'Someone who laughs easily'],
      ['partnerIWantToBe', 'Patient, and on time'],
    ])
    expect(all.filter((r) => r.kind === 'decide').map((r) => [r.step, r.text])).toEqual([['exclusive', 'Why now'], ['movingIn', 'Not yet'], ['child', 'Not until it is steady']])
    expect(all.filter((r) => r.kind === 'reflection')).toHaveLength(2)
    await saveReflection('partner', 'values', '  ', { part: 'preferences' }, MORNING)
    expect((await reflections('partner')).filter((r) => r.kind === 'values').map((r) => r.part)).toEqual(['nonNegotiables', 'partnerIWantToBe'])
  })

  it('keeps the monthly reflection a note a month for each part, rewritten in place within the month', async () => {
    await saveReflection('partner', 'monthly', 'They asked about my week and listened', { part: 'understood' }, new Date(2026, 7, 20))
    await saveReflection('partner', 'monthly', 'We talked it through the next morning', { part: 'disagreement' }, MORNING)
    await saveReflection('partner', 'monthly', 'We talked it through that evening', { part: 'disagreement' }, MORNING)
    await saveReflection('partner', 'monthly', 'I listened more', { part: 'ownPart' }, MORNING)
    const monthly = (await reflections('partner')).filter((r) => r.kind === 'monthly')
    expect(monthly.map((r) => [r.day.slice(0, 7), r.part, r.text])).toEqual([
      ['2026-08', 'understood', 'They asked about my week and listened'],
      ['2026-09', 'disagreement', 'We talked it through that evening'],
      ['2026-09', 'ownPart', 'I listened more'],
    ])
    // The card's line: open until something is written this month, and never on a hard day.
    expect(reflectionPromptShown(4, false, monthly, DAY)).toBe(false)
    expect(reflectionPromptShown(4, false, monthly, '2026-10-02')).toBe(true)
    expect(reflectionPromptShown(4, true, monthly, '2026-10-02')).toBe(false)
    expect(reflectionPromptShown(3, false, monthly, '2026-10-02')).toBe(false)
  })

  it('puts your own record in front of a decision: values, three months of reflections, and the notes before other steps, chosen by date alone', async () => {
    await saveReflection('partner', 'values', 'Honesty', { part: 'nonNegotiables' }, new Date(2026, 5, 1))
    await saveReflection('partner', 'monthly', 'Old month', { part: 'understood' }, new Date(2026, 4, 1))
    await saveReflection('partner', 'monthly', 'This month', { part: 'understood' }, MORNING)
    await saveReflection('partner', 'reflection', 'A walk last week', {}, new Date(2026, 8, 16))
    await saveReflection('partner', 'decide', 'Exclusive, chosen', { step: 'exclusive' }, new Date(2026, 8, 1))
    await saveReflection('partner', 'decide', 'Moving in, draft', { step: 'movingIn' }, MORNING)
    const record = recordBeforeDeciding(await reflections('partner'), 'movingIn', DAY)
    expect(record.values.map((r) => r.text)).toEqual(['Honesty'])
    expect(record.monthly.map((r) => r.text)).toEqual(['This month'])
    expect(record.notes.map((r) => r.text)).toEqual(['A walk last week'])
    expect(record.decided.map((r) => r.text)).toEqual(['Exclusive, chosen'])
  })

  it('answers the monthly check once a month, again in place, and shows its help only on a yes to safety or conduct', async () => {
    await saveMonthlyCheck({ safety: false, conduct: false, doubt: true }, new Date(2026, 8, 3))
    await saveMonthlyCheck({ safety: false, conduct: true, doubt: true }, MORNING)
    await saveMonthlyCheck({ safety: null, conduct: null, doubt: null }, new Date(2026, 9, 2))
    expect((await monthlyChecks()).map((c) => [c.month, c.day, c.answers.conduct])).toEqual([
      ['2026-09', DAY, true],
      ['2026-10', '2026-10-02', null],
    ])
    expect(checkShowsHelp({ safety: true, conduct: null, doubt: null })).toBe(true)
    expect(checkShowsHelp({ safety: null, conduct: true, doubt: false })).toBe(true)
    expect(checkShowsHelp({ safety: false, conduct: false, doubt: true })).toBe(false)
    expect(checkShowsHelp({ safety: null, conduct: null, doubt: null })).toBe(false)
    // The card's prompt: from Dating on and through every later stage (owner, 2026-09-23), once a month, never on a hard day.
    const checks = await monthlyChecks()
    expect(checkPromptShown(5, false, checks, DAY)).toBe(false)
    for (const stage of [4, 5, 6, 7]) expect(checkPromptShown(stage, false, checks, '2026-11-02'), String(stage)).toBe(true)
    for (const stage of [1, 2, 3]) expect(checkPromptShown(stage, false, checks, '2026-11-02'), String(stage)).toBe(false)
    expect(checkPromptShown(4, true, checks, '2026-11-02')).toBe(false)
    expect(actOpensAt('monthly-check')).toBe(4)
    expect(actOpensAt('values-note')).toBe(1)
    expect(actOpensAt('decide-dont-slide')).toBe(4)
    expect(actOpensAt('monthly-reflection')).toBe(4)
  })

  it('stores its records in the synced set, each write queued for your own database', async () => {
    expect(SYNCED_STORES).toEqual(expect.arrayContaining(['pathMarks', 'reflections', 'monthlyChecks']))
    await declareDate('partner', DAY, MORNING)
    await saveReflection('partner', 'reflection', 'A good walk', undefined, MORNING)
    await saveMonthlyCheck({ safety: false, conduct: false, doubt: false }, MORNING)
    const queued = new Set((await db.outbox.toArray()).map((r) => r.store))
    for (const s of ['pathMarks', 'reflections', 'monthlyChecks']) expect(queued.has(s), s).toBe(true)
  })

  it('resumes a shared rep for both paths, and keeps the People row’s one plan whichever path holds it', async () => {
    await addPathAim('social')
    await addPathAim('partner')
    const aims = await activeAims()
    const social = aims.find((a) => a.path === 'social') as Aim
    const partner = aims.find((a) => a.path === 'partner') as Aim
    await planAim(social, 'nextCheckIn', '13:00', MORNING, 'Greet someone by name')
    await setPathPick(partner.id as number, 'greet-by-name', DAY, MORNING)
    const pt = view((await db.aims.get(partner.id as number)) as Aim)
    const offer = await resumePath(partner, pt.pick!, pt.elig.stage, MORNING, ['social', 'partner'])
    expect(offer.paths).toEqual(['social', 'partner'])
    expect((await db.intentions.toArray()).map((i) => i.offerId)).toEqual([offer.id])
  })

  it('puts the path on the sheet only as the date-day fact, and the phone’s own engine writes no line about it', async () => {
    await addPathAim('social')
    await addPathAim('partner')
    const partner = (await activeAims()).find((a) => a.path === 'partner') as Aim
    const before = await factSheet(DAY, MORNING)
    // A Partner-only step, done in person; a plan, a milestone and a reflection.
    const offerId = await db.offers.add({ ...stepOffer('re-engage-someone', DAY, ['partner']), id: undefined })
    await db.outcomes.add({ offerId, moveId: 're-engage-someone', day: DAY, block: 'morning', at: `${DAY}T16:00:00.000Z`, outcome: 'done', why: null, passiveOutcome: null })
    await planAim(partner, 'nextCheckIn', '13:00', MORNING, copy.path.planLabel)
    await addMilestone('partner', 'We got engaged', MORNING)
    await saveReflection('partner', 'reflection', 'A good walk', undefined, MORNING)
    const plain = await factSheet(DAY, MORNING)
    // Nothing on the sheet moves: no count of steps, follow-through, becoming or people seen takes it in.
    expect(plain.facts).toEqual(before.facts)
    expect(plain.facts.filter((f) => f.id.startsWith('partner.'))).toEqual([])
    expect(plain.facts.some((f) => f.id === `aim.${partner.id}` || f.id === `path.${partner.id}` || f.id === `trajectory.${partner.id}`)).toBe(false)
    const text = JSON.stringify(plain)
    for (const w of ['re-engage-someone', moveById('re-engage-someone').name, 'The Partner path', 'We got engaged', 'A good walk', copy.path.planLabel]) expect(text, w).not.toContain(w)

    await declareDate('partner', DAY, MORNING)
    const dated = await factSheet(DAY, MORNING)
    expect(dated.facts.filter((f) => f.id.startsWith('partner.')).map((f) => ({ id: f.id, tags: f.tags, values: f.values }))).toEqual([{ id: 'partner.dateDay', tags: ['dating'], values: { dateDay: 1 } }])
    expect(rankLines(dated, [], []).filter((c) => c.factIds.some((f) => f.startsWith('partner.')))).toEqual([])
    expect((await coachFor(DAY, MORNING))?.dateDay).toBe(true)
  })
})

describe('a line never competes with the People row', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    await setDayContext(DAY, { atOffice: true })
  })

  it('says nothing about the Social path’s step on a day the Partner path holds the row, and the sheet stays the same', async () => {
    await addPathAim('social')
    const social = (await activeAims()).find((a) => a.path === 'social') as Aim
    const about = (ids: readonly string[]) => ids.some((f) => f === `aim.${social.id}` || f === `path.${social.id}`)
    // The Social path alone holds the row: a line about its step is said, and the Worker's is shown.
    await chooseAndLog(DAY, MORNING)
    const said = (await db.briefLog.toArray()).find((l) => l.situationId !== null && !l.withdrawnAt)
    expect(about(said?.factIds ?? [])).toBe(true)
    await db.brainBriefs.add({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'The Social path: say when, one tap.', mode: 'strategy', factIds: [`aim.${social.id}`], cardIds: [], model: 'm', at: `${DAY}T14:00:00.000Z` })
    expect((await todaysLine(DAY, MORNING))?.source).toBe('worker')
    const sheetBefore = await factSheet(DAY, MORNING)

    // The Partner path on, holding today's row with a rep of its own: neither line is shown, and the phone withdraws its own.
    await addPathAim('partner')
    expect([...(await offTheRow(DAY, MORNING))].sort()).toEqual([`aim.${social.id}`, `path.${social.id}`])
    const shown = await todaysLine(DAY, MORNING)
    expect(shown === null || !about(shown.factIds)).toBe(true)
    await chooseAndLog(DAY, MORNING)
    const now = (await db.briefLog.toArray()).filter((l) => l.situationId !== null && !l.withdrawnAt)
    for (const l of now) expect(about(l.factIds), l.text).toBe(false)
    expect((await db.briefLog.toArray()).some((l) => l.withdrawnAt && about(l.factIds))).toBe(true)
    expect((await factSheet(DAY, MORNING)).facts).toEqual(sheetBefore.facts)

    // Social holds the row again once you pick its rep through Change: the Worker's line is back.
    await setPathPick(social.id as number, 'attention-outward', DAY, MORNING)
    expect(await offTheRow(DAY, MORNING)).toEqual(new Set([`aim.${(await activeAims()).find((a) => a.path === 'partner')?.id}`, `path.${(await activeAims()).find((a) => a.path === 'partner')?.id}`]))
    expect((await todaysLine(DAY, MORNING))?.source).toBe('worker')
  })
})

describe('the line on screen, as a live query', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('shows a line the moment it is logged, with both paths on: every read is tracked', async () => {
    await addPathAim('social')
    await addPathAim('partner')
    const seen: (string | null)[] = []
    const sub = liveQuery(() => todaysLine(DAY, MORNING)).subscribe({ next: (v) => seen.push(v ? v.text : null) })
    await new Promise((r) => setTimeout(r, 200))
    await db.briefLog.add({ day: DAY, situationId: 'say-when', mode: 'recommendation', text: 'A line about the day.', factIds: ['week.today'], cardIds: [], at: `${DAY}T14:00:00.000Z` })
    await new Promise((r) => setTimeout(r, 300))
    await db.brainBriefs.add({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'The Worker line.', mode: 'observation', factIds: ['week.today'], cardIds: [], model: 'm', at: `${DAY}T15:00:00.000Z` })
    await new Promise((r) => setTimeout(r, 300))
    sub.unsubscribe()
    expect(seen[0]).toBeNull()
    expect(seen).toContain('A line about the day.')
    expect(seen[seen.length - 1]).toBe('The Worker line.')
  })
})

describe('the rules around the Partner path', () => {
  const sheet: FactSheet = {
    version: 1,
    day: DAY,
    builtAt: `${DAY}T14:00:00.000Z`,
    hour: 9,
    weeks: 3,
    days: 22,
    direction: '',
    said: [],
    facts: [
      { id: 'path.1', tags: ['social', 'people'], text: 'The Social path: Stage 1 of 6 · Presence.', values: { stage: 1 } },
      { id: 'partner.dateDay', tags: ['dating'], text: 'Today is a declared date day.', values: { dateDay: 1 } },
      { id: 'cadence', tags: ['monitoring'], text: 'Check-ins this week.', values: {} },
    ],
  }
  const line = (text: string, factIds: string[]) => validateOutput({ mode: 'encouragement', text, factIds, cardIds: [] }, sheet, [])

  it('refuses rating or outcome words in a line that cites a path fact, and leaves other lines alone', () => {
    expect(line('A date today: see if you can win them over.', ['partner.dateDay'])).toMatchObject({ ok: false, reason: expect.stringContaining('about a path') })
    expect(line('Rate how the conversation went tonight.', ['path.1'])).toMatchObject({ ok: false })
    expect(line('Keep the number of dates in mind.', ['partner.dateDay'])).toMatchObject({ ok: false })
    expect(line('A date today: your part is attention on them, the phone away.', ['partner.dateDay']).ok).toBe(true)
    expect(line('Your part is never rated, only done.', ['path.1']).ok).toBe(true)
    expect(line('A small win for your check-ins.', ['cadence']).ok).toBe(true)
  })

  it('has no field for rating, ranking or comparing anyone in any Partner store', () => {
    const src = readFileSync('src/db.ts', 'utf8')
    for (const name of ['PathMark', 'Reflection', 'MonthlyCheck']) {
      const body = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(src)?.[1] ?? ''
      expect(body.length, name).toBeGreaterThan(20)
      const fields = [...body.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1])
      expect(fields.length, name).toBeGreaterThan(2)
      for (const f of fields) expect(f, `${name}.${f}`).not.toMatch(/rat(e|ing)|rank|score|compar|match|repl(y|ies)|attract|grade|verdict|person|name|place|partnerId|who/i)
    }
    for (const store of ['pathMarks', 'reflections', 'monthlyChecks']) for (const ix of db.table(store).schema.indexes) expect(ix.name, store).not.toMatch(/rat|rank|score|compar|name|who/i)
  })

  it('never says a course is missing: the only word on screen about one says none is needed', () => {
    const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [])
    const about = strings(copy).filter((s) => /\bcourse\b/i.test(s))
    expect(about.length).toBeGreaterThan(0)
    for (const s of about) expect(s).toMatch(/\bno\b[^.]*\bcourse\b[^.]*\bneeded\b/i)
  })

  it('leaves the Partner path out of an export unless ticked, and puts all of it in when ticked', () => {
    const aims: AimsData = { aims: [socialAim, partnerAim], skills: [], marks: [], intentions: [{ id: 1, aimId: 2, day: DAY, cue: 'nextCheckIn', time: '13:00', setAt: `${DAY}T13:00:00.000Z`, offerId: null, step: copy.path.planLabel }] }
    const own = stepOffer('re-engage-someone', DAY, ['partner'])
    const shared = stepOffer('greet-by-name', DAY, ['social', 'partner'])
    const records: RecordsData = {
      offers: [own, shared],
      outcomes: [],
      cards: [],
      declarations: [],
      pathMarks: [mark('milestone', DAY, { note: 'We got engaged' })],
      reflections: [{ id: 1, path: 'partner', kind: 'reflection', day: DAY, text: 'A good walk', createdAt: `${DAY}T15:00:00.000Z`, updatedAt: `${DAY}T15:00:00.000Z` }],
      monthlyChecks: [{ id: 1, month: '2026-09', day: DAY, answers: { safety: false, conduct: false, doubt: true }, at: `${DAY}T15:00:00.000Z` }],
      brain: { log: [], feedback: [], briefs: [{ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'A date today: your part is attention.', mode: 'encouragement', factIds: ['partner.dateDay'], cardIds: [], model: 'm', at: `${DAY}T15:00:00.000Z` }] },
    }
    expect(partnerOwn(own)).toBe(true)
    expect(partnerOwn(shared)).toBe(false)
    const plain = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, aims, records)
    const out = JSON.parse(plain.json)
    expect(out.includesPartnerPath).toBe(false)
    expect(out.partnerPath).toBeUndefined()
    expect(out.offers.map((o: { move: string }) => o.move)).toEqual(['greet-by-name'])
    expect(out.offers[0].paths).toEqual(['social'])
    expect(out.aims.commitments.map((a: { path: string }) => a.path)).toEqual(['social'])
    expect(out.aims.plans).toEqual([])
    expect(out.brain.briefs).toEqual([])
    expect(out.settings.partnerOnline).toBeUndefined()
    for (const w of ['re-engage-someone', 'We got engaged', 'A good walk', 'partner']) expect(plain.json + plain.offersCsv, w).not.toContain(w)

    const ticked = JSON.parse(buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false, includePartner: true }, aims, records).json)
    expect(ticked.includesPartnerPath).toBe(true)
    expect(ticked.offers.map((o: { move: string }) => o.move)).toEqual(['re-engage-someone', 'greet-by-name'])
    expect(ticked.offers[1].paths).toEqual(['social', 'partner'])
    expect(ticked.aims.commitments.map((a: { path: string }) => a.path)).toEqual(['social', 'partner'])
    expect(ticked.aims.plans).toHaveLength(1)
    expect(ticked.brain.briefs).toHaveLength(1)
    expect(ticked.settings.partnerOnline).toBe(false)
    expect(ticked.partnerPath).toEqual({
      declarations: [{ kind: 'milestone', day: DAY, stage: null, note: 'We got engaged', at: `${DAY}T15:00:00.000Z` }],
      reflections: [{ kind: 'reflection', step: null, part: null, day: DAY, text: 'A good walk', createdAt: `${DAY}T15:00:00.000Z`, updatedAt: `${DAY}T15:00:00.000Z` }],
      monthlyChecks: [{ month: '2026-09', day: DAY, answers: { safety: false, conduct: false, doubt: true }, at: `${DAY}T15:00:00.000Z` }],
    })
  })
})

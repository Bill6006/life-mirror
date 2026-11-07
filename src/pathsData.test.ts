import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Paths as data (P1, 2026-11-06): a Path the catalogue adds runs with no code of its own. A third Path,
// made up for this test alone and two strands wide, is put into the catalogue: each strand moves by its
// own reps; the reps that fit come from every strand, drawn at even chances; it shares the one People
// row by its share of days; a rep it shares with Social counts for both; its record stays off the fact
// sheet, out of the coach's block and row; and your decisions on its versions decide where it is offered.

vi.mock('./catalogue.json', async (original) => {
  const data = ((await original()) as { default: { paths: Record<string, unknown>[]; moves: Record<string, unknown>[] } }).default
  const social = data.paths.find((p) => p.id === 'social') as Record<string, unknown>
  const base = data.moves.find((m) => m.id === 'one-sentence-past-hello') as Record<string, unknown>
  const stage = (n: number) => ({ n, name: `Stage ${n}`, what: 'What belongs here.', notProgress: 'Counting anyone else’s answer.' })
  const trial = {
    ...social, id: 'trial', name: 'Trial', what: 'A Path made for this test.', builtIn: undefined, version: '2',
    changes: [{ version: '1', day: '2026-11-01', reason: 'design', major: true, what: 'The first version.' }, { version: '2', day: '2026-11-06', reason: 'editorial', major: false, what: 'Clearer words.' }],
    traits: { sheet: false, coach: false, privacy: 'own', rowShare: 3, icon: 'practice' }, cards: [], excluded: [],
    names: { called: 'The Trial path', add: 'The Trial path', addNote: 'For the test.' },
    rule: { ...(social.rule as Record<string, unknown>), reps: 2, distinctReps: 2, settingKinds: 1 },
    strands: [{ id: 'talk', name: 'Talk', what: 'Talking.', stages: [stage(1), stage(2), stage(3)] }, { id: 'speak', name: 'Speak', what: 'Speaking.', stages: [stage(1), stage(2)] }],
  }
  const rep = (id: string, strand: string, n: number) => ({ ...base, id, name: `Rep ${id}`, status: 'path', guardrail: 'One try, then leave it.', settings: ['errand', 'recurring'], path: { trial: { strand, stage: n, advances: true } } })
  const shared = data.moves.map((m) => (m.id === 'one-sentence-past-hello' ? { ...m, path: { ...(m.path as Record<string, unknown>), trial: { strand: 'talk', stage: 1, advances: true } } } : m))
  return { default: { ...data, paths: [...data.paths, trial], moves: [...shared, rep('t-a1', 'talk', 1), rep('t-a2', 'talk', 1), rep('t-a3', 'talk', 2), rep('t-a4', 'talk', 2), rep('t-b1', 'speak', 1), rep('t-b2', 'speak', 1), rep('t-b3', 'speak', 2)] } }
})

const { addDays } = await import('./blocks')
const { paths, pathReps } = await import('./catalogue')
const { db } = await import('./db')
const { onTheSheet } = await import('./facts')
const { coachRow, peopleRowOf } = await import('./pathFlow')
const { coachBlock, pathKey, pathName, pathToday, peopleRowAll, stageForRep, whyThisRep } = await import('./pathStage')
const { changesSince, contentHash, decide, offeredNow, standing } = await import('./pathVersions')
const { factSheet } = await import('./brainFlow')
const { kindIcon } = await import('./aimCard')
const { weeklyFacts } = await import('./weeklyFacts')
type WeeklyAnalyses = import('./weeklyFacts').WeeklyAnalyses
type Aim = import('./db').Aim
type Offer = import('./db').Offer
type Outcome = import('./db').Outcome

const DAY = '2026-11-06'
const trial = paths.find((p) => p.id === 'trial')!
const trialAim: Aim = { id: 9, kind: 'path', path: 'trial', stepMoveId: null, createdAt: '2026-10-01T12:00:00.000Z', archivedAt: null }
const socialAim: Aim = { id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-10-01T12:00:00.000Z', archivedAt: null }
const ctx = { atOffice: true, churchDay: false, pickupTime: null, withHer: false }

let seq = 500
function step(moveId: string, day: string, on: string[], extra: Partial<Offer> = {}): Offer {
  seq++
  return { id: seq, kind: 'step', day, block: 'morning', at: `${day}T14:00:00.000Z`, situationKey: pathKey(on[0]), target: 'mood', stance: '', band: '', reading: 0, moveId, minutes: 2, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { [moveId]: 1 }, chosenBy: 'app', paths: on, setting: 'errand', rule: 'only', stage: 1, skippedAt: null, closedAt: null, ...extra }
}
const done = (o: Offer): Outcome => ({ id: (o.id as number) + 10000, offerId: o.id as number, moveId: o.moveId, day: o.day, block: o.block, at: `${o.day}T16:00:00.000Z`, outcome: 'done', why: null, passiveOutcome: null })
const view = (aim: Aim, offers: Offer[] = [], outcomes: Outcome[] = [], day = DAY) => pathToday({ aim, offers, outcomes, ctx, day, block: 'morning' })

describe('a Path with strands', () => {
  it('moves each strand by its own reps alone', () => {
    const fresh = view(trialAim)
    expect(fresh.strands.map((s) => [s.strand.id, s.state.stage])).toEqual([['talk', 1], ['speak', 1]])
    // Two different talk reps done: Talk reaches stage 2; Speak stands.
    const offers = [step('t-a1', addDays(DAY, -3), ['trial']), step('t-a2', addDays(DAY, -2), ['trial'])]
    const v = view(trialAim, offers, offers.map(done))
    expect(v.strands.map((s) => [s.strand.id, s.state.stage])).toEqual([['talk', 2], ['speak', 1]])
    // The same two reps done again move nothing more: Speak's stage is its own.
    expect(v.strands[1].state.reached).toEqual([])
  })

  it('offers the reps that fit from every strand, each strand at its own stage, drawn at even chances however many draws', () => {
    const offers = [step('t-a1', addDays(DAY, -3), ['trial']), step('t-a2', addDays(DAY, -2), ['trial'])]
    // Many draws at stage 2 do not make the chances lean: a Path with strands never leans.
    for (let k = 0; k < 14; k++) offers.push(step(k % 2 ? 't-a3' : 't-b1', addDays(DAY, -20 - k), ['trial'], { rule: 'draw', stage: 2, candidates: ['t-a3', 't-b1'], propensities: { 't-a3': 0.5, 't-b1': 0.5 } }))
    const v = view(trialAim, offers, offers.map(done))
    // Talk at stage 2 offers its stage-2 reps; Speak at stage 1 its stage-1 reps; nothing from Talk's stage 1 or Speak's stage 2.
    expect(v.strands.map((s) => s.elig.stageReps.map((m) => m.id).sort())).toEqual([['t-a3', 't-a4'], ['t-b1', 't-b2']])
    expect(v.elig.eligible.map((m) => m.id).sort()).toEqual(['t-a3', 't-a4', 't-b1', 't-b2'])
    expect(v.pick?.rule).toBe('draw')
    const chances = Object.values(v.pick?.propensities ?? {})
    expect(new Set(chances.map((c) => c.toFixed(6))).size).toBe(1)
    expect(v.pick?.leaning).toBe(false)
    // The step records the stage its own strand stands on.
    expect(stageForRep(v, 't-a3')).toBe(2)
    expect(stageForRep(v, 't-b1')).toBe(1)
  })

  it('is named by itself, and its turn of the row says its own share', () => {
    expect(pathName(trial)).toBe('The Trial path')
    const row = peopleRowAll([view(socialAim), view(trialAim)], DAY, 0.3)
    expect(row?.view.path.id).toBe('trial')
    expect(whyThisRep(row!.pick!, row!.view.path)).toMatch(/^A turn for the Trial path, which takes the People row on at most three days in seven while another path is on\. /)
  })
})

describe('the one People row with a third Path', () => {
  it('gives the Path’s own reps up to its share of days in seven with Social on, then Social’s pick', () => {
    expect(peopleRowAll([view(socialAim), view(trialAim)], DAY, 0.3)?.view.path.id).toBe('trial')
    const three = [1, 2, 3].map((d) => step('t-b1', addDays(DAY, -d), ['trial']))
    expect(peopleRowAll([view(socialAim, three), view(trialAim, three)], DAY, 0.3)?.view.path.id).toBe('social')
    // Two days are under the share: the Path keeps the row.
    expect(peopleRowAll([view(socialAim, three.slice(0, 2)), view(trialAim, three.slice(0, 2))], DAY, 0.3)?.view.path.id).toBe('trial')
  })

  it('takes every day alone, its share binding only beside another Path, drawing among all its reps (P4)', () => {
    const seven = [1, 2, 3, 4, 5, 6].map((d) => step('t-b1', addDays(DAY, -d), ['trial']))
    const alone = view(trialAim, seven)
    const row = peopleRowAll([alone], DAY, 0.3)
    expect(row?.view.path.id).toBe('trial')
    // Its own pick, no turn said: the rep it shares with Social is among the candidates, as on its own card.
    expect(row?.pick).toEqual(alone.pick)
    expect(row?.pick?.turn).toBeUndefined()
    expect(row?.pick?.candidates).toContain('one-sentence-past-hello')
  })

  it('takes on its turn a rep it shares that Social no longer holds at its stage, and leaves Social one it holds (P4)', () => {
    const shared = 'one-sentence-past-hello'
    // Social at its first stage does not hold the shared rep (its second stage's): the Trial path's turn may draw it.
    const early = peopleRowAll([view(socialAim), view(trialAim)], DAY, 0.3)
    expect(early?.view.path.id).toBe('trial')
    expect(early?.pick?.candidates).toContain(shared)
    // Social at its second stage holds it: the Trial path's turn draws among the reps it holds alone.
    const firsts = ['eye-contact-stranger', 'attention-outward', 'greet-by-name'].flatMap((id, k) => [1, 2].map((d) => step(id, addDays(DAY, -(k * 2 + d)), ['social'], { setting: k ? 'recurring' : 'errand' })))
    const second = view(socialAim, firsts, firsts.map(done))
    expect(second.state.stage).toBe(2)
    const late = peopleRowAll([second, view(trialAim)], DAY, 0.3)
    expect(late?.view.path.id).toBe('trial')
    expect(late?.pick?.candidates).not.toContain(shared)
    // A day it drew the shared rep while Social did not hold it counts toward its share no more once Social does.
    const three = [1, 2, 3].map((d) => step(shared, addDays(DAY, -d), ['social', 'trial']))
    expect(peopleRowAll([view(socialAim, three), view(trialAim, three)], DAY, 0.3)?.view.path.id).toBe('social')
    expect(peopleRowAll([view(socialAim, [...firsts, ...three], firsts.map(done)), view(trialAim, three)], DAY, 0.3)?.view.path.id).toBe('trial')
  })

  it('counts a rep it shares with Social for both, and one it holds alone for itself', () => {
    const shared = 'one-sentence-past-hello'
    expect(pathReps('trial').some((m) => m.id === shared)).toBe(true)
    // Your pick through Change on the Trial path: the shared rep counts for both Paths on.
    const picked: Aim = { ...trialAim, pick: { day: DAY, moveId: shared, at: `${DAY}T13:00:00.000Z` } }
    const row = peopleRowAll([view(socialAim), view(picked)], DAY, 0.3)
    expect(row?.pick?.moveId).toBe(shared)
    expect(row?.paths).toEqual(['social', 'trial'])
    // A rep the Trial path holds alone counts for it alone.
    const own: Aim = { ...trialAim, pick: { day: DAY, moveId: 't-b1', at: `${DAY}T13:00:00.000Z` } }
    expect(peopleRowAll([view(socialAim), view(own)], DAY, 0.3)?.paths).toEqual(['trial'])
  })
})

describe('a Path of its own stays on the phone', () => {
  it('leaves its own steps out of the sheet’s counts, and keeps those it shares with a Path on the sheet', () => {
    expect(onTheSheet({ paths: ['trial'] })).toBe(false)
    expect(onTheSheet({ paths: ['social', 'trial'] })).toBe(true)
    expect(onTheSheet({ paths: ['partner'] })).toBe(false)
    expect(onTheSheet({ paths: ['social'] })).toBe(true)
    expect(onTheSheet({})).toBe(true)
  })

  it('is left out of the coach’s block, and its row tells the coach nothing, not even whose it is', () => {
    const vs = [view(socialAim), view(trialAim)]
    const block = coachBlock(vs, ctx, DAY, 'morning')
    expect(block?.stages.map((s) => s.path)).toEqual(['social'])
    expect(JSON.stringify(block)).not.toContain('trial')
    expect(coachBlock([view(trialAim)], ctx, DAY, 'morning')).toBeNull()
    const rowIsTrials = peopleRowOf(vs, [], DAY, 'morning')?.view.path.id === 'trial'
    expect(rowIsTrials ? coachRow(vs, [], DAY, 'morning') : null).toBeNull()
    expect(coachRow([view(trialAim)], [], DAY, 'morning')).toBeNull()
  })

  it('never takes a coach’s pick on its row, even one that names it', () => {
    const forged = { id: 1, day: DAY, path: 'trial', ids: ['t-b1'], versions: { 't-b1': 'Try it now.' }, at: `${DAY}T12:00:00.000Z` } as unknown as Parameters<typeof peopleRowOf>[4]
    const row = peopleRowOf([view(trialAim)], [], DAY, 'morning', forged)
    expect(row?.view.path.id).toBe('trial')
    expect(row?.pick?.chosenBy).toBe('app')
    expect(row?.pick?.version).toBeUndefined()
  })

  it('wears its own icon, Social’s and Partner’s as before', () => {
    expect(kindIcon(trialAim)).toBe('practice')
    expect(kindIcon(socialAim)).toBe('social')
    expect(kindIcon({ kind: 'path', path: 'partner' })).toBe('partner')
  })

  it('keeps its own reps out of the weekly view, as the Partner path’s, and a rep it shares with Social stays Social’s', () => {
    const w = {
      scorecard: { scored: 20, hitRate: 0.65, target: 0.6, averageMiss: 7.34, repair: { underWay: 0, resolved: 0, held: 0 }, gaveBack: 0, checkins: 42, medianAnswerMs: { morning: null, afternoon: null, evening: null } },
      best: { days: 12, threshold: 20, silent: true, top: [], controlled: [], uncontrolled: [] },
      gap: { days: 5, typical: null, good: null, best: null, howOften: null, lastGoodDaysAgo: null },
      moved: { reading: { thisWeek: null, lastWeek: null, delta: null }, ingredients: [] },
      lasts: { decays: [{ moveId: 't-a1', daysHeld: 2, runs: 3 }, { moveId: 'one-sentence-past-hello', daysHeld: 3, runs: 3 }], byReward: [] },
      health: [],
      checks: { together: [], requests: [], misses: { slots: 0, misses: 0, candidates: [], clusters: [] }, missing: { slots: 0, missed: 0, started: 0, unanswered: 0, comparisons: [], relations: [] } },
    } as unknown as WeeklyAnalyses
    const text = JSON.stringify(weeklyFacts(w))
    expect(text).not.toContain('Rep t-a1')
    expect(text).toContain('One sentence past hello')
  })

  it('writes no fact at all, and its own steps leave the sheet’s follow-through untouched', async () => {
    db.close()
    await db.delete()
    await db.open()
    await db.aims.bulkPut([socialAim, trialAim])
    const offers = [step('t-a1', addDays(DAY, -1), ['trial']), step('t-b1', addDays(DAY, -2), ['trial'])]
    await db.offers.bulkPut(offers)
    await db.outcomes.bulkPut(offers.map(done))
    const sheet = await factSheet(DAY, new Date(2026, 10, 6, 9, 5))
    const text = JSON.stringify(sheet)
    expect(sheet.facts.some((f) => f.id === 'aim.9' || f.id === 'path.9' || f.id === 'trajectory.9')).toBe(false)
    expect(text).not.toMatch(/Trial|t-a1|t-b1|Rep t-/)
    expect(sheet.facts.some((f) => f.id === 'path.1')).toBe(true)
  })
})

describe('your decisions on a Path’s versions', () => {
  beforeEach(async () => {
    db.close()
    await db.delete()
    await db.open()
  })

  it('offer a Path the catalogue adds nowhere until you start it, and never after Not this', async () => {
    expect(standing(trial, [])).toEqual({ kind: 'proposed', later: false })
    expect(offeredNow(trial, [])).toBe(false)
    await decide(trial, 'later', [])
    expect(standing(trial, await db.pathVersions.toArray())).toEqual({ kind: 'proposed', later: true })
    await decide(trial, 'notThis', [], '  Not for me right now. ', new Date(Date.now() + 1000))
    expect(standing(trial, await db.pathVersions.toArray())).toEqual({ kind: 'declined', reason: 'Not for me right now.' })
    await decide(trial, 'started', [], undefined, new Date(Date.now() + 2000))
    const rows = await db.pathVersions.toArray()
    expect(offeredNow(trial, rows)).toBe(true)
    expect(rows.at(-1)).toMatchObject({ path: 'trial', version: '2', hash: contentHash(trial), decision: 'started' })
    // Built in: offered with no decision at all.
    expect(offeredNow(paths.find((p) => p.id === 'social')!, [])).toBe(true)
  })

  it('show what changed since the version you started: a minor change noted, a major one waiting for you', () => {
    const onOne = [{ path: 'trial', version: '1', hash: 'an older hash', decision: 'started' as const, at: '2026-11-02T12:00:00.000Z', cards: [] }]
    expect(changesSince(trial, onOne[0]).map((c) => c.version)).toEqual(['2'])
    expect(standing(trial, onOne)).toEqual({ kind: 'started', noted: [trial.changes![1]] })
    const major = { ...trial, changes: [trial.changes![0], { ...trial.changes![1], major: true }] }
    expect(standing(major, onOne).kind).toBe('waiting')
    expect(offeredNow(major, onOne)).toBe(false)
    // On the current version, nothing to show.
    expect(changesSince(trial, { version: '2', hash: contentHash(trial) })).toEqual([])
  })

  it('hash a Path by what you would see: its reps’ text changes it, its change records do not', () => {
    const h = contentHash(trial)
    expect(contentHash({ ...trial, changes: [] })).toBe(h)
    expect(contentHash({ ...trial, what: 'Different words.' })).not.toBe(h)
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })
})

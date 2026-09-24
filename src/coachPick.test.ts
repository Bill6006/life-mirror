import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Block } from './blocks'
import { coachPickOf } from './cloudSync'
import { db, type Aim, type CoachPick, type MonthlyCheck, type Offer, type Outcome } from './db'
import { coachAllowed, coachRow, peopleRowOf, resumePath } from './pathFlow'
import { isComparable } from './pathLearning'
import { coachBlock, pathKey, pathToday, whyThisRep, type PathToday } from './pathStage'

// The coach's pick on the phone (Part 32): used only while it holds, today's, for the row's own
// path, every rep among the reps the row may offer now, and never over your own pick. Two are
// drawn between at even chances, kept with the step; one is the coach's, a count only. The coach
// block carries the row it may choose for, and nothing the record holds by context.

const DAY = '2026-09-23'
const aim: Aim = { id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-09-01T00:00:00.000Z', archivedAt: null }
const office = { atOffice: true, churchDay: false, pickupTime: null }
const home = { atOffice: false, churchDay: false, pickupTime: null }
const view = (a: Aim = aim, offers: Offer[] = [], outcomes: Outcome[] = [], ctx = office, block: Block = 'morning'): PathToday => pathToday({ aim: a, offers, outcomes, ctx, day: DAY, block })
/** A coach pick naming reps, each with its own line of today's version. */
const coach = (ids: string[], extra: Partial<CoachPick> = {}): CoachPick => ({ id: `${DAY}:coach`, day: DAY, block: 'morning', path: 'social', ids, versions: Object.fromEntries(ids.map((id) => [id, `Today's version of ${id}.`])), model: 'claude-opus-5-5', at: `${DAY}T11:52:00.000Z`, ...extra })

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('the coach’s pick in the People row', () => {
  const base = peopleRowOf([view()], [], DAY, 'morning')
  const candidates = base?.pick?.candidates ?? []

  it('draws between two reps it named at even chances, both kept, with the drawn rep’s own line under it', () => {
    expect(candidates.length).toBeGreaterThanOrEqual(3)
    const two = candidates.slice(0, 2)
    const row = peopleRowOf([view()], [], DAY, 'morning', coach(two))
    expect(row?.pick).toMatchObject({ rule: 'coach+draw', chosenBy: 'coach', candidates: two, propensities: { [two[0]]: 0.5, [two[1]]: 0.5 } })
    expect(two).toContain(row?.pick?.moveId)
    expect(row?.pick?.version).toBe(`Today's version of ${row?.pick?.moveId}.`)
    // Whatever order the lines come in, the drawn rep shows its own.
    const flipped = { ...coach(two), versions: { [two[1]]: `Today's version of ${two[1]}.`, [two[0]]: `Today's version of ${two[0]}.` } }
    const again = peopleRowOf([view()], [], DAY, 'morning', flipped)
    expect(again?.pick?.version).toBe(`Today's version of ${again?.pick?.moveId}.`)
    expect(whyThisRep(row!.pick!)).toContain('The coach named two of the reps that fit now')
    // The same day draws the same, so the row does not flicker.
    expect(peopleRowOf([view()], [], DAY, 'morning', coach(two))?.pick?.moveId).toBe(row?.pick?.moveId)
  })

  it('takes one rep it named as its own pick, a count only and never one of Part 25’s comparisons', () => {
    const row = peopleRowOf([view()], [], DAY, 'morning', coach([candidates[1]]))
    expect(row?.pick).toMatchObject({ moveId: candidates[1], rule: 'coach', chosenBy: 'coach', candidates: [candidates[1]], propensities: { [candidates[1]]: 1 } })
    expect(whyThisRep(row!.pick!)).toContain('The coach chose it among the reps that fit now')
    expect(isComparable({ rule: 'coach+draw', chosenBy: 'coach', chances: { a: 0.5, b: 0.5 } })).toBe(false)
    expect(isComparable({ rule: 'coach', chosenBy: 'coach', chances: null })).toBe(false)
  })

  it('is ignored when stale, for the other path, naming a rep the row may not offer now or more than two, and never stands over your own pick', () => {
    const ignored = [coach(candidates.slice(0, 2), { day: '2026-09-22' }), coach(candidates.slice(0, 2), { path: 'partner' }), coach(['ask-one-question']), coach(candidates.slice(0, 3))]
    for (const c of ignored) expect(peopleRowOf([view()], [], DAY, 'morning', c)?.pick, JSON.stringify(c.ids) + c.day + c.path).toEqual(base?.pick)
    // At home in the evening an in-person rep no longer fits: the coach naming one is ignored at the tap.
    const evening = view(aim, [], [], home, 'evening')
    const inPerson = candidates.find((id) => !(evening.pick?.candidates ?? []).includes(id)) as string
    expect(inPerson).toBeTruthy()
    expect(peopleRowOf([evening], [], DAY, 'evening', coach([inPerson]))?.pick?.chosenBy).not.toBe('coach')
    // A real rep of a later stage is no candidate now, whatever the coach says.
    expect(peopleRowOf([view()], [], DAY, 'morning', coach(['ask-one-question']))?.pick?.chosenBy).not.toBe('coach')
    // Your own pick stands, even when the coach names the very rep you picked.
    const mine = view({ ...aim, pick: { day: DAY, moveId: candidates[2], at: `${DAY}T12:00:00.000Z` } })
    expect(peopleRowOf([mine], [], DAY, 'morning', coach([candidates[2]]))?.pick).toMatchObject({ rule: 'you', chosenBy: 'you', moveId: candidates[2] })
  })

  it('is kept with the step when resumed: who chose it, the rule, the reps it named and their chances', async () => {
    await db.aims.add(aim)
    const two = candidates.slice(0, 2)
    const row = peopleRowOf([view()], [], DAY, 'morning', coach(two))
    const offer = await resumePath(aim, row!.pick!, 1, new Date(2026, 8, 23, 8, 0), row!.paths)
    expect(offer).toMatchObject({ chosenBy: 'coach', rule: 'coach+draw', candidates: two, propensities: { [two[0]]: 0.5, [two[1]]: 0.5 }, propensity: 0.5 })
  })
})

describe('the coach and the monthly check’s help', () => {
  const check = (answers: MonthlyCheck['answers'], month = DAY.slice(0, 7)): MonthlyCheck => ({ id: 1, month, day: `${month}-01`, answers, at: `${month}-01T12:00:00.000Z` })
  const yes = check({ safety: true, conduct: null, doubt: null })

  it('drops a Partner pick at the tap while this month’s check shows its help, even one made before the help showed', () => {
    const partner = coach(['talk-ordinary-week'], { path: 'partner' })
    expect(coachAllowed(partner, [yes], DAY)).toBeNull()
    expect(coachAllowed(partner, [check({ safety: null, conduct: true, doubt: null })], DAY)).toBeNull()
  })

  it('keeps it on any other answer, in another month, and keeps a Social pick whatever the check says', () => {
    const partner = coach(['talk-ordinary-week'], { path: 'partner' })
    expect(coachAllowed(partner, [check({ safety: false, conduct: false, doubt: true })], DAY)).toBe(partner)
    expect(coachAllowed(partner, [check({ safety: true, conduct: null, doubt: null }, '2026-08')], DAY)).toBe(partner)
    expect(coachAllowed(partner, [], DAY)).toBe(partner)
    const social = coach(['greet-by-name'])
    expect(coachAllowed(social, [yes], DAY)).toBe(social)
    expect(coachAllowed(null, [yes], DAY)).toBeNull()
  })
})

describe('the coach block', () => {
  it('carries the People row it may choose for: its path and candidates, none while a step is started', () => {
    const v = view()
    expect(coachRow([v], [], DAY, 'morning')).toEqual({ path: 'social', candidates: peopleRowOf([v], [], DAY, 'morning')?.pick?.candidates })
    const open: Offer = { id: 9, kind: 'step', day: DAY, block: 'morning', at: `${DAY}T12:00:00.000Z`, situationKey: pathKey('social'), target: 'mood', stance: '', band: '', reading: 0, moveId: 'greet-by-name', cardId: null, candidates: ['greet-by-name'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null }
    expect(coachRow([v], [open], DAY, 'morning')).toEqual({ path: 'social', candidates: [] })
    expect(coachBlock([v], office, DAY, 'morning', false, coachRow([v], [], DAY, 'morning'))?.row?.path).toBe('social')
  })

  it('is the same for two records whose reps differ only in the block and day they were done in: tier 2 changes nothing', () => {
    const done = (block: Block, day: string): [Offer, Outcome] => [
      { id: 50, kind: 'step', day, block, at: `${day}T${block === 'morning' ? '12' : '23'}:00:00.000Z`, situationKey: pathKey('social'), target: 'mood', stance: '', band: '', reading: 0, moveId: 'greet-by-name', cardId: null, candidates: ['greet-by-name'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: `${day}T23:30:00.000Z`, chosenBy: 'app', paths: ['social'], setting: 'recurring', rule: 'only', stage: 1 },
      { id: 60, offerId: 50, moveId: 'greet-by-name', day, block, at: `${day}T23:30:00.000Z`, outcome: 'done', why: null, passiveOutcome: null },
    ]
    const [oa, xa] = done('morning', '2026-09-21')
    const [ob, xb] = done('evening', '2026-09-20')
    const a = view(aim, [oa], [xa])
    const b = view(aim, [ob], [xb])
    const blockOf = (v: PathToday) => JSON.stringify(coachBlock([v], office, DAY, 'morning', false, coachRow([v], [], DAY, 'morning')))
    expect(blockOf(a)).toBe(blockOf(b))
  })
})

describe('a coach row as the phone reads it', () => {
  it('takes a whole pick and nothing else', () => {
    const row = { day: DAY, block: 'morning', path: 'social', ids: ['greet-by-name'], versions: { 'greet-by-name': 'Say it by name.' }, model: 'claude-opus-5-5', at: `${DAY}T11:52:00.000Z` }
    expect(coachPickOf('x', JSON.stringify(row))).toEqual({ id: 'x', ...row })
    // A line for a rep it did not name is dropped.
    expect(coachPickOf('x', JSON.stringify({ ...row, versions: { 'greet-by-name': 'Say it by name.', other: 'No.' } }))?.versions).toEqual({ 'greet-by-name': 'Say it by name.' })
    expect(coachPickOf('x', JSON.stringify({ ...row, ids: ['a', 'b', 'c'] }))).toBeNull()
    expect(coachPickOf('x', JSON.stringify({ ...row, path: 'everyone' }))).toBeNull()
    expect(coachPickOf('x', 'not json')).toBeNull()
  })
})

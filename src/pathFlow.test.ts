import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeAims, planAim } from './aimFlow'
import { keysOf, lastDoneDay } from './aims'
import { coachFor, factSheet, writeFactsRow } from './brainFlow'
import { moveById } from './catalogue'
import { db, ensureDayContext, getSettings, setDayContext, type Offer } from './db'
import { factById } from './facts'
import { candidatesFor, type Situation } from './offers'
import { todayState } from './offerFlow'
import { addPathAim, convertToSocial, pathOn, pausePath, resumePath, setPathPick } from './pathFlow'
import { pathKey, pathToday } from './pathStage'

// The path commitment on the phone (Part 24): added once, converted from A person with its whole
// record, paused, a rep picked through Change, Resume recording who chose and where, the one
// people rep a day across the row and the draw, and the coach block beside the sheet.

const DAY = '2026-09-18'
const MORNING = new Date(2026, 8, 18, 9, 0)

async function socialAim() {
  const aim = (await activeAims()).find((a) => a.kind === 'path' && a.path === 'social')
  if (!aim) throw new Error('no Social path')
  return aim
}

describe('the path commitment', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('is added once, and paused and taken up again with its record kept', async () => {
    await addPathAim('social')
    await addPathAim('social')
    expect((await activeAims()).filter((a) => a.kind === 'path')).toHaveLength(1)
    const aim = await socialAim()
    expect(pathOn(aim)).toBe(true)
    await pausePath(aim.id as number, true)
    expect(pathOn(await socialAim())).toBe(false)
    await pausePath(aim.id as number, false)
    expect(pathOn(await socialAim())).toBe(true)
  })

  it('converts A person to the Social path, keeping its plans, its steps and their answers', async () => {
    const personId = await db.aims.add({ kind: 'person', stepMoveId: 'message-a-friend', createdAt: '2026-09-01T08:00:00.000Z', archivedAt: null })
    const offerId = await db.offers.add({ kind: 'step', day: '2026-09-10', block: 'evening', at: '2026-09-10T19:00:00.000Z', situationKey: 'aim:person', target: 'mood', stance: '', band: '', reading: 0, moveId: 'message-a-friend', cardId: null, candidates: ['message-a-friend'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: '2026-09-10T20:00:00.000Z' })
    await db.outcomes.add({ offerId, moveId: 'message-a-friend', day: '2026-09-10', block: 'evening', at: '2026-09-10T20:00:00.000Z', outcome: 'done', why: null, passiveOutcome: null })
    await planAim((await db.aims.get(personId))!, 'nextCheckIn', '13:00', MORNING, 'Message one friend now')
    await convertToSocial(personId)
    const aim = await socialAim()
    expect(aim).toMatchObject({ id: personId, kind: 'path', path: 'social', convertedFrom: 'person', createdAt: '2026-09-01T08:00:00.000Z' })
    expect(keysOf(aim, [])).toEqual(expect.arrayContaining([pathKey('social'), 'aim:person']))
    const [offers, outcomes] = [await db.offers.toArray(), await db.outcomes.toArray()]
    expect(lastDoneDay(aim, offers, outcomes)).toBe('2026-09-10')
    expect((await db.intentions.toArray()).map((i) => i.aimId)).toEqual([personId])
    const view = pathToday({ aim, offers, outcomes, ctx: null, day: DAY, block: 'morning' })
    expect(view.entries.map((e) => e.moveId)).toEqual(['message-a-friend'])
    // A second conversion, or a person beside a Social path, changes nothing.
    await convertToSocial(personId)
    expect((await activeAims()).filter((a) => a.kind === 'path')).toHaveLength(1)
  })

  it('records on Resume who chose the rep, the paths it counts for, where it was meant to happen, the rule, the stage and the chances', async () => {
    await setDayContext(DAY, { atOffice: true })
    await addPathAim('social')
    const aim = await socialAim()
    await planAim(aim, 'nextCheckIn', '13:00', MORNING, 'The Social path')
    const [offers, outcomes, ctx] = [await db.offers.toArray(), await db.outcomes.toArray(), await db.days.get(DAY)]
    const view = pathToday({ aim, offers, outcomes, ctx: ctx ?? null, day: DAY, block: 'morning' })
    expect(view.pick).not.toBeNull()
    const offer = await resumePath(aim, view.pick!, view.state.stage, MORNING)
    expect(offer).toMatchObject({ kind: 'step', situationKey: pathKey('social'), chosenBy: 'app', paths: ['social'], stage: 1, rule: 'draw', setting: view.pick!.setting })
    expect(offer.candidates.sort()).toEqual(['attention-outward', 'eye-contact-stranger', 'greet-by-name'])
    expect(Object.values(offer.propensities ?? {}).reduce((s, p) => s + p, 0)).toBeCloseTo(1)
    expect((await db.intentions.toArray())[0].offerId).toBe(offer.id)
  })

  it('offers your pick through Change whatever the shape says, as your pick', async () => {
    await addPathAim('social')
    const aim = await socialAim()
    await setPathPick(aim.id as number, 'greet-by-name', DAY)
    const view = pathToday({ aim: await socialAim(), offers: [], outcomes: [], ctx: (await db.days.get(DAY)) ?? null, day: DAY, block: 'evening' })
    expect(view.elig.eligible).toEqual([])
    expect(view.pick).toMatchObject({ moveId: 'greet-by-name', chosenBy: 'you', rule: 'you' })
    const offer: Offer = await resumePath(await socialAim(), view.pick!, view.state.stage, new Date(2026, 8, 18, 19, 0))
    expect(offer.chosenBy).toBe('you')
    // Tomorrow the pick is the app's again.
    expect(pathToday({ aim: await socialAim(), offers: [], outcomes: [], ctx: null, day: '2026-09-19', block: 'evening' }).pick).toBeNull()
  })

  it('holds one people rep a day: with a path on, the draw offers no in-person people or charisma rep, and paused it does again', async () => {
    await setDayContext(DAY, { atOffice: true })
    const s: Situation = { block: 'morning', target: 'mood', key: 'morning:mood', band: 'gettingBy', reading: 50, targetPosition: 3 }
    const inPersonPeople = (ids: string[]) => ids.filter((id) => id !== 'nothing' && moveById(id).with === 'adult' && ['people', 'charisma'].includes(moveById(id).family))
    const before = candidatesFor(s, await todayState(DAY, await getSettings(), MORNING)).candidates.map((c) => c.id)
    expect(inPersonPeople(before).length).toBeGreaterThan(0)
    await addPathAim('social')
    const t = await todayState(DAY, await getSettings(), MORNING)
    expect(t.pathOn).toBe(true)
    const set = candidatesFor(s, t)
    expect(inPersonPeople(set.candidates.map((c) => c.id))).toEqual([])
    for (const id of inPersonPeople(before)) expect(set.excluded.get(id)).toBe('path')
    await pausePath((await socialAim()).id as number, true)
    const paused = candidatesFor(s, await todayState(DAY, await getSettings(), MORNING)).candidates.map((c) => c.id)
    expect(inPersonPeople(paused)).toEqual(inPersonPeople(before))
  })

  it('puts the path on the sheet’s line side, and its coach block beside the sheet and never inside it', async () => {
    await setDayContext(DAY, { atOffice: true })
    await addPathAim('social')
    const aim = await socialAim()
    const sheet = await factSheet(DAY, MORNING)
    const f = factById(sheet, `path.${aim.id}`)
    expect(f?.text).toContain('The Social path: Stage 1 of 6 · Presence')
    expect(f?.values).toMatchObject({ path: 'social', stage: 1, stages: 6, nobodyAround: 0 })
    expect(String(f?.values.eligible).split(',').sort()).toEqual(['attention-outward', 'eye-contact-stranger', 'greet-by-name'])
    expect(factById(sheet, `aim.${aim.id}`)?.text).toContain('The Social path (path)')
    expect(await writeFactsRow(DAY, MORNING)).toBe(true)
    const row = await db.facts.get(DAY)
    expect(row?.coach).toEqual(await coachFor(DAY, MORNING))
    expect(row?.coach?.stages).toEqual([{ path: 'social', stage: 1, name: 'Presence', reentry: false }])
    expect(Object.keys(row?.sheet ?? {})).not.toContain('coach')
    expect(JSON.stringify(row?.sheet)).not.toContain('perRep')
    // Unchanged, the row is not written again; paused, the path leaves the sheet and the block.
    expect(await writeFactsRow(DAY, MORNING)).toBe(false)
    await pausePath(aim.id as number, true)
    expect(factById(await factSheet(DAY, MORNING), `path.${aim.id}`)).toBeUndefined()
    expect(await coachFor(DAY, MORNING)).toBeNull()
  })
})

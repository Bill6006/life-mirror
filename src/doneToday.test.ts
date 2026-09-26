import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeAims, addAim, addSkill, liveSkills, logSession, planAim, resumeAim, rungMarks } from './aimFlow'
import { sessionsToday, stepFor } from './aims'
import { blockReadings } from './readings'
import { db, ensureDayContext, getSettings, saveAnswer, updateSettings, type Aim, type Offer } from './db'
import { doneOpen, ensureOffer, ensurePickupOffer, pickupOfferNow, recordDoneNow, recordOutcome, replacementsFor, skipOffer } from './offerFlow'
import { NOTHING } from './offers'
import { addPathAim } from './pathFlow'
import { pathKey, pathToday, peopleRepToday, peopleRow } from './pathStage'
import type { PathId } from './catalogue'

// Workstream 6, Part 37: done feels done. A session you started stays yours to resolve whatever the
// clock says; one done away from the app is recorded in one tap; one People rep a day, and once it
// is done nothing more is offered; Skip shows another move only where one really fits.

const DAY = '2026-09-18'
const MORNING = new Date(2026, 8, 18, 9, 0)

async function practice(): Promise<Aim> {
  await addAim('practice', 'box-breathing')
  const aim = (await activeAims()).find((a) => a.kind === 'practice')
  if (!aim) throw new Error('no practice')
  return aim
}

async function records() {
  return { offers: await db.offers.toArray(), outcomes: await db.outcomes.toArray() }
}

describe('a started session stays resolvable (D3)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('opens Done at once and keeps it open across blocks and days, while a move keeps its block', async () => {
    const aim = await practice()
    const offer = await resumeAim(aim, stepFor(aim, [], []), 'step', MORNING)
    expect(doneOpen(offer, MORNING)).toBe(true)
    expect(doneOpen(offer, new Date(2026, 8, 18, 18, 30))).toBe(true)
    expect(doneOpen(offer, new Date(2026, 8, 19, 8, 0))).toBe(true)
    const move: Offer = { ...offer, kind: 'block', moveId: 'box-breathing', at: MORNING.toISOString() }
    expect(doneOpen(move, new Date(2026, 8, 18, 18, 30))).toBe(false)
  })

  it('records Done the next morning against the day the session began', async () => {
    const aim = await practice()
    const offer = await resumeAim(aim, stepFor(aim, [], []), 'step', new Date(2026, 8, 18, 22, 0))
    await recordDoneNow(offer, new Date(2026, 8, 19, 7, 30))
    const { offers, outcomes } = await records()
    expect(outcomes).toHaveLength(1)
    expect(sessionsToday(aim, offers, outcomes, DAY).done?.outcome).toBe('done')
    expect(sessionsToday(aim, offers, outcomes, '2026-09-19').done).toBeNull()
  })

  it('says Partly until a session that day is done, and never counts an unblock move as the session', async () => {
    const aim = await practice()
    const first = await resumeAim(aim, stepFor(aim, [], []), 'step', MORNING)
    await recordOutcome(first, 'partly', null, null, { day: DAY, block: 'afternoon' })
    let r = await records()
    expect(sessionsToday(aim, r.offers, r.outcomes, DAY)).toMatchObject({ done: null, partly: true })
    const unblock = await resumeAim(aim, stepFor(aim, [], []), 'unblock', new Date(2026, 8, 18, 13, 0))
    await recordDoneNow(unblock, new Date(2026, 8, 18, 13, 10))
    r = await records()
    expect(sessionsToday(aim, r.offers, r.outcomes, DAY)).toMatchObject({ done: null, partly: true })
    const second = await resumeAim(aim, stepFor(aim, [], []), 'step', new Date(2026, 8, 18, 14, 0))
    await recordDoneNow(second, new Date(2026, 8, 18, 14, 20))
    r = await records()
    expect(sessionsToday(aim, r.offers, r.outcomes, DAY)).toMatchObject({ done: { outcome: 'done' }, partly: false })
  })
})

describe('Did it already', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('records a session done now, and keeps today’s plan so no reminder fires for it', async () => {
    const aim = await practice()
    await planAim(aim, 'nextCheckIn', '13:00', MORNING, 'A step')
    await logSession(aim, stepFor(aim, [], []), new Date(2026, 8, 18, 10, 0))
    const [offer] = await db.offers.toArray()
    expect(offer).toMatchObject({ kind: 'step', logged: true, closedAt: '2026-09-18T' + offer.at.slice(11) })
    expect((await db.outcomes.toArray()).map((x) => x.outcome)).toEqual(['done'])
    expect((await db.intentions.toArray()).map((i) => i.offerId)).toEqual([offer.id])
    const r = await records()
    expect(sessionsToday(aim, r.offers, r.outcomes, DAY).done).not.toBeNull()
  })

  it('records a session of the current skill and moves no rung (Workstream 6, D2)', async () => {
    await addAim('certification', null, 'A language', 'language')
    await addSkill('A word', 'A language', 'language')
    const aim = (await activeAims()).find((a) => a.kind === 'certification') as Aim
    const step = stepFor(aim, await liveSkills(), [])
    expect(step.id).toBe('skill:1')
    const id = await logSession(aim, step, MORNING)
    expect((await db.offers.get(id))?.moveId).toBe('skill:1')
    expect(await rungMarks()).toEqual([])
  })
})

describe('one People rep a day (D4)', () => {
  let seq = 100
  const repOffer = (moveId: string, on: PathId[], extra: Partial<Offer> = {}): Offer => {
    seq++
    return { id: seq, kind: 'step', day: DAY, block: 'morning', at: `${DAY}T15:00:00.000Z`, situationKey: pathKey(on[0]), target: 'mood', stance: '', band: '', reading: 0, moveId, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, chosenBy: 'app', paths: on, setting: 'recurring', rule: 'only', stage: 1, ...extra }
  }
  const answer = (o: Offer, outcome: 'done' | 'partly' | 'no') => ({ id: (o.id as number) + 1000, offerId: o.id as number, moveId: o.moveId, day: DAY, block: 'morning' as const, at: `${DAY}T16:00:00.000Z`, outcome, why: null, passiveOutcome: null })
  const office = { atOffice: true, churchDay: false, pickupTime: null, withHer: true }

  beforeEach(async () => {
    await db.delete()
    await db.open()
    await addPathAim('social')
    await addPathAim('partner')
  })

  async function aims() {
    const all = await activeAims()
    return { social: all.find((a) => a.path === 'social') as Aim, partner: all.find((a) => a.path === 'partner') as Aim }
  }

  it('offers no other rep once today’s is done, on either path, and says which it was', async () => {
    const { social, partner } = await aims()
    const o = repOffer('greet-by-name', ['social'])
    const outcomes = [answer(o, 'done')]
    const s = pathToday({ aim: social, offers: [o], outcomes, ctx: office, day: DAY, block: 'afternoon' })
    const p = pathToday({ aim: partner, offers: [o], outcomes, ctx: office, day: DAY, block: 'afternoon' })
    expect(s.pick).toBeNull()
    expect(p.pick).toBeNull()
    expect(s.repDone).toMatchObject({ moveId: 'greet-by-name', paths: ['social'] })
    const row = peopleRow(s, p, DAY, 0.5)
    expect(row).toMatchObject({ pick: null, paths: ['social'] })
    expect(row?.view.path.id).toBe('social')
  })

  it('after Partly offers that rep alone, to finish, and after No may offer again', async () => {
    const { social } = await aims()
    const o = repOffer('greet-by-name', ['social'])
    const partly = pathToday({ aim: social, offers: [o], outcomes: [answer(o, 'partly')], ctx: office, day: DAY, block: 'afternoon' })
    expect(partly.repDone).toBeNull()
    expect(partly.repPartly).toBe('greet-by-name')
    expect(partly.pick).toMatchObject({ moveId: 'greet-by-name', chosenBy: 'you' })
    const no = pathToday({ aim: social, offers: [o], outcomes: [answer(o, 'no')], ctx: office, day: DAY, block: 'afternoon' })
    expect(no.repDone).toBeNull()
    expect(no.repPartly).toBeNull()
  })

  it('reads the day the rep began, not the day it was answered', () => {
    const o = repOffer('greet-by-name', ['social'], { day: '2026-09-17' })
    const outcomes = [{ ...answer(o, 'done'), day: DAY }]
    expect(peopleRepToday([o], outcomes, DAY).done).toBeNull()
    expect(peopleRepToday([o], outcomes, '2026-09-17').done).not.toBeNull()
  })
})

describe('Skip shows another only where one fits (D6)', () => {
  const AFTERNOON = new Date(2026, 8, 18, 14, 0)
  const asked = blockReadings('afternoon')
  const rng = () => 0.3

  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('draws another real move for the same check-in, never Nothing today, and the skip completes nothing', async () => {
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    const first = (await ensureOffer(DAY, 'afternoon', rng)) as Offer
    expect(first).not.toBeNull()
    expect(await replacementsFor(first, AFTERNOON)).toBeGreaterThan(0)
    const next = (await skipOffer(first)) as Offer
    expect(next).not.toBeNull()
    expect(next.moveId).not.toBe(first.moveId)
    expect(next.moveId).not.toBe(NOTHING)
    expect(next.candidates).not.toContain(NOTHING)
    expect(await db.outcomes.count()).toBe(0)
    // An offer from another block, left for the next check-in, has no replacement to promise.
    expect(await replacementsFor(next, new Date(2026, 8, 18, 18, 0))).toBe(0)
  })

  it('shows another move before pickup after a skip, while the window is open', async () => {
    await updateSettings((s) => ({ ...s, week: { ...s.week, pickupTime: '17:00' } }))
    await db.days.clear()
    await ensureDayContext(DAY, await getSettings())
    const now = new Date(2026, 8, 18, 16, 0)
    const first = (await ensurePickupOffer(now, rng)) as Offer
    expect(first).not.toBeNull()
    expect(await replacementsFor(first, now)).toBeGreaterThan(0)
    await db.offers.update(first.id as number, { skippedAt: now.toISOString() })
    const next = (await ensurePickupOffer(now, rng)) as Offer
    expect(next).not.toBeNull()
    expect(next.id).not.toBe(first.id)
    expect(next.moveId).not.toBe(first.moveId)
    // After pickup, nothing more is promised.
    expect(await replacementsFor(next, new Date(2026, 8, 18, 17, 5))).toBe(0)
  })

  it('keeps the move before pickup on Now across 17:00 while its window is open, and not after (the final checklist, item 2)', async () => {
    await updateSettings((s) => ({ ...s, week: { ...s.week, pickupTime: '17:30' } }))
    await db.days.clear()
    await ensureDayContext(DAY, await getSettings())
    // Drawn at 16:30, in the afternoon block, for a 17:30 pickup.
    const drawn = (await ensurePickupOffer(new Date(2026, 8, 18, 16, 30), rng)) as Offer
    expect(drawn.block).toBe('afternoon')
    expect((await pickupOfferNow(new Date(2026, 8, 18, 16, 45)))?.id).toBe(drawn.id)
    // The evening block begins at 17:00; the window before pickup does not end there.
    expect((await pickupOfferNow(new Date(2026, 8, 18, 17, 10)))?.id).toBe(drawn.id)
    // After pickup it is the next check-in's to ask about, as before.
    expect(await pickupOfferNow(new Date(2026, 8, 18, 17, 35))).toBeNull()
    // One drawn in the evening block stays in its block, as it always did.
    await db.offers.update(drawn.id as number, { skippedAt: new Date(2026, 8, 18, 17, 1).toISOString() })
    const late = (await ensurePickupOffer(new Date(2026, 8, 18, 17, 5), rng)) as Offer
    expect(late.block).toBe('evening')
    expect((await pickupOfferNow(new Date(2026, 8, 18, 21, 43)))?.id).toBe(late.id)
  })
})

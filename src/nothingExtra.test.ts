import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { NOTHING } from './catalogue'
import { copy } from './copy'
import { db, type Offer, type Outcome } from './db'
import { closeNothingExtra, pendingOffers, recordOutcome } from './offerFlow'
import { START, walkRecord } from './repair/fixtures'
import { buildEngine, type RepairRecord } from './repair/record'

// Nothing extra (Item 4, 2026-10-23): no move suggested for the block, which is lived as usual: plans, work, parenting,
// church, errands and anything spontaneous all go ahead. Nothing is asked of it, so ordinary life in it is never a failure;
// and each test's comparison, suggesting the move against suggesting nothing extra, reads it the same whatever was answered
// of it before, or nothing at all.

const offer = (over: Partial<Offer>): Offer => ({ kind: 'block', day: '2026-10-22', block: 'morning', at: '2026-10-22T13:00:00.000Z', situationKey: 's', target: 'mood', stance: '', band: '', reading: 50, moveId: NOTHING, cardId: null, candidates: ['walk-ten', NOTHING], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, ...over })

describe('Nothing extra asks nothing', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('never brings a Nothing extra block to a check-in; a passive item that rode alongside is still asked about, alone', async () => {
    await db.offers.add(offer({}))
    const walk = (await db.offers.add(offer({ block: 'afternoon', at: '2026-10-22T17:00:00.000Z', moveId: 'walk-ten' }))) as number
    const gap = (await db.offers.add(offer({ block: 'evening', at: '2026-10-22T22:00:00.000Z', passiveId: 'recovery-gap' }))) as number
    expect((await pendingOffers()).map((o) => o.id)).toEqual([walk, gap])
    // The passive item answered: nothing more is asked of that block.
    await recordOutcome((await db.offers.get(gap)) as Offer, null, null, 'done', { day: '2026-10-23', block: 'morning' })
    expect((await pendingOffers()).map((o) => o.id)).toEqual([walk])
  })

  it('closes an earlier Nothing extra at the next check-in as it stands, writing no outcome; the block still on and a move are left', async () => {
    const earlier = (await db.offers.add(offer({}))) as number
    const current = (await db.offers.add(offer({ block: 'afternoon', at: '2026-10-22T17:00:00.000Z' }))) as number
    const walk = (await db.offers.add(offer({ moveId: 'walk-ten', at: '2026-10-22T13:01:00.000Z' }))) as number
    const gap = (await db.offers.add(offer({ passiveId: 'recovery-gap', at: '2026-10-22T13:02:00.000Z' }))) as number
    expect(await closeNothingExtra({ day: '2026-10-22', block: 'afternoon' }, new Date('2026-10-22T17:05:00.000Z'))).toBe(1)
    expect((await db.offers.get(earlier))?.closedAt).toBe('2026-10-22T17:05:00.000Z')
    for (const id of [current, walk, gap]) expect((await db.offers.get(id))?.closedAt).toBeNull()
    expect(await db.outcomes.count()).toBe(0)
  })
})

describe('what the engine reads of Nothing extra', () => {
  const calls = (r: RepairRecord) => {
    const { engine } = buildEngine(r, addDays(START, 39))
    return [...engine.testsNow().values()].filter((t) => t.n1 >= 1 && t.n0 >= 1).map((t) => engine.callOfTest(t))
  }
  const mapNothing = (r: RepairRecord, f: (o: Outcome) => Outcome | null): RepairRecord => ({ ...r, outcomes: r.outcomes.flatMap((o) => (o.moveId === NOTHING ? (f(o) ?? []) : [o])) })

  it('reads the same comparison whatever was answered of Nothing extra, or nothing: ordinary life there never counts as failure', () => {
    const base = walkRecord(40, true)
    const asDone = calls(base)
    expect(asDone.length).toBeGreaterThan(0)
    expect(asDone.some((c) => c.itt !== null)).toBe(true)
    expect(calls(mapNothing(base, (o) => ({ ...o, outcome: 'no', why: 'didntWant' })))).toEqual(asDone)
    expect(calls(mapNothing(base, (o) => ({ ...o, outcome: 'partly' })))).toEqual(asDone)
    // As the check-in now leaves it: nothing asked, nothing written; the card was seen, so each block still counts.
    expect(calls(mapNothing(base, () => null))).toEqual(asDone)
  })

  it('reads a move’s own answers, the share done, into its estimate when done, never into the comparison its calls rest on', () => {
    const base = walkRecord(40, true)
    const asDone = calls(base)
    const walkNo = calls({ ...base, outcomes: base.outcomes.map((o) => (o.moveId === 'walk-ten' ? { ...o, outcome: 'no', why: 'noTime' } : o)) })
    expect(walkNo.map((c) => c.itt)).toEqual(asDone.map((c) => c.itt))
    expect(walkNo.map((c) => c.compliance)).not.toEqual(asDone.map((c) => c.compliance))
  })
})

describe('Nothing extra in words', () => {
  it('says ordinary life goes ahead, asks nothing, and never reads it as doing nothing, rest or something kept', () => {
    expect(copy.move.nothing).toBe('Nothing extra')
    expect(copy.move.nothingWhat).toBe('No extra move this block: live it as you normally would. Your plans, work, parenting, church, errands and anything spontaneous all go ahead as usual.')
    expect(copy.move.nothingAfter).toBe('Nothing is asked about it at your next check-in.')
    const every: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') every.push(v)
      else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(copy)
    const wrong = every.filter((s) => /doing nothing|rest is a move|keep it to nothing extra|kept to \{|Nothing today/i.test(s))
    expect(wrong).toEqual([])
  })

  it('says each call is on suggesting the move against suggesting nothing extra, and the size when done as resting on an assumption', () => {
    expect(copy.repairEvidence.intro).toContain('Each call says what suggesting the move did, against suggesting nothing extra, whatever was then done')
    expect(copy.repairEvidence.suggested).toContain('when suggested, against nothing extra')
    expect(copy.repairEvidence.estimate).toContain('assuming it works only through doing it')
    expect(copy.askMirror.estimate).toContain('assuming it works only through doing it')
  })
})

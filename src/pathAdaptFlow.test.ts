import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { findPath, type Path, type PathId } from './catalogue'
import { SYNCED_STORES } from './cloudOutbox'
import { db, getSettings, type Aim, type Offer } from './db'
import { buildExport } from './export'
import { recordOutcome } from './offerFlow'
import { declineProposal, proposalsFor, setTap, undoChange, useProposal } from './pathAdaptFlow'
import { pathToday, type PathToday } from './pathStage'

// The fast loop's record on the phone (P6, 2026-11-07): your taps applied at once and undone in place, a rep set aside
// for safety the moment you say so and kept until its own Undo, the record's proposals used or declined, and the whole
// log in the export, the Partner path's only when it is included.

const DAY = '2026-11-20'
const NOW = new Date(2026, 10, 20, 9, 0)
const speaking = findPath('speaking') as Path

async function aimOf(path: PathId, strands?: string[]): Promise<Aim> {
  const id = await db.aims.add({ kind: 'path', path, stepMoveId: null, pausedAt: null, createdAt: '2026-11-01T08:00:00.000Z', archivedAt: null, ...(strands ? { strands } : {}) })
  return (await db.aims.get(id)) as Aim
}

async function view(aim: Aim, day = DAY): Promise<PathToday> {
  return pathToday({ aim, offers: await db.offers.toArray(), outcomes: await db.outcomes.toArray(), ctx: null, day, block: 'morning', adaptations: await db.pathAdaptations.toArray() })
}

let at = 0
async function stepOf(moveId: string, day: string, path: PathId): Promise<Offer> {
  at++
  const offer: Offer = { kind: 'step', day, block: 'morning', at: `${day}T09:${String(at % 60).padStart(2, '0')}:00.000Z`, situationKey: `aim:path:${path}`, target: 'mood', stance: '', band: '', reading: 0, moveId, minutes: 1, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, chosenBy: 'app', paths: [path], setting: 'group', rule: 'only', stage: 1, skippedAt: null, closedAt: null }
  offer.id = await db.offers.add(offer)
  return offer
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('your taps', () => {
  it('apply a preference at once, and undo it in place, kept', async () => {
    const aim = await aimOf('speaking', ['nerves'])
    expect(await setTap(await view(aim), 'prefer', { rep: 'sp-n-eyes-up' }, true, NOW)).toBeNull()
    let rows = await db.pathAdaptations.toArray()
    expect(rows.map((r) => [r.path, r.kind, r.rep, r.origin, r.state, r.version])).toEqual([['speaking', 'prefer', 'sp-n-eyes-up', 'preference', 'applied', speaking.version ?? '1']])
    expect((await view(aim)).adapted.prefer.has('sp-n-eyes-up')).toBe(true)
    await setTap(await view(aim), 'prefer', { rep: 'sp-n-eyes-up' }, false, NOW)
    rows = await db.pathAdaptations.toArray()
    expect(rows.map((r) => r.state)).toEqual(['undone'])
    expect((await view(aim)).adapted.prefer.size).toBe(0)
  })

  it('refuse Not for me where the stage would lose its floor, and write nothing', async () => {
    const aim = await aimOf('social')
    const words = await setTap(await view(aim), 'setAside', { rep: 'greet-by-name' }, true, NOW)
    expect(words).toMatch(/too few different reps/)
    expect(await db.pathAdaptations.count()).toBe(0)
    // Where the stage keeps its floor, it is set aside at once.
    const nerves = await aimOf('speaking', ['nerves'])
    expect(await setTap(await view(nerves), 'setAside', { rep: 'sp-n-no-lines' }, true, NOW)).toBeNull()
    expect((await view(nerves)).elig.stageReps.map((m) => m.id)).not.toContain('sp-n-no-lines')
  })

  it('take a kind of setting you don’t have as a correction, setting aside the reps that need only it', async () => {
    const aim = await aimOf('speaking', ['speaking'])
    expect((await view(aim)).elig.stageReps.map((m) => m.id)).toContain('read-aloud')
    await setTap(await view(aim), 'noSetting', { setting: 'solo' }, true, NOW)
    const [r] = await db.pathAdaptations.toArray()
    expect([r.kind, r.setting, r.origin]).toEqual(['noSetting', 'solo', 'correction'])
    expect((await view(aim)).elig.stageReps.map((m) => m.id)).not.toContain('read-aloud')
  })
})

describe('a rep you said felt unsafe or harmful', () => {
  it('is set aside at once on its Path, once, and comes back only by its own Undo', async () => {
    const aim = await aimOf('speaking', ['nerves'])
    const first = await stepOf('sp-n-eyes-up', '2026-11-18', 'speaking')
    await recordOutcome(first, 'no', 'didntWant', null, { day: '2026-11-18', block: 'evening' }, null, true, 'unsafe')
    expect((await db.outcomes.toArray()).map((x) => [x.pathWhy, x.chance])).toEqual([['unsafe', true]])
    const second = await stepOf('sp-n-eyes-up', '2026-11-19', 'speaking')
    await recordOutcome(second, 'no', null, null, { day: '2026-11-19', block: 'evening' }, null, null, 'unsafe')
    const rows = await db.pathAdaptations.toArray()
    expect(rows.map((r) => [r.path, r.kind, r.rep, r.origin, r.state])).toEqual([['speaking', 'setAside', 'sp-n-eyes-up', 'safety', 'applied']])
    expect(rows[0].why).toMatch(/unsafe or harmful/)
    expect((await view(aim)).elig.stageReps.map((m) => m.id)).not.toContain('sp-n-eyes-up')
    // A tap on the sheet never brings it back.
    await setTap(await view(aim), 'setAside', { rep: 'sp-n-eyes-up' }, false, NOW)
    expect((await db.pathAdaptations.toArray()).map((r) => r.state)).toEqual(['applied'])
    await undoChange(rows[0].id as number, NOW)
    expect((await db.pathAdaptations.toArray()).map((r) => r.state)).toEqual(['undone'])
    expect((await view(aim)).elig.stageReps.map((m) => m.id)).toContain('sp-n-eyes-up')
  })

  it('keeps the reason only after a No', async () => {
    const offer = await stepOf('sp-n-eyes-up', '2026-11-18', 'speaking')
    await recordOutcome(offer, 'partly', null, null, { day: '2026-11-18', block: 'evening' }, null, null, 'unsafe')
    expect((await db.outcomes.toArray())[0].pathWhy).toBeUndefined()
    expect(await db.pathAdaptations.count()).toBe(0)
  })
})

describe('what the record suggests', () => {
  async function noChanceFour(aim: Aim) {
    for (const d of ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']) {
      const o = await stepOf('sp-n-no-lines', d, 'speaking')
      await recordOutcome(o, 'no', null, null, { day: d, block: 'evening' }, null, false, 'noChance')
    }
    return view(aim)
  }

  it('is applied only on Use it, with its origin and why, and is then offered no more', async () => {
    const aim = await aimOf('speaking', ['nerves'])
    const pt = await noChanceFour(aim)
    const [p, ...rest] = proposalsFor(pt, await db.outcomes.toArray(), await db.pathAdaptations.toArray(), DAY)
    expect(rest).toEqual([])
    expect([p.kind, p.rep, p.origin]).toEqual(['setAside', 'sp-n-no-lines', 'feasibility'])
    expect(p.why).toBe('No chance came up for it on 4 of its last 4 answered steps.')
    expect(pt.elig.stageReps.map((m) => m.id)).toContain('sp-n-no-lines')
    await useProposal(speaking, p, NOW)
    const rows = await db.pathAdaptations.toArray()
    expect(rows.map((r) => [r.kind, r.rep, r.origin, r.state, r.why])).toEqual([['setAside', 'sp-n-no-lines', 'feasibility', 'applied', p.why]])
    const after = await view(aim)
    expect(after.elig.stageReps.map((m) => m.id)).not.toContain('sp-n-no-lines')
    expect(proposalsFor(after, await db.outcomes.toArray(), rows, DAY)).toEqual([])
  })

  it('is kept as declined on Not now, changing nothing, and is not suggested again without newer answers', async () => {
    const aim = await aimOf('speaking', ['nerves'])
    const pt = await noChanceFour(aim)
    const [p] = proposalsFor(pt, await db.outcomes.toArray(), [], DAY)
    await declineProposal(speaking, p, NOW)
    const rows = await db.pathAdaptations.toArray()
    expect(rows.map((r) => [r.kind, r.state])).toEqual([['setAside', 'declined']])
    const after = await view(aim)
    expect(after.elig.stageReps.map((m) => m.id)).toContain('sp-n-no-lines')
    expect(proposalsFor(after, await db.outcomes.toArray(), rows, DAY)).toEqual([])
  })
})

describe('the log in your record', () => {
  it('syncs with the rest of it', () => {
    for (const s of ['pathAdaptations', 'pathTests', 'pathTestDays']) expect(SYNCED_STORES).toContain(s)
  })

  it('is in the export when it has rows, the Partner path’s only when included, and absent otherwise', async () => {
    const settings = await getSettings()
    const plain = buildExport([], [], [], settings, { includePrivate: false }, undefined, { offers: [], outcomes: [], cards: [], declarations: [] })
    expect(JSON.parse(plain.json).pathAdaptations).toBeUndefined()
    const aim = await aimOf('speaking', ['nerves'])
    await setTap(await view(aim), 'prefer', { rep: 'sp-n-eyes-up' }, true, NOW)
    const rows = await db.pathAdaptations.toArray()
    const partner = { ...rows[0], id: 99, path: 'partner', rep: 'x' }
    const out = JSON.parse(buildExport([], [], [], settings, { includePrivate: false }, undefined, { offers: [], outcomes: [], cards: [], declarations: [], pathAdaptations: [...rows, partner] }).json)
    expect(out.pathAdaptations.map((r: { path: string; kind: string; origin: string; state: string }) => [r.path, r.kind, r.origin, r.state])).toEqual([['speaking', 'prefer', 'preference', 'applied']])
    const withPartner = JSON.parse(buildExport([], [], [], settings, { includePrivate: false, includePartner: true }, undefined, { offers: [], outcomes: [], cards: [], declarations: [], pathAdaptations: [...rows, partner] }).json)
    expect(withPartner.pathAdaptations).toHaveLength(2)
  })
})

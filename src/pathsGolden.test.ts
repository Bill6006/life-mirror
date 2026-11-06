import './pathsGolden.tz'
import 'fake-indexeddb/auto'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addDays, BLOCKS, type Block } from './blocks'
import { coachFor, factSheet } from './brainFlow'
import { pathReps, paths, type Path } from './catalogue'
import { db, type Aim, type CheckIn, type DayContext, type Offer, type Outcome, type PathMark } from './db'
import { buildExport, partnerOwn } from './export'
import { onTheSheet } from './facts'
import { coachRow, peopleRowOf } from './pathFlow'
import { coachBlock, pathKey, pathName, pathsHolding, pathToday, stageWords, whyThisRep, type PathToday } from './pathStage'
import { DEFAULT_SETTINGS } from './settings'

// Social and Partner, byte for byte (P1 of the AI-generated Paths design, 2026-11-06). Seeded records
// of every shape the two paths take are run through each output that reads a path: the day's rep for
// each path, the one People row, the coach's block and row, which steps the sheet counts, the Partner
// record's own steps, the whole fact sheet, the coach block the phone sends, and the export with and
// without the Partner record. The fixture holds one hash per scenario, taken on the code before P1:
// any change either path could see changes a hash. GOLDEN_WRITE=1 writes the fixture again, a
// deliberate act for a deliberate change; GOLDEN_DUMP=<folder> writes each scenario's outputs, to diff.

const FIXTURE = new URL('./pathsGolden.json', import.meta.url)
const PURE = 400
const WITH_DB = 60

/** A fixed stream of numbers in [0, 1) from a seed (mulberry32). */
function stream(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Scenario {
  day: string
  block: Block
  now: Date
  aims: Aim[]
  offers: Offer[]
  outcomes: Outcome[]
  marks: PathMark[]
  ctx: DayContext
  checkins: CheckIn[]
  socialEnergy: number | null
  online: boolean
  lightOnly: boolean
  faithHidden: boolean
}

const HOURS: Record<Block, number> = { morning: 9, afternoon: 13, evening: 19 }

function scenario(seed: number): Scenario {
  const r = stream(seed * 7919 + 17)
  const pickOf = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  const day = `2026-09-${String(10 + Math.floor(r() * 19)).padStart(2, '0')}`
  const block = pickOf(BLOCKS)
  const now = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), HOURS[block], 5)
  const aims: Aim[] = []
  if (r() < 0.75) aims.push({ id: 1, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-07-01T12:00:00.000Z', archivedAt: null, pausedAt: r() < 0.15 ? '2026-08-01T12:00:00.000Z' : null, ...(r() < 0.2 ? { convertedFrom: 'person' as const, convertedAt: '2026-07-02T12:00:00.000Z' } : {}) })
  if (r() < 0.6) aims.push({ id: 2, kind: 'path', path: 'partner', stepMoveId: null, createdAt: '2026-07-01T12:00:00.000Z', archivedAt: null, pausedAt: r() < 0.15 ? '2026-08-01T12:00:00.000Z' : null })
  const on = aims.filter((a) => !a.pausedAt).map((a) => a.path as string)
  // A pick through Change, on today or another day.
  for (const a of aims) if (r() < 0.25) {
    const rep = pickOf(pathReps(a.path as string as Path['id']))
    a.pick = { day: r() < 0.7 ? day : addDays(day, -1), moveId: rep.id, at: `${day}T1${Math.floor(r() * 9)}:00:00.000Z` }
  }
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  let id = 1000
  const n = Math.floor(r() * 45)
  for (let k = 0; k < n; k++) {
    const holder = aims.length ? pickOf(aims) : null
    const path = (holder?.path ?? 'social') as Path['id']
    const reps = pathReps(path)
    const move = pickOf(reps)
    const offerDay = r() < 0.12 ? day : addDays(day, -Math.floor(r() * 70))
    const offerBlock = pickOf(BLOCKS)
    const rule = pickOf(['draw', 'only', 'smaller', 'you', 'coach', 'coach+draw', 'rotate'] as const)
    const others = reps.filter((m) => m.id !== move.id).slice(0, 1 + Math.floor(r() * 2)).map((m) => m.id)
    const candidates = rule === 'draw' || rule === 'coach+draw' ? [move.id, ...others] : [move.id]
    const weights = candidates.map(() => 0.2 + r())
    const total = weights.reduce((a, b) => a + b, 0)
    const propensities = Object.fromEntries(candidates.map((c, i) => [c, weights[i] / total]))
    const heldBy = pathsHolding(move.id, on.length ? (on as Path['id'][]) : [path])
    const at = `${offerDay}T${String(HOURS[offerBlock] + 4).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:00.000Z`
    const skipped = r() < 0.06
    id++
    const offer: Offer = {
      id, kind: 'step', day: offerDay, block: offerBlock, at, situationKey: r() < 0.08 && path === 'social' ? 'aim:person' : pathKey(path), target: 'mood', stance: '', band: '', reading: 0,
      moveId: move.id, minutes: move.minutes, cardId: null, candidates, coinFlip: false, passiveId: null, whyNot: null, propensity: propensities[move.id], propensities,
      chosenBy: rule === 'you' ? 'you' : rule.startsWith('coach') ? 'coach' : 'app', paths: r() < 0.05 ? undefined : heldBy.length ? heldBy : [path],
      setting: pickOf(move.settings ?? ['solo']), rule, stage: 1 + Math.floor(r() * 4), skippedAt: skipped ? at : null, closedAt: null,
    }
    offers.push(offer)
    if (!skipped && r() < 0.8) {
      const outcome = r() < 0.6 ? 'done' : r() < 0.5 ? 'partly' : 'no'
      outcomes.push({ id: id + 50000, offerId: id, moveId: move.id, day: offerDay, block: offerBlock, at: `${offerDay}T${String(HOURS[offerBlock] + 6).padStart(2, '0')}:00:00.000Z`, outcome, why: null, passiveOutcome: null })
    }
  }
  const marks: PathMark[] = []
  if (aims.some((a) => a.path === 'partner')) {
    if (r() < 0.2) marks.push({ id: 7001, path: 'partner', kind: 'stage', stage: 4 + Math.floor(r() * 4), day: addDays(day, -Math.floor(r() * 30)), at: `${addDays(day, -Math.floor(r() * 30))}T12:00:00.000Z` })
    if (r() < 0.35) {
      const d = r() < 0.5 ? day : addDays(day, -Math.floor(r() * 10))
      marks.push({ id: 7002, path: 'partner', kind: 'date', day: d, at: `${addDays(d, -1)}T12:00:00.000Z` })
    }
    if (r() < 0.1) marks.push({ id: 7003, path: 'partner', kind: 'milestone', day: addDays(day, -3), note: 'A milestone', at: `${addDays(day, -3)}T12:00:00.000Z` })
  }
  const weekday = new Date(`${day}T12:00:00`).getDay() as DayContext['weekday']
  const church = r() < 0.15 ? 'sabbath' : r() < 0.15 ? 'third' : undefined
  const ctx: DayContext = {
    day, weekday, withHer: r() < 0.5, studyNight: false, churchDay: church === 'sabbath', ...(church ? { church, services: church === 'sabbath' ? ['07:30', '14:30', '19:30'] : ['19:30'] } : {}),
    atOffice: r() < 0.35, officeDay: r() < 0.3, pickupTime: r() < 0.3 ? '17:30' : null, soloUntil: '20:00', ...(r() < 0.2 ? { amongPeople: true } : {}),
  } as DayContext
  const socialEnergy = r() < 0.6 ? 1 + Math.floor(r() * 5) : null
  const stress = r() < 0.3 ? 4 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3)
  const checkins: CheckIn[] = [{ day, block: 'morning', startedAt: `${day}T13:00:00.000Z`, completedAt: `${day}T13:02:00.000Z`, updatedAt: `${day}T13:02:00.000Z`, answers: { ...(socialEnergy ? { socialEnergy } : {}), stress, mood: 3 } as CheckIn['answers'], activeMs: 30000 }]
  return { day, block, now, aims, offers, outcomes, marks, ctx, checkins, socialEnergy, online: r() < 0.4, lightOnly: stress >= 4, faithHidden: r() < 0.2 }
}

const views = (s: Scenario): PathToday[] =>
  s.aims.filter((a) => !a.pausedAt && a.archivedAt === null).map((aim) => pathToday({ aim, offers: s.offers, outcomes: s.outcomes, ctx: s.ctx, day: s.day, block: s.block, socialEnergy: s.socialEnergy, marks: s.marks, online: s.online, lightOnly: s.lightOnly, faithHidden: s.faithHidden }))

/** What a view shows, by value: never the path's own content, which P1 extends without changing what it decides. */
function seen(v: PathToday) {
  return {
    path: v.path.id, name: pathName(v.path), stageWords: stageWords(v.path, v.state.stage), state: v.state,
    elig: { stage: v.elig.stage, stageReps: v.elig.stageReps.map((m) => m.id), eligible: v.elig.eligible.map((m) => m.id), requiresGoingOut: v.elig.requiresGoingOut },
    pick: v.pick, why: v.pick ? whyThisRep(v.pick) : null, around: v.around, dateDay: v.dateDay, doneEver: [...v.doneEver].sort(), faithHidden: v.faithHidden, repDone: v.repDone, repPartly: v.repPartly,
    entries: v.entries.length,
  }
}

function pureOutputs(s: Scenario) {
  const vs = views(s)
  const row = peopleRowOf(vs, [], s.day, s.block)
  const cRow = coachRow(vs, [], s.day, s.block)
  return {
    views: vs.map(seen),
    row: row ? { path: row.view.path.id, pick: row.pick, why: row.pick ? whyThisRep(row.pick) : null, paths: row.paths } : null,
    coachRow: cRow,
    coachBlock: coachBlock(vs, s.ctx, s.day, s.block, vs.some((v) => v.dateDay), cRow),
    onSheet: s.offers.map((o) => onTheSheet(o)),
    partnerOwn: s.offers.map((o) => partnerOwn(o)),
  }
}

async function dbOutputs(s: Scenario) {
  db.close()
  await db.delete()
  await db.open()
  await db.settings.put({ ...DEFAULT_SETTINGS, id: 1, updatedAt: '2026-09-01T12:00:00.000Z', partnerOnline: s.online } as never)
  await db.aims.bulkPut(s.aims)
  await db.offers.bulkPut(s.offers)
  await db.outcomes.bulkPut(s.outcomes)
  await db.pathMarks.bulkPut(s.marks)
  await db.checkins.bulkPut(s.checkins)
  await db.days.put(s.ctx)
  const sheet = await factSheet(s.day, s.now)
  const coach = await coachFor(s.day, s.now)
  const settings = { ...DEFAULT_SETTINGS, partnerOnline: s.online }
  const aimsData = { aims: s.aims, skills: [], marks: [] }
  const records = { offers: s.offers, outcomes: s.outcomes, cards: [], declarations: [], pathMarks: s.marks } as never
  const exported = [false, true].map((includePartner) => buildExport(s.checkins, [], [], settings as never, { includePrivate: false, includePartner }, aimsData, records).json.replace(/"exportedAt":\s*"[^"]*"/, '"exportedAt":"-"'))
  return { facts: [...sheet.facts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((f) => ({ id: f.id, tags: f.tags, text: f.text, values: f.values })), coach, exported }
}

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24)

describe('Social and Partner, byte for byte', () => {
  it(`gives every seeded scenario the same outputs as the code before P1 (${PURE} without the database, ${WITH_DB} with it)`, { timeout: 240_000 }, async () => {
    const dump = process.env.GOLDEN_DUMP
    if (dump) mkdirSync(dump, { recursive: true })
    const pure: string[] = []
    for (let k = 0; k < PURE; k++) {
      const out = pureOutputs(scenario(k))
      if (dump) writeFileSync(`${dump}/pure-${k}.json`, JSON.stringify(out, null, 1))
      pure.push(hash(out))
    }
    const withDb: string[] = []
    for (let k = 0; k < WITH_DB; k++) {
      const out = await dbOutputs(scenario(100000 + k))
      if (dump) writeFileSync(`${dump}/db-${k}.json`, JSON.stringify(out, null, 1))
      withDb.push(hash(out))
    }
    // The scenarios reach both paths, both rows and the coach: a fixture of empty outputs proves nothing.
    const reached = Array.from({ length: PURE }, (_, k) => pureOutputs(scenario(k)))
    expect(reached.filter((o) => o.row?.path === 'partner').length).toBeGreaterThan(20)
    expect(reached.filter((o) => o.row?.path === 'social').length).toBeGreaterThan(20)
    expect(reached.filter((o) => o.row?.pick?.rule === 'draw').length).toBeGreaterThan(20)
    expect(reached.filter((o) => o.views.some((v) => v.state.stage > 1)).length).toBeGreaterThan(10)
    if (process.env.GOLDEN_WRITE === '1') {
      writeFileSync(FIXTURE, `${JSON.stringify({ note: 'Hashes of every Social and Partner output on seeded records, taken on the code before P1. Regenerate only for a change either path is meant to show.', tz: process.env.TZ, paths: paths.map((p) => p.id), pure, withDb }, null, 1)}\n`)
      return
    }
    expect(existsSync(FIXTURE)).toBe(true)
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { pure: string[]; withDb: string[] }
    const pureDiff = pure.map((h, k) => (h === fixture.pure[k] ? -1 : k)).filter((k) => k >= 0)
    const dbDiff = withDb.map((h, k) => (h === fixture.withDb[k] ? -1 : k)).filter((k) => k >= 0)
    expect({ pureDiff, dbDiff }).toEqual({ pureDiff: [], dbDiff: [] })
  })
})

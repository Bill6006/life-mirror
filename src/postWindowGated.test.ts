import 'fake-indexeddb/auto'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { addLearning, logSession, setEase, setRhythm, studyAims } from './aimFlow'
import { stepFor } from './aims'
import { addDays, BLOCKS } from './blocks'
import { coachFor, factSheet } from './brainFlow'
import { contextFromWeek, db, ensureDayContext, getSettings, setDayContext, updateSettings, type CheckIn, type DayContext, type Offer } from './db'
import type { Settings } from './settings'
import { runForecasting, usualFor } from './forecastFlow'
import { candidatesFor, everySituation } from './offers'
import { ensureOffer, recordOutcome, todayState } from './offerFlow'
import { blockReadings, type Answers, type Position } from './readings'

// The two features agreed for after the clean window (home-only moves with Skip's "Not home", and
// Away from home) are built behind closed gates. Recorded before either was built and held fixed
// while both gates are closed: the day's sheet the monitored prompts are built from, the coach
// block, every draw, every candidate set and every day's shape must not move by a byte. The record
// already holds what the features would store once open (a trip saved in Settings, days shaped by
// it, a skip given "Not home"), so these snapshots also prove the closed gates read none of it.

const DAY = '2026-10-07'
const NOW = new Date(2026, 9, 7, 7, 45)
const TRIP = { from: '2026-10-05', to: '2026-10-11', setAt: '2026-10-04T20:00:00.000Z' }

/** A fixed draw: the same sequence of numbers on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const blockIndex = (b: CheckIn['block']) => BLOCKS.indexOf(b)

function checkin(day: string, block: CheckIn['block'], back: number): CheckIn {
  const at = new Date(`${day}T${block === 'morning' ? '07' : block === 'afternoon' ? '13' : '19'}:30:00`).toISOString()
  const ids = blockReadings(block)
  const answers = Object.fromEntries(ids.map((id, k) => [id, (1 + ((back * 7 + blockIndex(block) * 3 + k) % 5)) as Position])) as Answers
  const extras = block === 'evening' && back % 9 === 0 ? { note: `a note from ${back} days back` } : undefined
  return { day, block, asked: [...ids], answers, startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000, ...(extras ? { extras } : {}) }
}

/** A day shaped as an open gate would shape it on a trip; today's code knows none of it. */
function awayShaped(ctx: DayContext): DayContext {
  return { ...ctx, atOffice: false, pickupTime: null, churchDay: false, studyNight: false, awayFromHome: { held: { atOffice: Boolean(ctx.atOffice), pickupTime: ctx.pickupTime, churchDay: ctx.churchDay, studyNight: ctx.studyNight } } } as DayContext
}

const digest = (lines: readonly string[]) => createHash('sha256').update(lines.join('\n')).digest('hex')

describe('the record the monitored prompts are built from, held fixed while the post-window features are gated', () => {
  let settings: Settings

  beforeAll(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    await db.delete()
    await db.open()
    settings = await updateSettings((s) => ({
      ...s,
      week: { ...s.week, churchDay: 0, livesWithMe: true, studyNights: { ...s.week.studyNights, 3: true }, officeDays: { ...s.week.officeDays, 2: true, 4: true }, pickupTime: '17:30', soloUntil: '20:00' },
      // A trip saved as the open gate would save it: today's code has no such field and reads none of it.
      ...({ away: TRIP } as object),
    }))

    const rows: CheckIn[] = []
    for (let back = 35; back >= 1; back--) {
      const day = addDays(DAY, -back)
      await ensureDayContext(day, settings)
      for (const block of BLOCKS) rows.push(checkin(day, block, back))
    }
    await ensureDayContext(DAY, settings)
    rows.push(checkin(DAY, 'morning', 0))
    await db.checkins.bulkAdd(rows)
    // She was away one day by the chip; the trip's days are shaped as the open gate would shape them.
    await setDayContext(addDays(DAY, -12), { withHer: false })
    for (const day of [addDays(DAY, -2), addDays(DAY, -1), DAY]) await db.days.put(awayShaped((await db.days.get(day)) as DayContext))

    await addLearning('Learn Veltish', 'A phrasebook', 'Ten words', 'I can read a little', new Date(2026, 8, 20, 9, 0))
    const [aim] = await studyAims()
    await setRhythm(aim.id as number, { perWeek: 3, restDays: 0 })
    const skills = await db.skills.toArray()
    for (const [back, ease] of [[20, 'right'], [16, 'easy'], [13, 'hard'], [9, 'right'], [5, 'easy'], [3, 'right']] as const) {
      const when = new Date(`${addDays(DAY, -back)}T20:00:00`)
      const id = await logSession(aim, stepFor(aim, skills, [], [aim]), when)
      await setEase(id, ease)
    }

    // The draws of the last ten days, each block, from one fixed sequence; some answered, one skipped "Not home".
    const rng = seeded(20261004)
    for (let back = 10; back >= 0; back--) {
      const day = addDays(DAY, -back)
      for (const block of BLOCKS) {
        if (back === 0 && block !== 'morning') continue
        const offer = await ensureOffer(day, block, rng)
        if (!offer?.id) continue
        if ((back + blockIndex(block)) % 3 === 0) await recordOutcome(offer, 'done', null, offer.passiveId ? 'done' : null, { day, block })
        else if ((back + blockIndex(block)) % 3 === 1) await recordOutcome(offer, 'no', back % 2 ? 'noTime' : 'didntWant', offer.passiveId ? 'no' : null, { day, block })
      }
    }
    const skipped = (await db.offers.where('day').equals(addDays(DAY, -1)).toArray()).find((o) => o.block === 'afternoon' && o.kind === 'block') as Offer
    await db.offers.update(skipped.id as number, { skippedAt: new Date(NOW.getTime() - 3_600_000).toISOString(), ...({ skipReason: 'notHome' } as object) })
    await ensureOffer(addDays(DAY, -1), 'afternoon', rng)

    await runForecasting(DAY)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('builds the same sheet: every fact, the shortlist and the day', async () => {
    const sheet = await factSheet(DAY, NOW)
    expect(sheet.facts.map((f) => f.id)).toMatchSnapshot()
    expect(sheet).toMatchSnapshot()
  })

  it('writes the same coach block', async () => {
    expect(await coachFor(DAY, NOW)).toMatchSnapshot()
  })

  it('draws the same moves from the same candidates, the replacement after the skip included', async () => {
    const offers = (await db.offers.toArray()).sort((a, b) => (a.id as number) - (b.id as number))
    expect(offers.map((o) => ({ day: o.day, block: o.block, kind: o.kind, moveId: o.moveId, candidates: o.candidates, coinFlip: o.coinFlip, passiveId: o.passiveId, skipped: o.skippedAt !== null, whyNot: o.whyNot, propensity: o.propensity ?? null }))).toMatchSnapshot()
  })

  it('screens every move the same way in every situation, on an office day, a trip day, a church day and a study day', async () => {
    const out: Record<string, { candidates: number; digest: string }> = {}
    for (const day of [addDays(DAY, -3), addDays(DAY, -2), addDays(DAY, -1), DAY, addDays(DAY, -12)]) {
      const t = await todayState(day, await getSettings(), NOW)
      const lines = everySituation().map((s) => `${s.key}:${s.band} ${candidatesFor(s, t).candidates.map((c) => `${c.id}${c.bonus ? `+${c.bonus}` : ''}`).join(',')}`)
      out[day] = { candidates: lines.reduce((n, l) => n + l.split(',').length, 0), digest: digest(lines) }
    }
    expect(out).toMatchSnapshot()
  })

  it('shapes the same fortnight from the week, a trip saved or not', async () => {
    const s = await getSettings()
    const fortnight = Array.from({ length: 14 }, (_, k) => contextFromWeek(addDays('2026-10-01', k), s, '2026-10-01T00:00:00.000Z'))
    expect(fortnight).toMatchSnapshot()
  })

  it('reads the same usual ranges', async () => {
    const usual: Record<string, unknown> = {}
    for (const block of BLOCKS) usual[block] = await usualFor(DAY, block)
    expect(usual).toMatchSnapshot()
  })
})

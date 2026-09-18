import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAim, addSkill, planAim, studyAims } from './aimFlow'
import { weekBuckets } from './facts'
import { applyLineAction, brainStatus, chooseAndLog, factSheet, feedbackFor, lineActionState, recordFeedback, todaysLine, weekReview, whyFor, writeFactsRow } from './brainFlow'
import { db, ensureDayContext, getSettings } from './db'
import { factById } from './facts'

// The brain on the phone, end to end on a seeded record: the sheet built from the record, the
// day's line chosen once and logged, the tap filed under it, the facts row written only when
// something changed, and the Worker's line preferred when it wrote one.

const DAY = '2026-09-18'
const NOW = new Date(2026, 8, 18, 8, 0)

describe('the brain on the phone', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('builds the sheet from the record: the day, the commitment, its plan and the ladder', async () => {
    await addAim('certification', null, 'French', 'language')
    const [aim] = await studyAims()
    await addSkill('Ten words', 'French')
    await planAim(aim, 'afterBedtime', '20:00', NOW, 'French · Ten words · hear or read it')
    const sheet = await factSheet(DAY, NOW)
    expect(sheet.day).toBe(DAY)
    expect(sheet.hour).toBe(8)
    expect(factById(sheet, 'record')?.values.checkins).toBe(0)
    expect(factById(sheet, 'week.today')?.values).toMatchObject({ weekday: 'Friday', bedtime: '20:00', hour: 8 })
    const a = factById(sheet, `aim.${aim.id}`)
    expect(a?.values).toMatchObject({ kind: 'certification', name: 'French', skills: 1, plan: 'afterBedtime', planTime: '20:00', planStarted: 0, gapDays: null })
    expect(a?.text).toContain('French (study): the step is “Ten words · hear or read it”, 10 min; the ladder has not moved yet; planned today after her bedtime at 20:00, not started')
    expect(factById(sheet, 'follow')).toBeDefined()
    expect((await db.intentions.toArray())[0].step).toBe('French · Ten words · hear or read it')
  })

  it('chooses the day’s line once, logs it, takes one tap, and reads the Worker’s line first when there is one', async () => {
    await addAim('certification', null, 'French', 'language')
    expect(await todaysLine(DAY)).toBeNull()
    await chooseAndLog(DAY, NOW)
    const line = await todaysLine(DAY)
    expect(line).toMatchObject({ source: 'phone', situationId: 'first-skill' })
    expect(line?.text).toContain('French has no skill on its ladder yet')
    // Kept while its situation holds: a second run changes nothing.
    await chooseAndLog(DAY, new Date(2026, 8, 18, 9, 0))
    expect(await db.briefLog.count()).toBe(1)
    expect((await todaysLine(DAY))?.key).toBe(line?.key)
    // The tap, filed once.
    expect(await feedbackFor(line?.key ?? null)).toBeNull()
    await recordFeedback(DAY, line!, 'useful', NOW)
    await recordFeedback(DAY, line!, 'not', NOW)
    expect((await feedbackFor(line!.key))?.answer).toBe('useful')
    expect(await db.briefFeedback.count()).toBe(1)
    // Withdrawn once its facts no longer hold: a skill added, and the next true situation takes its place.
    await addSkill('Ten words', 'French')
    await chooseAndLog(DAY, new Date(2026, 8, 18, 9, 30))
    expect((await todaysLine(DAY))?.situationId).toBe('say-when')
    // Withdrawn, not deleted: it was said, so the row stays, marked, and its tap stays filed under it.
    const rows = await db.briefLog.orderBy('id').toArray()
    expect(rows.map((r) => [r.situationId, Boolean(r.withdrawnAt)])).toEqual([['first-skill', true], ['say-when', false]])
    expect((await factSheet(DAY, NOW)).said.map((x) => x.situationId)).toEqual(['first-skill', 'say-when'])
    // The Worker's line, pulled from its rows, comes first.
    await db.brainBriefs.put({ id: 'w1', day: DAY, kind: 'brief', text: 'From the Worker.', mode: 'observation', factIds: ['record'], cardIds: [], model: 'm', at: '2026-09-18T05:15:00.000Z' })
    expect(await todaysLine(DAY)).toMatchObject({ source: 'worker', key: 'worker:w1', text: 'From the Worker.', model: 'm' })
    expect(await brainStatus()).toMatchObject({ day: DAY, model: 'm' })
  })

  it('logs a day with nothing to say and looks again later; writes the facts row only when the facts changed', async () => {
    await chooseAndLog(DAY, NOW)
    expect(await todaysLine(DAY)).toBeNull()
    expect(await db.briefLog.count()).toBe(1)
    expect(await writeFactsRow(DAY, NOW)).toBe(true)
    expect(await writeFactsRow(DAY, new Date(2026, 8, 18, 8, 5))).toBe(false)
    await addAim('certification', null, 'Piano', 'craft')
    await chooseAndLog(DAY, new Date(2026, 8, 18, 9, 0))
    expect((await todaysLine(DAY))?.situationId).toBe('first-skill')
    expect(await db.briefLog.count()).toBe(1)
    expect(await writeFactsRow(DAY, new Date(2026, 8, 18, 9, 1))).toBe(true)
    expect((await db.facts.get(DAY))?.sheet.facts.some((f) => f.id.startsWith('aim.'))).toBe(true)
  })
})

describe('what the sheet learned to carry', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('counts days into the last four rolling weeks, oldest first, and nothing outside them', () => {
    expect(weekBuckets(['2026-09-18', '2026-09-12', '2026-09-11', '2026-08-25', '2026-08-21', '2026-08-01', '2026-09-19'], DAY)).toEqual([1, 0, 1, 2])
  })

  it('carries your own words, the trajectory of a commitment, and what happened since the last line', async () => {
    await addAim('certification', null, 'French', 'language')
    const [aim] = await studyAims()
    await addSkill('Ten words', 'French')
    await db.checkins.add({ day: '2026-09-17', block: 'evening', asked: ['mood'], startedAt: '2026-09-17T23:00:00.000Z', completedAt: '2026-09-17T23:01:00.000Z', updatedAt: '2026-09-17T23:01:00.000Z', answers: { mood: 3 }, activeMs: 0, extras: { note: 'work was heavy' } })
    await db.briefLog.add({ day: '2026-09-17', situationId: 'say-when', mode: 'recommendation', text: 'Said yesterday.', factIds: ['aim.1'], cardIds: [], at: '2026-09-17T12:00:00.000Z' })
    await planAim(aim, 'afterBedtime', '20:00', NOW, 'French · Ten words · hear or read it')
    const sheet = await factSheet(DAY, NOW)
    expect(factById(sheet, 'note.2026-09-17.evening')?.values.note).toBe('work was heavy')
    expect(factById(sheet, 'trajectory.1')?.values).toMatchObject({ name: 'French', w0: 0, w1: 0 })
    expect(factById(sheet, 'followup')?.values).toMatchObject({ day: '2026-09-17', about: 'French', aimId: 1, planned: 1, missed: 0, started: 0, received: 'untapped' })
    expect(factById(sheet, 'cadence')).toBeUndefined()
  })
})

describe('the line, acted on', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('does what it says in one tap, says why it said it, sets a test once, and makes the check-in lighter', async () => {
    await addAim('certification', null, 'French', 'language')
    await addSkill('Ten words', 'French')
    await chooseAndLog(DAY, NOW)
    const line = await todaysLine(DAY)
    expect(line?.action).toEqual({ kind: 'plan', aimId: 1, cue: 'afterBedtime' })
    expect(await lineActionState(DAY, line?.action ?? null, NOW)).toEqual({ state: 'open', cue: 'afterBedtime', time: '20:00' })
    expect(await applyLineAction(DAY, line!.action!, NOW)).toBe(true)
    expect((await db.intentions.toArray())[0]).toMatchObject({ aimId: 1, cue: 'afterBedtime', time: '20:00', step: 'French · Ten words · hear or read it' })
    expect((await lineActionState(DAY, line!.action, NOW))?.state).toBe('done')
    expect(await applyLineAction(DAY, line!.action!, NOW)).toBe(false)
    // Past her bedtime the cue is gone for the day.
    await db.intentions.clear()
    expect((await lineActionState(DAY, line!.action, new Date(2026, 8, 18, 21, 0)))?.state).toBe('gone')

    await writeFactsRow(DAY, NOW)
    const why = await whyFor(line!, DAY)
    expect(why.facts[0].text).toContain('French (study)')
    expect(why.cards.map((c) => c.id)).toEqual(['implementation-intentions'])

    expect((await lineActionState(DAY, { kind: 'test', moveId: 'walk-ten' }, NOW))?.state).toBe('open')
    expect(await applyLineAction(DAY, { kind: 'test', moveId: 'walk-ten' }, NOW)).toBe(true)
    expect(await db.cards.toArray()).toMatchObject([{ moveId: 'walk-ten', alternativeId: 'nothing', origin: 'import' }])
    expect((await lineActionState(DAY, { kind: 'test', moveId: 'walk-ten' }, NOW))?.state).toBe('done')
    expect((await lineActionState(DAY, { kind: 'test', moveId: 'no-such-move' }, NOW))?.state).toBe('gone')

    expect(await applyLineAction(DAY, { kind: 'depth', value: 'short' }, NOW)).toBe(true)
    expect((await getSettings()).depth).toBe('short')
    expect((await lineActionState(DAY, { kind: 'depth', value: 'short' }, NOW))?.state).toBe('done')
  })

  it('keeps a line that was answered for the day, and the next morning closes the loop on it', async () => {
    await addAim('certification', null, 'French', 'language')
    await addSkill('Ten words', 'French')
    await chooseAndLog(DAY, NOW)
    const line = await todaysLine(DAY)
    expect(line?.situationId).toBe('say-when')
    await applyLineAction(DAY, line!.action!, new Date(2026, 8, 18, 8, 5))
    // Its situation no longer tests true, since a plan exists; the tap was taken, so it stays with what was done under it.
    await chooseAndLog(DAY, new Date(2026, 8, 18, 9, 0))
    expect((await todaysLine(DAY))?.key).toBe(line?.key)
    expect(await db.briefLog.count()).toBe(1)
    // The morning after: the sheet carries what the record shows since the line, and the engine says so.
    const next = '2026-09-19'
    const morning = new Date(2026, 8, 19, 8, 0)
    await ensureDayContext(next, await getSettings())
    const sheet = await factSheet(next, morning)
    expect(factById(sheet, 'followup')?.values).toMatchObject({ day: DAY, about: 'French', aimId: 1, planned: 1, missed: 1, started: 0, received: 'untapped' })
    await chooseAndLog(next, morning)
    const after = await todaysLine(next)
    expect(after?.situationId).toBe('loop-planned')
    expect(after?.text).toContain('Yesterday’s line was about French: a plan was made, and its moment passed without a start.')
    expect(after?.action).toEqual({ kind: 'plan', aimId: 1, cue: 'afterBedtime' })
  })

  it('reviews the week from the record when the Worker has not, and takes the Worker’s three parts when it has', async () => {
    await addAim('certification', null, 'French', 'language')
    expect(await weekReview(DAY, NOW)).toMatchObject({ source: 'phone', didNot: 'French: added today, no step started yet.' })
    await db.brainBriefs.put({ id: 'r1', day: DAY, kind: 'review', text: 'a b c', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: '2026-09-18T09:15:00.000Z', parts: { held: 'a', didNot: 'b', change: 'c' } })
    expect(await weekReview(DAY, NOW)).toMatchObject({ source: 'worker', held: 'a', didNot: 'b', change: 'c', model: 'm' })
  })
})

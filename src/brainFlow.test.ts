import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAim, addSkill, planAim, studyAims } from './aimFlow'
import { wasShown, weekBuckets } from './facts'
import { applyLineAction, brainStatus, chooseAndLog, factSheet, feedbackFor, lineActionState, lineTiming, markShown, recordFeedback, todaysLine, weekReview, whyFor, writeFactsRow } from './brainFlow'
import type { LineAction } from './brainShared'
import { dayGuard } from './brainShared'
import { db, ensureDayContext, getSettings, setDayContext, updateSettings } from './db'
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

  it('marks the phone’s own line once it is on screen, and keeps the first time (Part 33)', async () => {
    await addAim('certification', null, 'French', 'language')
    await chooseAndLog(DAY, NOW)
    const line = (await todaysLine(DAY))!
    const id = Number(line.key.split(':')[2])
    expect((await db.briefLog.get(id))?.shownAt).toBeUndefined()
    await markShown(line, new Date(2026, 8, 18, 8, 5))
    const first = (await db.briefLog.get(id))?.shownAt
    expect(first).toBe(new Date(2026, 8, 18, 8, 5).toISOString())
    await markShown(line, new Date(2026, 8, 18, 9, 0))
    expect((await db.briefLog.get(id))?.shownAt).toBe(first)
    // The brain's own lines are said by being written; nothing to mark.
    await markShown({ key: 'worker:1', source: 'worker' })
  })

  it('counts a phone line as said once shown, and before marks existed, unless the brain’s line already stood that day (Part 33)', () => {
    expect(wasShown({ day: '2026-09-26', at: '2026-09-26T12:00:00.000Z', shownAt: '2026-09-26T12:00:01.000Z' }, [])).toBe(true)
    expect(wasShown({ day: '2026-09-26', at: '2026-09-26T12:00:00.000Z' }, [])).toBe(false)
    const brain = [{ day: '2026-09-20', at: '2026-09-20T13:00:00.000Z', kind: 'brief' as const }]
    expect(wasShown({ day: '2026-09-20', at: '2026-09-20T12:00:00.000Z' }, brain)).toBe(true)
    expect(wasShown({ day: '2026-09-20', at: '2026-09-20T14:00:00.000Z' }, brain)).toBe(false)
    expect(wasShown({ day: '2026-09-20', at: '2026-09-20T14:00:00.000Z' }, [{ ...brain[0], kind: 'review' as const }])).toBe(true)
  })

  it('holds no drop-off, pickup or bedtime on a day she is away, and the guard refuses the words (Part 33)', async () => {
    // A Friday on a week with a 17:00 pickup on the daycare days: then the chip.
    await db.days.clear()
    await updateSettings((s) => ({ ...s, week: { ...s.week, pickupTime: '17:00' } }))
    await ensureDayContext(DAY, await getSettings())
    const before = await factSheet(DAY, NOW)
    expect(factById(before, 'week.today')?.values).toMatchObject({ away: 0, daycare: 1, pickup: '17:00', bedtime: '20:00' })
    expect(dayGuard('After pickup, one short sitting.', before, DAY)).toBeNull()
    await setDayContext(DAY, { withHer: false })
    const away = await factSheet(DAY, NOW)
    const today = factById(away, 'week.today')
    expect(today?.values).toMatchObject({ away: 1, daycare: 0, pickup: null, bedtime: null })
    expect(today?.text).toContain('she is away today')
    expect(today?.text).not.toMatch(/pickup|bedtime/)
    expect(dayGuard('After pickup, one short sitting.', away, DAY)).toMatch(/pickup or daycare/)
    expect(dayGuard('Say hello to someone at the drop-off.', away, DAY)).not.toBeNull()
    // The chip taken back restores the day.
    await setDayContext(DAY, { withHer: true })
    expect(factById(await factSheet(DAY, NOW), 'week.today')?.values).toMatchObject({ away: 0, daycare: 1, pickup: '17:00' })
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

describe('a kept line, said as the record now stands', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })
  const checkIn = (block: 'morning' | 'evening', loneliness: number, hour: number) => {
    const ids = block === 'morning' ? ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'] : ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
    const answers = Object.fromEntries(ids.map((id) => [id, id === 'loneliness' ? loneliness : 3])) as never
    const at = new Date(2026, 8, 18, hour, 0).toISOString()
    return db.checkins.add({ day: DAY, block, asked: ids, answers, startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000 })
  }

  it('keeps the same row, so its tap stays filed, and says the reading as it now is', async () => {
    await checkIn('morning', 5, 7)
    await chooseAndLog(DAY, new Date(2026, 8, 18, 8, 0))
    const first = await todaysLine(DAY)
    expect(first?.situationId).toBe('loneliness-high')
    expect(first?.text).toContain('“Cut off”')
    await checkIn('evening', 4, 19)
    await chooseAndLog(DAY, new Date(2026, 8, 18, 20, 0))
    const later = await todaysLine(DAY)
    expect(later?.key).toBe(first?.key)
    expect(later?.text).toContain('“Lonely”')
    expect(later?.text).not.toContain('Cut off')
    expect(await db.briefLog.count()).toBe(1)
  })

  it('leaves a line alone once it was answered: the tap belongs to the words it was given for', async () => {
    await checkIn('morning', 5, 7)
    await chooseAndLog(DAY, new Date(2026, 8, 18, 8, 0))
    const first = await todaysLine(DAY)
    await recordFeedback(DAY, first!, 'useful', new Date(2026, 8, 18, 8, 5))
    await checkIn('evening', 4, 19)
    await chooseAndLog(DAY, new Date(2026, 8, 18, 20, 0))
    expect((await todaysLine(DAY))?.text).toBe(first?.text)
  })
})

describe('what the sheet learned to carry', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('carries tomorrow’s shape from the week in Settings, writes no day record for it, and carries the private-names setting', async () => {
    const sheet = await factSheet(DAY, NOW)
    const tomorrow = factById(sheet, 'week.tomorrow')
    expect(tomorrow?.values).toMatchObject({ day: '2026-09-19', weekday: 'Saturday' })
    expect(tomorrow?.text).toMatch(/^Tomorrow is Saturday; /)
    expect(await db.days.get('2026-09-19')).toBeUndefined()
    expect(sheet.showPrivate).toBe(false)
  })

  it('carries the engine’s ranked shortlist and the time of each check-in completed today (Part 28)', async () => {
    await addAim('certification', null, 'French', 'language')
    const before = await factSheet(DAY, NOW)
    expect(before.checkedIn).toEqual({})
    expect(before.shortlist?.length).toBeGreaterThan(0)
    expect(before.shortlist?.[0]).toMatchObject({ situationId: expect.any(String), mode: expect.any(String), factIds: expect.any(Array) })
    const done = '2026-09-18T11:40:00.000Z'
    await db.checkins.add({ day: DAY, block: 'morning', asked: ['mood'], answers: { mood: 3 }, startedAt: done, completedAt: done, updatedAt: done, activeMs: 30_000 })
    const after = await factSheet(DAY, NOW)
    expect(after.checkedIn).toEqual({ morning: done })
    // A new completion is a change of the sheet, so the row is written again for the Worker.
    expect(await writeFactsRow(DAY, NOW)).toBe(true)
    expect((await db.facts.get(DAY))?.sheet.checkedIn).toEqual({ morning: done })
  })

  it('counts days into the last four rolling weeks, oldest first, and nothing outside them', () => {
    expect(weekBuckets(['2026-09-18', '2026-09-12', '2026-09-11', '2026-08-25', '2026-08-21', '2026-08-01', '2026-09-19'], DAY)).toEqual([1, 0, 1, 2])
  })

  it('counts two workouts on one day as one workout day, and each session as its own (Part 35)', async () => {
    await db.outside.bulkPut([
      { id: 'w1', day: '2026-09-17', minutes: 40, at: '2026-09-17T11:00:00.000Z', source: 'workout' },
      { id: 'w2', day: '2026-09-17', minutes: 15, at: '2026-09-17T22:00:00.000Z', source: 'workout' },
      { id: 'w3', day: '2026-09-15', minutes: null, at: '2026-09-15T11:00:00.000Z', source: 'workout' },
      { id: 'w4', day: '2026-09-01', minutes: 30, at: '2026-09-01T11:00:00.000Z', source: 'workout' },
    ])
    const f = factById(await factSheet(DAY, NOW), 'outside.7d')
    expect(f?.values.days).toBe(2)
    expect(f?.values.sessions).toBe(3)
    expect(f?.text).toBe('Workout days in the last seven: 2 (2026-09-15, 2026-09-17); 3 sessions.')
  })

  it('carries last week’s one change and what the record shows since, so the review can close its loop (Part 36)', async () => {
    await addAim('certification', null, 'French', 'language')
    const [aim] = await studyAims()
    await db.brainBriefs.put({ id: '2026-09-13:review', day: '2026-09-13', kind: 'review', text: 'H D C', mode: 'strategy', factIds: [`aim.${aim.id}`], cardIds: [], model: 'claude-opus-5-5', at: '2026-09-13T09:00:00.000Z', parts: { held: 'H', didNot: 'D', change: 'Pin French to after her bedtime.' }, writer: 'claude' })
    await planAim(aim, 'afterBedtime', '20:00', NOW, 'French · Ten words · hear or read it')
    const f = factById(await factSheet(DAY, NOW), 'review.change')
    expect(f?.text).toBe('The last review, on 2026-09-13, proposed one change: “Pin French to after her bedtime.” Since then the record shows, for French, 1 plans made, 0 of them past their day with no step started, 0 steps started, 0 marked done, and the ladder moved 0 times.')
    expect(f?.values).toMatchObject({ day: '2026-09-13', aimId: aim.id, planned: 1 })
    // A change about no commitment: what the record shows in general since.
    await db.brainBriefs.put({ id: '2026-09-14:review', day: '2026-09-14', kind: 'review', text: 'H D C', mode: 'strategy', factIds: ['record'], cardIds: [], model: 'claude-opus-5-5', at: '2026-09-14T09:00:00.000Z', parts: { held: 'H', didNot: 'D', change: 'One small move a day.' }, writer: 'claude' })
    expect(factById(await factSheet(DAY, NOW), 'review.change')?.text).toBe('The last review, on 2026-09-14, proposed one change: “One small move a day.” Since then 0 check-ins were completed and 0 moves marked done.')
    // Words that end without a stop get one, after the quote.
    await db.brainBriefs.put({ id: '2026-09-15:review', day: '2026-09-15', kind: 'review', text: 'H D C', mode: 'strategy', factIds: ['record'], cardIds: [], model: 'claude-opus-5-5', at: '2026-09-15T09:00:00.000Z', parts: { held: 'H', didNot: 'D', change: 'Keep the cue that holds' }, writer: 'claude' })
    expect(factById(await factSheet(DAY, NOW), 'review.change')?.text).toMatch(/proposed one change: “Keep the cue that holds”. Since then/)
  })

  it('carries the last session as the other app kept it, and no comparison until one can be made (Part 35)', async () => {
    await db.outside.bulkPut([
      { id: 'w1', day: '2026-09-16', minutes: 40, at: new Date(2026, 8, 16, 18, 30).toISOString(), source: 'workout', title: 'Push + arms', workingSets: 12, effort: 'too-hard', energyAfter: 4, avgRir: 1.5 },
      { id: 'w2', day: '2026-09-17', minutes: 30, at: new Date(2026, 8, 17, 7, 10).toISOString(), source: 'workout', title: 'Lower body', workingSets: 9, endedEarly: true },
    ])
    const sheet = await factSheet(DAY, NOW)
    const last = factById(sheet, 'workout.last')
    expect(last?.text).toBe('The last workout: Thursday morning (2026-09-17), Lower body, 30 min, 9 working sets, ended early.')
    expect(last?.values).toMatchObject({ block: 'morning', hard: 0, endedEarly: 1, workingSets: 9 })
    // No evening logged: nothing to set a hard session or an evening one against yet.
    expect(factById(sheet, 'assoc.hardWorkout')).toBeUndefined()
    expect(factById(sheet, 'assoc.eveningWorkout')).toBeUndefined()
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

  it('titles the line by when it is meant to be acted on, from its action alone (owner, 2026-09-23)', async () => {
    await addAim('certification', null, 'French', 'language')
    const at = (h: number, m = 0) => new Date(2026, 8, 18, h, m)
    const timing = async (action: LineAction | null, now: Date) => lineTiming(action, await lineActionState(DAY, action, now), now)
    const plan: LineAction = { kind: 'plan', aimId: 1, cue: 'afterBedtime' }
    const test: LineAction = { kind: 'test', moveId: 'walk-ten' }
    const depth: LineAction = { kind: 'depth', value: 'short' }
    // A line with no action has no time of its own.
    expect(await timing(null, NOW)).toBe('forToday')
    // A step pinned to her bedtime is later today, before the plan is made and after it, until its moment.
    expect(await timing(plan, NOW)).toBe('laterToday')
    expect(await applyLineAction(DAY, plan, NOW)).toBe(true)
    expect(await lineActionState(DAY, plan, NOW)).toEqual({ state: 'done', time: '20:00' })
    expect(await timing(plan, at(19, 59))).toBe('laterToday')
    expect(await timing(plan, at(20, 0))).toBe('forToday')
    // In the small hours the day being logged is yesterday's, so nothing is later today.
    expect(lineTiming(plan, { state: 'done', time: '20:00' }, new Date(2026, 8, 19, 1, 0))).toBe('forToday')
    // A cue whose moment passed before any plan, and a commitment no longer there, are for today.
    await db.intentions.clear()
    expect(await timing(plan, at(21))).toBe('forToday')
    expect(await timing({ kind: 'plan', aimId: 9, cue: 'afterBedtime' }, NOW)).toBe('forToday')
    // A tap that does it on the spot is now while it is open, and for today once taken or gone.
    expect(await timing(test, NOW)).toBe('now')
    expect(await applyLineAction(DAY, test, NOW)).toBe(true)
    expect(await timing(test, NOW)).toBe('forToday')
    expect(await timing({ kind: 'test', moveId: 'no-such-move' }, NOW)).toBe('forToday')
    expect(await timing(depth, NOW)).toBe('now')
    expect(await applyLineAction(DAY, depth, NOW)).toBe(true)
    expect(await timing(depth, NOW)).toBe('forToday')
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

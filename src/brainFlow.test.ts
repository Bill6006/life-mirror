import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAim, addSkill, planAim, studyAims } from './aimFlow'
import { brainStatus, chooseAndLog, factSheet, feedbackFor, recordFeedback, todaysLine, writeFactsRow } from './brainFlow'
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
    expect(await db.briefLog.count()).toBe(1)
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

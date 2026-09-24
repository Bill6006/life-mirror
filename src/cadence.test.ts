import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeAims, addAim, addLearning, logSession, pauseAim, setRhythm, setSchedule, studyAims } from './aimFlow'
import { stepFor } from './aims'
import { factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings, type Aim } from './db'
import { factById, type Fact, type FactSheet } from './facts'
import { rankLines } from './situations'

// Workstream 6, Part 39: the sheet says each commitment's rhythm or fixed days and what they make of
// today; a paused one says nothing; the phone's own lines never nudge a rest day, a week whose
// sessions are in, or a faith practice (Rule 10).

const DAY = '2026-09-24'
const NOW = new Date(2026, 8, 24, 9, 0)

async function learning(): Promise<Aim> {
  const [aim] = await studyAims()
  return aim
}

describe('rhythm on the sheet', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('says a rest day, a due day and a met week in counts, and fixed days with the next one', async () => {
    await addLearning('Learn a handstand', 'Wall drills', 'Hold against the wall', '', new Date(2026, 8, 20, 9, 0))
    const aim = await learning()
    const id = aim.id as number
    await setRhythm(id, { perWeek: 3, restDays: 1 })
    await logSession(aim, stepFor(aim, await db.skills.toArray(), []), new Date(2026, 8, 23, 18, 0))
    let f = factById(await factSheet(DAY, NOW), `aim.${id}`)
    expect(f?.values).toMatchObject({ due: 'resting', perWeek: 3, restDays: 1, fixed: null, faith: 0 })
    expect(f?.text).toContain('rhythm 3 a week with 1 rest day between, 1 practice day in the seven before today, so today is a rest day')
    await setRhythm(id, { perWeek: 3, restDays: 0 })
    f = factById(await factSheet(DAY, NOW), `aim.${id}`)
    expect(f?.values.due).toBe('due')
    expect(f?.text).toContain('so it is due today')
    await setRhythm(id, { perWeek: 1, restDays: 0 })
    expect(factById(await factSheet(DAY, NOW), `aim.${id}`)?.text).toContain('so this week’s are in')
    // Fixed days alone decide once set; 2026-09-24 is a Thursday.
    await setSchedule(id, [1, 3])
    f = factById(await factSheet(DAY, NOW), `aim.${id}`)
    expect(f?.values).toMatchObject({ due: 'notDue', fixed: 'Mon, Wed' })
    expect(f?.text).toContain('fixed days Mon, Wed, next on Mon')
  })

  it('leaves a paused commitment off the sheet, and its weeks are never read as fading', async () => {
    await addLearning('Learn a language', '', 'Understand what is said')
    const aim = await learning()
    await pauseAim(aim.id as number, true)
    const sheet = await factSheet(DAY, NOW)
    expect(factById(sheet, `aim.${aim.id}`)).toBeUndefined()
    expect(factById(sheet, `trajectory.${aim.id}`)).toBeUndefined()
  })

  it('never counts a faith practice by the days between, and no line nudges it', async () => {
    await addAim('practice', 'five-minutes-prayer')
    const aim = (await activeAims()).find((a) => a.kind === 'practice') as Aim
    await setRhythm(aim.id as number, { perWeek: 7, restDays: 0 })
    const sheet = await factSheet(DAY, NOW)
    const f = factById(sheet, `aim.${aim.id}`) as Fact
    expect(f.values).toMatchObject({ faith: 1, due: 'open' })
    expect(f.text).not.toMatch(/rhythm|due today|no rhythm set/)
    // A week-old gap would call for a nudge on anything else; on a faith practice there is none.
    const stale: FactSheet = { ...sheet, facts: sheet.facts.map((x) => (x.id === f.id ? { ...x, values: { ...x.values, gapDays: 9 } } : x)) }
    expect(rankLines(stale, [], []).filter((c) => c.factIds.includes(f.id)).map((c) => c.situationId)).toEqual([])
    // The same gap on a practice that is not faith does bring a nudge, so the silence above is the rule, not an accident.
    const plain: FactSheet = { ...stale, facts: stale.facts.map((x) => (x.id === f.id ? { ...x, values: { ...x.values, faith: 0 } } : x)) }
    expect(rankLines(plain, [], []).filter((c) => c.factIds.includes(f.id)).length).toBeGreaterThan(0)
  })

  it('never nudges a commitment on its rest day or once its week is in', async () => {
    await addLearning('Learn a language', '', 'Understand what is said')
    const aim = await learning()
    const sheet = await factSheet(DAY, NOW)
    const f = factById(sheet, `aim.${aim.id}`) as Fact
    const withDue = (due: string) => ({ ...sheet, facts: sheet.facts.map((x) => (x.id === f.id ? { ...x, values: { ...x.values, due, gapDays: 9 } } : x)) })
    const nudges = (s: FactSheet) => rankLines(s, [], []).filter((c) => c.factIds.includes(f.id) && ['say-when', 'step-stalled', 'fresh-start'].includes(c.situationId)).map((c) => c.situationId)
    expect(nudges(withDue('open')).length).toBeGreaterThan(0)
    expect(nudges(withDue('resting'))).toEqual([])
    expect(nudges(withDue('notDue'))).toEqual([])
  })
})

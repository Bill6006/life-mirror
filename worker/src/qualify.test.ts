import { describe, expect, it } from 'vitest'
import { taskIdOf } from './claude'
import { qualifyReport, reportText, runQualify, windowOf } from './qualify'
import { addDays } from './time'
import { BRAIN_APP, memoryStore, type BriefRow, type SpotRow, type TaskRow } from './turso'

// The clean window's qualification report (2026-10-02): the ten-day check's own rule read over the window,
// written once at its time and sent to the phone. Every value here is made up.

const TZ = 'America/New_York'
const WIN = { QUALIFY_FROM: '2026-10-03', QUALIFY_TO: '2026-10-12', QUALIFY_REPORT_AT: '2026-10-13T20:07' }
const env = { TIMEZONE: TZ, COACH_LAUNCH: '2026-09-23', ...WIN }
/** New York local times (UTC−4). */
const at = (hhmm: string, day: string) => new Date(Date.parse(`${day}T${hhmm}:00Z`) + 4 * 3_600_000)

const task = (day: string): TaskRow => ({ id: taskIdOf('line', day), kind: 'task', task: 'line', day, at: `${day}T11:45:00.000Z`, firedAt: `${day}T11:45:00.000Z`, status: 'written', trigger: 'checkin', factsDay: day, askedModel: 'opus', fires: 1, contextCalls: 0, contextBytes: 0, posts: 1, refusals: [] })
const line = (day: string, writer: 'claude' | 'free' = 'claude', hh = '09:48'): BriefRow => ({ id: `${day}:brief`, day, kind: 'brief', text: 'a private line', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at(hh, day).toISOString(), factsDay: day, writer })
const review = (day: string): BriefRow => ({ ...line(day), id: `${day}:review`, kind: 'review' })
const spot = (day: string, clean = true): SpotRow => ({ id: `spot:${day}`, kind: 'spotcheck', day, at: `${day}T19:00:00.000Z`, runs: 5, clean })
const sunday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === 0

/** Every day from the launch's next to the window's last, fired on schedule with its line; Sundays with their review. */
function record(free: readonly string[] = [], missing: readonly string[] = [], last = '2026-10-12') {
  const tasks: TaskRow[] = []
  const lines: BriefRow[] = []
  for (let day = '2026-09-24'; day <= last; day = addDays(day, 1)) {
    tasks.push(task(day))
    if (!missing.includes(day)) lines.push(line(day, free.includes(day) ? 'free' : 'claude'))
    if (sunday(day)) lines.push(review(day))
  }
  return { tasks, lines }
}
const REPORT_TIME = at('20:07', '2026-10-13')

describe('the window and its report time', () => {
  it('reads the window from the settings, and none when it is unset or does not read as one', () => {
    expect(windowOf(WIN)).toEqual({ from: '2026-10-03', to: '2026-10-12', reportDay: '2026-10-13', reportMinutes: 20 * 60 + 7 })
    expect(windowOf({})).toBeNull()
    expect(windowOf({ ...WIN, QUALIFY_REPORT_AT: '2026-10-12T20:07' })).toBeNull()
    expect(windowOf({ ...WIN, QUALIFY_FROM: '2026-10-13' })).toBeNull()
    expect(windowOf({ ...WIN, QUALIFY_TO: '12 October' })).toBeNull()
  })
})

describe('the qualification report', () => {
  it('is met when the window’s ten days are clean, Claude wrote seven or more, and the run logs were checked clean since the count began', () => {
    const r = record(['2026-09-30', '2026-10-05', '2026-10-09'])
    const report = qualifyReport([...r.tasks, spot('2026-10-01')], r.lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23')
    expect(report).toMatchObject({ id: 'qualify:2026-10-03:2026-10-12', met: true, reasons: [], claudeDays: 8, spotcheck: { day: '2026-10-01', runs: 5, clean: true }, watch: { on: true, failures: [] } })
    expect(report.days.map((d) => d.day)).toEqual(Array.from({ length: 10 }, (_, k) => addDays('2026-10-03', k)))
    // A day before the window, Claude's or not, changes nothing.
    expect(qualifyReport([...record(['2026-09-29', '2026-09-30']).tasks, spot('2026-10-01')], record(['2026-09-29', '2026-09-30']).lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23').met).toBe(true)
  })

  it('is not met by a day with no line stored, and says which day; failures before the window are not its own', () => {
    const r = record([], ['2026-09-30', '2026-10-07'])
    const report = qualifyReport([...r.tasks, spot('2026-10-01')], r.lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23')
    expect(report.met).toBe(false)
    expect(report.reasons[0]).toMatch(/^2026-10-07: no line stored/)
    expect(report.days.find((d) => d.day === '2026-10-07')?.problems).toEqual(['no line stored'])
    expect(report.watch.failures.map((f) => f.day)).toEqual(['2026-10-07'])
  })

  it('is not met with Claude’s own line on six of the ten days', () => {
    const r = record(['2026-10-03', '2026-10-04', '2026-10-08', '2026-10-11'])
    const report = qualifyReport([...r.tasks, spot('2026-10-01')], r.lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23')
    expect(report.met).toBe(false)
    expect(report.claudeDays).toBe(6)
    expect(report.reasons.join(' | ')).toMatch(/on 6 of the 10 days; 7 are needed/)
  })

  it('is not met when the latest run-log check found a key, or came before the count began', () => {
    const r = record()
    expect(qualifyReport([...r.tasks, spot('2026-10-10', false)], r.lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23').met).toBe(false)
    // A failure on 2026-10-02 restarts the count on 2026-10-03; a check made on 2026-10-01 is then too early.
    const broken = record([], ['2026-10-02'])
    const report = qualifyReport([...broken.tasks, spot('2026-10-01')], broken.lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23')
    expect(report.met).toBe(false)
    expect(report.reasons.join(' | ')).toMatch(/came before the current count began on 2026-10-03/)
  })

  it('tells the phone counts, days and the check’s own reasons, never a word of the record', () => {
    const r = record(['2026-10-05'])
    const met = qualifyReport([...r.tasks, spot('2026-10-01')], r.lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23')
    expect(reportText(met)).toBe('The clean ten days, Oct 3 to Oct 12: the reliability check is met. Claude wrote 9 of the 10 lines, no day broke a rule, and the latest run-log check (Oct 1) was clean.')
    const not = qualifyReport([...record([], ['2026-10-07']).tasks, spot('2026-10-01')], record([], ['2026-10-07']).lines, TZ, { from: '2026-10-03', to: '2026-10-12' }, REPORT_TIME, '2026-09-23')
    expect(reportText(not)).toMatch(/^The clean ten days, Oct 3 to Oct 12: the reliability check is not met\. 2026-10-07: no line stored/)
    expect(JSON.stringify([met, not])).not.toContain('a private line')
  })
})

describe('the report’s turn in the Worker’s schedule', () => {
  async function seeded() {
    const store = memoryStore()
    const r = record(['2026-10-05'])
    for (const t of r.tasks) await store.writeTask(t)
    await store.writeSpot(spot('2026-10-01'))
    for (const l of r.lines) store.put({ app: BRAIN_APP, store: 'briefs', id: l.id, day: l.day, body: JSON.stringify(l), updated_at: l.at, deleted: 0, synced_at: l.at })
    return store
  }

  it('does nothing before its moment; then writes the report once, tells the phone once, and never reads the window anew', async () => {
    const store = await seeded()
    const sent: string[] = []
    const send = async (p: string) => (sent.push(p), true)
    expect(await runQualify(env, store, at('20:00', '2026-10-13'), send)).toEqual({ reason: 'not yet' })
    expect(await store.readReport('qualify:2026-10-03:2026-10-12')).toBeNull()
    const first = await runQualify(env, store, at('20:15', '2026-10-13'), send)
    expect(first.reason).toBe('reported')
    expect(first.report).toMatchObject({ met: true, claudeDays: 9, pushed: true })
    expect(sent.map((p) => JSON.parse(p))).toEqual([{ kind: 'report', body: reportText(first.report!) }])
    // Later rows change nothing already reported, and nothing is sent twice.
    await store.writeTask({ ...task('2026-10-13'), fires: 2 })
    expect((await runQualify(env, store, at('20:30', '2026-10-13'), send)).reason).toBe('done')
    expect((await store.readReport('qualify:2026-10-03:2026-10-12'))?.at).toBe(first.report?.at)
    expect(sent).toHaveLength(1)
  })

  it('tries the phone again on later ticks of the report day, and only then', async () => {
    const store = await seeded()
    let up = false
    const tries: string[] = []
    const send = async (p: string) => (tries.push(p), up)
    expect((await runQualify(env, store, at('20:15', '2026-10-13'), send)).reason).toBe('reported; the phone was not reached')
    const kept = await store.readReport('qualify:2026-10-03:2026-10-12')
    expect(kept?.pushed).toBeUndefined()
    up = true
    expect((await runQualify(env, store, at('20:30', '2026-10-13'), send)).reason).toBe('reported')
    expect((await store.readReport('qualify:2026-10-03:2026-10-12'))?.at).toBe(kept?.at)
    expect(tries).toHaveLength(2)
    // A report the phone never heard about is not pushed again the day after.
    const other = await seeded()
    expect((await runQualify(env, other, at('20:15', '2026-10-13'), async () => false)).reason).toBe('reported; the phone was not reached')
    expect((await runQualify(env, other, at('08:00', '2026-10-14'), send)).reason).toBe('done')
    expect(tries).toHaveLength(2)
  })

  it('does nothing without a window, and writes without a phone to tell', async () => {
    const store = await seeded()
    expect(await runQualify({ TIMEZONE: TZ }, store, REPORT_TIME, null)).toEqual({ reason: 'no window set' })
    expect((await runQualify(env, store, at('20:15', '2026-10-13'), null)).reason).toBe('reported; the phone was not reached')
    expect(await store.readReport('qualify:2026-10-03:2026-10-12')).not.toBeNull()
  })
})

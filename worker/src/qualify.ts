import { taskIdOf } from './claude'
import { coachGate, coachWatch, GATE_DAYS, readDay, type Failure, type GateDay } from './coach'
import type { Env } from './env'
import { addDays, localTime, minutesOf } from './time'
import type { DayLine, DayTask, SpotRow, Store } from './turso'

// The clean window's qualification report (2026-10-02). The owner set ten clean days for Pass 1B, read
// once at their end. The Worker writes the report itself, from the bridge's own rows, at the report
// time, keeps it in the cloud and announces it on the phone, so nothing waits on any other computer
// being on. It reads the window by the ten-day check's own rule (coachGate), unchanged: it adds no rule,
// changes nothing it reads, and decides nothing; activating Pass 1B stays the owner's word.

/** The window and the moment its report is due, in the owner's local time. */
export interface QualifyWindow {
  from: string
  to: string
  reportDay: string
  reportMinutes: number
}

/** The window from the Worker's settings; null when none is set, or when it does not read as one. */
export function windowOf(env: Pick<Env, 'QUALIFY_FROM' | 'QUALIFY_TO' | 'QUALIFY_REPORT_AT'>): QualifyWindow | null {
  const day = /^\d{4}-\d{2}-\d{2}$/
  const at = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(env.QUALIFY_REPORT_AT ?? '')
  const from = env.QUALIFY_FROM ?? ''
  const to = env.QUALIFY_TO ?? ''
  if (!day.test(from) || !day.test(to) || !at || from > to || at[1] <= to) return null
  return { from, to, reportDay: at[1], reportMinutes: minutesOf(at[2]) }
}

export interface QualifyReport {
  id: string
  kind: 'qualify'
  from: string
  to: string
  /** When it was written. */
  at: string
  /** The ten-day check read the day after the window, its ten days exactly the window's. */
  met: boolean
  /** Why not, in the check's own words; none when met. */
  reasons: string[]
  /** Each day of the window as the check reads it. */
  days: GateDay[]
  claudeDays: number
  /** The latest spot-check of the run logs the check counted. */
  spotcheck: { day: string; runs: number; clean: boolean } | null
  /** The coach's watch at the report: on or off, and each failure it found inside the window. */
  watch: { on: boolean; failures: Failure[] }
  /** Whether the phone was reached. */
  pushed?: boolean
}

/** The report for a window, from the bridge's rows and the stored lines, as the check reads them `now`. */
export function qualifyReport(rows: readonly (DayTask | SpotRow)[], lines: readonly DayLine[], tz: string, win: Pick<QualifyWindow, 'from' | 'to'>, now: Date, launch?: string | null): QualifyReport {
  const tasks = new Map<string, DayTask>()
  for (const r of rows) if (r.kind === 'task') tasks.set(r.id, r as DayTask)
  const byId = new Map(lines.map((l) => [l.id, l]))
  const days: GateDay[] = []
  for (let d = win.from; d <= win.to; d = addDays(d, 1)) days.push(readDay(d, tasks.get(taskIdOf('line', d)), byId.get(`${d}:brief`), byId.has(`${d}:review`), tz, true))
  const gate = coachGate(rows, lines, addDays(win.to, 1), tz)
  const exact = days.length === GATE_DAYS && gate.window.length === GATE_DAYS && gate.window[0] === win.to && gate.window[GATE_DAYS - 1] === win.from
  const met = gate.met && exact
  const reasons = met ? [] : [...(days.length === GATE_DAYS ? [] : [`the window holds ${days.length} days, not ${GATE_DAYS}`]), ...gate.reasons]
  const watch = coachWatch(rows, lines, now, tz, launch)
  return {
    id: `qualify:${win.from}:${win.to}`,
    kind: 'qualify',
    from: win.from,
    to: win.to,
    at: now.toISOString(),
    met,
    reasons,
    days,
    claudeDays: days.filter((d) => d.counted && d.claude).length,
    spotcheck: gate.spotcheck ? { day: gate.spotcheck.day, runs: gate.spotcheck.runs, clean: gate.spotcheck.clean } : null,
    watch: { on: watch.on, failures: watch.failures.filter((f) => f.day >= win.from && f.day <= win.to) },
  }
}

const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** What the phone shows: counts, days and the check's own reasons; never a word of the record. */
export function reportText(r: QualifyReport): string {
  const span = `${shortDay(r.from)} to ${shortDay(r.to)}`
  if (r.met) return `The clean ten days, ${span}: the reliability check is met. Claude wrote ${r.claudeDays} of the ${GATE_DAYS} lines, no day broke a rule, and the latest run-log check${r.spotcheck ? ` (${shortDay(r.spotcheck.day)})` : ''} was clean.`
  return `The clean ten days, ${span}: the reliability check is not met. ${r.reasons[0] ?? ''}`.trim()
}

export type Sender = (payload: string) => Promise<boolean>

/**
 * The report's turn, every tick: nothing before its moment; then, once, the report is written to the
 * cloud and the phone is told. A push that does not reach the phone is tried again on later ticks of
 * that day; the report itself is never written twice, so a later tick never reads the window anew.
 */
export async function runQualify(env: Pick<Env, 'TIMEZONE' | 'COACH_LAUNCH' | 'QUALIFY_FROM' | 'QUALIFY_TO' | 'QUALIFY_REPORT_AT'>, store: Store, now: Date, send: Sender | null): Promise<{ reason: string; report?: QualifyReport }> {
  const win = windowOf(env)
  if (!win) return { reason: 'no window set' }
  const local = localTime(now, env.TIMEZONE)
  if (local.day < win.reportDay || (local.day === win.reportDay && local.hour * 60 + local.minute < win.reportMinutes)) return { reason: 'not yet' }
  const id = `qualify:${win.from}:${win.to}`
  let report = await store.readReport(id)
  if (report?.pushed || (report && local.day > win.reportDay)) return { reason: 'done', report }
  if (!report) {
    const launch = env.COACH_LAUNCH ?? null
    const reach = addDays(win.from, -45)
    const { rows, lines } = await store.readWatchRows(launch && launch < reach ? launch : reach)
    report = qualifyReport(rows, lines, env.TIMEZONE, win, now, launch)
    await store.writeReport(report)
  }
  const pushed = send ? await send(JSON.stringify({ kind: 'report', body: reportText(report) })).catch(() => false) : false
  if (pushed) await store.writeReport({ ...report, pushed: true })
  return { reason: pushed ? 'reported' : 'reported; the phone was not reached', report: { ...report, pushed } }
}

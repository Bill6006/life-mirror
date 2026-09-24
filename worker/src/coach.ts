import { coachCore } from './briefing'
import { claudeOn, fallbackReason, rowIdOf, startTask, taskIdOf, timeoutMinutes, type ClaudeEnv } from './claude'
import { rowOf } from './coachCheck'
import type { Env } from './env'
import { addDays, localTime, minutesOf } from './time'
import type { DayLine, DayTask, SpotRow, Store } from './turso'

// The coach (Part 32): choosing and wording among the reps the app already found possible for the
// People row, never around them. Once a day, after the day's line, the Worker fires the owner's
// routine for the coach task; the run names one or two of the row's own candidates, each with one
// line of today's version, and the Worker refuses anything outside the set, any rating or verdict
// on a person, any reply, match or rejection as a measure, and anyone in person when nobody is
// around. With two the phone draws between them at even chances; the phone checks again at the tap
// and falls back to Part 24's pick. Switched on at its launch (the owner's word, 2026-09-23) and
// watched every day from the next: a day that breaks a safety or reliability condition, or a
// spot-check that finds a key in a run log, turns it off and takes back the day's pick, so the
// app's own pick stands until the clean window is re-established after the failure: ten
// consecutive scheduled clean days, Claude's own line on seven of them, and the latest spot-check
// clean. Without a launch day, that window alone switches it on, as it did at first.

// The reliability gate (Part 32): an engineering rollout threshold, not a research finding.

/** Consecutive scheduled days the gate needs, and on how many of them Claude's own line must be stored. */
export const GATE_DAYS = 10
export const GATE_CLAUDE_DAYS = 7
/** The local time a day's line must be stored by: the fallback hour, Claude's twenty minutes, a tick and the chain's own time (engineering judgment). */
export const LINE_DEADLINE = '13:00'
/** The owner's post-launch check (2026-09-24 to 2026-09-28): Claude's own line on three days in a row among the first five watched. */
export const LAUNCH_CHECK_DAYS = 5
export const LAUNCH_CHECK_RUN = 3
const WRONG_DAY = /does not hold|the sheet is for|does not know the shape/
/** How far back the gate reads, in days. */
const GATE_REACH = 40

const isSunday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === 0

export interface GateDay {
  day: string
  /** The Worker fired the day's line on its own schedule (a day run by hand is not counted). */
  counted: boolean
  /** The day's line is stored, and whether Claude wrote it. */
  stored: boolean
  claude: boolean
  /** Each safety condition this day broke, in words. */
  problems: string[]
}

export interface Gate {
  met: boolean
  /** Consecutive scheduled days back from yesterday with every safety condition held. */
  streak: number
  /** The ten days the gate reads, newest first, once the streak reaches ten. */
  window: string[]
  claudeDays: number
  spotcheck: SpotRow | null
  reasons: string[]
  days: GateDay[]
}

/**
 * One day's line as the gate and the watch both read it, the one rule for both. Whether the Worker
 * fired it on its own schedule (a day run by hand, or with no task, is not counted), whether a line
 * is stored and Claude wrote it, and each safety condition broken: fired more than once, no line
 * stored by the deadline or one stored after it, a line for another day, a wrong-day refusal left
 * unresolved, and on a Sunday no review. A past day is read whole; today, only what is settled.
 */
export function readDay(day: string, t: DayTask | undefined, line: DayLine | undefined, reviewed: boolean, tz: string, settled: boolean): GateDay {
  const problems: string[] = []
  if (t && (t.fires ?? 1) > 1) problems.push('fired more than once')
  if (!t || t.forced) return { day, counted: false, stored: Boolean(line), claude: line?.writer === 'claude', problems }
  if (line) {
    const at = localTime(new Date(line.at), tz)
    if (at.day > day || (at.day === day && at.hour * 60 + at.minute > minutesOf(LINE_DEADLINE))) problems.push(`the line came after ${LINE_DEADLINE}`)
    if (line.forDay && line.forDay !== day) problems.push('the line was written for another day')
  } else if (settled) {
    problems.push('no line stored')
    if ((t.refusals ?? []).some((r) => WRONG_DAY.test(r))) problems.push('a wrong-day refusal left unresolved')
  }
  if (settled && isSunday(day) && !reviewed) problems.push('no Sunday review stored')
  return { day, counted: true, stored: Boolean(line), claude: line?.writer === 'claude', problems }
}

/** The days as read from the rows, each read once; the spot-checks newest first. */
function reader(rows: readonly (DayTask | SpotRow)[], lines: readonly DayLine[], tz: string, today: string, settledToday: boolean) {
  const tasks = new Map<string, DayTask>()
  const spots: SpotRow[] = []
  for (const r of rows) {
    if (r.kind === 'spotcheck') spots.push(r as SpotRow)
    else if (r.kind === 'task') tasks.set(r.id, r as DayTask)
  }
  spots.sort((a, b) => (a.at < b.at ? 1 : -1))
  const byId = new Map(lines.map((b) => [b.id, b]))
  const seen = new Map<string, GateDay>()
  const read = (day: string): GateDay => {
    let d = seen.get(day)
    if (!d) {
      d = readDay(day, tasks.get(taskIdOf('line', day)), byId.get(`${day}:brief`), byId.has(`${day}:review`), tz, day < today || settledToday)
      seen.set(day, d)
    }
    return d
  }
  return { read, spots }
}

/** The ten-day check as it stood on `today`: back from the day before, with the spot-checks made by then, newest first. */
function gateOf(read: (day: string) => GateDay, spots: readonly SpotRow[], today: string): Gate {
  const days: GateDay[] = []
  for (let k = 1; k <= GATE_REACH; k++) {
    const d = read(addDays(today, -k))
    days.push(d)
    if (!d.counted || d.problems.length) break
  }
  const safe = days.filter((d) => d.counted && d.problems.length === 0)
  const streak = safe.length
  const window = safe.slice(0, GATE_DAYS).map((d) => d.day)
  const claudeDays = safe.slice(0, GATE_DAYS).filter((d) => d.claude).length
  const since = safe[safe.length - 1]?.day
  const spot = spots[0] ?? null
  const reasons: string[] = []
  if (streak < GATE_DAYS) {
    const broke = days.find((d) => d.problems.length)
    reasons.push(broke ? `${broke.day}: ${broke.problems.join('; ')}; the count restarts after it` : `${streak} of ${GATE_DAYS} consecutive scheduled days so far`)
  }
  if (streak >= GATE_DAYS && claudeDays < GATE_CLAUDE_DAYS) reasons.push(`Claude's own line on ${claudeDays} of the ${GATE_DAYS} days; ${GATE_CLAUDE_DAYS} are needed`)
  if (!spot) reasons.push('no spot-check of the run logs recorded')
  else if (!spot.clean) reasons.push(`the latest spot-check, ${spot.day}, found a key in a run log; fix its cause and check again`)
  else if (since && spot.day < since) reasons.push(`the latest clean spot-check, ${spot.day}, came before the current count began on ${since}`)
  return { met: reasons.length === 0, streak, window, claudeDays, spotcheck: spot, reasons, days }
}

/**
 * The gate, computed from the bridge's own rows, never remembered: the ten-day reliability check.
 * Back from yesterday, each day the Worker fired on its own schedule is read for safety. The first
 * day that breaks a condition, or was not fired on schedule, ends the count, so a failed condition
 * restarts it. Met when ten such days run back from yesterday (ten days always hold a Sunday and a
 * Friday into Monday), Claude's own line is stored on at least seven of them, and the latest
 * spot-check of the run logs, made since the count began, found no key. Every stored line passed
 * its checks before it was stored.
 */
export function coachGate(rows: readonly (DayTask | SpotRow)[], lines: readonly DayLine[], today: string, tz: string): Gate {
  const { read, spots } = reader(rows, lines, tz, today, true)
  return gateOf(read, spots, today)
}

/** A failure the watch found: the day, and each condition broken. */
export interface Failure {
  day: string
  problems: string[]
}

export interface Watch {
  /** Whether the coach may run now. */
  on: boolean
  /** The day the coach switched on; null before one is set, when the ten-day check alone decides. */
  launch: string | null
  /** Every failure since launch, oldest first. */
  failures: Failure[]
  /** The day the clean window was re-established after the latest failure, once it was. */
  restored?: string
  /** Why the coach is off, in words; none while it is on. */
  reasons: string[]
  /** The ten-day reliability check as it stands today. */
  tenDays: Gate
}

/** Whether `xs` holds `n` trues in a row. */
function inARow(xs: readonly boolean[], n: number): boolean {
  let run = 0
  for (const x of xs) {
    run = x ? run + 1 : 0
    if (run >= n) return true
  }
  return false
}

/**
 * The coach's watch (the owner's word, 2026-09-23): the ten-day check turned from a gate before
 * launch into monitoring after it, computed every tick from the bridge's own rows. From the day
 * after launch, each day is read as the gate reads it, today as far as it is settled, and a
 * failure is any of: a day fired on schedule that broke a safety condition; a day fired twice;
 * Claude's own line on fewer than seven of the last ten scheduled days since the last failure; no
 * three days in a row of Claude's own line among the first five (the post-launch check of
 * 2026-09-24 to 2026-09-28); a spot-check that found a key. A day not fired on the Worker's
 * schedule, because nothing was there to write from or it was run by hand, is a gap: it is not a
 * failure, and the ten-day check does not count it. On from launch while nothing has failed and a
 * clean spot-check was made since launch; after a failure, off until the ten-day check is met with
 * all ten days after it, and on from that day until the next failure.
 */
export function coachWatch(rows: readonly (DayTask | SpotRow)[], lines: readonly DayLine[], now: Date, tz: string, launch?: string | null): Watch {
  const local = localTime(now, tz)
  const today = local.day
  const { read, spots } = reader(rows, lines, tz, today, local.hour * 60 + local.minute >= minutesOf(LINE_DEADLINE))
  const tenDays = gateOf(read, spots, today)
  if (!launch || today < launch) return { on: tenDays.met, launch: null, failures: [], reasons: tenDays.reasons, tenDays }

  const failures: Failure[] = []
  const checkEnd = addDays(launch, LAUNCH_CHECK_DAYS)
  const first: boolean[] = []
  let recent: boolean[] = []
  for (let day = launch; day <= today; day = addDays(day, 1)) {
    const problems: string[] = []
    if (day > launch) {
      const d = read(day)
      problems.push(...d.problems)
      if (d.counted && d.stored) {
        recent.push(d.claude)
        const last = recent.slice(-GATE_DAYS)
        const mine = last.filter(Boolean).length
        if (last.length - mine > GATE_DAYS - GATE_CLAUDE_DAYS) problems.push(`Claude’s own line on ${mine} of the last ${last.length} scheduled days; ${GATE_CLAUDE_DAYS} of every ${GATE_DAYS} are needed`)
        if (day <= checkEnd) first.push(d.claude)
      }
      if (day === checkEnd && (day < today || d.stored) && first.length >= LAUNCH_CHECK_RUN && !inARow(first, LAUNCH_CHECK_RUN)) problems.push(`Claude’s own line on no ${LAUNCH_CHECK_RUN} days in a row among the first ${LAUNCH_CHECK_DAYS} after launch`)
    }
    for (const s of spots) if (s.day === day && !s.clean) problems.push(`a spot-check of ${s.runs} run logs found a key`)
    if (problems.length) {
      failures.push({ day, problems })
      recent = []
    }
  }

  const last = failures[failures.length - 1]
  if (!last) {
    const checked = spots.some((s) => s.clean && s.day >= launch)
    return { on: checked, launch, failures, reasons: checked ? [] : ['no clean spot-check of the run logs since launch'], tenDays }
  }
  // Re-established on the first day since the failure whose ten-day check was met with all ten days after it; on from then until the next failure.
  for (let d = addDays(last.day, 1); d <= today; d = addDays(d, 1)) {
    const g = d === today ? tenDays : gateOf(read, spots.filter((s) => s.day <= d), d)
    if (g.met && (g.window[g.window.length - 1] ?? '') > last.day) return { on: true, launch, failures, restored: d, reasons: [], tenDays }
  }
  return { on: false, launch, failures, reasons: [`${last.day}: ${last.problems.join('; ')}`, 'off until ten clean scheduled days in a row after it, Claude’s own line on seven of them, and the latest spot-check of the run logs clean'], tenDays }
}

/** The watch as the Worker reads it now: the rows from launch, or from as far back as the ten-day check reaches, whichever is earlier. */
export async function watchNow(store: Store, now: Date, tz: string, launch?: string | null): Promise<Watch> {
  const reach = addDays(localTime(now, tz).day, -(GATE_REACH + 1))
  const { rows, lines } = await store.readWatchRows(launch && launch < reach ? launch : reach)
  return coachWatch(rows, lines, now, tz, launch)
}

/** Whether this month's check answered yes to safety or conduct: the app's own help is showing, and the coach defers to it on the Partner path. */
export async function helpShowing(store: Store, day: string): Promise<boolean> {
  const rows = await store.readRecords('monthlyChecks')
  return rows.some((r) => {
    const b = r.body as { month?: unknown; answers?: { safety?: unknown; conduct?: unknown } } | null
    return b?.month === day.slice(0, 7) && (b.answers?.safety === true || b.answers?.conduct === true)
  })
}

/**
 * The coach stands down for the day: a pick stored for today is taken back where the phone reads
 * it (the row stays on record, marked deleted, so the phone drops it), and a run still open is
 * closed, so its answer is refused. The app's own pick stands. True when a pick was taken back.
 */
export async function standDown(store: Store, day: string, now: Date, reason: string): Promise<boolean> {
  const at = now.toISOString()
  const [t, stored] = await Promise.all([store.readTask(taskIdOf('coach', day)), store.hasCoach(rowIdOf('coach', day))])
  const open = t !== null && (t.status === 'firing' || t.status === 'fired')
  if (stored) await store.withdrawCoach(rowIdOf('coach', day), at)
  if (t && (open || stored)) await store.writeTask({ ...t, ...(open ? { status: 'fallback' as const, fallbackReason: `${reason}; the app’s own pick stands` } : {}), ...(stored ? { withdrawn: { at, reason } } : {}) })
  return stored
}

export interface CoachResult {
  ran: boolean
  reason: string
  day?: string
  watch?: Pick<Watch, 'on' | 'launch' | 'reasons'>
  /** Today's pick was taken back where the phone reads it. */
  withdrawn?: boolean
}

export interface CoachOptions {
  /** By hand, with the run key: fire now, whatever the switch and the watch say. A pick stored while the watch has the coach off is taken back at the next tick. */
  force?: boolean
  /** By hand: the run is checked like any, and its pick is never stored where the phone reads it. */
  dry?: boolean
  fireFetcher?: typeof fetch
}

type CoachEnv = ClaudeEnv & Pick<Env, 'TIMEZONE' | 'FALLBACK_TIME' | 'COACH_WRITER' | 'COACH_LAUNCH'>

/**
 * The day's coach run, read every tick. Switched off, Claude off, or its watch finding a failure:
 * it does not run, and it stands down, taking back a pick stored for today. On the Partner path a
 * pick made before the monthly check's help showed gives way to it. Otherwise, today's coach block
 * built after the morning check-in, the day's line stored, and a row with something to choose: the
 * task is marked, then the routine fired. A task under way waits for its answer; a failure or the
 * time running out leaves Part 24's pick standing.
 */
export async function runCoach(env: CoachEnv, store: Store, now: Date, opts: CoachOptions = {}): Promise<CoachResult> {
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  if (!opts.force) {
    const off = env.COACH_WRITER !== 'on' ? 'the coach is off' : !claudeOn(env) ? 'Claude is off' : null
    const watch = off ? null : await watchNow(store, now, env.TIMEZONE, env.COACH_LAUNCH)
    if (off || !watch?.on) {
      const reason = off ?? 'the watch has the coach off'
      const withdrawn = await standDown(store, day, now, watch ? `${reason}: ${watch.reasons.join('; ')}` : reason)
      return { ran: false, reason, day, ...(watch ? { watch: { on: watch.on, launch: watch.launch, reasons: watch.reasons } } : {}), ...(withdrawn ? { withdrawn } : {}) }
    }
    const stored = await store.readCoach(rowIdOf('coach', day))
    if (stored?.path === 'partner' && (await helpShowing(store, day))) {
      const reason = 'the monthly check’s help is showing; the coach defers to it'
      return { ran: false, reason, day, withdrawn: await standDown(store, day, now, reason) }
    }
    const t = await store.readTask(taskIdOf('coach', day))
    if (t) {
      if (t.status === 'written' || t.status === 'fallback') return { ran: false, reason: 'done for today', day }
      const why = fallbackReason(t, now, timeoutMinutes(env))
      if (!why) return { ran: false, reason: 'waiting for Claude', day }
      await store.writeTask({ ...t, status: 'fallback', fallbackReason: `${why}; the app’s own pick stands` })
      return { ran: false, reason: why, day }
    }
  }
  const facts = await store.readFacts(day)
  if (!facts?.coach) return { ran: false, reason: 'no coach block for today yet', day }
  const core = coachCore(facts.coach)
  if (core.day !== day) return { ran: false, reason: 'the coach block is for another day', day }
  const morning = facts.sheet.checkedIn?.morning
  const afterCheckIn = Boolean(morning && Date.parse(facts.sheet.builtAt) >= Date.parse(morning))
  if (!opts.force && !afterCheckIn && local.hour * 60 + local.minute < minutesOf(env.FALLBACK_TIME ?? '11:00')) return { ran: false, reason: 'waiting for the morning check-in', day }
  if (!opts.force && !(await store.hasBrief(`${day}:brief`))) return { ran: false, reason: 'waiting for the day’s line', day }
  const row = rowOf(core)
  if (!row || !row.candidates.length) return { ran: false, reason: 'nothing for the coach to choose', day }
  if (row.path === 'partner' && (await helpShowing(store, day))) return { ran: false, reason: 'the monthly check’s help is showing; the coach defers to it', day }
  const t = await startTask(env, store, now, 'coach', day, opts.force ? 'forced' : 'checkin', day, Boolean(opts.force), opts.fireFetcher, opts.dry ? { dry: true } : {})
  if (t.status !== 'fired') {
    await store.writeTask({ ...t, fallbackReason: `${t.fallbackReason ?? 'the fire failed'}; the app’s own pick stands` })
    return { ran: false, reason: t.fallbackReason ?? 'the fire failed', day }
  }
  return { ran: true, reason: 'Claude is coaching', day }
}

/** Where today stands for the coach, for the report: the phone's coach block and the row it may choose for, the day's coach task, and the pick stored. Ids and counts, never words. */
export async function coachToday(store: Store, day: string) {
  const [facts, t, stored] = await Promise.all([store.readFacts(day), store.readTask(taskIdOf('coach', day)), store.readCoach(rowIdOf('coach', day))])
  const row = facts?.coach ? rowOf(coachCore(facts.coach)) : null
  return {
    day,
    coachBlock: Boolean(facts?.coach),
    row: row ? { path: row.path, candidates: row.candidates.length } : null,
    task: t ? { status: t.status, forced: t.forced === true, dry: t.dry === true, fallbackReason: t.fallbackReason ?? null, withdrawn: t.withdrawn ?? null } : null,
    pick: stored ? { path: stored.path, reps: stored.ids.length, model: stored.model } : null,
  }
}

/** Records a spot-check of the run logs for the bridge key (Part 32), by the run key. */
export async function recordSpot(store: Store, now: Date, tz: string, runs: number, clean: boolean): Promise<SpotRow> {
  const at = now.toISOString()
  const row: SpotRow = { id: `spot:${at}`, kind: 'spotcheck', day: localTime(now, tz).day, at, runs, clean }
  await store.writeSpot(row)
  return row
}

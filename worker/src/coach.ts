import { coachCore } from './briefing'
import { claudeOn, fallbackReason, startTask, taskIdOf, timeoutMinutes, type ClaudeEnv } from './claude'
import { rowOf } from './coachCheck'
import type { Env } from './env'
import { addDays, localTime, minutesOf } from './time'
import type { BriefRow, SpotRow, Store, TaskRow } from './turso'

// The coach (Part 32): choosing and wording among the reps the app already found possible for the
// People row, never around them. Once a day, after the day's line, the Worker fires the owner's
// routine for the coach task; the run names one or two of the row's own candidates and one line of
// today's version, and the Worker refuses anything outside the set, any rating or verdict on a
// person, any reply, match or rejection as a measure, and anyone in person when nobody is around.
// With two the phone draws between them at even chances; the phone checks again at the tap and
// falls back to Part 24's pick. It runs only while the reliability gate is met: ten consecutive
// scheduled days of the bridge back from yesterday, every failure handled, Claude's own line on at
// least seven, and a clean spot-check of the run logs made since the count began. Otherwise Part
// 24's pick stands, as it always does when the coach has nothing to say.

// The reliability gate (Part 32): an engineering rollout threshold, not a research finding.

/** Consecutive scheduled days the gate needs, and on how many of them Claude's own line must be stored. */
export const GATE_DAYS = 10
export const GATE_CLAUDE_DAYS = 7
/** The local time a day's line must be stored by: the fallback hour, Claude's twenty minutes, a tick and the chain's own time (engineering judgment). */
export const LINE_DEADLINE = '13:00'
const WRONG_DAY = /does not hold|the sheet is for|does not know the shape/

export interface GateDay {
  day: string
  /** The Worker fired the day's line on its own schedule (a day run by hand is not counted). */
  counted: boolean
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
 * The gate, computed from the bridge's own rows, never remembered. Back from yesterday, each day the
 * Worker fired on its own schedule is read for safety: fired once, a line stored by the deadline, no
 * wrong-day refusal left unresolved, and on a Sunday the review stored. The first day that breaks
 * one, or was not fired on schedule, ends the count, so a failed condition restarts it. Met when ten
 * such days run back from yesterday (ten days always hold a Sunday and a Friday into Monday), Claude's
 * own line is stored on at least seven of them, and the latest spot-check of the run logs, made
 * since the count began, found no key. It is read every day, so a day that breaks a safety
 * condition turns the coach off until ten more clean days and a new spot-check. Every stored line
 * passed its checks before it was stored.
 */
export function coachGate(rows: readonly (TaskRow | SpotRow)[], briefs: readonly BriefRow[], today: string, tz: string): Gate {
  const tasks = rows.filter((r): r is TaskRow => r.kind === 'task')
  const spots = rows.filter((r): r is SpotRow => r.kind === 'spotcheck').sort((a, b) => (a.at < b.at ? 1 : -1))
  const days: GateDay[] = []
  for (let k = 1; k <= 40; k++) {
    const day = addDays(today, -k)
    const t = tasks.find((x) => x.id === taskIdOf('line', day))
    if (!t || t.forced) {
      days.push({ day, counted: false, claude: false, problems: [] })
      break
    }
    const problems: string[] = []
    if ((t.fires ?? 1) > 1) problems.push('fired more than once')
    const line = briefs.find((b) => b.id === `${day}:brief`)
    if (!line) problems.push('no line stored')
    else {
      const at = localTime(new Date(line.at), tz)
      if (at.day > day || (at.day === day && at.hour * 60 + at.minute > minutesOf(LINE_DEADLINE))) problems.push(`the line came after ${LINE_DEADLINE}`)
    }
    if (!line && [...(t.refusals ?? [])].some((r) => WRONG_DAY.test(r))) problems.push('a wrong-day refusal left unresolved')
    if (new Date(`${day}T12:00:00Z`).getUTCDay() === 0 && !briefs.some((b) => b.id === `${day}:review`)) problems.push('no Sunday review stored')
    days.push({ day, counted: true, claude: line?.writer === 'claude', problems })
    if (problems.length) break
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

/** The gate as the Worker reads it now. */
export async function gateNow(store: Store, today: string, tz: string): Promise<Gate> {
  return coachGate(await store.readTasks(150), await store.readBriefs(60), today, tz)
}

/** Whether this month's check answered yes to safety or conduct: the app's own help is showing, and the coach defers to it on the Partner path. */
export async function helpShowing(store: Store, day: string): Promise<boolean> {
  const rows = await store.readRecords('monthlyChecks')
  return rows.some((r) => {
    const b = r.body as { month?: unknown; answers?: { safety?: unknown; conduct?: unknown } } | null
    return b?.month === day.slice(0, 7) && (b.answers?.safety === true || b.answers?.conduct === true)
  })
}

export interface CoachResult {
  ran: boolean
  reason: string
  day?: string
  gate?: Pick<Gate, 'met' | 'streak' | 'claudeDays' | 'reasons'>
}

export interface CoachOptions {
  /** By hand, with the run key: fire now, whatever the switch and the gate say. */
  force?: boolean
  /** By hand: the run is checked like any, and its pick is never stored where the phone reads it. */
  dry?: boolean
  fireFetcher?: typeof fetch
}

type CoachEnv = ClaudeEnv & Pick<Env, 'TIMEZONE' | 'FALLBACK_TIME' | 'COACH_WRITER'>

/**
 * The day's coach run. Switched on, the gate met, today's coach block built after the morning
 * check-in, the day's line stored, and a row with something to choose: the task is marked, then
 * the routine fired. A task under way waits for its answer; a failure or the time running out
 * leaves Part 24's pick standing. On the Partner path the coach defers to the monthly check's help.
 */
export async function runCoach(env: CoachEnv, store: Store, now: Date, opts: CoachOptions = {}): Promise<CoachResult> {
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  if (!opts.force && env.COACH_WRITER !== 'on') return { ran: false, reason: 'the coach is off', day }
  if (!opts.force && !claudeOn(env)) return { ran: false, reason: 'Claude is off', day }
  if (!opts.force) {
    const t = await store.readTask(taskIdOf('coach', day))
    if (t) {
      if (t.status === 'written' || t.status === 'fallback') return { ran: false, reason: 'done for today', day }
      const why = fallbackReason(t, now, timeoutMinutes(env))
      if (!why) return { ran: false, reason: 'waiting for Claude', day }
      await store.writeTask({ ...t, status: 'fallback', fallbackReason: `${why}; the app’s own pick stands` })
      return { ran: false, reason: why, day }
    }
    const gate = await gateNow(store, day, env.TIMEZONE)
    if (!gate.met) return { ran: false, reason: 'the gate is not met', day, gate: { met: gate.met, streak: gate.streak, claudeDays: gate.claudeDays, reasons: gate.reasons } }
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

/** Records a spot-check of the run logs for the bridge key (Part 32's gate), by the run key. */
export async function recordSpot(store: Store, now: Date, tz: string, runs: number, clean: boolean): Promise<SpotRow> {
  const at = now.toISOString()
  const row: SpotRow = { id: `spot:${at}`, kind: 'spotcheck', day: localTime(now, tz).day, at, runs, clean }
  await store.writeSpot(row)
  return row
}

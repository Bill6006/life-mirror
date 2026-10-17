import { activeBlocks, DEFAULT_FREQUENCY, DEFAULT_QUIET, DEFAULT_REMINDERS, inQuietHours, type Frequency } from '../../src/reminderRules'
import type { Env } from './env'
import { addDays, localTime, minutesOf } from './time'
import type { Store } from './turso'

// A cue whose moment has come. Every fifteen minutes: today's plans, the latest per commitment,
// not yet started, whose time has passed within the last twenty minutes and which have not been
// reminded of. One content-free push covers all of them; the phone composes the words from the
// plans it recorded. Each is marked so it is never sent twice. Forty-five minutes on, a plan
// still not started gets one follow-up, and never another. Neither goes in quiet hours or for a
// paused or archived commitment. The same job sends the check-in pings at your own reminder
// times, and none at all while reminders are off (stage 1, item b).

const WINDOW_MIN = 20
const FOLLOW_UP_AFTER_MIN = 45
/**
 * Stage 3, group 2: a commitment's follow-up is retired once its last five each led to no start that
 * day, and tried once more after thirty days without one. Follow-ups are looked for this far back.
 */
const RETIRE_AFTER = 5
const RETRY_AFTER_DAYS = 30
const LOOK_BACK_DAYS = 120

export interface CueResult {
  sent: boolean
  due: string[]
  /** Plans reminded of once already and still not started, given their one follow-up in this run. */
  followUps: string[]
  /** Plans whose follow-up was due but is retired for their commitment (stage 3, group 2); absent when none. */
  retired?: string[]
  reason: string
}

export type Sender = (payload: string) => Promise<boolean>

export interface PingResult {
  sent: boolean
  due: string | null
  reason: string
}

/** What the pings and cues follow: your settings as the phone last copied them to the cloud, or the phone's own defaults before it has. */
export interface PushSettings {
  /** The check-in reminders are on. Off, no ping is sent at all. */
  enabled: boolean
  /** The reminder times of the check-ins a day holds, HH:MM. */
  times: string[]
  quietStart: string
  quietEnd: string
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function pushSettingsOf(raw: unknown): PushSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as { frequency?: unknown; reminders?: { enabled?: unknown; times?: Record<string, unknown> }; quietStart?: unknown; quietEnd?: unknown }
  const frequency: Frequency = s.frequency === 'three' || s.frequency === 'two' || s.frequency === 'one' ? s.frequency : DEFAULT_FREQUENCY
  const hhmm = (v: unknown, fallback: string) => (typeof v === 'string' && HHMM.test(v) ? v : fallback)
  return {
    enabled: typeof s.reminders?.enabled === 'boolean' ? s.reminders.enabled : DEFAULT_REMINDERS.enabled,
    times: activeBlocks(frequency).map((b) => hhmm(s.reminders?.times?.[b], DEFAULT_REMINDERS.times[b])),
    quietStart: hhmm(s.quietStart, DEFAULT_QUIET.quietStart),
    quietEnd: hhmm(s.quietEnd, DEFAULT_QUIET.quietEnd),
  }
}

function hhmmAt(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/**
 * The content-free check-in ping, at each of your reminder times for the check-ins the day holds:
 * the fifteen-minute cron lands once inside the quarter hour that starts at the time, and a mark
 * keeps it to once a day per time. Reminders off, nothing is sent at all, not even the ping the
 * phone would have to show as a silent notice; never in quiet hours. The phone decides the rest.
 */
export async function runPings(env: Pick<Env, 'TIMEZONE'>, store: Store, now: Date, send: Sender | null): Promise<PingResult> {
  const local = localTime(now, env.TIMEZONE)
  const minute = local.hour * 60 + local.minute
  const s = pushSettingsOf(await store.readRecord('settings', '1'))
  if (!s.enabled) return { sent: false, due: null, reason: 'reminders are off' }
  const due = s.times.find((t) => minute >= minutesOf(t) && minute - minutesOf(t) < 15) ?? null
  if (!due) return { sent: false, due, reason: 'not a ping time' }
  if (inQuietHours(hhmmAt(minute), s)) return { sent: false, due, reason: 'quiet hours' }
  const id = `ping:${local.day}:${due}`
  if (await store.isPushed(id)) return { sent: false, due, reason: 'sent already' }
  if (!send) return { sent: false, due, reason: 'no push address or key' }
  if (!(await send(JSON.stringify({ kind: 'ping' })))) return { sent: false, due, reason: 'the push service refused it' }
  await store.markPushed(id, now.toISOString())
  return { sent: true, due, reason: 'sent' }
}

export async function runCues(env: Pick<Env, 'TIMEZONE'>, store: Store, now: Date, send: Sender | null): Promise<CueResult> {
  const local = localTime(now, env.TIMEZONE)
  const minute = local.hour * 60 + local.minute
  const plans = await store.readIntentions(local.day)
  const latest = new Map<number, (typeof plans)[number]>()
  for (const p of [...plans].sort((a, b) => (a.setAt < b.setAt ? -1 : 1))) latest.set(p.aimId, p)
  const due: string[] = []
  const followUps: string[] = []
  const retired: string[] = []
  let settings: PushSettings | null = null
  for (const p of latest.values()) {
    if (p.offerId !== null) continue
    // Reminded at the moment the commitment actually happens when the phone learned one (stage 3, group 2), else at its cue's own time.
    const since = minute - minutesOf(p.remindAt ?? p.time)
    const first = since >= 0 && since < WINDOW_MIN
    const second = since >= FOLLOW_UP_AFTER_MIN && since < FOLLOW_UP_AFTER_MIN + WINDOW_MIN
    if (!first && !second) continue
    // Read only once something is due: quiet hours hold for a plan's cue too, and a paused or archived commitment is never cued.
    settings ??= pushSettingsOf(await store.readRecord('settings', '1'))
    if (inQuietHours(hhmmAt(minute), settings) || !(await cueable(store, p.aimId))) continue
    if (first && !(await store.isPushed(`cue:${p.id}`))) due.push(p.id)
    // One follow-up, only for a plan that was reminded of once and is still not started, and never once retired.
    else if (second && (await store.isPushed(`cue:${p.id}`)) && !(await store.isPushed(`cue2:${p.id}`))) {
      if (await followUpRetired(store, p.aimId, local.day)) retired.push(p.id)
      else followUps.push(p.id)
    }
  }
  const quiet = retired.length ? { retired } : {}
  if (!due.length && !followUps.length) return { sent: false, due, followUps, ...quiet, reason: 'nothing due' }
  if (!send) return { sent: false, due, followUps, ...quiet, reason: 'no push address or key' }
  const at = now.toISOString()
  let sent = false
  if (due.length) {
    if (!(await send(JSON.stringify({ kind: 'cue' })))) return { sent: false, due, followUps, ...quiet, reason: 'the push service refused it' }
    for (const id of due) await store.markPushed(`cue:${id}`, at)
    sent = true
  }
  if (followUps.length) {
    if (!(await send(JSON.stringify({ kind: 'cue2' })))) return { sent, due, followUps, ...quiet, reason: 'the push service refused the follow-up' }
    for (const id of followUps) await store.markPushed(`cue2:${id}`, at)
    sent = true
  }
  return { sent, due, followUps, ...quiet, reason: 'sent' }
}

/**
 * Whether a commitment's follow-up is retired (stage 3, group 2): its last five follow-ups, on days
 * before today, each led to no start that day, and the newest of them is under thirty days old. A plan
 * given a follow-up was not started before it, so one started afterwards is a start it led to.
 */
async function followUpRetired(store: Store, aimId: number, today: string): Promise<boolean> {
  // The record's own rows, newest day first; the text filter is coarse, so each is checked whole.
  const rows = await store.readRecords('intentions', { from: addDays(today, -LOOK_BACK_DAYS), to: addDays(today, -1), like: `"aimId":${aimId}` })
  const followed: { day: string; started: boolean }[] = []
  for (const r of rows) {
    const p = r.body as { aimId?: unknown; offerId?: unknown } | null
    if (!p || p.aimId !== aimId || r.day === null || !(await store.isPushed(`cue2:${r.id}`))) continue
    followed.push({ day: r.day, started: p.offerId !== null && p.offerId !== undefined })
    if (followed.length === RETIRE_AFTER) break
  }
  if (followed.length < RETIRE_AFTER || followed.some((f) => f.started)) return false
  return followed[0].day > addDays(today, -RETRY_AFTER_DAYS)
}

/** A commitment you have paused or archived is never cued; one not yet in the cloud copy is, since its plan is. */
async function cueable(store: Store, aimId: number): Promise<boolean> {
  const a = (await store.readRecord('aims', String(aimId))) as { pausedAt?: unknown; archivedAt?: unknown } | null
  return !a || (!a.pausedAt && !a.archivedAt)
}

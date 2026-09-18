import type { Env } from './env'
import { localTime, minutesOf } from './time'
import type { Store } from './turso'

// A cue whose moment has come. Every fifteen minutes: today's plans, the latest per commitment,
// not yet started, whose time has passed within the last twenty minutes and which have not been
// reminded of. One content-free push covers all of them; the phone composes the words from the
// plans it recorded. Each is marked so it is never sent twice. Forty-five minutes on, a plan
// still not started gets one follow-up, and never another. The same job sends the three
// check-in pings at their times.

const WINDOW_MIN = 20
const FOLLOW_UP_AFTER_MIN = 45

export interface CueResult {
  sent: boolean
  due: string[]
  /** Plans reminded of once already and still not started, given their one follow-up in this run. */
  followUps: string[]
  reason: string
}

export type Sender = (payload: string) => Promise<boolean>

export interface PingResult {
  sent: boolean
  due: string | null
  reason: string
}

/**
 * The content-free check-in ping, at each of its local times: the fifteen-minute cron lands once
 * inside the quarter hour that starts at the time, and a mark keeps it to once a day per time.
 * The phone decides whether to show anything.
 */
export async function runPings(env: Pick<Env, 'TIMEZONE' | 'PING_TIMES'>, store: Store, now: Date, send: Sender | null): Promise<PingResult> {
  const local = localTime(now, env.TIMEZONE)
  const minute = local.hour * 60 + local.minute
  const times = (env.PING_TIMES ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const due = times.find((t) => minute >= minutesOf(t) && minute - minutesOf(t) < 15) ?? null
  if (!due) return { sent: false, due, reason: 'not a ping time' }
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
  for (const p of latest.values()) {
    if (p.offerId !== null) continue
    const since = minute - minutesOf(p.time)
    if (since >= 0 && since < WINDOW_MIN && !(await store.isPushed(`cue:${p.id}`))) due.push(p.id)
    // One follow-up, only for a plan that was reminded of once and is still not started.
    else if (since >= FOLLOW_UP_AFTER_MIN && since < FOLLOW_UP_AFTER_MIN + WINDOW_MIN && (await store.isPushed(`cue:${p.id}`)) && !(await store.isPushed(`cue2:${p.id}`))) followUps.push(p.id)
  }
  if (!due.length && !followUps.length) return { sent: false, due, followUps, reason: 'nothing due' }
  if (!send) return { sent: false, due, followUps, reason: 'no push address or key' }
  const at = now.toISOString()
  let sent = false
  if (due.length) {
    if (!(await send(JSON.stringify({ kind: 'cue' })))) return { sent: false, due, followUps, reason: 'the push service refused it' }
    for (const id of due) await store.markPushed(`cue:${id}`, at)
    sent = true
  }
  if (followUps.length) {
    if (!(await send(JSON.stringify({ kind: 'cue2' })))) return { sent, due, followUps, reason: 'the push service refused the follow-up' }
    for (const id of followUps) await store.markPushed(`cue2:${id}`, at)
    sent = true
  }
  return { sent, due, followUps, reason: 'sent' }
}

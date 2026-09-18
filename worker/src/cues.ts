import type { Env } from './env'
import { localTime, minutesOf } from './time'
import type { Store } from './turso'

// A cue whose moment has come. Every fifteen minutes: today's plans, the latest per commitment,
// not yet started, whose time has passed within the last twenty minutes and which have not been
// reminded of. One content-free push covers all of them; the phone composes the words from the
// plans it recorded. Each is marked so it is never sent twice.

const WINDOW_MIN = 20

export interface CueResult {
  sent: boolean
  due: string[]
  reason: string
}

export type Sender = (payload: string) => Promise<boolean>

export async function runCues(env: Pick<Env, 'TIMEZONE'>, store: Store, now: Date, send: Sender | null): Promise<CueResult> {
  const local = localTime(now, env.TIMEZONE)
  const minute = local.hour * 60 + local.minute
  const plans = await store.readIntentions(local.day)
  const latest = new Map<number, (typeof plans)[number]>()
  for (const p of [...plans].sort((a, b) => (a.setAt < b.setAt ? -1 : 1))) latest.set(p.aimId, p)
  const due: string[] = []
  for (const p of latest.values()) {
    if (p.offerId !== null) continue
    const at = minutesOf(p.time)
    if (at > minute || minute - at >= WINDOW_MIN) continue
    if (await store.isPushed(`cue:${p.id}`)) continue
    due.push(p.id)
  }
  if (!due.length) return { sent: false, due, reason: 'nothing due' }
  if (!send) return { sent: false, due, reason: 'no push address or key' }
  const ok = await send(JSON.stringify({ kind: 'cue' }))
  if (!ok) return { sent: false, due, reason: 'the push service refused it' }
  const at = now.toISOString()
  for (const id of due) await store.markPushed(`cue:${id}`, at)
  return { sent: true, due, reason: 'sent' }
}

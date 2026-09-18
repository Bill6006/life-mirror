import { aiRunner } from './ai'
import { runBrief } from './brief'
import { runCues, type Sender } from './cues'
import type { Env } from './env'
import { sendPush, type Subscription } from './push'
import { BRAIN_APP, tursoStore } from './turso'

// The brain, as deployed: three crons and two routes. The morning line at the brief hour, the
// cue reminder every fifteen minutes, and by hand, with the run key, either job now.

const CUE_CRON = '*/15 * * * *'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function sender(env: Env): Sender | null {
  if (!env.PUSH_SUBSCRIPTION || !env.VAPID_PRIVATE_KEY) return null
  let sub: Subscription
  try {
    sub = JSON.parse(env.PUSH_SUBSCRIPTION) as Subscription
  } catch {
    return null
  }
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return null
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
  return async (payload) => {
    const r = await sendPush(sub, payload, vapid)
    if (r.status === 404 || r.status === 410) console.log('push: the stored address is dead; copy it again from Settings')
    return r.status >= 200 && r.status < 300
  }
}

async function dispatch(job: 'brief' | 'cues', env: Env, now: Date, force = false): Promise<unknown> {
  if (!env.TURSO_TOKEN) return { job, reason: 'no database token' }
  const store = tursoStore(env.TURSO_URL, env.TURSO_TOKEN)
  const result = job === 'cues' ? await runCues(env, store, now, sender(env)) : await runBrief(env, store, aiRunner(env.AI), now, { force })
  console.log(JSON.stringify({ job, ...result }))
  return { job, ...result }
}

const handler: ExportedHandler<Env> = {
  async scheduled(event, env, ctx) {
    const job = event.cron === CUE_CRON ? 'cues' : 'brief'
    ctx.waitUntil(dispatch(job, env, new Date(event.scheduledTime)))
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return json({ ok: true, app: BRAIN_APP })
    const m = /^\/run\/(brief|cues)$/.exec(url.pathname)
    if (m && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      return json(await dispatch(m[1] as 'brief' | 'cues', env, new Date(), url.searchParams.get('force') === '1'))
    }
    return new Response('Not found', { status: 404 })
  },
}

export default handler

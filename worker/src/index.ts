import { aiRunner, textOf } from './ai'
import { runBrief, runReview } from './brief'
import { runCues, runPings, type Sender } from './cues'
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

type Job = 'brief' | 'review' | 'cues'

async function dispatch(job: Job, env: Env, now: Date, force = false): Promise<unknown> {
  if (!env.TURSO_TOKEN) return { job, reason: 'no database token' }
  const store = tursoStore(env.TURSO_URL, env.TURSO_TOKEN)
  if (job === 'cues') {
    const send = sender(env)
    const result = { ping: await runPings(env, store, now, send), cues: await runCues(env, store, now, send) }
    console.log(JSON.stringify({ job, ...result }))
    return { job, ...result }
  }
  const result = job === 'review' ? await runReview(env, store, aiRunner(env.AI), now, { force }) : await runBrief(env, store, aiRunner(env.AI), now, { force })
  console.log(JSON.stringify({ job, ...result }))
  return { job, ...result }
}

const handler: ExportedHandler<Env> = {
  async scheduled(event, env, ctx) {
    const now = new Date(event.scheduledTime)
    if (event.cron === CUE_CRON) ctx.waitUntil(dispatch('cues', env, now))
    // The morning line every day; beside it on Sunday, the week reviewed. Each decides for itself whether it is its hour.
    else ctx.waitUntil(dispatch('brief', env, now).then(() => dispatch('review', env, now)))
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return json({ ok: true, app: BRAIN_APP })
    const m = /^\/run\/(brief|review|cues)$/.exec(url.pathname)
    if (m && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      return json(await dispatch(m[1] as Job, env, new Date(), url.searchParams.get('force') === '1'))
    }
    // With the run key: one push by hand. kind=test shows itself on the phone; ping and cue behave as the scheduled ones do.
    if (url.pathname === '/run/push' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      const kind = url.searchParams.get('kind') ?? 'test'
      const send = sender(env)
      if (!send) return json({ sent: false, reason: 'no push address or key' })
      try {
        return json({ sent: await send(JSON.stringify({ kind })), kind })
      } catch (e) {
        return json({ sent: false, kind, reason: e instanceof Error ? e.message : String(e) })
      }
    }
    // With the run key: one model, one tiny prompt, its raw answer and what the extractor reads from it. For diagnosing a model's shape.
    if (url.pathname === '/run/probe' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      const model = url.searchParams.get('model') ?? env.MODELS.split(',')[0].trim()
      try {
        const raw = await aiRunner(env.AI)(model, [{ role: 'system', content: 'Answer with JSON only.' }, { role: 'user', content: 'Reply with {"ok": true, "model": "<your model name>"} and nothing else.' }], 300)
        return json({ model, text: textOf(raw).slice(0, 1500), raw: JSON.stringify(raw).slice(0, 3000) })
      } catch (e) {
        return json({ model, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return new Response('Not found', { status: 404 })
  },
}

export default handler

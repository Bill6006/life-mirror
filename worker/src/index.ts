import { aiRunner, textOf } from './ai'
import { runBrief, runReview } from './brief'
import { runCues, runPings, type Sender } from './cues'
import type { Env } from './env'
import { sendPush, type Subscription } from './push'
import { BRAIN_APP, tursoStore } from './turso'
import { acceptNonce, bearerOk, fireRoutine, issueNonce, TEST_MODELS, type TestModel } from './claude'

// The brain, as deployed: one cron, every fifteen minutes. Each tick sends a cue reminder or a
// ping whose moment has come; writes the day's line once the morning check-in is on a sheet (or
// from the fallback hour); and on Sunday at the brief hour writes the week reviewed. By hand,
// with the run key, any job now, and the report of the last lines written.

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
    // In turn, and each on its own: a failure in one never stops the next. Each decides for itself whether its moment has come.
    ctx.waitUntil(
      (async () => {
        for (const job of ['cues', 'brief', 'review'] as const) {
          try {
            await dispatch(job, env, now)
          } catch (e) {
            console.log(JSON.stringify({ job, error: e instanceof Error ? e.message : String(e) }))
          }
        }
      })(),
    )
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return json({ ok: true, app: BRAIN_APP })
    const m = /^\/run\/(brief|review|cues)$/.exec(url.pathname)
    if (m && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      return json(await dispatch(m[1] as Job, env, new Date(), url.searchParams.get('force') === '1'))
    }
    // The bridge proof (Part 29): the run asks for a nonce and hands it back, with the key the agent proxy adds; without it, nothing.
    if (url.pathname === '/claude/ping') {
      if (!bearerOk(request.headers.get('authorization'), env.CLAUDE_BRIDGE_KEY)) return json({ error: 'unauthorized' }, 401)
      if (!env.TURSO_TOKEN) return json({ error: 'no database token' }, 503)
      const store = tursoStore(env.TURSO_URL, env.TURSO_TOKEN)
      if (request.method === 'GET') return json(await issueNonce(store, new Date()))
      if (request.method === 'POST') {
        const body = await request.json().catch(() => null)
        const r = await acceptNonce(store, new Date(), body)
        return json(r, r.ok ? 200 : 400)
      }
      return json({ error: 'method' }, 405)
    }
    // With the run key: fire the routine once, asking its subagent for one of the test models.
    if (url.pathname === '/run/claude-fire' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      const asked = url.searchParams.get('model') ?? 'opus'
      if (!(TEST_MODELS as readonly string[]).includes(asked)) return json({ reason: `model must be one of ${TEST_MODELS.join(', ')}` }, 400)
      return json(await fireRoutine(env, tursoStore(env.TURSO_URL, env.TURSO_TOKEN), new Date(), asked as TestModel))
    }
    // With the run key: the bridge rows, newest first.
    if (url.pathname === '/run/bridge-report' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      return json({ rows: await tursoStore(env.TURSO_URL, env.TURSO_TOKEN).readBridge(30) })
    }
    // With the run key: the last thirty lines and reviews as their log reads, never their words (Part 28's window is read off this).
    if (url.pathname === '/run/brief-report' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      const rows = await tursoStore(env.TURSO_URL, env.TURSO_TOKEN).readBriefs(30)
      return json({ rows: rows.map((r) => ({ id: r.id, kind: r.kind, day: r.day, forDay: r.forDay ?? null, factsDay: r.factsDay, trigger: r.trigger ?? null, model: r.model, at: r.at, candidates: r.candidates ?? null, refusals: r.refusals ?? [], neurons: r.neurons ?? null, calls: r.calls ?? null, latencyMs: r.latencyMs ?? null, shape: r.shape ?? null })) })
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

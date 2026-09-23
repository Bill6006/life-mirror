import { aiRunner, textOf } from './ai'
import { runBrief, runReview } from './brief'
import { runCues, runPings, type Sender } from './cues'
import type { Env } from './env'
import { sendPush, type Subscription } from './push'
import { BRAIN_APP, tursoStore } from './turso'
import { bearerOk, handleBriefing, handleContext, handleLine } from './claude'

// The brain, as deployed: one cron, every fifteen minutes. Each tick sends a cue reminder or a
// ping whose moment has come; starts the day's line once the morning check-in is on a sheet (or
// from the fallback hour), through Claude when it is switched on, else the free model chain; and
// on Sunday at the brief hour the week reviewed. The routine's run reaches the three /claude/
// endpoints with the bridge key the agent proxy adds. By hand, with the run key, any job now, and
// the reports: the lines written, and the bridge's tasks.

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

async function dispatch(job: Job, env: Env, now: Date, force = false, writer?: 'claude' | 'free'): Promise<unknown> {
  if (!env.TURSO_TOKEN) return { job, reason: 'no database token' }
  const store = tursoStore(env.TURSO_URL, env.TURSO_TOKEN)
  if (job === 'cues') {
    const send = sender(env)
    const result = { ping: await runPings(env, store, now, send), cues: await runCues(env, store, now, send) }
    console.log(JSON.stringify({ job, ...result }))
    return { job, ...result }
  }
  const opts = { force, ...(writer ? { writer } : {}) }
  const result = job === 'review' ? await runReview(env, store, aiRunner(env.AI), now, opts) : await runBrief(env, store, aiRunner(env.AI), now, opts)
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
      const w = url.searchParams.get('writer')
      if (w !== null && w !== 'claude' && w !== 'free') return json({ reason: 'writer must be claude or free' }, 400)
      return json(await dispatch(m[1] as Job, env, new Date(), url.searchParams.get('force') === '1', w ?? undefined))
    }
    // The bridge (Part 30): the routine's run, with the key the agent proxy adds; without it, nothing. The key never reaches Claude.
    if (url.pathname.startsWith('/claude/')) {
      if (!bearerOk(request.headers.get('authorization'), env.CLAUDE_BRIDGE_KEY)) return json({ error: 'unauthorized' }, 401)
      if (!env.TURSO_TOKEN) return json({ error: 'no database token' }, 503)
      const deps = { env, store: tursoStore(env.TURSO_URL, env.TURSO_TOKEN), now: new Date() }
      try {
        if (url.pathname === '/claude/briefing' && request.method === 'GET') {
          const r = await handleBriefing(deps, url)
          return json(r.body, r.status)
        }
        if (url.pathname === '/claude/context' && request.method === 'GET') {
          const r = await handleContext(deps, url)
          return json(r.body, r.status)
        }
        if (url.pathname === '/claude/line' && request.method === 'POST') {
          const text = await request.text()
          if (text.length > 20_000) return json({ error: 'at most 20,000 characters' }, 413)
          let body: unknown
          try {
            body = JSON.parse(text)
          } catch {
            return json({ error: 'the body is not JSON' }, 400)
          }
          const r = await handleLine(deps, body)
          return json(r.body, r.status)
        }
        return json({ error: 'not found' }, 404)
      } catch (e) {
        console.log(JSON.stringify({ bridge: url.pathname, error: e instanceof Error ? e.message : String(e) }))
        return json({ error: 'the Worker could not serve this now' }, 503)
      }
    }
    // With the run key: the bridge's rows, newest first: each day's task with how it ended, never its words.
    if (url.pathname === '/run/bridge-report' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      return json({ rows: await tursoStore(env.TURSO_URL, env.TURSO_TOKEN).readBridge(30) })
    }
    // With the run key: the last thirty lines and reviews as their log reads, never their words (Part 28's window is read off this).
    if (url.pathname === '/run/brief-report' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      const rows = await tursoStore(env.TURSO_URL, env.TURSO_TOKEN).readBriefs(30)
      return json({ rows: rows.map((r) => ({ id: r.id, kind: r.kind, day: r.day, forDay: r.forDay ?? null, factsDay: r.factsDay, trigger: r.trigger ?? null, writer: r.writer ?? null, model: r.model, askedModel: r.askedModel ?? null, runnerModel: r.runnerModel ?? null, fallback: r.fallback ?? null, at: r.at, candidates: r.candidates ?? null, refusals: r.refusals ?? [], neurons: r.neurons ?? null, calls: r.calls ?? null, latencyMs: r.latencyMs ?? null, shape: r.shape ?? null })) })
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

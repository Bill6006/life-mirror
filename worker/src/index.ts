import { aiRunner, textOf } from './ai'
import { runBrief, runReview } from './brief'
import { runCues, runPings, type Sender } from './cues'
import type { Env } from './env'
import { sendPush, type Subscription } from './push'
import { BRAIN_APP, tursoStore } from './turso'
import { bearerOk, handleBriefing, handleContext, handleLine } from './claude'
import { coachToday, recordSpot, runCoach, watchNow } from './coach'
import { handleCoachBriefing, handleCoachLine, runCommitments } from './skillCoach'
import { SKILL_COACH } from '../../src/coachShared'
import { localTime } from './time'

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

type Job = 'brief' | 'review' | 'cues' | 'coach' | 'commitments'

async function dispatch(job: Job, env: Env, now: Date, force = false, writer?: 'claude' | 'free', dry = false, coach?: { reason: string }): Promise<unknown> {
  // Parts 40 and 41: closed, the skill coach's job returns before anything is opened or read, by hand or by schedule, and logs nothing.
  if (job === 'commitments' && SKILL_COACH !== 'open') return { job, ran: false, reason: 'gated' }
  if (!env.TURSO_TOKEN) return { job, reason: 'no database token' }
  const store = tursoStore(env.TURSO_URL, env.TURSO_TOKEN)
  if (job === 'cues') {
    const send = sender(env)
    const result = { ping: await runPings(env, store, now, send), cues: await runCues(env, store, now, send) }
    console.log(JSON.stringify({ job, ...result }))
    return { job, ...result }
  }
  if (job === 'coach') {
    const result = await runCoach(env, store, now, { force, dry })
    console.log(JSON.stringify({ job, ...result }))
    return { job, ...result }
  }
  if (job === 'commitments') {
    const result = await runCommitments(env, store, now, { force, dry, ...(coach ? { coach } : {}) })
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
        let coach: { reason: string } | undefined
        for (const job of ['cues', 'brief', 'review', 'coach'] as const) {
          try {
            const r = (await dispatch(job, env, now)) as { reason?: unknown }
            if (job === 'coach') coach = { reason: String(r?.reason ?? '') }
          } catch (e) {
            console.log(JSON.stringify({ job, error: e instanceof Error ? e.message : String(e) }))
          }
        }
        // Parts 40 and 41: the skill coach last, after the coach has said whether it runs today. Closed, it does nothing.
        try {
          await dispatch('commitments', env, now, false, undefined, false, coach)
        } catch (e) {
          console.log(JSON.stringify({ job: 'commitments', error: e instanceof Error ? e.message : String(e) }))
        }
      })(),
    )
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return json({ ok: true, app: BRAIN_APP })
    const m = /^\/run\/(brief|review|cues|coach|commitments)$/.exec(url.pathname)
    if (m && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      const w = url.searchParams.get('writer')
      if (w !== null && w !== 'claude' && w !== 'free') return json({ reason: 'writer must be claude or free' }, 400)
      return json(await dispatch(m[1] as Job, env, new Date(), url.searchParams.get('force') === '1', w ?? undefined, url.searchParams.get('dry') === '1'))
    }
    // With the run key: the coach's watch as the bridge's rows read now (Part 32): on or off and why, every failure since launch, the ten-day check, and where today stands. And a spot-check of the run logs recorded.
    if (url.pathname === '/run/coach-gate' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      const now = new Date()
      const store = tursoStore(env.TURSO_URL, env.TURSO_TOKEN)
      const watch = await watchNow(store, now, env.TIMEZONE, env.COACH_LAUNCH)
      return json({ switchedOn: env.COACH_WRITER === 'on', ...watch, today: await coachToday(store, localTime(now, env.TIMEZONE).day) })
    }
    if (url.pathname === '/run/coach-spotcheck' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      const runs = Number(url.searchParams.get('runs'))
      const clean = url.searchParams.get('clean')
      if (!Number.isInteger(runs) || runs < 1 || (clean !== '1' && clean !== '0')) return json({ reason: 'runs must be a whole number of runs read, and clean 1 or 0' }, 400)
      return json(await recordSpot(tursoStore(env.TURSO_URL, env.TURSO_TOKEN), new Date(), env.TIMEZONE, runs, clean === '1'))
    }
    // The bridge (Part 30): the routine's run, with the key the agent proxy adds; without it, nothing. The key never reaches Claude.
    if (url.pathname.startsWith('/claude/')) {
      if (!bearerOk(request.headers.get('authorization'), env.CLAUDE_BRIDGE_KEY)) return json({ error: 'unauthorized' }, 401)
      if (!env.TURSO_TOKEN) return json({ error: 'no database token' }, 503)
      const deps = { env, store: tursoStore(env.TURSO_URL, env.TURSO_TOKEN), now: new Date() }
      try {
        if (url.pathname === '/claude/briefing' && request.method === 'GET') {
          // Parts 40 and 41: a skill coach run's briefing, refused while their gate is closed.
          const task = url.searchParams.get('task')
          const r = task === 'skill' || task === 'progress' ? await handleCoachBriefing(deps, url) : await handleBriefing(deps, url)
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
          const task = body && typeof body === 'object' ? (body as { task?: unknown }).task : undefined
          const r = task === 'skill' || task === 'progress' ? await handleCoachLine(deps, body) : await handleLine(deps, body)
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
    // With the run key: what Claude read, newest first, by task, category, count and size, never content.
    if (url.pathname === '/run/reads-report' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      if (!env.TURSO_TOKEN) return json({ reason: 'no database token' })
      return json({ rows: await tursoStore(env.TURSO_URL, env.TURSO_TOKEN).readReads(60) })
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

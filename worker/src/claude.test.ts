import { describe, expect, it } from 'vitest'
import { acceptNonce, bearerOk, FIRE_BETA, FIRE_TEXT, fireRoutine, issueNonce, NONCE_MINUTES } from './claude'
import { memoryStore } from './turso'

// The bridge proof (Part 29), against the store in memory and a fire endpoint stood in for: the
// key checked, the nonce issued once and answered once, every fire recorded with what came back,
// and only test text ever sent.

const KEY = 'k'.repeat(64)
const env = { CLAUDE_FIRE_URL: 'https://api.anthropic.com/v1/claude_code/routines/trig_test/fire', CLAUDE_FIRE_TOKEN: 'fire-token' }
const NOW = new Date('2026-09-23T15:00:00.000Z')
const later = (ms: number) => new Date(NOW.getTime() + ms)

function answering(status: number, body: unknown, headers: Record<string, string> = {}) {
  const seen: { url: string; init: RequestInit }[] = []
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  }) as unknown as typeof fetch
  return { fetcher, seen }
}

describe('the key', () => {
  it('lets through only the exact bearer key', () => {
    expect(bearerOk(`Bearer ${KEY}`, KEY)).toBe(true)
    expect(bearerOk(`Bearer ${KEY.slice(1)}x`, KEY)).toBe(false)
    expect(bearerOk(`Bearer ${KEY}x`, KEY)).toBe(false)
    expect(bearerOk(KEY, KEY)).toBe(false)
    expect(bearerOk(null, KEY)).toBe(false)
    expect(bearerOk(`Bearer ${KEY}`, undefined)).toBe(false)
    expect(bearerOk('Bearer ', '')).toBe(false)
  })
})

describe('a fire', () => {
  it('sends test text only, with the routine’s token and the beta header, and records the session', async () => {
    const store = memoryStore()
    const { fetcher, seen } = answering(200, { type: 'routine_fire', claude_code_session_id: 'session_01ABC', claude_code_session_url: 'https://claude.ai/code/session_01ABC' })
    const r = await fireRoutine(env, store, NOW, 'opus', fetcher)
    expect(r).toMatchObject({ fired: true, status: 200, sessionUrl: 'https://claude.ai/code/session_01ABC' })
    expect(seen[0].url).toBe(env.CLAUDE_FIRE_URL)
    const headers = seen[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer fire-token')
    expect(headers['anthropic-beta']).toBe(FIRE_BETA)
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ text: FIRE_TEXT })
    expect((await store.readBridge(5))[0]).toMatchObject({ kind: 'fire', model: 'opus', status: 200, sessionId: 'session_01ABC' })
  })

  it('records a refusal with its reason: 429 with its Retry-After, 400 for a paused routine, and nothing to send without a token', async () => {
    const store = memoryStore()
    const busy = answering(429, { error: { type: 'rate_limit_error', message: 'Daily routine run limit reached' } }, { 'retry-after': '3600' })
    expect(await fireRoutine(env, store, NOW, 'opus', busy.fetcher)).toMatchObject({ fired: false, status: 429, retryAfter: '3600', reason: 'Daily routine run limit reached' })
    const paused = answering(400, { error: { type: 'invalid_request_error', message: 'Routine is paused' } })
    expect(await fireRoutine(env, store, later(1000), 'opus', paused.fetcher)).toMatchObject({ fired: false, status: 400, reason: 'Routine is paused' })
    expect(await fireRoutine({ CLAUDE_FIRE_URL: env.CLAUDE_FIRE_URL }, store, NOW, 'opus', busy.fetcher)).toEqual({ fired: false, reason: 'no fire URL or token' })
    expect((await store.readBridge(5)).map((r) => r.status)).toEqual([400, 429])
  })
})

describe('the nonce', () => {
  it('is issued for the newest fire with its model, answered once, and times the round trip from the fire', async () => {
    const store = memoryStore()
    await fireRoutine(env, store, NOW, 'haiku', answering(200, { claude_code_session_id: 's1' }).fetcher)
    const issued = await issueNonce(store, later(20_000))
    expect(issued.model).toBe('haiku')
    const answer = { nonce: issued.nonce, reply: 'Hello, bridge.', askedModel: 'haiku', subagentModel: 'claude-haiku-4-5-20251001', runnerModel: 'claude-sonnet-5', subagentError: null }
    expect(await acceptNonce(store, later(45_000), answer)).toEqual({ ok: true, roundTripMs: 45_000 })
    expect(await store.readBridgeRow(`ping:${issued.nonce}`)).toMatchObject({ reply: 'Hello, bridge.', subagentModel: 'claude-haiku-4-5-20251001', runnerModel: 'claude-sonnet-5', roundTripMs: 45_000 })
    expect(await acceptNonce(store, later(50_000), answer)).toEqual({ ok: false, reason: 'already answered' })
  })

  it('refuses an unknown nonce, an old one, and a body that is not one', async () => {
    const store = memoryStore()
    const issued = await issueNonce(store, NOW)
    expect(issued.model).toBe('opus')
    expect(await acceptNonce(store, NOW, { nonce: 'not-issued' })).toEqual({ ok: false, reason: 'unknown nonce' })
    expect(await acceptNonce(store, later((NONCE_MINUTES + 1) * 60_000), { nonce: issued.nonce })).toEqual({ ok: false, reason: 'nonce expired' })
    expect(await acceptNonce(store, NOW, 'hello')).toEqual({ ok: false, reason: 'not an object' })
    expect(await acceptNonce(store, NOW, {})).toEqual({ ok: false, reason: 'no nonce' })
  })

  it('keeps what a run hands back to a bounded size', async () => {
    const store = memoryStore()
    const issued = await issueNonce(store, NOW)
    await acceptNonce(store, later(1000), { nonce: issued.nonce, reply: 'x'.repeat(5000), subagentModel: 'y'.repeat(500) })
    const row = await store.readBridgeRow(`ping:${issued.nonce}`)
    expect(row?.reply).toHaveLength(500)
    expect(row?.subagentModel).toHaveLength(100)
  })
})

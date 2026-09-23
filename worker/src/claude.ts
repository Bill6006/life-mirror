import type { Env } from './env'
import type { BridgeRow, Store } from './turso'

// The bridge proof (Part 29): test data only, nothing personal crosses. A routine on the owner's
// claude.ai account is fired from here with the routine's own token; the run asks this Worker
// for a nonce and hands it back, through Anthropic's agent proxy, which adds the bridge key to
// requests for this host after they leave the session's VM, so the key never reaches Claude.
// Every fire and every ping is a row of its own, so the proof is read off, not remembered.

export const FIRE_BETA = 'experimental-cc-routine-2026-04-01'
export const FIRE_TEXT = 'Bridge proof: test data only. Follow the instructions in this repository.'
/**
 * The models a proof run may ask its subagent to write with: the four values the Agent tool's
 * `model` parameter accepts (read from its own refusal on 2026-09-23; `best` is not one), and one
 * retired id on purpose, to record what an unavailable model does.
 */
export const TEST_MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'claude-3-opus-20240229'] as const
export type TestModel = (typeof TEST_MODELS)[number]
/** How long a nonce may wait for its answer. */
export const NONCE_MINUTES = 30

const enc = new TextEncoder()

/** The bearer key, compared in constant time over its length; false when either side is missing. */
export function bearerOk(header: string | null, key: string | undefined): boolean {
  if (!key || !header || !header.startsWith('Bearer ')) return false
  const a = enc.encode(header.slice(7))
  const b = enc.encode(key)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

const clip = (v: unknown, n: number): string | null => (typeof v === 'string' ? v.slice(0, n) : null)

export interface FireResult {
  fired: boolean
  status?: number
  reason?: string
  id?: string
  sessionUrl?: string | null
  retryAfter?: string | null
}

type FireEnv = Pick<Env, 'CLAUDE_FIRE_URL' | 'CLAUDE_FIRE_TOKEN'>

/** Fires the routine once, with test text only, and records what came back. There is no idempotency key: a second call is a second run. */
export async function fireRoutine(env: FireEnv, store: Store, now: Date, model: TestModel, fetcher: typeof fetch = fetch): Promise<FireResult> {
  if (!env.CLAUDE_FIRE_URL || !env.CLAUDE_FIRE_TOKEN) return { fired: false, reason: 'no fire URL or token' }
  const at = now.toISOString()
  const id = `fire:${at}`
  let status = 0
  let body: Record<string, unknown> = {}
  let retryAfter: string | null = null
  let error: string | null = null
  try {
    const r = await fetcher(env.CLAUDE_FIRE_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CLAUDE_FIRE_TOKEN}`, 'anthropic-beta': FIRE_BETA, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ text: FIRE_TEXT }),
    })
    status = r.status
    retryAfter = r.headers.get('retry-after')
    body = ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const fired = status >= 200 && status < 300
  const errorText = fired ? null : (error ?? clip((body.error as { message?: unknown } | undefined)?.message, 300) ?? clip(body.message, 300))
  const row: BridgeRow = { id, kind: 'fire', at, model, status, sessionId: clip(body.claude_code_session_id, 120), sessionUrl: clip(body.claude_code_session_url, 200), retryAfter, error: errorText }
  await store.writeBridge(row)
  return { fired, status, id, sessionUrl: row.sessionUrl ?? null, retryAfter, ...(fired ? {} : { reason: errorText ?? `status ${status}` }) }
}

/** A run asks for its nonce: issued once, tied to the newest fire, with the model that fire asked for. */
export async function issueNonce(store: Store, now: Date): Promise<{ nonce: string; model: TestModel; at: string }> {
  const fire = (await store.readBridge(50)).find((r) => r.kind === 'fire')
  const model = fire && (TEST_MODELS as readonly string[]).includes(fire.model ?? '') ? (fire.model as TestModel) : 'opus'
  const nonce = crypto.randomUUID()
  const at = now.toISOString()
  await store.writeBridge({ id: `ping:${nonce}`, kind: 'ping', at, nonce, model, fireId: fire?.id ?? null, fireAt: fire?.at ?? null })
  return { nonce, model, at }
}

/** The run hands the nonce back with what its subagent wrote and which models ran; refused for a nonce unknown, already answered, or too old. */
export async function acceptNonce(store: Store, now: Date, raw: unknown): Promise<{ ok: true; roundTripMs: number | null } | { ok: false; reason: string }> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const nonce = clip(o.nonce, 64)
  if (!nonce) return { ok: false, reason: 'no nonce' }
  const row = await store.readBridgeRow(`ping:${nonce}`)
  if (!row) return { ok: false, reason: 'unknown nonce' }
  if (row.answeredAt) return { ok: false, reason: 'already answered' }
  if (now.getTime() - Date.parse(row.at) > NONCE_MINUTES * 60_000) return { ok: false, reason: 'nonce expired' }
  const answeredAt = now.toISOString()
  const roundTripMs = row.fireAt ? now.getTime() - Date.parse(row.fireAt) : null
  await store.writeBridge({
    ...row,
    answeredAt,
    roundTripMs,
    reply: clip(o.reply, 500),
    askedModel: clip(o.askedModel, 100),
    subagentModel: clip(o.subagentModel, 100),
    runnerModel: clip(o.runnerModel, 100),
    subagentError: clip(o.subagentError, 500),
  })
  return { ok: true, roundTripMs }
}

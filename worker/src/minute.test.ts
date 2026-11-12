import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './index'
import type { Env } from './env'

// What a quiet minute costs (2026-11-12). The Worker runs every minute, and most minutes have nothing to do. Cloudflare
// counts each request a run sends and the processor time spent on it, so a minute with nothing asked sends three
// requests to the database and no more: the skill coach's open asks, the day's Ask runs in one request, and the
// questions waiting. Counted here at the network, through the deployed handler's own scheduled run and the real
// database client, with a stand-in database that holds nothing.

interface Sent {
  sql: string
  args: unknown[]
}

/** A stand-in for the database's address: every statement is recorded and answered with no rows. */
function emptyDatabase(): { sent: Sent[]; other: string[]; fetch: typeof fetch } {
  const sent: Sent[] = []
  const other: string[] = []
  const answer = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init)
    if (!new URL(req.url).hostname.endsWith('database.test')) {
      other.push(req.url)
      return new Response('{}', { status: 404 })
    }
    const body = (await req.json()) as { requests: { type: string; stmt?: { sql?: string; args?: { value?: unknown }[] } }[] }
    const results = body.requests.map((r) => {
      if (r.type === 'execute') {
        sent.push({ sql: r.stmt?.sql ?? '', args: (r.stmt?.args ?? []).map((a) => a.value) })
        return { type: 'ok', response: { type: 'execute', result: { cols: [], rows: [], affected_row_count: 0, last_insert_rowid: null } } }
      }
      return { type: 'ok', response: { type: r.type } }
    })
    return new Response(JSON.stringify({ baton: null, base_url: null, results }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { sent, other, fetch: answer }
}

const env = {
  TIMEZONE: 'America/New_York',
  BRIEF_HOUR: '5',
  FALLBACK_TIME: '11:00',
  TURSO_URL: 'https://stand-in.database.test',
  TURSO_TOKEN: 'stand-in-token',
  MODELS: 'model-a',
  LIBRARY_URL: 'https://example.test/library.json',
  CATALOGUE_URL: 'https://example.test/catalogue.json',
  CLAUDE_WRITER: 'on',
  CLAUDE_FIRE_URL: 'https://example.test/fire',
  CLAUDE_FIRE_TOKEN: 'fire-token',
  CLAUDE_TIMEOUT_MINUTES: '20',
  COACH_WRITER: 'on',
  COACH_LAUNCH: '2026-09-23',
} as unknown as Env

/** One scheduled run at a moment, waited to its end. */
async function runAt(iso: string): Promise<void> {
  const waits: Promise<unknown>[] = []
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext
  await handler.scheduled?.({ scheduledTime: Date.parse(iso), cron: '* * * * *', noRetry: () => {} } as unknown as ScheduledController, env, ctx)
  await Promise.all(waits)
}

afterEach(() => vi.unstubAllGlobals())

describe('a minute with nothing asked', () => {
  it('sends the database three requests, and nothing anywhere else', async () => {
    const db = emptyDatabase()
    vi.stubGlobal('fetch', db.fetch)
    // 14:07 UTC: not a quarter hour, so only the minute's two checks run.
    await runAt('2026-11-10T14:07:00.000Z')
    expect(db.other).toEqual([])
    expect(db.sent).toHaveLength(3)
    // The skill coach's asks of the last three days.
    expect(db.sent[0].args).toContain('coachAsks')
    // The day's Ask runs, every one of them in one request: three by day, the deep one and nine by hand.
    expect(db.sent[1].sql).toContain("store = 'bridge'")
    expect(db.sent[1].sql.match(/\?/g)).toHaveLength(14)
    expect(db.sent[1].args).toContain('task:2026-11-10:ask')
    expect(db.sent[1].args).toContain('task:2026-11-10:hand.9')
    // The questions waiting; with none, the answered ones are never asked for.
    expect(db.sent[2].args).toContain('askTurns')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore, tursoStore, BRAIN_APP, type BriefRow } from './turso'

// When the Worker writes one of its own rows (2026-11-12): `updated_at` is the time the caller hands in, and
// `synced_at` is the moment of the write itself. A line can take half a minute to write after its time was taken,
// and the phone reads the Worker's rows by `synced_at`: a row stamped at the earlier time could land behind rows the
// phone had already read. Checked on the live store's own statements, with a stand-in for the database's address,
// and on the store in memory the tests use.

const EARLIER = '2026-01-01T00:00:00.000Z'
const brief: BriefRow = { id: '2026-01-01:brief', day: '2026-01-01', kind: 'brief', text: 'One line.', mode: 'observation', factIds: [], cardIds: [], model: 'm', at: EARLIER }

/** Every statement the live store sends, with its arguments, answered as a write that went through. */
function recorded(): { sent: { sql: string; args: unknown[] }[]; fetch: typeof fetch } {
  const sent: { sql: string; args: unknown[] }[] = []
  const answer = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init)
    const body = (await req.json()) as { requests: { type: string; stmt?: { sql?: string; args?: { value?: unknown }[] } }[] }
    const results = body.requests.map((r) => {
      if (r.type !== 'execute') return { type: 'ok', response: { type: r.type } }
      sent.push({ sql: r.stmt?.sql ?? '', args: (r.stmt?.args ?? []).map((a) => a.value) })
      return { type: 'ok', response: { type: 'execute', result: { cols: [], rows: [], affected_row_count: 1, last_insert_rowid: null } } }
    })
    return new Response(JSON.stringify({ baton: null, base_url: null, results }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { sent, fetch: answer }
}

afterEach(() => vi.unstubAllGlobals())

describe('the Worker’s own rows, as written', () => {
  it('stamps each row’s sync time at the write, and keeps the time handed in as its update time', async () => {
    const db = recorded()
    vi.stubGlobal('fetch', db.fetch)
    const store = tursoStore('https://stand-in.database.test', 'stand-in-token')
    const before = Date.now()
    await store.writeBrief(brief, EARLIER)
    await store.markPushed('ping:1', EARLIER)
    await store.writeCoach({ id: '2026-01-01:coach', day: '2026-01-01', block: 'morning', path: 'social', ids: [], versions: {}, model: 'm', at: EARLIER } as never, EARLIER)
    await store.withdrawCoach('2026-01-01:coach', EARLIER)
    await store.writeProposal({ id: 'ask:1', day: '2026-01-01' } as never, EARLIER)
    await store.writeAnswer({ id: 'turn:1', day: '2026-01-01' } as never, EARLIER)
    await store.writeBrainRow('served', 'task:2026-01-01:line', '2026-01-01', { at: EARLIER }, EARLIER)
    const after = Date.now()
    expect(db.sent).toHaveLength(7)
    for (const s of db.sent) {
      // updated_at and synced_at, by their place in each statement.
      const [updatedAt, syncedAt] = s.sql.startsWith('UPDATE') ? [s.args[0], s.args[1]] : [s.args[5], s.args[7]]
      expect(updatedAt, s.sql).toBe(EARLIER)
      expect(syncedAt, s.sql).not.toBe(EARLIER)
      expect(Date.parse(String(syncedAt)), s.sql).toBeGreaterThanOrEqual(before)
      expect(Date.parse(String(syncedAt)), s.sql).toBeLessThanOrEqual(after)
    }
  })

  it('does the same in the store the tests use, each write later than the last', async () => {
    const store = memoryStore()
    await store.writeBrief(brief, EARLIER)
    await store.writeBrainRow('served', 'task:2026-01-01:line', '2026-01-01', { at: EARLIER }, EARLIER)
    const a = store.rows.get(`${BRAIN_APP}|briefs|2026-01-01:brief`)
    const b = store.rows.get(`${BRAIN_APP}|served|task:2026-01-01:line`)
    expect(a?.updated_at).toBe(EARLIER)
    expect(a?.synced_at).not.toBe(EARLIER)
    expect(String(b?.synced_at) > String(a?.synced_at)).toBe(true)
  })
})

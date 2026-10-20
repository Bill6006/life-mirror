import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The ping's address as the Worker sends to it (the owner's decision of 2026-10-20): the cron at a ping time, a push by
// hand and the report all read the address the phone's settings record carries, and the secret copied by hand only for a
// record without the field. The database and the push service are stand-ins: nothing leaves the machine.

const h = vi.hoisted(() => ({ sent: [] as string[], store: null as unknown }))

vi.mock('./turso', async (original) => ({ ...(await original<typeof import('./turso')>()), tursoStore: () => h.store }))
vi.mock('./push', async (original) => ({
  ...(await original<typeof import('./push')>()),
  sendPush: async (sub: { endpoint: string }) => {
    h.sent.push(sub.endpoint)
    return new Response(null, { status: 201 })
  },
}))

import handler from './index'
import { APP, memoryStore } from './turso'

const SYNCED = { endpoint: 'https://push.example.test/send/synced', expirationTime: null, keys: { p256dh: 'synced-p256dh', auth: 'synced-auth' } }
const SECRET = JSON.stringify({ endpoint: 'https://push.example.test/send/secret', keys: { p256dh: 'secret-p256dh', auth: 'secret-auth' } })
const env = { TIMEZONE: 'America/New_York', FALLBACK_TIME: '11:00', BRIEF_HOUR: '5', TURSO_URL: 'https://db.test', TURSO_TOKEN: 'token', RUN_KEY: 'run-key', VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'https://example.test', PUSH_SUBSCRIPTION: SECRET }
/** 09:30 in New York on 20 October: the morning ping's tick. */
const AT_0930 = '2026-10-20T13:30:00Z'

function settings(body: Record<string, unknown>) {
  return { app: APP, store: 'settings', id: '1', day: null, body: JSON.stringify({ id: 1, frequency: 'three', quietStart: '22:00', quietEnd: '07:00', reminders: { enabled: true, times: { morning: '09:30', afternoon: '13:00', evening: '19:30' } }, ...body }), updated_at: '2026-10-20T12:00:00.000Z', deleted: 0 as const, synced_at: '2026-10-20T12:00:00.000Z' }
}

async function tick(iso: string): Promise<void> {
  const waits: Promise<unknown>[] = []
  await handler.scheduled?.({ scheduledTime: Date.parse(iso), cron: '* * * * *', noRetry() {} } as never, env as never, { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException() {} } as never)
  await Promise.all(waits)
}

async function run(path: string): Promise<Record<string, unknown>> {
  const r = await handler.fetch!(new Request(`https://w.test${path}`) as never, env as never, {} as never)
  return (await r.json()) as Record<string, unknown>
}

beforeEach(() => {
  h.sent = []
  h.store = memoryStore()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'))
})
afterEach(() => vi.restoreAllMocks())

const put = (row: ReturnType<typeof settings>) => (h.store as ReturnType<typeof memoryStore>).put(row)

describe('the ping, sent to the address the phone’s settings carry', () => {
  it('pings that address at the reminder time, never the secret copied by hand, and marks it sent', async () => {
    put(settings({ push: { subscription: SYNCED, subscribedAt: '2026-10-20T11:00:00.000Z' } }))
    await tick(AT_0930)
    expect(h.sent).toEqual([SYNCED.endpoint])
    expect(await (h.store as ReturnType<typeof memoryStore>).isPushed('ping:2026-10-20:09:30')).toBe(true)
  })

  it('sends nothing at all when the phone turned the ping off, never the secret in its place', async () => {
    put(settings({ push: { subscription: null, subscribedAt: null } }))
    await tick(AT_0930)
    expect(h.sent).toEqual([])
  })

  it('pings the secret copied by hand only for a record from an app before the change', async () => {
    put(settings({}))
    await tick(AT_0930)
    expect(h.sent).toEqual(['https://push.example.test/send/secret'])
  })

  it('pushes by hand to the same address, and the report says where it read it and when it was set up, never the address', async () => {
    put(settings({ push: { subscription: SYNCED, subscribedAt: '2026-10-20T11:00:00.000Z' } }))
    expect(await run('/run/push?key=run-key&kind=test')).toEqual({ sent: true, kind: 'test' })
    expect(h.sent).toEqual([SYNCED.endpoint])
    const report = await run('/run/pings?key=run-key&day=2026-10-20')
    expect(report).toMatchObject({ address: true, addressFrom: 'cloud', addressSetUpAt: '2026-10-20T11:00:00.000Z' })
    expect(JSON.stringify(report)).not.toContain('push.example.test')
  })
})

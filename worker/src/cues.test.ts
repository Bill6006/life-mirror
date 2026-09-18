import { describe, expect, it } from 'vitest'
import { runCues, runPings } from './cues'
import { APP, BRAIN_APP, memoryStore } from './turso'

// A cue whose moment has come: once, only for a plan not yet started, only within twenty
// minutes of its time, the latest plan per commitment; the push carries nothing.

const env = { TIMEZONE: 'America/New_York' }
const AT_2005 = new Date('2026-09-19T00:05:00Z')

function plan(id: string, body: Record<string, unknown>, day = '2026-09-18') {
  return { app: APP, store: 'intentions', id, day, body: JSON.stringify({ aimId: 1, cue: 'afterBedtime', time: '20:00', setAt: '2026-09-18T13:00:00.000Z', offerId: null, step: 'French · Ten words · say it', ...body }), updated_at: '2026-09-18T13:00:00.000Z', deleted: 0 as const, synced_at: '2026-09-18T13:00:00.000Z' }
}

describe('the cue reminder', () => {
  it('sends one content-free push for the plans due, marks each, and never sends twice', async () => {
    const store = memoryStore()
    store.put(plan('5', {}))
    store.put(plan('6', { aimId: 2, time: '19:50' }))
    const sent: string[] = []
    const send = async (payload: string) => {
      sent.push(payload)
      return true
    }
    expect(await runCues(env, store, AT_2005, send)).toEqual({ sent: true, due: ['5', '6'], reason: 'sent' })
    expect(sent).toEqual(['{"kind":"cue"}'])
    expect(store.rows.get(`${BRAIN_APP}|pushes|cue:5`)).toBeDefined()
    expect(await runCues(env, store, new Date('2026-09-19T00:10:00Z'), send)).toEqual({ sent: false, due: [], reason: 'nothing due' })
    expect(sent).toHaveLength(1)
  })

  it('leaves alone a plan started, one not yet due, one long past, an older plan replaced, and yesterday’s', async () => {
    const store = memoryStore()
    store.put(plan('1', { offerId: 42 }))
    store.put(plan('2', { aimId: 2, time: '20:30' }))
    store.put(plan('3', { aimId: 3, time: '19:30' }))
    store.put(plan('4', { aimId: 4, time: '20:00', setAt: '2026-09-18T12:00:00.000Z' }))
    store.put(plan('5', { aimId: 4, cue: 'nextCheckIn', time: '21:00', setAt: '2026-09-18T12:30:00.000Z' }))
    store.put(plan('6', { aimId: 6 }, '2026-09-17'))
    const send = async () => true
    expect(await runCues(env, store, AT_2005, send)).toEqual({ sent: false, due: [], reason: 'nothing due' })
  })

  it('sends nothing without a push address, and marks nothing when the push service refuses', async () => {
    const store = memoryStore()
    store.put(plan('5', {}))
    expect(await runCues(env, store, AT_2005, null)).toEqual({ sent: false, due: ['5'], reason: 'no push address or key' })
    expect(await runCues(env, store, AT_2005, async () => false)).toEqual({ sent: false, due: ['5'], reason: 'the push service refused it' })
    expect(store.rows.get(`${BRAIN_APP}|pushes|cue:5`)).toBeUndefined()
  })
})

describe('the check-in ping', () => {
  const pingEnv = { TIMEZONE: 'America/New_York', PING_TIMES: '07:30, 13:00,19:30' }

  it('goes once inside the quarter hour that starts at each time, content-free, and never twice', async () => {
    const store = memoryStore()
    const sent: string[] = []
    const send = async (payload: string) => {
      sent.push(payload)
      return true
    }
    // 19:30 in New York on 18 September is 23:30 UTC.
    expect(await runPings(pingEnv, store, new Date('2026-09-18T23:30:00Z'), send)).toEqual({ sent: true, due: '19:30', reason: 'sent' })
    expect(sent).toEqual(['{"kind":"ping"}'])
    expect(await runPings(pingEnv, store, new Date('2026-09-18T23:40:00Z'), send)).toEqual({ sent: false, due: '19:30', reason: 'sent already' })
    expect(await runPings(pingEnv, store, new Date('2026-09-18T23:45:00Z'), send)).toEqual({ sent: false, due: null, reason: 'not a ping time' })
    // The next morning's 07:30 is its own ping.
    expect((await runPings(pingEnv, store, new Date('2026-09-19T11:30:00Z'), send)).sent).toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('says why when it cannot send, and marks nothing', async () => {
    const store = memoryStore()
    expect(await runPings(pingEnv, store, new Date('2026-09-18T17:00:00Z'), null)).toEqual({ sent: false, due: '13:00', reason: 'no push address or key' })
    expect(await runPings(pingEnv, store, new Date('2026-09-18T17:00:00Z'), async () => false)).toEqual({ sent: false, due: '13:00', reason: 'the push service refused it' })
    expect(await runPings({ TIMEZONE: 'America/New_York' }, store, new Date('2026-09-18T17:00:00Z'), async () => true)).toEqual({ sent: false, due: null, reason: 'not a ping time' })
    expect(store.rows.size).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { runCues, runPings } from './cues'
import { APP, BRAIN_APP, memoryStore } from './turso'

// A cue whose moment has come: once, only for a plan not yet started, only within twenty
// minutes of its time, the latest plan per commitment; the push carries nothing.

const env = { TIMEZONE: 'America/New_York' }
const AT_2005 = new Date('2026-09-19T00:05:00Z')

function plan(id: string, body: Record<string, unknown>, day = '2026-09-18') {
  return { app: APP, store: 'intentions', id, day, body: JSON.stringify({ aimId: 1, cue: 'afterBedtime', time: '20:00', setAt: '2026-09-18T13:00:00.000Z', offerId: null, step: 'Veltish · Ten words · say it', ...body }), updated_at: '2026-09-18T13:00:00.000Z', deleted: 0 as const, synced_at: '2026-09-18T13:00:00.000Z' }
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
    expect(await runCues(env, store, AT_2005, send)).toEqual({ sent: true, due: ['5', '6'], followUps: [], reason: 'sent' })
    expect(sent).toEqual(['{"kind":"cue"}'])
    expect(store.rows.get(`${BRAIN_APP}|pushes|cue:5`)).toBeDefined()
    expect(await runCues(env, store, new Date('2026-09-19T00:10:00Z'), send)).toEqual({ sent: false, due: [], followUps: [], reason: 'nothing due' })
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
    expect(await runCues(env, store, AT_2005, send)).toEqual({ sent: false, due: [], followUps: [], reason: 'nothing due' })
  })

  it('sends nothing without a push address, and marks nothing when the push service refuses', async () => {
    const store = memoryStore()
    store.put(plan('5', {}))
    expect(await runCues(env, store, AT_2005, null)).toEqual({ sent: false, due: ['5'], followUps: [], reason: 'no push address or key' })
    expect(await runCues(env, store, AT_2005, async () => false)).toEqual({ sent: false, due: ['5'], followUps: [], reason: 'the push service refused it' })
    expect(store.rows.get(`${BRAIN_APP}|pushes|cue:5`)).toBeUndefined()
  })
})

describe('one follow-up at the moment of decision', () => {
  it('goes once, forty-five minutes on, only for a plan reminded of and still not started, and never again', async () => {
    const store = memoryStore()
    store.put(plan('5', {}))
    const sent: string[] = []
    const send = async (payload: string) => {
      sent.push(payload)
      return true
    }
    await runCues(env, store, AT_2005, send)
    // 20:30: too soon. 20:45: the one follow-up. 21:00: never another.
    expect((await runCues(env, store, new Date('2026-09-19T00:30:00Z'), send)).followUps).toEqual([])
    expect(await runCues(env, store, new Date('2026-09-19T00:45:00Z'), send)).toEqual({ sent: true, due: [], followUps: ['5'], reason: 'sent' })
    expect(sent).toEqual(['{"kind":"cue"}', '{"kind":"cue2"}'])
    expect((await runCues(env, store, new Date('2026-09-19T01:00:00Z'), send)).followUps).toEqual([])
    expect(sent).toHaveLength(2)
  })

  it('never follows up a plan that was started, or one that was never reminded of', async () => {
    const store = memoryStore()
    store.put(plan('5', {}))
    const send = async () => true
    // Never reminded of at 20:00, so nothing to follow up at 20:45.
    expect((await runCues(env, store, new Date('2026-09-19T00:45:00Z'), send)).followUps).toEqual([])
    const started = memoryStore()
    started.put(plan('7', {}))
    await runCues(env, started, AT_2005, send)
    started.put(plan('7', { offerId: 12 }))
    expect((await runCues(env, started, new Date('2026-09-19T00:45:00Z'), send)).followUps).toEqual([])
  })
})

/** Your settings as the phone copies them to the cloud: only what the pings and cues read. */
function settings(body: Record<string, unknown>) {
  return { app: APP, store: 'settings', id: '1', day: null, body: JSON.stringify({ id: 1, frequency: 'three', quietStart: '22:00', quietEnd: '07:00', reminders: { enabled: true, times: { morning: '07:30', afternoon: '13:00', evening: '19:30' } }, ...body }), updated_at: '2026-09-18T12:00:00.000Z', deleted: 0 as const, synced_at: '2026-09-18T12:00:00.000Z' }
}

function aimRow(id: string, body: Record<string, unknown>) {
  return { app: APP, store: 'aims', id, day: null, body: JSON.stringify({ id: Number(id), kind: 'certification', archivedAt: null, ...body }), updated_at: '2026-09-18T12:00:00.000Z', deleted: 0 as const, synced_at: '2026-09-18T12:00:00.000Z' }
}

describe('the check-in ping (stage 1, item b: your own reminder times, and nothing while reminders are off)', () => {
  it('goes once inside the quarter hour that starts at each of your reminder times, content-free, and never twice', async () => {
    const store = memoryStore()
    store.put(settings({ reminders: { enabled: true, times: { morning: '07:40', afternoon: '13:15', evening: '19:45' } } }))
    const sent: string[] = []
    const send = async (payload: string) => {
      sent.push(payload)
      return true
    }
    // 19:45 in New York on 18 September is 23:45 UTC; 19:30, the old fixed time, is no ping time now.
    expect(await runPings(env, store, new Date('2026-09-18T23:30:00Z'), send)).toEqual({ sent: false, due: null, reason: 'not a ping time' })
    expect(await runPings(env, store, new Date('2026-09-18T23:45:00Z'), send)).toEqual({ sent: true, due: '19:45', reason: 'sent' })
    expect(sent).toEqual(['{"kind":"ping"}'])
    expect(await runPings(env, store, new Date('2026-09-18T23:55:00Z'), send)).toEqual({ sent: false, due: '19:45', reason: 'sent already' })
    expect(await runPings(env, store, new Date('2026-09-19T00:00:00Z'), send)).toEqual({ sent: false, due: null, reason: 'not a ping time' })
    // The next morning's 07:40 is its own ping, at the 07:45 tick.
    expect((await runPings(env, store, new Date('2026-09-19T11:45:00Z'), send)).sent).toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('sends nothing at all while reminders are off, at any of the times, and nothing before the phone has copied its settings (their default is off)', async () => {
    const off = memoryStore()
    off.put(settings({ reminders: { enabled: false, times: { morning: '07:30', afternoon: '13:00', evening: '19:30' } } }))
    const none = memoryStore()
    let calls = 0
    const send = async () => {
      calls++
      return true
    }
    for (const at of ['2026-09-18T11:30:00Z', '2026-09-18T17:00:00Z', '2026-09-18T23:30:00Z']) {
      expect(await runPings(env, off, new Date(at), send)).toEqual({ sent: false, due: null, reason: 'reminders are off' })
      expect(await runPings(env, none, new Date(at), send)).toEqual({ sent: false, due: null, reason: 'reminders are off' })
    }
    expect(calls).toBe(0)
  })

  it('pings only the check-ins the day holds, and never in quiet hours', async () => {
    const two = memoryStore()
    two.put(settings({ frequency: 'two' }))
    const send = async () => true
    // Morning and evening only: 13:00 holds no check-in.
    expect(await runPings(env, two, new Date('2026-09-18T17:00:00Z'), send)).toEqual({ sent: false, due: null, reason: 'not a ping time' })
    expect((await runPings(env, two, new Date('2026-09-18T23:30:00Z'), send)).sent).toBe(true)
    // An evening reminder at 22:30 with quiet hours from 22:00: no ping.
    const late = memoryStore()
    late.put(settings({ reminders: { enabled: true, times: { morning: '07:30', afternoon: '13:00', evening: '22:30' } } }))
    expect(await runPings(env, late, new Date('2026-09-19T02:30:00Z'), send)).toEqual({ sent: false, due: '22:30', reason: 'quiet hours' })
  })

  it('says why when it cannot send, and marks nothing', async () => {
    const store = memoryStore()
    store.put(settings({}))
    const before = store.rows.size
    expect(await runPings(env, store, new Date('2026-09-18T17:00:00Z'), null)).toEqual({ sent: false, due: '13:00', reason: 'no push address or key' })
    expect(await runPings(env, store, new Date('2026-09-18T17:00:00Z'), async () => false)).toEqual({ sent: false, due: '13:00', reason: 'the push service refused it' })
    expect(store.rows.size).toBe(before)
  })
})

describe('a plan cue keeps quiet hours and skips a commitment at rest (stage 1, item b)', () => {
  it('sends nothing for a plan whose moment falls in quiet hours, and no follow-up into them', async () => {
    const store = memoryStore()
    store.put(settings({ quietStart: '20:30', quietEnd: '07:00' }))
    store.put(plan('5', { time: '20:40' }))
    const send = async () => true
    expect(await runCues(env, store, new Date('2026-09-19T00:45:00Z'), send)).toEqual({ sent: false, due: [], followUps: [], reason: 'nothing due' })
    // Reminded at 20:00, before quiet hours: the follow-up at 20:45 would fall inside them.
    const early = memoryStore()
    early.put(settings({ quietStart: '20:30', quietEnd: '07:00' }))
    early.put(plan('6', {}))
    expect((await runCues(env, early, AT_2005, send)).due).toEqual(['6'])
    expect((await runCues(env, early, new Date('2026-09-19T00:45:00Z'), send)).followUps).toEqual([])
  })

  it('never cues a paused or archived commitment; one not yet in the cloud copy is cued', async () => {
    const store = memoryStore()
    store.put(plan('5', { aimId: 1 }))
    store.put(plan('6', { aimId: 2 }))
    store.put(plan('7', { aimId: 3 }))
    store.put(aimRow('1', { pausedAt: '2026-09-17T12:00:00.000Z' }))
    store.put(aimRow('2', { archivedAt: '2026-09-17T12:00:00.000Z' }))
    expect(await runCues(env, store, AT_2005, async () => true)).toEqual({ sent: true, due: ['7'], followUps: [], reason: 'sent' })
  })
})

describe('timing (stage 3, group 2)', () => {
  const pushed = (id: string, day: string) => ({ app: BRAIN_APP, store: 'pushes', id, day, body: JSON.stringify({ at: `${day}T23:00:00.000Z` }), updated_at: `${day}T23:00:00.000Z`, deleted: 0 as const, synced_at: `${day}T23:00:00.000Z` })
  /** A past plan of commitment 1 that was reminded of and followed up, started afterwards or not. */
  const followed = (store: ReturnType<typeof memoryStore>, id: string, day: string, started: boolean) => {
    store.put(plan(id, { offerId: started ? 99 : null }, day))
    store.put(pushed(`cue:${id}`, day))
    store.put(pushed(`cue2:${id}`, day))
  }
  const send = async () => true

  it('reminds at the moment the commitment actually happens when the phone learned one, and follows up forty-five minutes after it', async () => {
    const store = memoryStore()
    store.put(plan('7', { remindAt: '20:45' }))
    // 20:05: the cue's own time has passed, but the plan's moment has not.
    expect((await runCues(env, store, AT_2005, send)).due).toEqual([])
    expect((await runCues(env, store, new Date('2026-09-19T00:50:00Z'), send)).due).toEqual(['7'])
    expect((await runCues(env, store, new Date('2026-09-19T01:30:00Z'), send)).followUps).toEqual(['7'])
  })

  it('retires a commitment’s follow-up once its last five each led to no start that day', async () => {
    const store = memoryStore()
    for (const [i, day] of ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].entries()) followed(store, `p${i}`, day, false)
    store.put(plan('5', {}))
    await runCues(env, store, AT_2005, send)
    expect(await runCues(env, store, new Date('2026-09-19T00:45:00Z'), send)).toEqual({ sent: false, due: [], followUps: [], retired: ['5'], reason: 'nothing due' })
    expect(store.rows.get(`${BRAIN_APP}|pushes|cue2:5`)).toBeUndefined()
  })

  it('keeps the follow-up while one of the last five led to a start, or fewer than five were sent', async () => {
    const one = memoryStore()
    for (const [i, day] of ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].entries()) followed(one, `p${i}`, day, i === 2)
    one.put(plan('5', {}))
    await runCues(env, one, AT_2005, send)
    expect((await runCues(env, one, new Date('2026-09-19T00:45:00Z'), send)).followUps).toEqual(['5'])
    const four = memoryStore()
    for (const [i, day] of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].entries()) followed(four, `p${i}`, day, false)
    four.put(plan('5', {}))
    await runCues(env, four, AT_2005, send)
    expect((await runCues(env, four, new Date('2026-09-19T00:45:00Z'), send)).followUps).toEqual(['5'])
  })

  it('tries a retired follow-up once more after thirty days without one, and counts only its own commitment’s', async () => {
    const store = memoryStore()
    for (const [i, day] of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].entries()) followed(store, `p${i}`, day, false)
    store.put(plan('5', {}))
    await runCues(env, store, AT_2005, send)
    expect((await runCues(env, store, new Date('2026-09-19T00:45:00Z'), send)).followUps).toEqual(['5'])
    // Commitment 12's five unanswered follow-ups never retire commitment 1's, though its rows hold the same digits.
    const other = memoryStore()
    for (const [i, day] of ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].entries()) {
      other.put(plan(`q${i}`, { aimId: 12 }, day))
      other.put(pushed(`cue2:q${i}`, day))
    }
    other.put(plan('5', {}))
    await runCues(env, other, AT_2005, send)
    expect((await runCues(env, other, new Date('2026-09-19T00:45:00Z'), send)).followUps).toEqual(['5'])
  })
})

import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import cards from '../../src/library.json'
import { runBrief, runReview } from './brief'
import { memoryStore, APP, BRAIN_APP } from './turso'
import type { Message } from './prompt'

// The morning line and the Sunday review, end to end against the store in memory and a model
// stood in for: the newest facts go in, the answer is checked, one row comes out, once; every
// failure falls through the chain.

const env = { TIMEZONE: 'America/New_York', BRIEF_HOUR: '5', MODELS: 'model-a, model-b', LIBRARY_URL: 'https://example.test/library.json' }
const fetcher = (async () => new Response(JSON.stringify(cards), { headers: { 'content-type': 'application/json' } })) as typeof fetch
const MORNING = new Date('2026-09-18T09:15:00Z')
const SUNDAY = new Date('2026-09-20T09:15:00Z')

const sheet: FactSheet = {
  version: 1,
  day: '2026-09-17',
  builtAt: '2026-09-17T23:00:00.000Z',
  hour: 23,
  weeks: 3,
  days: 22,
  direction: null,
  said: [{ day: '2026-09-17', source: 'phone', situationId: 'first-skill', text: 'The phone said this.', feedback: null }],
  facts: [
    { id: 'aim.1', tags: ['study', 'cue'], text: 'French: planned after her bedtime at 20:00, not started; cues: after her bedtime started 1 of 4.', values: { name: 'French', cue_afterBedtime_n: 4, cue_afterBedtime_started: 1 }, n: 4 },
    { id: 'trajectory.1', tags: ['study', 'habit'], text: 'French: steps started per week over the last four weeks, oldest first: 3, 2, 0, 0.', values: { name: 'French', aimId: 1, w3: 3, w2: 2, w1: 0, w0: 0 }, n: 5 },
    { id: 'note.2026-09-16.evening', tags: ['writing'], text: 'On 2026-09-16, at the evening check-in, you wrote: “work was heavy”.', values: { day: '2026-09-16', block: 'evening', note: 'work was heavy' } },
  ],
}

function withFacts(day: string, updatedAt: string) {
  const store = memoryStore()
  store.put({ app: APP, store: 'facts', id: day, day, body: JSON.stringify({ day, builtAt: updatedAt, updatedAt, sheet: { ...sheet, day } }), updated_at: updatedAt, deleted: 0, synced_at: updatedAt })
  return store
}

const good = JSON.stringify({ mode: 'strategy', text: 'After her bedtime held 1 of 4 plans. Try the next check-in as the cue this week.', factIds: ['aim.1'], cardIds: ['implementation-intentions'], action: { kind: 'plan', aimId: 1, cue: 'nextCheckIn' } })
const review = JSON.stringify({ held: 'Nothing on French held this week: 0 steps started.', didNot: 'French went from 3 and 2 sittings to 0 and 0.', change: 'Pin one short sitting to the next check-in instead of after her bedtime, which held 1 of 4.', factIds: ['aim.1', 'trajectory.1'], cardIds: ['implementation-intentions'] })

describe('the morning line', () => {
  it('writes the line once from yesterday’s facts, with the model that produced it and the one tap it offers', async () => {
    const store = withFacts('2026-09-17', '2026-09-17T23:10:00.000Z')
    const calls: string[] = []
    const run = async (model: string) => {
      calls.push(model)
      return { response: good }
    }
    const r = await runBrief(env, store, run, MORNING, { fetcher })
    expect(r).toMatchObject({ wrote: true, reason: 'brief', day: '2026-09-18', model: 'model-a', attempts: [], action: { kind: 'plan', aimId: 1, cue: 'nextCheckIn' } })
    const row = store.rows.get(`${BRAIN_APP}|briefs|2026-09-18:brief`)
    expect(JSON.parse(row?.body ?? '{}')).toMatchObject({ id: '2026-09-18:brief', day: '2026-09-18', kind: 'brief', mode: 'strategy', model: 'model-a', factsDay: '2026-09-17', cardIds: ['implementation-intentions'], action: { kind: 'plan', aimId: 1, cue: 'nextCheckIn' } })
    expect(calls).toEqual(['model-a'])
    expect(await runBrief(env, store, run, MORNING, { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
    expect((await runBrief(env, store, run, MORNING, { fetcher, force: true })).wrote).toBe(true)
  })

  it('shows the model the person’s own notes, the trajectories and the loop to close, and asks for one action or none', async () => {
    const store = withFacts('2026-09-17', '2026-09-17T23:10:00.000Z')
    let system = ''
    let user = ''
    const run = async (_model: string, messages: Message[]) => {
      system = messages[0].content
      user = messages[1].content
      return { response: good }
    }
    await runBrief(env, store, run, MORNING, { fetcher })
    expect(user).toContain('[note.2026-09-16.evening] On 2026-09-16, at the evening check-in, you wrote: “work was heavy”.')
    expect(user).toContain('[trajectory.1]')
    expect(system).toContain('the person\'s own words')
    expect(system).toContain('"kind":"plan"')
    expect(system).toContain('Close that loop')
  })

  it('refuses an action the sheet does not make possible, and takes the answer without one', async () => {
    const store = withFacts('2026-09-17', '2026-09-17T23:10:00.000Z')
    let calls = 0
    const run = async (_model: string, messages: Message[]) => {
      calls++
      if (messages.length === 2) return { response: JSON.stringify({ ...JSON.parse(good), action: { kind: 'plan', aimId: 9, cue: 'afterBedtime' } }) }
      expect(messages[messages.length - 1].content).toContain('no commitment aim.9')
      return { response: JSON.stringify({ ...JSON.parse(good), action: null }) }
    }
    const r = await runBrief(env, store, run, MORNING, { fetcher })
    expect(r).toMatchObject({ wrote: true, model: 'model-a', action: null })
    expect(calls).toBe(2)
  })

  it('writes Saturday’s line from Friday’s facts for Saturday: both days named, a pickup refused, the day stored', async () => {
    const friday: FactSheet = {
      ...sheet,
      day: '2026-09-18',
      facts: [
        ...sheet.facts,
        { id: 'week.today', tags: ['cue'], text: 'Today is Friday; a daycare day with pickup at 17:30.', values: { weekday: 'Friday', daycare: 1, pickup: '17:30', office: 0, church: 0, studyNight: 0 } },
        { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Saturday; not a daycare day.', values: { day: '2026-09-19', weekday: 'Saturday', daycare: 0, pickup: null, office: 0, church: 0, studyNight: 0 } },
      ],
    }
    const store = memoryStore()
    store.put({ app: APP, store: 'facts', id: '2026-09-18', day: '2026-09-18', body: JSON.stringify({ day: '2026-09-18', updatedAt: '2026-09-18T23:10:00.000Z', sheet: friday }), updated_at: '2026-09-18T23:10:00.000Z', deleted: 0, synced_at: '2026-09-18T23:10:00.000Z' })
    let prompt = ''
    const run = async (_model: string, messages: Message[]) => {
      prompt = messages[1].content
      if (messages.length === 2) return { response: JSON.stringify({ mode: 'recommendation', text: 'After picking up your child, do a short pleasant task.', factIds: ['aim.1'], cardIds: [] }) }
      expect(messages[messages.length - 1].content).toContain('speaks of pickup or daycare, which Saturday 2026-09-19 does not hold')
      return { response: JSON.stringify({ mode: 'recommendation', text: 'One short sitting after her bedtime keeps the thread.', factIds: ['aim.1'], cardIds: [] }) }
    }
    const r = await runBrief(env, store, run, new Date('2026-09-19T09:15:00Z'), { fetcher })
    expect(r).toMatchObject({ wrote: true, day: '2026-09-19', forDay: '2026-09-19', factsDay: '2026-09-18' })
    expect(r.attempts).toEqual(['model-a: speaks of pickup or daycare, which Saturday 2026-09-19 does not hold'])
    expect(prompt).toContain('You are writing for 2026-09-19')
    expect(JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|2026-09-19:brief`)?.body ?? '{}')).toMatchObject({ forDay: '2026-09-19', factsDay: '2026-09-18' })
  })

  it('does nothing outside the hour, without facts, or with facts too old', async () => {
    const run = async () => ({ response: good })
    expect(await runBrief(env, withFacts('2026-09-17', '2026-09-17T23:10:00.000Z'), run, new Date('2026-09-18T12:15:00Z'), { fetcher })).toMatchObject({ wrote: false, reason: 'not the hour (8)' })
    expect(await runBrief(env, memoryStore(), run, MORNING, { fetcher })).toMatchObject({ wrote: false, reason: 'no facts for yesterday or today' })
    expect((await runBrief(env, withFacts('2026-09-17', '2026-09-15T23:10:00.000Z'), run, MORNING, { fetcher })).reason).toMatch(/too old/)
  })

  it('falls through the chain: a model that throws, then an answer refused, then one that passes', async () => {
    const store = withFacts('2026-09-17', '2026-09-17T23:10:00.000Z')
    let calls = 0
    const run = async (model: string, messages: Message[]) => {
      calls++
      if (model === 'model-a') throw new Error('capacity')
      if (messages.length === 2) return { response: JSON.stringify({ mode: 'warning', text: 'Held 1 of 9 plans.', factIds: ['aim.1'], cardIds: [] }) }
      expect(messages[messages.length - 1].content).toContain('the number 9 is not in the cited facts')
      return { response: good }
    }
    const r = await runBrief(env, store, run, MORNING, { fetcher })
    expect(r).toMatchObject({ wrote: true, model: 'model-b' })
    expect(r.attempts).toEqual(['model-a: capacity', 'model-b: the number 9 is not in the cited facts'])
    expect(calls).toBe(3)
  })

  it('writes nothing when no model passes, and says why', async () => {
    const store = withFacts('2026-09-17', '2026-09-17T23:10:00.000Z')
    const run = async () => ({ response: 'I would rather chat.' })
    const r = await runBrief(env, store, run, MORNING, { fetcher })
    expect(r).toMatchObject({ wrote: false, reason: 'no model produced a line that passed' })
    expect(r.attempts).toHaveLength(4)
    expect(store.rows.size).toBe(1)
  })
})

describe('the week reviewed', () => {
  it('writes three parts on Sunday at the hour, once, beside the day’s ordinary line; what was said goes in with how it landed', async () => {
    const store = withFacts('2026-09-19', '2026-09-19T23:10:00.000Z')
    store.put({ app: BRAIN_APP, store: 'briefs', id: '2026-09-19:brief', day: '2026-09-19', body: JSON.stringify({ day: '2026-09-19', text: 'Yesterday’s line.' }), updated_at: '2026-09-19T09:15:00.000Z', deleted: 0, synced_at: '2026-09-19T09:15:00.000Z' })
    store.put({ app: APP, store: 'briefFeedback', id: '1', day: '2026-09-19', body: JSON.stringify({ briefKey: 'worker:2026-09-19:brief', answer: 'knew' }), updated_at: '2026-09-19T10:00:00.000Z', deleted: 0, synced_at: '2026-09-19T10:00:00.000Z' })
    let prompt = ''
    const run = async (_model: string, messages: Message[]) => {
      prompt = messages[1].content
      return { response: messages[0].content.includes('weekly review') ? review : good }
    }
    expect(await runBrief(env, store, run, SUNDAY, { fetcher })).toMatchObject({ wrote: true, reason: 'brief', day: '2026-09-20' })
    const r = await runReview(env, store, run, SUNDAY, { fetcher })
    expect(r).toMatchObject({ wrote: true, reason: 'review', day: '2026-09-20', model: 'model-a' })
    expect(prompt).toContain('weekly review')
    expect(prompt).toContain('2026-09-19 (knew): Yesterday’s line.')
    expect(prompt).toContain('The phone said this.')
    const row = JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|2026-09-20:review`)?.body ?? '{}')
    expect(row).toMatchObject({ kind: 'review', parts: { held: expect.stringContaining('0 steps'), didNot: expect.stringContaining('3 and 2'), change: expect.stringContaining('next check-in') } })
    expect(JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|2026-09-20:brief`)?.body ?? '{}').kind).toBe('brief')
    expect(await runReview(env, store, run, SUNDAY, { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
  })

  it('keeps to Sunday unless forced, and refuses a part that breaks a rule', async () => {
    const store = withFacts('2026-09-17', '2026-09-17T23:10:00.000Z')
    const run = async () => ({ response: review })
    expect(await runReview(env, store, run, MORNING, { fetcher })).toMatchObject({ wrote: false, reason: 'not Sunday at the hour' })
    expect((await runReview(env, store, run, MORNING, { fetcher, force: true })).wrote).toBe(true)
    const broken = JSON.stringify({ ...JSON.parse(review), didNot: 'A weak week: 7 sittings missed.' })
    const r = await runReview(env, withFacts('2026-09-17', '2026-09-17T23:10:00.000Z'), async () => ({ response: broken }), MORNING, { fetcher, force: true })
    expect(r.wrote).toBe(false)
    expect(r.attempts?.[0]).toContain('didNot: uses the word "weak"')
  })
})

import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import cards from '../../src/library.json'
import { runBrief } from './brief'
import { memoryStore, APP, BRAIN_APP } from './turso'
import type { Message } from './prompt'

// The morning line, end to end against the store in memory and a model stood in for: the
// newest facts go in, the answer is checked, one row comes out, once; every failure falls
// through the chain; Sunday reviews the week.

const env = { TIMEZONE: 'America/New_York', BRIEF_HOUR: '5', MODELS: 'model-a, model-b', LIBRARY_URL: 'https://example.test/library.json' }
const fetcher = (async () => new Response(JSON.stringify(cards), { headers: { 'content-type': 'application/json' } })) as typeof fetch
const MORNING = new Date('2026-09-18T09:15:00Z')

const sheet: FactSheet = {
  version: 1,
  day: '2026-09-17',
  builtAt: '2026-09-17T23:00:00.000Z',
  hour: 23,
  weeks: 3,
  days: 22,
  direction: null,
  said: [{ day: '2026-09-17', source: 'phone', situationId: 'first-skill', text: 'The phone said this.', feedback: null }],
  facts: [{ id: 'aim.1', tags: ['study', 'cue'], text: 'French: planned after her bedtime at 20:00, not started; cues: after her bedtime started 1 of 4.', values: { name: 'French', cue_afterBedtime_n: 4, cue_afterBedtime_started: 1 }, n: 4 }],
}

function withFacts(day: string, updatedAt: string) {
  const store = memoryStore()
  store.put({ app: APP, store: 'facts', id: day, day, body: JSON.stringify({ day, builtAt: updatedAt, updatedAt, sheet: { ...sheet, day } }), updated_at: updatedAt, deleted: 0, synced_at: updatedAt })
  return store
}

const good = JSON.stringify({ mode: 'strategy', text: 'After her bedtime held 1 of 4 plans. Try the next check-in as the cue this week.', factIds: ['aim.1'], cardIds: ['implementation-intentions'] })

describe('the morning line', () => {
  it('writes the line once from yesterday’s facts, with the model that produced it', async () => {
    const store = withFacts('2026-09-17', '2026-09-17T23:10:00.000Z')
    const calls: string[] = []
    const run = async (model: string) => {
      calls.push(model)
      return { response: good }
    }
    const r = await runBrief(env, store, run, MORNING, { fetcher })
    expect(r).toMatchObject({ wrote: true, reason: 'brief', day: '2026-09-18', model: 'model-a', attempts: [] })
    const row = store.rows.get(`${BRAIN_APP}|briefs|2026-09-18:brief`)
    expect(row).toBeDefined()
    expect(JSON.parse(row?.body ?? '{}')).toMatchObject({ id: '2026-09-18:brief', day: '2026-09-18', kind: 'brief', mode: 'strategy', model: 'model-a', factsDay: '2026-09-17', cardIds: ['implementation-intentions'] })
    expect(calls).toEqual(['model-a'])
    expect(await runBrief(env, store, run, MORNING, { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
    expect((await runBrief(env, store, run, MORNING, { fetcher, force: true })).wrote).toBe(true)
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

  it('reviews the week on Sunday and tells the phone so; what it said before goes in with how it landed', async () => {
    const store = withFacts('2026-09-19', '2026-09-19T23:10:00.000Z')
    store.put({ app: BRAIN_APP, store: 'briefs', id: '2026-09-19:brief', day: '2026-09-19', body: JSON.stringify({ day: '2026-09-19', text: 'Yesterday’s line.' }), updated_at: '2026-09-19T09:15:00.000Z', deleted: 0, synced_at: '2026-09-19T09:15:00.000Z' })
    store.put({ app: APP, store: 'briefFeedback', id: '1', day: '2026-09-19', body: JSON.stringify({ briefKey: 'worker:2026-09-19:brief', answer: 'knew' }), updated_at: '2026-09-19T10:00:00.000Z', deleted: 0, synced_at: '2026-09-19T10:00:00.000Z' })
    let prompt = ''
    const run = async (_model: string, messages: Message[]) => {
      prompt = messages[1].content
      return { response: good }
    }
    const r = await runBrief(env, store, run, new Date('2026-09-20T09:15:00Z'), { fetcher })
    expect(r).toMatchObject({ wrote: true, reason: 'review', day: '2026-09-20' })
    expect(prompt).toContain('weekly review')
    expect(prompt).toContain('2026-09-19 (knew): Yesterday’s line.')
    expect(prompt).toContain('The phone said this.')
    expect(JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|2026-09-20:brief`)?.body ?? '{}')).toMatchObject({ kind: 'brief', weekly: true })
  })
})

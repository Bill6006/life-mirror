import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import cards from '../../src/library.json'
import { runBrief, runReview } from './brief'
import { memoryStore, APP, BRAIN_APP } from './turso'
import type { Message } from './prompt'

// The day's line and the Sunday review, end to end against the store in memory and a model stood
// in for (Part 28): the line waits for the morning check-in on today's sheet, or for the fallback
// time; three candidates are checked, one is chosen; one row comes out, once, carrying its days,
// its trigger, every refusal and its cost; every failure falls through the chain.

const env = { TIMEZONE: 'America/New_York', BRIEF_HOUR: '5', FALLBACK_TIME: '11:00', MODELS: 'model-a, model-b', LIBRARY_URL: 'https://example.test/library.json' }
const fetcher = (async () => new Response(JSON.stringify(cards), { headers: { 'content-type': 'application/json' } })) as typeof fetch
/** New York local times on Friday 2026-09-18 (UTC−4). */
const at = (hhmm: string, day = '2026-09-18') => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const SUNDAY = at('05:15', '2026-09-20')

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOf = (day: string) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]
const next = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** A sheet for a day, with that day's shape and the next day's, both weekday daycare days unless told otherwise. */
function sheetFor(day: string, patch: Partial<FactSheet> = {}, daycare = { today: true, tomorrow: true }): FactSheet {
  const shape = (label: string, d: string, dc: boolean) => `${label} ${weekdayOf(d)}; ${dc ? 'a daycare day with pickup at 17:30' : 'not a daycare day'}; at home; not a study night; her bedtime 20:00.`
  return {
    version: 1,
    day,
    builtAt: `${day}T23:00:00.000Z`,
    hour: 19,
    weeks: 3,
    days: 22,
    direction: null,
    said: [{ day, source: 'phone', situationId: 'first-skill', text: 'The phone said this.', feedback: null }],
    shortlist: [{ situationId: 'cue-switch', mode: 'strategy', text: 'After her bedtime held 1 of 4; the next check-in held more.', factIds: ['aim.1'], cardIds: ['implementation-intentions'], score: 0.8 }],
    facts: [
      { id: 'week.today', tags: ['cue'], text: shape('Today is', day, daycare.today), values: { weekday: weekdayOf(day), daycare: daycare.today ? 1 : 0, pickup: daycare.today ? '17:30' : null, office: 0, church: 0, studyNight: 0 } },
      { id: 'week.tomorrow', tags: ['cue'], text: shape('Tomorrow is', next(day), daycare.tomorrow), values: { day: next(day), weekday: weekdayOf(next(day)), daycare: daycare.tomorrow ? 1 : 0, pickup: daycare.tomorrow ? '17:30' : null, office: 0, church: 0, studyNight: 0 } },
      { id: 'aim.1', tags: ['study', 'cue'], text: 'French: planned after her bedtime at 20:00, not started; cues: after her bedtime started 1 of 4.', values: { name: 'French', cue_afterBedtime_n: 4, cue_afterBedtime_started: 1 }, n: 4 },
      { id: 'trajectory.1', tags: ['study', 'habit'], text: 'French: steps started per week over the last four weeks, oldest first: 3, 2, 0, 0.', values: { name: 'French', aimId: 1, w3: 3, w2: 2, w1: 0, w0: 0 }, n: 5 },
      { id: 'note.2026-09-16.evening', tags: ['writing'], text: 'On 2026-09-16, at the evening check-in, you wrote: “work was heavy”.', values: { day: '2026-09-16', block: 'evening', note: 'work was heavy' } },
    ],
    ...patch,
  }
}

type Store = ReturnType<typeof memoryStore>
function putFacts(store: Store, sheet: FactSheet, updatedAt = sheet.builtAt): Store {
  store.put({ app: APP, store: 'facts', id: sheet.day, day: sheet.day, body: JSON.stringify({ day: sheet.day, builtAt: sheet.builtAt, updatedAt, sheet }), updated_at: updatedAt, deleted: 0, synced_at: updatedAt })
  return store
}
/** Yesterday's sheet, as the phone left it last night. */
const yesterday = () => putFacts(memoryStore(), sheetFor('2026-09-17'))
/** Today's sheet, built right after the morning check-in completed at 07:40. */
const afterCheckIn = (store: Store = yesterday()) => putFacts(store, sheetFor('2026-09-18', { builtAt: '2026-09-18T11:41:00.000Z', checkedIn: { morning: '2026-09-18T11:40:00.000Z' } }))

const line = (text: string, extra: Record<string, unknown> = {}) => ({ mode: 'strategy', text, factIds: ['aim.1'], cardIds: ['implementation-intentions'], action: null, ...extra })
const good = JSON.stringify(line('After her bedtime held 1 of 4 plans. Try the next check-in as the cue this week.', { action: { kind: 'plan', aimId: 1, cue: 'nextCheckIn' } }))
const review = JSON.stringify({ held: 'Nothing on French held this week: 0 steps started.', didNot: 'French went from 3 and 2 sittings to 0 and 0.', change: 'Pin one short sitting to the next check-in instead of after her bedtime, which held 1 of 4.', factIds: ['aim.1', 'trajectory.1'], cardIds: ['implementation-intentions'] })
const bodyOf = (store: Store, id: string) => JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|${id}`)?.body ?? '{}')

describe('when the day’s line is written', () => {
  it('waits for the morning check-in until the fallback time, then writes from the newest sheet, relabelled for today', async () => {
    const store = yesterday()
    const run = async () => ({ response: good })
    expect(await runBrief(env, store, run, at('05:15'), { fetcher })).toMatchObject({ wrote: false, reason: 'waiting for the morning check-in' })
    expect(await runBrief(env, store, run, at('10:59'), { fetcher })).toMatchObject({ wrote: false, reason: 'waiting for the morning check-in' })
    const r = await runBrief(env, store, run, at('11:00'), { fetcher })
    expect(r).toMatchObject({ wrote: true, trigger: 'fallback', day: '2026-09-18', forDay: '2026-09-18', factsDay: '2026-09-17', model: 'model-a', attempts: [], action: { kind: 'plan', aimId: 1, cue: 'nextCheckIn' } })
    expect(bodyOf(store, '2026-09-18:brief')).toMatchObject({ trigger: 'fallback', forDay: '2026-09-18', factsDay: '2026-09-17', shape: 'The day you are writing for, 2026-09-18, is Friday; a daycare day with pickup at 17:30; at home; not a study night; her bedtime 20:00.', candidates: 1, refusals: [] })
  })

  it('writes as soon as today’s sheet carries the morning check-in, from today’s own facts, and never twice', async () => {
    const store = afterCheckIn()
    let calls = 0
    const run = async () => {
      calls++
      return { response: good }
    }
    const r = await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(r).toMatchObject({ wrote: true, trigger: 'checkin', forDay: '2026-09-18', factsDay: '2026-09-18' })
    expect(await runBrief(env, store, run, at('08:00'), { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
    expect(await runBrief(env, store, run, at('11:15'), { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
    expect(calls).toBe(1)
    // By hand, with force, it writes again: only the tick is held to once a day.
    expect(await runBrief(env, store, run, at('11:30'), { fetcher, force: true })).toMatchObject({ wrote: true, trigger: 'forced' })
  })

  it('does not take a sheet built before the morning check-in completed', async () => {
    const run = async () => ({ response: good })
    const openedOnly = putFacts(yesterday(), sheetFor('2026-09-18', { builtAt: '2026-09-18T11:20:00.000Z' }))
    expect(await runBrief(env, openedOnly, run, at('07:45'), { fetcher })).toMatchObject({ wrote: false, reason: 'waiting for the morning check-in' })
    const stale = putFacts(yesterday(), sheetFor('2026-09-18', { builtAt: '2026-09-18T11:20:00.000Z', checkedIn: { morning: '2026-09-18T11:40:00.000Z' } }))
    expect(await runBrief(env, stale, run, at('07:45'), { fetcher })).toMatchObject({ wrote: false, reason: 'waiting for the morning check-in' })
    // At the fallback time the newest sheet serves: today's, opened but not yet checked in.
    expect(await runBrief(env, openedOnly, run, at('11:05'), { fetcher })).toMatchObject({ wrote: true, trigger: 'fallback', factsDay: '2026-09-18' })
  })

  it('names the day’s shape and the phone’s ranking before the facts, and asks for three candidates', async () => {
    const store = afterCheckIn()
    let system = ''
    let user = ''
    const run = async (_model: string, messages: Message[]) => {
      system = messages[0].content
      user = messages[1].content
      return { response: good }
    }
    await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(user).toContain('THE DAY YOU ARE WRITING FOR, 2026-09-18\nToday is Friday; a daycare day with pickup at 17:30')
    expect(user).toContain('RANKED BY THE PHONE (true today, best first)\n1. cue-switch (strategy): After her bedtime held 1 of 4; the next check-in held more. [facts: aim.1; cards: implementation-intentions]')
    expect(user.indexOf('RANKED BY THE PHONE')).toBeLessThan(user.indexOf('FACTS ('))
    expect(user).toContain('[note.2026-09-16.evening] On 2026-09-16, at the evening check-in, you wrote: “work was heavy”.')
    expect(user).toContain('[trajectory.1]')
    expect(system).toContain('Offer three candidate lines')
    expect(system).toContain('{"candidates": [')
    expect(system).toContain('the person\'s own words')
    expect(system).toContain('"kind":"plan"')
    expect(system).toContain('Close that loop')
  })

  it('keeps the candidates that pass, lets the model choose among them, and logs every refusal and what it cost', async () => {
    const store = afterCheckIn()
    const a = line('Plans held 1 of 9 times after her bedtime.')
    const b = line('After her bedtime held 1 of 4 plans; try the next check-in instead this week.')
    const c = line('French went from 3 sittings to 0; one short sitting today restarts it.', { factIds: ['trajectory.1'] })
    const seen: Message[][] = []
    const run = async (_model: string, messages: Message[]) => {
      seen.push(messages)
      if (seen.length === 1) return { response: JSON.stringify({ candidates: [a, b, c] }), usage: { neurons: 40.25 } }
      return { response: JSON.stringify({ choice: 2 }), usage: { neurons: 4.5 } }
    }
    const r = await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(r).toMatchObject({ wrote: true, candidates: 2, attempts: ['model-a: the number 9 is not in the cited facts'], neurons: 44.8, text: c.text })
    expect(seen[1][1].content).toContain('CANDIDATES\n1. (strategy) After her bedtime held 1 of 4 plans')
    expect(seen[1][1].content).toContain('2. (strategy) French went from 3 sittings to 0')
    expect(bodyOf(store, '2026-09-18:brief')).toMatchObject({ candidates: 2, refusals: ['model-a: the number 9 is not in the cited facts'], neurons: 44.8, calls: 2, trigger: 'checkin' })
    const logged = await store.readBriefs(5)
    expect(logged[0]).toMatchObject({ id: '2026-09-18:brief', forDay: '2026-09-18', factsDay: '2026-09-18', trigger: 'checkin' })
  })

  it('keeps the first candidate that passed when the choice names none, and says so', async () => {
    const store = afterCheckIn()
    const b = line('After her bedtime held 1 of 4 plans; try the next check-in instead this week.')
    const c = line('French went from 3 sittings to 0; one short sitting today restarts it.', { factIds: ['trajectory.1'] })
    let n = 0
    const run = async () => (++n === 1 ? { response: JSON.stringify({ candidates: [b, c] }) } : { response: 'The second, I think.' })
    const r = await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(r).toMatchObject({ wrote: true, text: b.text, attempts: ['model-a: the choice named no candidate, so the first stands'] })
  })

  it('refuses a near-repeat of a line said on the last seven days, and not today’s own phone line', async () => {
    const store = afterCheckIn()
    store.put({ app: BRAIN_APP, store: 'briefs', id: '2026-09-17:brief', day: '2026-09-17', body: JSON.stringify({ day: '2026-09-17', text: 'After her bedtime held 1 of 4 plans. Try the next check-in as the cue this week.' }), updated_at: '2026-09-17T13:00:00.000Z', deleted: 0, synced_at: '2026-09-17T13:00:00.000Z' })
    const echo = line('After her bedtime held only 1 of 4 plans. Try the next check-in as your cue this week.')
    const fresh = line('French went from 3 sittings to 0; one short sitting today restarts it.', { factIds: ['trajectory.1'] })
    const run = async (_model: string, messages: Message[]) => {
      if (messages.length === 2) return { response: JSON.stringify(echo) }
      expect(messages[messages.length - 1].content).toContain('nearly repeats the line said on 2026-09-17')
      return { response: JSON.stringify(fresh) }
    }
    const r = await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(r).toMatchObject({ wrote: true, text: fresh.text })
    expect(r.attempts?.[0]).toContain('model-a: nearly repeats the line said on 2026-09-17')
    // The phone's own line for today is not an earlier day: the Worker may say the same.
    const same = afterCheckIn(putFacts(memoryStore(), sheetFor('2026-09-17')))
    const phoneToday = sheetFor('2026-09-18', { builtAt: '2026-09-18T11:41:00.000Z', checkedIn: { morning: '2026-09-18T11:40:00.000Z' }, said: [{ day: '2026-09-18', source: 'phone', situationId: 'cue-switch', text: 'After her bedtime held 1 of 4 plans. Try the next check-in as the cue this week.', feedback: null }] })
    putFacts(same, phoneToday)
    expect(await runBrief(env, same, async () => ({ response: good }), at('07:45'), { fetcher })).toMatchObject({ wrote: true, attempts: [] })
  })

  it('writes Saturday’s line from Friday’s sheet at the fallback time: both days named, a pickup refused, the day stored', async () => {
    const store = putFacts(memoryStore(), sheetFor('2026-09-18', {}, { today: true, tomorrow: false }))
    let prompt = ''
    const run = async (_model: string, messages: Message[]) => {
      prompt = messages[1].content
      if (messages.length === 2) return { response: JSON.stringify({ mode: 'recommendation', text: 'After picking up your child, do a short pleasant task.', factIds: ['aim.1'], cardIds: [] }) }
      expect(messages[messages.length - 1].content).toContain('speaks of pickup or daycare, which Saturday 2026-09-19 does not hold')
      return { response: JSON.stringify({ mode: 'recommendation', text: 'One short sitting after her bedtime keeps the thread.', factIds: ['aim.1'], cardIds: [] }) }
    }
    const r = await runBrief(env, store, run, at('11:15', '2026-09-19'), { fetcher })
    expect(r).toMatchObject({ wrote: true, trigger: 'fallback', day: '2026-09-19', forDay: '2026-09-19', factsDay: '2026-09-18' })
    expect(r.attempts).toEqual(['model-a: speaks of pickup or daycare, which Saturday 2026-09-19 does not hold'])
    expect(prompt).toContain('You are writing for 2026-09-19')
    expect(prompt).toContain('THE DAY YOU ARE WRITING FOR, 2026-09-19\nThe day you are writing for, 2026-09-19, is Saturday; not a daycare day')
    expect(bodyOf(store, '2026-09-19:brief')).toMatchObject({ forDay: '2026-09-19', factsDay: '2026-09-18', refusals: ['model-a: speaks of pickup or daycare, which Saturday 2026-09-19 does not hold'] })
  })

  it('writes nothing from a sheet that does not say what the day holds, without facts, or with facts too old', async () => {
    const run = async () => ({ response: good })
    const blind = putFacts(memoryStore(), sheetFor('2026-09-17', { facts: sheetFor('2026-09-17').facts.filter((f) => f.id !== 'week.tomorrow') }))
    expect(await runBrief(env, blind, run, at('11:15'), { fetcher })).toMatchObject({ wrote: false, reason: 'the sheet for 2026-09-17 does not say what 2026-09-18 holds' })
    expect(await runBrief(env, memoryStore(), run, at('11:15'), { fetcher })).toMatchObject({ wrote: false, reason: 'no facts for yesterday or today' })
    expect((await runBrief(env, putFacts(memoryStore(), sheetFor('2026-09-17'), '2026-09-15T23:10:00.000Z'), run, at('11:15'), { fetcher })).reason).toMatch(/too old/)
  })

  it('refuses an action the sheet does not make possible, and takes the answer without one', async () => {
    const store = afterCheckIn()
    let calls = 0
    const run = async (_model: string, messages: Message[]) => {
      calls++
      if (messages.length === 2) return { response: JSON.stringify({ ...JSON.parse(good), action: { kind: 'plan', aimId: 9, cue: 'afterBedtime' } }) }
      expect(messages[messages.length - 1].content).toContain('no commitment aim.9')
      return { response: JSON.stringify({ ...JSON.parse(good), action: null }) }
    }
    const r = await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(r).toMatchObject({ wrote: true, model: 'model-a', action: null })
    expect(calls).toBe(2)
  })

  it('falls through the chain: a model that throws, then an answer refused, then one that passes', async () => {
    const store = afterCheckIn()
    let calls = 0
    const run = async (model: string, messages: Message[]) => {
      calls++
      if (model === 'model-a') throw new Error('capacity')
      if (messages.length === 2) return { response: JSON.stringify({ mode: 'warning', text: 'Held 1 of 9 plans.', factIds: ['aim.1'], cardIds: [] }) }
      expect(messages[messages.length - 1].content).toContain('the number 9 is not in the cited facts')
      return { response: good }
    }
    const r = await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(r).toMatchObject({ wrote: true, model: 'model-b' })
    expect(r.attempts).toEqual(['model-a: capacity', 'model-b: the number 9 is not in the cited facts'])
    expect(calls).toBe(3)
  })

  it('writes nothing when no model passes, and says why', async () => {
    const store = afterCheckIn()
    const run = async () => ({ response: 'I would rather chat.' })
    const r = await runBrief(env, store, run, at('07:45'), { fetcher })
    expect(r).toMatchObject({ wrote: false, reason: 'no model produced a line that passed' })
    expect(r.attempts).toHaveLength(4)
    expect([...store.rows.keys()].filter((k) => k.startsWith(`${BRAIN_APP}|briefs`))).toEqual([])
  })
})

describe('the week reviewed', () => {
  it('writes three parts on Sunday at the hour, once, beside the day’s ordinary line; what was said goes in with how it landed', async () => {
    const store = putFacts(memoryStore(), sheetFor('2026-09-19', {}, { today: false, tomorrow: false }))
    store.put({ app: BRAIN_APP, store: 'briefs', id: '2026-09-19:brief', day: '2026-09-19', body: JSON.stringify({ day: '2026-09-19', text: 'Yesterday’s line.' }), updated_at: '2026-09-19T09:15:00.000Z', deleted: 0, synced_at: '2026-09-19T09:15:00.000Z' })
    store.put({ app: APP, store: 'briefFeedback', id: '1', day: '2026-09-19', body: JSON.stringify({ briefKey: 'worker:2026-09-19:brief', answer: 'knew' }), updated_at: '2026-09-19T10:00:00.000Z', deleted: 0, synced_at: '2026-09-19T10:00:00.000Z' })
    let prompt = ''
    const run = async (_model: string, messages: Message[]) => {
      prompt = messages[1].content
      return { response: messages[0].content.includes('weekly review') ? review : good }
    }
    const r = await runReview(env, store, run, SUNDAY, { fetcher })
    expect(r).toMatchObject({ wrote: true, reason: 'review', day: '2026-09-20', model: 'model-a', trigger: 'sunday', factsDay: '2026-09-19' })
    expect(prompt).toContain('weekly review')
    expect(prompt).toContain('2026-09-19 (knew): Yesterday’s line.')
    expect(prompt).toContain('The phone said this.')
    expect(prompt).toContain('THE DAY YOU ARE WRITING FOR, 2026-09-20\nThe day you are writing for, 2026-09-20, is Sunday')
    const row = bodyOf(store, '2026-09-20:review')
    expect(row).toMatchObject({ kind: 'review', trigger: 'sunday', parts: { held: expect.stringContaining('0 steps'), didNot: expect.stringContaining('3 and 2'), change: expect.stringContaining('next check-in') } })
    expect(await runReview(env, store, run, SUNDAY, { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
    // The day's line is its own job, held to the morning check-in as on any day.
    expect(await runBrief(env, store, run, SUNDAY, { fetcher })).toMatchObject({ wrote: false, reason: 'waiting for the morning check-in' })
  })

  it('keeps to Sunday unless forced, and refuses a part that breaks a rule', async () => {
    const run = async () => ({ response: review })
    expect(await runReview(env, yesterday(), run, at('05:15'), { fetcher })).toMatchObject({ wrote: false, reason: 'not Sunday at the hour' })
    expect(await runReview(env, yesterday(), run, at('05:15'), { fetcher, force: true })).toMatchObject({ wrote: true, trigger: 'forced' })
    const broken = JSON.stringify({ ...JSON.parse(review), didNot: 'A weak week: 7 sittings missed.' })
    const r = await runReview(env, yesterday(), async () => ({ response: broken }), at('05:15'), { fetcher, force: true })
    expect(r.wrote).toBe(false)
    expect(r.attempts?.[0]).toContain('didNot: uses the word "weak"')
  })
})

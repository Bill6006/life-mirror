import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SYNCED_STORES } from './cloudOutbox'
import { db } from './db'
import { fingerprintOf, generatedRowOf, pathJobOf, queryRefusal, quietHours, readOf, requestOf, requestState } from './pathJob'
import { requestPath, routeOf, withdrawRequest } from './pathRequestFlow'
import { routeWords } from './pathIntake'

// Asking for a Path (P5, 2026-11-06): the rules route your words before anything is kept; a Path request waits for a
// draft, and any other route is kept with the app's own words; a request is withdrawn only before its draft starts.
// The jobs' rows and the versions are read through checking parsers; a search never carries your own words.

const NOW = new Date(2026, 10, 7, 20, 0)

beforeEach(async () => {
  await db.pathRequests.clear()
  await db.pathJobs.clear()
})

describe('a request for a Path', () => {
  it('waits for a draft when the rules route it as a Path, and is kept with its route otherwise', async () => {
    const a = await requestPath({ goal: 'Grow vegetables in a small garden bed this summer', why: 'fresh food', where: ['home'], minutes: 90 }, NOW)
    expect(a.triage.route).toBe('fits')
    expect(await db.pathRequests.get(a.id)).toMatchObject({ goal: 'Grow vegetables in a small garden bed this summer', why: 'fresh food', where: ['home'], minutes: 90, route: 'fits', state: 'queued' })
    const b = await requestPath({ goal: 'Make more friends', minutes: 90 }, NOW)
    expect(await db.pathRequests.get(b.id)).toMatchObject({ route: 'existing', state: 'triaged' })
    // Practice beside help waits for a draft too, behind the app's own screen.
    const c = await requestPath({ goal: 'Overcome my social anxiety at work', minutes: 90 }, NOW)
    expect(await db.pathRequests.get(c.id)).toMatchObject({ route: 'redirect', state: 'queued' })
    // A risk in the why is read too: no Path, the app's own help.
    const d = await requestPath({ goal: 'Get better at cooking', why: 'so I can stop eating for days', minutes: 90 }, NOW)
    expect(await db.pathRequests.get(d.id)).toMatchObject({ route: 'redirect', state: 'triaged' })
    expect(SYNCED_STORES).toContain('pathRequests')
  })

  it('shows the app’s own words for every route, never a model’s', () => {
    expect(routeWords(routeOf({ goal: 'I want to kill myself' }))).toContain('988')
    expect(routeWords(routeOf({ goal: 'Lose 10 pounds in two weeks' }))).toContain('a doctor can help you find a safe way')
    expect(routeWords(routeOf({ goal: 'Get my ex to want me back' }))).toContain('Life Mirror makes no Path for this')
    expect(routeWords(routeOf({ goal: 'Learn to read sheet music' }))).toContain('Something to learn covers this')
    expect(routeWords(routeOf({ goal: 'Start running' }))).toContain('workout app')
    expect(routeWords(routeOf({ goal: 'be better' }))).toContain('What would you like to get better at?')
    // Abuse shows the Partner path's own fixed help, word for word.
    expect(routeWords(routeOf({ goal: 'My boyfriend hits me and I want to stop it' }))).toContain('National Domestic Violence Hotline')
  })

  it('is withdrawn before its draft starts, and not once a job holds it', async () => {
    const a = await requestPath({ goal: 'Grow vegetables in a small garden bed this summer', minutes: 90 }, NOW)
    await withdrawRequest(a.id, NOW)
    expect((await db.pathRequests.get(a.id))?.state).toBe('withdrawn')
    const b = await requestPath({ goal: 'Keep the shed tidy every weekend', minutes: 60 }, NOW)
    await db.pathJobs.put({ id: `job:${b.id}`, requestId: b.id, state: 'drafting', at: NOW.toISOString(), day: '2026-11-07' })
    await withdrawRequest(b.id, NOW)
    expect((await db.pathRequests.get(b.id))?.state).toBe('queued')
    // What the phone shows: the job's state once there is one.
    expect(requestState({ state: 'queued' }, { state: 'drafting' })).toBe('drafting')
    expect(requestState({ state: 'withdrawn' }, { state: 'ready' })).toBe('withdrawn')
  })
})

describe('the rows the phone and the Worker share', () => {
  it('read a request, a job and a version whole, or not at all', () => {
    expect(requestOf('5', { id: 5, at: 'x', goal: 'Grow vegetables', minutes: 9999, route: 'fits', state: 'queued' })).toMatchObject({ id: 5, minutes: 90 })
    expect(requestOf('5', { id: 5, at: 'x', goal: '', route: 'fits' })).toBeNull()
    expect(pathJobOf('job:5', JSON.stringify({ requestId: 5, state: 'ready', at: 'x', day: '2026-11-07', pathId: 'g-12345678' }))).toMatchObject({ state: 'ready', pathId: 'g-12345678' })
    expect(pathJobOf('job:5', JSON.stringify({ requestId: 5, state: 'sure', at: 'x', day: 'y' }))).toBeNull()
    const v = { pathId: 'g-12345678', version: '1', at: 'x', hash: 'h', path: { id: 'g-12345678' }, reps: [{ id: 'g-12345678-a', family: 'g-12345678' }], shared: [], cards: [{ id: 'g-12345678-c' }] }
    expect(generatedRowOf('g-12345678:1', JSON.stringify(v))?.pathId).toBe('g-12345678')
    // A rep or a card that would take a catalogue id is no version at all.
    expect(generatedRowOf('g-12345678:1', JSON.stringify({ ...v, reps: [{ id: 'ask-follow-up', family: 'g-12345678' }] }))).toBeNull()
    expect(generatedRowOf('g-12345678:1', JSON.stringify({ ...v, cards: [{ id: 'skill-decay' }] }))).toBeNull()
    expect(generatedRowOf('social:1', JSON.stringify({ ...v, pathId: 'social', path: { id: 'social' } }))).toBeNull()
  })

  it('refuse a search carrying your own words, a name or a number, and let a generic one through', () => {
    const r = { goal: 'Get comfortable cooking dinner on weeknights for Sam', why: 'my divorce left me eating takeaway', where: ['home'], month: 'four dinners in a row', offLimits: 'nothing with nuts' }
    expect(queryRefusal('cooking skills intervention adults', r)).toBeNull()
    expect(queryRefusal('divorce cooking', r)).toBe('the query carries a word from your own answers: “divorce”')
    expect(queryRefusal('cooking Sam', r)).toBe('the query carries a name from your own words: “sam”')
    expect(queryRefusal('nuts allergy cooking', r)).toBe('the query carries a word from your own answers: “nuts”')
    expect(queryRefusal('ab', r)).toBe('a query of three to two hundred characters')
  })

  it('keep a stable fingerprint of the words a reader read, and the quiet morning hours', () => {
    expect(fingerprintOf('a')).toMatch(/^[0-9a-f]{16}$/)
    expect(readOf({ claim: 'c', effect: 'e', population: 'p' })).toBe(readOf({ claim: 'c', effect: 'e', population: 'p' }))
    expect(readOf({ claim: 'c', effect: 'e', population: 'p' })).not.toBe(readOf({ claim: 'c', effect: 'e2', population: 'p' }))
    expect([quietHours('08:59'), quietHours('09:00'), quietHours('11:29'), quietHours('11:30')]).toEqual([false, true, true, false])
  })
})

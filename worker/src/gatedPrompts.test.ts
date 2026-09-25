import { describe, expect, it } from 'vitest'
import type { CoachBlock, FactSheet } from '../../src/factTypes'
import type { ClaimCard } from '../../src/libraryTypes'
import { lineBriefing } from './briefing'
import { runBrief, runReview } from './brief'
import { handleBriefing, taskIdOf } from './claude'
import { runCoach } from './coach'
import { buildMessages, buildReviewMessages, claudeInstructions } from './prompt'
import { APP, BRAIN_APP, memoryStore } from './turso'

// What Claude and the free chain are given for the day's line, the Sunday review and the coach,
// recorded before Parts 40 and 41 were built and held fixed while their gate is closed: the
// monitored prompts, their instructions, their private context and their read log must not move
// by a byte (the owner's condition, 2026-09-25). Small invented cards and moves stand in for the
// library and the catalogue, so a change to either is not mistaken for one here.

const TZ = 'America/New_York'
const env = {
  TIMEZONE: TZ,
  BRIEF_HOUR: '5',
  FALLBACK_TIME: '11:00',
  MODELS: 'model-a',
  LIBRARY_URL: 'https://example.test/library.json',
  CATALOGUE_URL: 'https://example.test/catalogue.json',
  CLAUDE_WRITER: 'on',
  CLAUDE_FIRE_URL: 'https://example.test/fire',
  CLAUDE_FIRE_TOKEN: 'fire-token',
  CLAUDE_TIMEOUT_MINUTES: '20',
  COACH_WRITER: 'on',
  COACH_LAUNCH: '2026-10-04',
}
const CARDS: ClaimCard[] = [
  { id: 'plan-a-cue', claim: 'A plan tied to a cue is kept more often.', domain: 'behaviour-change', tags: ['cue', 'plan', 'study'], grade: 'A', replication: 'replicated', effect: 'small', population: 'adults', sources: [{ cite: 'Invented (2025).', doi: '10.0000/x' }], caveats: 'None known.', app: 'One tap says when.', reviewed: '2026-09-24', status: 'admitted' },
  { id: 'rest-helps', claim: 'Rest days help a skill that needs recovery.', domain: 'movement', tags: ['recovery', 'movement'], grade: 'B', replication: 'replicated', effect: 'moderate', population: 'adults', sources: [{ cite: 'Invented (2024).', doi: '10.0000/y' }], caveats: 'None known.', app: 'Rest days between sessions.', reviewed: '2026-09-24', status: 'admitted' },
]
const MOVES = { moves: [{ id: 'greet-by-name', name: 'Greet someone by name', family: 'social', tags: { ingredients: ['connection'] } }, { id: 'ask-one-question', name: 'Ask one question', family: 'social', tags: { ingredients: ['curiosity'] } }] }
const fetcher = (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('catalogue') ? MOVES : CARDS), { headers: { 'content-type': 'application/json' } })) as typeof fetch
/** New York local times (UTC−4). */
const at = (hhmm: string, day: string) => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const DAY = '2026-10-04'

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown, when = `${DAY}T11:41:00.000Z`) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })

function sheetFor(day: string): FactSheet {
  return {
    version: 1,
    day,
    builtAt: `${day}T11:41:00.000Z`,
    hour: 7,
    weeks: 5,
    days: 36,
    direction: 'One line, mine',
    said: [{ day: '2026-10-03', source: 'phone', situationId: 'say-when', text: 'A plan tied to a moment is kept more often than a wish is.', feedback: 'useful' }],
    checkedIn: { morning: `${day}T11:40:00.000Z` },
    shortlist: [{ situationId: 'say-when', mode: 'recommendation', text: 'French: the step is Ten words. Say when, one tap.', factIds: ['aim.1'], cardIds: ['plan-a-cue'], score: 0.6 }],
    facts: [
      { id: 'week.today', tags: ['cue'], text: 'Today is Sunday; not a daycare day; at home; her bedtime 20:00; the hour is 7.', values: { weekday: 'Sunday', daycare: 0, pickup: null, office: 0, church: 0, studyNight: 0, bedtime: '20:00', hour: 7 } },
      { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Monday; a daycare day with pickup at 17:30; at home; her bedtime 20:00.', values: { day: '2026-10-05', weekday: 'Monday', daycare: 1, pickup: '17:30', office: 0, church: 0, studyNight: 0 } },
      { id: 'aim.1', tags: ['study', 'cue'], text: 'French (learning): the current skill is “Ten words”; 5 sessions on it over 4 days since Sep 28; no plan today.', values: { kind: 'certification', name: 'French', skill: 'Ten words', sessions: 5, practiceDays: 4, plan: null }, n: 5 },
      { id: 'note.2026-10-03.evening', tags: ['writing'], text: 'On 2026-10-03, at the evening check-in, you wrote: “long week”.', values: { day: '2026-10-03', block: 'evening', note: 'long week' } },
      { id: 'workout.last', tags: ['workout', 'morning'], text: 'The last workout: Saturday morning, 42 minutes.', values: { day: '2026-10-03', block: 'morning', minutes: 42 } },
    ],
  }
}

const COACH: CoachBlock & Record<string, unknown> = {
  eligible: [{ path: 'social', ids: ['greet-by-name', 'ask-one-question'] }],
  ineligibleReason: null,
  day: DAY,
  block: 'morning',
  shape: 'People around by today’s shape: at home',
  stages: [{ path: 'social', stage: 2, name: 'One step past hello', reentry: false }],
  dateDay: false,
  perRep: [{ path: 'social', id: 'greet-by-name', drawn: 3, done: 2, partly: 0, no: 1, last: ['done'], settings: [] }],
  row: { path: 'social', candidates: ['greet-by-name', 'ask-one-question'] },
}

/** A record whose commitments category has something to say: a learning commitment, its skill, a plan and its sessions. */
function record(): Store {
  const store = memoryStore()
  const sheet = sheetFor(DAY)
  put(store, 'facts', DAY, DAY, { day: DAY, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet, coach: COACH }, sheet.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  put(store, 'aims', '1', null, { id: 1, kind: 'certification', stepMoveId: null, name: 'French', currentSkillId: 2, rhythm: { perWeek: 3, restDays: 0 }, createdAt: '2026-09-20T12:00:00.000Z', archivedAt: null })
  put(store, 'skills', '2', null, { id: 2, name: 'Ten words', aimId: 1, method: 'An audio course', how: 'One lesson, then say the ten words aloud.', minutes: 30, source: 'you', startedAt: '2026-09-28T12:00:00.000Z', order: 2, createdAt: '2026-09-28T12:00:00.000Z', archivedAt: null })
  put(store, 'intentions', '7', DAY, { id: 7, aimId: 1, day: DAY, cue: 'afterBedtime', time: '20:00', setAt: `${DAY}T12:00:00.000Z`, offerId: null, step: 'Ten words' })
  put(store, 'checkins', '40', '2026-10-03', { id: 40, day: '2026-10-03', block: 'evening', answers: { mood: 3, energy: 2 }, extras: { note: 'long week' } })
  for (const [id, day] of [[31, '2026-09-29'], [32, '2026-10-01'], [33, '2026-10-02'], [34, '2026-10-03']] as const) {
    put(store, 'offers', String(id), day, { id, day, kind: 'step', moveId: 'skill:2', situationKey: 'aim:certification', skippedAt: null, at: `${day}T23:00:00.000Z` })
    put(store, 'outcomes', String(id), day, { id, offerId: id, outcome: 'done', ease: id % 2 ? 'right' : 'easy', note: id === 34 ? 'the numbers stuck' : undefined, at: `${day}T23:30:00.000Z` })
  }
  return store
}

function routine() {
  return (async () => new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_z' }), { status: 200 })) as typeof fetch
}
const deps = (store: Store, now: Date) => ({ env, store, now, fetcher })
const url = (q: Record<string, string>) => new URL(`https://w.test/claude/briefing?${new URLSearchParams(q)}`)
const readsOf = async (store: Store) => (await store.readReads(100)).map(({ task, category, count, bytes, via }) => ({ task, category, count, bytes, via })).sort((a, b) => `${a.task}${a.category}`.localeCompare(`${b.task}${b.category}`))

describe('the monitored prompts, held fixed while Parts 40 and 41 are gated', () => {
  it('serves Claude the day’s line exactly as before, with the same private context and the same reads logged', async () => {
    const store = record()
    await runBrief(env, store, async () => ({ response: '' }), at('07:45', DAY), { fetcher, fireFetcher: routine() })
    expect((await store.readTask(taskIdOf('line', DAY)))?.status).toBe('fired')
    const r = await handleBriefing(deps(store, at('07:46', DAY)), url({ task: 'line', day: DAY }))
    expect(r.status).toBe(200)
    expect(r.body).toMatchSnapshot()
    expect(await readsOf(store)).toMatchSnapshot()
  })

  it('serves Claude the Sunday review exactly as before', async () => {
    const store = record()
    await runReview(env, store, async () => ({ response: '' }), at('05:00', DAY), { fetcher, fireFetcher: routine() })
    expect((await store.readTask(taskIdOf('review', DAY)))?.status).toBe('fired')
    const r = await handleBriefing(deps(store, at('05:01', DAY)), url({ task: 'review', day: DAY }))
    expect(r.status).toBe(200)
    expect(r.body).toMatchSnapshot()
    expect(await readsOf(store)).toMatchSnapshot()
  })

  it('serves the coach exactly as before', async () => {
    const store = record()
    await store.writeSpot({ id: `spot:${DAY}`, kind: 'spotcheck', day: DAY, at: `${DAY}T11:00:00.000Z`, runs: 3, clean: true })
    await store.writeBrief({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at('07:48', DAY).toISOString(), writer: 'claude', forDay: DAY }, at('07:48', DAY).toISOString())
    const ran = await runCoach(env, store, at('07:50', DAY), { fireFetcher: routine() })
    expect(ran).toMatchObject({ ran: true })
    const r = await handleBriefing(deps(store, at('07:51', DAY)), url({ task: 'coach', day: DAY }))
    expect(r.status).toBe(200)
    expect(r.body).toMatchSnapshot()
    expect(await readsOf(store)).toMatchSnapshot()
  })

  it('gives the free chain the same messages and every task the same instructions', () => {
    const sheet = sheetFor(DAY)
    const line = lineBriefing({ task: 'line', writer: 'free', sheet, forDay: DAY, cards: CARDS, said: [] })
    const review = lineBriefing({ task: 'review', writer: 'free', sheet, forDay: DAY, cards: CARDS, said: [] })
    if (!line.ok || !review.ok) throw new Error('no briefing')
    expect(buildMessages(line.briefing)).toMatchSnapshot()
    expect(buildReviewMessages(review.briefing)).toMatchSnapshot()
    expect({ line: claudeInstructions('line'), review: claudeInstructions('review'), coach: claudeInstructions('coach') }).toMatchSnapshot()
  })
})

describe('a saved How firm choice, while its gate is closed (Pass 2)', () => {
  const withChoice = (firmness: string) => {
    const store = record()
    put(store, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: {}, firmness })
    return store
  }
  const noClaude = { ...env, CLAUDE_WRITER: 'off' }
  const candidate = { mode: 'recommendation', text: 'French: the current skill is Ten words. Pin it to a moment today.', factIds: ['aim.1'], cardIds: ['plan-a-cue'], action: null, firmness: 'hardCoach' }
  const freeRunner = async () => ({ response: JSON.stringify({ candidates: [candidate] }) })

  it('serves Claude the same line, review and coach, with the same reads, whatever was chosen', async () => {
    for (const firmness of ['hardCoach', 'supportive', 'adaptive']) {
      const [plain, chosen] = [record(), withChoice(firmness)]
      for (const s of [plain, chosen]) await runBrief(env, s, async () => ({ response: '' }), at('07:45', DAY), { fetcher, fireFetcher: routine() })
      expect(await handleBriefing(deps(chosen, at('07:46', DAY)), url({ task: 'line', day: DAY })), firmness).toEqual(await handleBriefing(deps(plain, at('07:46', DAY)), url({ task: 'line', day: DAY })))
      expect(await readsOf(chosen)).toEqual(await readsOf(plain))

      const [plainR, chosenR] = [record(), withChoice(firmness)]
      for (const s of [plainR, chosenR]) await runReview(env, s, async () => ({ response: '' }), at('05:00', DAY), { fetcher, fireFetcher: routine() })
      expect(await handleBriefing(deps(chosenR, at('05:01', DAY)), url({ task: 'review', day: DAY })), firmness).toEqual(await handleBriefing(deps(plainR, at('05:01', DAY)), url({ task: 'review', day: DAY })))

      const [plainC, chosenC] = [record(), withChoice(firmness)]
      for (const s of [plainC, chosenC]) {
        await s.writeSpot({ id: `spot:${DAY}`, kind: 'spotcheck', day: DAY, at: `${DAY}T11:00:00.000Z`, runs: 3, clean: true })
        await s.writeBrief({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at('07:48', DAY).toISOString(), writer: 'claude', forDay: DAY }, at('07:48', DAY).toISOString())
        await runCoach(env, s, at('07:50', DAY), { fireFetcher: routine() })
      }
      expect(await handleBriefing(deps(chosenC, at('07:51', DAY)), url({ task: 'coach', day: DAY })), firmness).toEqual(await handleBriefing(deps(plainC, at('07:51', DAY)), url({ task: 'coach', day: DAY })))
    }
  })

  it('lets the free chain write as before: its answer is checked without a delivery, and none is stored', async () => {
    const store = withChoice('hardCoach')
    const r = await runBrief(noClaude, store, freeRunner, at('07:45', DAY), { fetcher })
    expect(r).toMatchObject({ wrote: true, writer: 'free', text: candidate.text })
    const row = store.rows.get(`${BRAIN_APP}|briefs|${DAY}:brief`)
    expect(row).toBeDefined()
    expect(JSON.parse(row?.body ?? '{}')).toMatchObject({ text: candidate.text, writer: 'free' })
    expect(JSON.parse(row?.body ?? '{}')).not.toHaveProperty('firmness')
  })
})

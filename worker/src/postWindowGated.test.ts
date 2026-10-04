import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import type { ClaimCard } from '../../src/libraryTypes'
import { dayGuard } from '../../src/brainShared'
import { lineBriefing } from './briefing'
import { runBrief, runReview } from './brief'
import { handleBriefing, taskIdOf } from './claude'
import { buildMessages, buildReviewMessages } from './prompt'
import { APP, memoryStore } from './turso'

// The two features agreed for after the clean window are built behind closed gates (the owner's
// word, 2026-10-04). Recorded before either was built and held fixed while both are closed: what
// Claude and the free chain are given for the day's line and the Sunday review must not move by a
// byte, even with a record already holding what the features would store once open: days shaped
// by a trip, a trip saved in Settings and a skip given "Not home".

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
}
const CARDS: ClaimCard[] = [
  { id: 'plan-a-cue', claim: 'A plan tied to a cue is kept more often.', domain: 'behaviour-change', tags: ['cue', 'plan', 'study'], grade: 'A', replication: 'replicated', effect: 'small', population: 'adults', sources: [{ cite: 'Invented (2025).', doi: '10.0000/x' }], caveats: 'None known.', app: 'One tap says when.', reviewed: '2026-09-24', status: 'admitted' },
]
const MOVES = { moves: [{ id: 'open-windows', name: 'Open the windows', family: 'space', tags: { ingredients: ['outdoors'] } }, { id: 'greet-by-name', name: 'Greet someone by name', family: 'social', tags: { ingredients: ['connection'] } }] }
const fetcher = (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('catalogue') ? MOVES : CARDS), { headers: { 'content-type': 'application/json' } })) as typeof fetch
/** New York local times (UTC−4). */
const at = (hhmm: string, day: string) => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const DAY = '2026-10-11'

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
    direction: null,
    said: [],
    checkedIn: { morning: `${day}T11:40:00.000Z` },
    shortlist: [{ situationId: 'say-when', mode: 'recommendation', text: 'A plan tied to a moment is kept more often than a wish is.', factIds: ['week.today'], cardIds: ['plan-a-cue'], score: 0.6 }],
    facts: [
      { id: 'week.today', tags: ['cue', 'evening'], text: 'Today is Sunday; not a daycare day; at home; her bedtime 20:00; the hour is 7.', values: { weekday: 'Sunday', away: 0, daycare: 0, pickup: null, office: 0, church: 0, studyNight: 0, bedtime: '20:00', hour: 7 } },
      { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Monday; a daycare day with pickup at 17:30; at the office; her bedtime 20:00.', values: { day: '2026-10-12', weekday: 'Monday', away: 0, daycare: 1, pickup: '17:30', office: 1, church: 0, studyNight: 0, bedtime: '20:00' } },
      { id: 'cadence', tags: ['monitoring', 'habit'], text: 'Check-ins completed per week over the last four weeks, oldest first: 14, 13, 12, 4; the check-in depth is full.', values: { w3: 14, w2: 13, w1: 12, w0: 4, depth: 'full', lowDemand: 0 }, n: 43 },
      { id: 'note.2026-10-10.evening', tags: ['writing', 'mood'], text: 'On 2026-10-10, at the evening check-in, you wrote: “at the beach with her all day”.', values: { day: '2026-10-10', block: 'evening', note: 'at the beach with her all day' } },
    ],
  }
}

/** A week whose last days a trip shaped, as the open gate would store them; today's Worker knows none of it. */
function record(): Store {
  const store = memoryStore()
  const sheet = sheetFor(DAY)
  put(store, 'facts', DAY, DAY, { day: DAY, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet }, sheet.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false, away: { from: '2026-10-08', to: '2026-10-14', setAt: '2026-10-07T20:00:00.000Z' } })
  const held = { atOffice: true, pickupTime: '17:30', churchDay: false, studyNight: false }
  for (const [day, weekday] of [['2026-10-05', 1], ['2026-10-06', 2], ['2026-10-07', 3]] as const) put(store, 'days', day, day, { day, weekday, withHer: true, studyNight: false, churchDay: false, atOffice: weekday !== 3, pickupTime: '17:30', soloUntil: '20:00', changed: false, createdAt: `${day}T10:00:00.000Z` })
  for (const [day, weekday] of [['2026-10-08', 4], ['2026-10-09', 5], ['2026-10-10', 6], ['2026-10-11', 0]] as const) put(store, 'days', day, day, { day, weekday, withHer: true, studyNight: false, churchDay: false, atOffice: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: `${day}T10:00:00.000Z`, awayFromHome: { held } })
  put(store, 'checkins', '40', '2026-10-10', { id: 40, day: '2026-10-10', block: 'evening', answers: { mood: 4, energy: 3 }, extras: { note: 'at the beach with her all day' } })
  put(store, 'offers', '51', '2026-10-07', { id: 51, day: '2026-10-07', block: 'afternoon', kind: 'block', moveId: 'open-windows', situationKey: 'afternoon:outdoors', skippedAt: '2026-10-07T18:00:00.000Z', skipReason: 'notHome', at: '2026-10-07T17:30:00.000Z' })
  put(store, 'offers', '52', '2026-10-07', { id: 52, day: '2026-10-07', block: 'afternoon', kind: 'block', moveId: 'greet-by-name', situationKey: 'afternoon:outdoors', skippedAt: null, at: '2026-10-07T18:00:01.000Z' })
  put(store, 'outcomes', '52', '2026-10-07', { id: 52, offerId: 52, outcome: 'done', at: '2026-10-07T19:00:00.000Z' })
  return store
}

function routine() {
  return (async () => new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_z' }), { status: 200 })) as typeof fetch
}
const deps = (store: Store, now: Date) => ({ env, store, now, fetcher })
const url = (q: Record<string, string>) => new URL(`https://w.test/claude/briefing?${new URLSearchParams(q)}`)
const readsOf = async (store: Store) => (await store.readReads(100)).map(({ task, category, count, bytes, via }) => ({ task, category, count, bytes, via })).sort((a, b) => `${a.task}${a.category}`.localeCompare(`${b.task}${b.category}`))

describe('the monitored prompts, held fixed while the post-window features are gated', () => {
  it('serves Claude the day’s line exactly as before, trip-shaped days and a "Not home" skip in the record', async () => {
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

  it('gives the free chain the same messages', () => {
    const sheet = sheetFor(DAY)
    const line = lineBriefing({ task: 'line', writer: 'free', sheet, forDay: DAY, cards: CARDS, said: [] })
    const review = lineBriefing({ task: 'review', writer: 'free', sheet, forDay: DAY, cards: CARDS, said: [] })
    if (!line.ok || !review.ok) throw new Error('no briefing')
    expect(buildMessages(line.briefing)).toMatchSnapshot()
    expect(buildReviewMessages(review.briefing)).toMatchSnapshot()
  })

  it('refuses and allows the same words on the day’s shape', () => {
    const sheet = sheetFor(DAY)
    const lines = ['Open the windows at home for ten minutes.', 'After pickup, one short sitting.', 'Say hello to a colleague at the office.', 'A walk on the beach before lunch.', 'Tidy one surface around the house.', 'Tomorrow at the office, take the stairs.']
    expect(lines.map((l) => [l, dayGuard(l, sheet, DAY), dayGuard(l, sheet, '2026-10-12')])).toMatchSnapshot()
  })
})

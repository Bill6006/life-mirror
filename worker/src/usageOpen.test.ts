import { describe, expect, it, vi } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import catalogue from '../../src/catalogue.json'
import cards from '../../src/library.json'

// Follow-up F1, once its gate opens (a test stands in for the owner's word): the same handlers
// serve the counts that bear on each task, with the rule, every read logged by count and size; a
// slice of events to the weekly review alone. Nothing here opens it in the app.
vi.mock('../../src/brainShared', async (original) => ({ ...(await original<typeof import('../../src/brainShared')>()), USAGE_TO_CLAUDE: 'open' }))

const { runBrief, runReview } = await import('./brief')
const { handleBriefing, handleContext } = await import('./claude')
const { USAGE_RULES } = await import('./prompt')
const { APP, BRAIN_APP, memoryStore } = await import('./turso')

const env = { TIMEZONE: 'America/New_York', BRIEF_HOUR: '5', FALLBACK_TIME: '11:00', MODELS: 'model-a', LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20' }
const fetcher = (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('catalogue') ? catalogue : cards), { headers: { 'content-type': 'application/json' } })) as typeof fetch
const fire = (async () => new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_x' }), { status: 200 })) as typeof fetch
const freeRun = async () => ({ response: '{"candidates":[]}' })
const at = (hhmm: string, day: string) => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const url = (path: string, q: Record<string, string>) => new URL(`https://w.test${path}?${new URLSearchParams(q)}`)

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown, when: string) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })
const reads = (store: Store) => [...store.rows.values()].filter((r) => r.app === BRAIN_APP && r.store === 'reads').map((r) => JSON.parse(r.body ?? '{}'))

function sheetFor(day: string, tomorrow: string, weekday: string, next: string): FactSheet {
  return {
    version: 1,
    day,
    builtAt: `${day}T11:41:00.000Z`,
    hour: 7,
    weeks: 3,
    days: 22,
    direction: null,
    said: [],
    checkedIn: { morning: `${day}T11:40:00.000Z` },
    shortlist: [],
    facts: [
      { id: 'week.today', tags: ['cue'], text: `Today is ${weekday}; not a daycare day; at home.`, values: { weekday, daycare: 0, pickup: null, office: 0, church: 0 } },
      { id: 'week.tomorrow', tags: ['cue'], text: `Tomorrow is ${next}; not a daycare day; at home.`, values: { day: tomorrow, weekday: next, daycare: 0, pickup: null, office: 0, church: 0 } },
      { id: 'usage.line', tags: [], text: 'The line’s one tap: offered on 5 of the 7 days to yesterday, taken on 2 of them. Why under the line: opened 4 times.', values: { days: 7, offered: 5, taken: 2, why: 4 } },
      { id: 'usage.screens', tags: [], text: 'Screens in the 28 days to yesterday: opened most, Now 40.', values: { days: 28, often: 'Now 40', rarely: '', never: '', neverDays: 56 } },
    ],
  }
}

function withSheet(sheet: FactSheet, prefs?: unknown): Store {
  const store = memoryStore()
  put(store, 'facts', sheet.day, sheet.day, { day: sheet.day, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet }, sheet.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false }, sheet.builtAt)
  if (prefs) put(store, 'brainPrefs', 'prefs', null, prefs, sheet.builtAt)
  put(store, 'useLog', '1', sheet.day, { id: 1, day: sheet.day, at: `${sheet.day}T11:30:00.000Z`, kind: 'screen', what: 'evidence' }, sheet.builtAt)
  return store
}

describe('once the gate opens', () => {
  const DAY = '2026-10-20'

  it('the day’s line carries the counts that bear on it and the rule, logged by count and size, and may not ask for a slice of events', async () => {
    const store = withSheet(sheetFor(DAY, '2026-10-21', 'Tuesday', 'Wednesday'))
    await runBrief(env, store, freeRun, at('07:45', DAY), { fetcher, fireFetcher: fire })
    const r = await handleBriefing({ env, store, now: at('07:47', DAY), fetcher }, url('/claude/briefing', { task: 'line', day: DAY }))
    expect(r.status).toBe(200)
    const b = r.body as { briefing: string; context: { categories: string[] } }
    expect(b.briefing).toContain('[usage.line] The line’s one tap')
    expect(b.briefing).not.toContain('[usage.screens]')
    expect(b.briefing).toContain(USAGE_RULES)
    expect(b.context.categories).toContain('usage')
    expect(b.context.categories).not.toContain('usageEvents')
    expect(reads(store).find((x) => x.category === 'usage')).toMatchObject({ task: 'line', count: 1, via: 'briefing' })
    expect(JSON.stringify(reads(store))).not.toContain('one tap')
    const q = (category: string) => handleContext({ env, store, now: at('07:48', DAY), fetcher }, url('/claude/context', { task: 'line', day: DAY, category }))
    expect((await q('usageEvents')).status).toBe(403)
    expect(await q('usage')).toMatchObject({ status: 200, body: { category: 'usage', items: [{ text: expect.stringContaining('The line’s one tap') }] } })
  })

  it('the Sunday review may ask for a short slice of events in order, in fixed words and local time', async () => {
    const SUN = '2026-10-18'
    const store = withSheet(sheetFor('2026-10-17', SUN, 'Saturday', 'Sunday'))
    await runReview(env, store, freeRun, at('05:00', SUN), { fetcher, fireFetcher: fire })
    const r = await handleContext({ env, store, now: at('05:03', SUN), fetcher }, url('/claude/context', { task: 'review', day: SUN, category: 'usageEvents' }))
    expect(r).toMatchObject({ status: 200, body: { category: 'usageEvents', items: [{ day: '2026-10-17', text: '07:30 opened the Evidence screen' }] } })
    expect(reads(store).find((x) => x.category === 'usageEvents')).toMatchObject({ task: 'review', count: 1, via: 'context' })
  })

  it('the owner’s switch still closes it, counts and events alike', async () => {
    const store = withSheet(sheetFor(DAY, '2026-10-21', 'Tuesday', 'Wednesday'), { id: 'prefs', writerModel: 'opus', switches: { usage: false } })
    await runBrief(env, store, freeRun, at('07:45', DAY), { fetcher, fireFetcher: fire })
    const r = await handleBriefing({ env, store, now: at('07:47', DAY), fetcher }, url('/claude/briefing', { task: 'line', day: DAY }))
    expect((r.body as { briefing: string }).briefing).not.toContain('usage.')
    expect(reads(store).map((x) => x.category)).not.toContain('usage')
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import catalogue from '../../src/catalogue.json'
import cards from '../../src/library.json'

// Part 43, once its gate opens (a test stands in for the owner's word): the day's line reads where the
// day was spent, with the rule that a place is context; usage stays behind its own gate. Nothing here
// opens it in the app.
vi.mock('../../src/brainShared', async (original) => ({ ...(await original<typeof import('../../src/brainShared')>()), LOCATION_TO_CLAUDE: 'open' }))

const { runBrief } = await import('./brief')
const { handleBriefing } = await import('./claude')
const { LOCATION_RULES, USAGE_RULES } = await import('./prompt')
const { APP, memoryStore } = await import('./turso')

const env = { TIMEZONE: 'America/New_York', BRIEF_HOUR: '5', FALLBACK_TIME: '11:00', MODELS: 'model-a', LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20' }
const fetcher = (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('catalogue') ? catalogue : cards), { headers: { 'content-type': 'application/json' } })) as typeof fetch
const fire = (async () => new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_x' }), { status: 200 })) as typeof fetch
const freeRun = async () => ({ response: '{"candidates":[]}' })
const DAY = '2026-10-20'
const at = (hhmm: string) => new Date(`${DAY}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)

const sheet: FactSheet = {
  version: 1,
  day: DAY,
  builtAt: `${DAY}T11:41:00.000Z`,
  hour: 7,
  weeks: 3,
  days: 22,
  direction: null,
  said: [],
  checkedIn: { morning: `${DAY}T11:40:00.000Z` },
  shortlist: [],
  facts: [
    { id: 'week.today', tags: ['cue'], text: 'Today is Tuesday; not a daycare day; at home.', values: { weekday: 'Tuesday', daycare: 0, pickup: null, office: 0, church: 0 } },
    { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Wednesday; not a daycare day; at home.', values: { day: '2026-10-21', weekday: 'Wednesday', daycare: 0, pickup: null, office: 0, church: 0 } },
    { id: 'location.today', tags: [], text: 'Where today has been so far, as Life Mirror saw it while open: the morning at Home, then at Work.', values: { day: DAY, morning: 'home,work' } },
    { id: 'usage.line', tags: [], text: 'The line’s one tap: offered on 5 of the 7 days to yesterday, taken on 2 of them. Why under the line: opened 4 times.', values: { days: 7, offered: 5, taken: 2, why: 4 } },
  ],
}

describe('once the location gate opens', () => {
  it('the day’s line reads where the day was spent, with its rule; usage stays gated', async () => {
    const store = memoryStore()
    const put = (s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: sheet.builtAt, deleted: 0, synced_at: sheet.builtAt })
    put('facts', DAY, DAY, { day: DAY, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet })
    put('settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
    await runBrief(env, store, freeRun, at('07:45'), { fetcher, fireFetcher: fire })
    const r = await handleBriefing({ env, store, now: at('07:47'), fetcher }, new URL(`https://w.test/claude/briefing?task=line&day=${DAY}`))
    expect(r.status).toBe(200)
    const b = (r.body as { briefing: string }).briefing
    expect(b).toContain('[location.today] Where today has been so far')
    expect(b).toContain(LOCATION_RULES)
    expect(b).not.toContain('[usage.line]')
    expect(b).not.toContain(USAGE_RULES)
  })
})

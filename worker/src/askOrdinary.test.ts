import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { AskTurn } from '../../src/ask/types'
import type { FactSheet } from '../../src/factTypes'
import { handleAskBriefing, runAsks } from './ask'
import * as prompt from './prompt'
import { APP, memoryStore } from './turso'

// Ordinary Ask as it was before "Coach me on everything" covered everything (2026-11-14). The snapshots here were
// recorded on the code before that change, with the change stashed, so "as before" is byte for byte: what ordinary
// Ask is told, what it is briefed with, and what the deep tier is told once its new rules are set aside.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, FALLBACK_TIME: '11:00', LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20' }
const DAY = '2026-11-12'
const at = (hhmm: string) => new Date(`${DAY}T${String(Number(hhmm.slice(0, 2)) + 5).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)

const SHEET: FactSheet = {
  version: 1,
  day: DAY,
  builtAt: `${DAY}T12:41:00.000Z`,
  hour: 7,
  weeks: 8,
  days: 56,
  direction: null,
  said: [],
  checkedIn: { morning: `${DAY}T12:40:00.000Z` },
  facts: [
    { id: 'week.today', tags: ['cue'], text: 'Today is Thursday; a daycare day.', values: {} },
    { id: 'record', tags: [], text: 'The record holds 56 days.', values: { days: 56 } },
  ],
} as FactSheet

const fetcher = (async (u: string | URL | Request) => {
  const href = String(u)
  if (href.endsWith('library.json')) return new Response('[]', { status: 200 })
  if (href.endsWith('catalogue.json')) return new Response(JSON.stringify({ moves: [] }), { status: 200 })
  return new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_s' }), { status: 200 })
}) as typeof fetch

/** The deep tier's new rules, where the code has them: before the change it had none. */
const DEEP_RULES: readonly string[] = (prompt as { DEEP_RULES?: readonly string[] }).DEEP_RULES ?? []

describe('ordinary Ask, as it was before the deep tier covered everything', () => {
  it('is told exactly what it was told, with How firm and without', () => {
    expect(prompt.askInstructions('ask', 220, null)).toMatchSnapshot()
    expect(prompt.askInstructions('ask', 220, 'adaptive')).toMatchSnapshot()
  })

  it('is briefed exactly as it was: the same lookups, the same limits, nothing of the deep tier’s', async () => {
    const store = memoryStore()
    const put = (s: string, id: string, day: string | null, body: unknown, when = `${DAY}T12:00:00.000Z`) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })
    put('facts', DAY, DAY, { day: DAY, builtAt: SHEET.builtAt, updatedAt: SHEET.builtAt, sheet: SHEET }, SHEET.builtAt)
    put('settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
    const turn: AskTurn & { id: number } = { id: 1_770_000_000_001, threadId: 1_770_000_000_001, day: DAY, at: at('09:00').toISOString(), question: 'What stands out this week?', tier: 'standard', state: 'waiting', kind: 'typed', version: 'v', cited: [], updatedAt: at('09:00').toISOString() }
    put('askTurns', String(turn.id), DAY, turn)
    expect(await runAsks(env, store, at('09:01'), { gate: 'open', fireFetcher: fetcher })).toMatchObject({ ran: true })
    const r = await handleAskBriefing({ env, store, now: at('09:02'), gate: 'open' as const, fetcher }, new URL(`https://w.test/claude/briefing?task=ask&day=${DAY}`))
    expect(r.status).toBe(200)
    expect(r.body).toMatchSnapshot()
  })

  it('leaves the deep tier told what it was told, once its new rules are set aside', () => {
    const less = (text: string) => text.split('\n').filter((line) => !DEEP_RULES.includes(line)).join('\n')
    expect(less(prompt.askInstructions('deep', 450, null))).toMatchSnapshot()
    expect(less(prompt.askInstructions('deep', 450, 'adaptive'))).toMatchSnapshot()
  })
})

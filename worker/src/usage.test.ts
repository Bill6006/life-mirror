import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import catalogueJson from '../../src/catalogue.json'
import { USAGE_FOR } from '../../src/useShared'
import { CLOSED_GATES, lineBriefing, permitted, withoutUsage, type Gates } from './briefing'
import { buildMessages, buildReviewMessages, claudeBriefingText, coachBriefingText, USAGE_RULES } from './prompt'
import { accessFor, bytesOf, contextFor, factCategories, gatesFrom, logUsageOnSheet, parseContextQuery, READABLE, readCategory, readOnDemand, sheetForClaude, tagsOf, type Catalogue } from './retrieval'
import { surfaceGuard } from './surface'
import { APP, BRAIN_APP, memoryStore } from './turso'

// Follow-up F1 in the Worker: how Life Mirror is used reaches Claude only through the retrieval
// layer, only through an open gate, only under its switch and each task's relevance; the free chain
// never reads it; while gated every prompt is as it was; a slice of events is short, recent and the
// weekly review's alone; every read is logged by count and size, never content.

const DAY = '2026-10-20'
const catalogue: Catalogue = new Map((catalogueJson as unknown as { moves: { id: string; name: string; family: string; hiddenWith?: string; tags?: Record<string, unknown> }[] }).moves.map((m) => [m.id, { name: m.name, family: m.family, ...(m.hiddenWith ? { hiddenWith: m.hiddenWith } : {}), tags: tagsOf(m.tags) }]))
const f = (id: string, text: string, values: Fact['values'] = {}, tags: string[] = []): Fact => ({ id, tags, text, values })

const USAGE: Fact[] = [
  f('usage.opened', 'Life Mirror itself: opened on 5 of the 7 days to yesterday, 9 times in all.', { days: 7, openDays: 5, opens: 9 }),
  f('usage.screens', 'Screens in the 28 days to yesterday: opened most, Now 40; opened once or twice, the Evidence screen 1.', { days: 28, often: 'Now 40', rarely: 'the Evidence screen 1', never: '', neverDays: 56 }),
  f('usage.line', 'The line’s one tap: offered on 5 of the 7 days to yesterday, taken on 2 of them. Why under the line: opened 4 times.', { days: 7, offered: 5, taken: 2, why: 4 }),
  f('usage.checkins', 'Check-ins in the 7 days to yesterday: opened 12 times, 2 of them left before the end.', { days: 7, opened: 12, left: 2 }),
  f('usage.change', 'Change on the People row in the 28 days to yesterday: opened 3 times, a rep chosen there once; 2 openings ended without one.', { days: 28, opened: 3, chosen: 1, without: 2 }),
  f('usage.coach', 'The coach’s pick in the 28 days to yesterday: made on 6 days, not taken on 2 of them.', { days: 28, picked: 6, notTaken: 2 }),
]

const base: FactSheet = {
  version: 1,
  day: DAY,
  builtAt: `${DAY}T11:41:00.000Z`,
  hour: 7,
  weeks: 3,
  days: 22,
  direction: null,
  said: [],
  shortlist: [{ situationId: 'sleep-led', mode: 'observation', text: 's', factIds: ['today.shortSleep'], cardIds: [], score: 0.5 }],
  facts: [f('week.today', 'Today is Tuesday.', {}, ['cue']), f('week.tomorrow', 'Tomorrow is Wednesday.', { day: '2026-10-21' }, ['cue']), f('today.shortSleep', 'Short sleep.', {}, ['sleep'])],
}
const withUsage: FactSheet = { ...base, facts: [...base.facts, ...USAGE] }

const GATED: Gates = gatesFrom({ hideFaith: false, privateInSelection: true })
const OPEN: Gates = gatesFrom({ hideFaith: false, privateInSelection: true }, 'open')
const ids = (s: FactSheet) => s.facts.map((x) => x.id)
const usageIds = (s: FactSheet) => ids(s).filter((id) => id.startsWith('usage.'))

describe('the gate and the permission check', () => {
  it('keeps how Life Mirror is used closed to every task while the gate is, whatever the switch says', () => {
    expect(GATED.usageOpen).toBe(false)
    expect(CLOSED_GATES.usageOpen).toBe(false)
    for (const task of ['line', 'review', 'coach'] as const) for (const c of ['usage', 'usageEvents']) expect(permitted(task, 'claude', c, GATED)).toBe(false)
  })

  it('once open, gives the counts to the line, the review and the coach, and a slice of events to the review alone', () => {
    expect(permitted('line', 'claude', 'usage', OPEN)).toBe(true)
    expect(permitted('review', 'claude', 'usage', OPEN)).toBe(true)
    expect(permitted('coach', 'claude', 'usage', OPEN)).toBe(true)
    expect(permitted('review', 'claude', 'usageEvents', OPEN)).toBe(true)
    expect(permitted('line', 'claude', 'usageEvents', OPEN)).toBe(false)
    expect(permitted('coach', 'claude', 'usageEvents', OPEN)).toBe(false)
  })

  it('never gives any of it to the free chain, and one switch turns both off', () => {
    for (const task of ['line', 'review', 'coach'] as const) for (const c of ['usage', 'usageEvents']) expect(permitted(task, 'free', c, OPEN)).toBe(false)
    const off = { usage: false } as const
    expect(permitted('review', 'claude', 'usage', OPEN, off)).toBe(false)
    expect(permitted('review', 'claude', 'usageEvents', OPEN, off)).toBe(false)
  })

  it('files every usage fact under usage alone, never under the day’s record', () => {
    for (const x of USAGE) expect(factCategories(x, new Map())).toEqual(['usage'])
  })
})

describe('what the sheet shows Claude', () => {
  it('shows no usage fact while the gate is closed, with every switch on', () => {
    for (const task of ['line', 'review'] as const) expect(usageIds(sheetForClaude(withUsage, accessFor(task, GATED, readBrainPrefs({}))))).toEqual([])
  })

  it('once open, shows each task only the usage facts that bear on it', () => {
    expect(usageIds(sheetForClaude(withUsage, accessFor('line', OPEN, readBrainPrefs({}))))).toEqual(USAGE.map((x) => x.id).filter((id) => USAGE_FOR.line.includes(id)))
    expect(usageIds(sheetForClaude(withUsage, accessFor('review', OPEN, readBrainPrefs({}))))).toEqual(USAGE.map((x) => x.id))
  })

  it('shows none once its switch is off, and leaves every other fact where it was', () => {
    const s = sheetForClaude(withUsage, accessFor('review', OPEN, readBrainPrefs({ switches: { usage: false } })))
    expect(usageIds(s)).toEqual([])
    expect(ids(s)).toEqual(ids(base))
  })
})

describe('the prompts', () => {
  const claude = (sheet: FactSheet, gates: Gates, task: 'line' | 'review' = 'line') => {
    const b = lineBriefing({ task, writer: 'claude', sheet, forDay: DAY, cards: [], said: [], writerModel: 'opus', gates, context: 'a note' })
    if (!b.ok) throw new Error(b.reason)
    return b.briefing
  }
  const free = (sheet: FactSheet, task: 'line' | 'review' = 'line') => {
    const b = lineBriefing({ task, writer: 'free', sheet, forDay: DAY, cards: [], said: [] })
    if (!b.ok) throw new Error(b.reason)
    return b.briefing
  }

  it('are byte for byte as they were while the gate is closed, a sheet full of usage facts or not', () => {
    for (const task of ['line', 'review'] as const) {
      expect(claudeBriefingText(claude(withUsage, GATED, task))).toBe(claudeBriefingText(claude(base, GATED, task)))
      expect(JSON.stringify(buildMessages(free(withUsage, task)))).toBe(JSON.stringify(buildMessages(free(base, task))))
      expect(JSON.stringify(buildReviewMessages(free(withUsage, task)))).toBe(JSON.stringify(buildReviewMessages(free(base, task))))
    }
    expect(claudeBriefingText(claude(base, GATED))).not.toContain('usage')
  })

  it('keep the free chain on the fact sheet alone, gate open or not: no usage fact, and nothing it could cite', () => {
    const b = free(withUsage)
    expect(usageIds(b.sheet)).toEqual([])
    expect(b.facts).not.toContain('usage.')
    expect(withoutUsage(base)).toBe(base)
  })

  it('once open, carry the facts Claude was given and the rule that keeps observation apart from reason', () => {
    const open = claude(sheetForClaude(withUsage, accessFor('line', OPEN, readBrainPrefs({}))), OPEN)
    const text = claudeBriefingText(open)
    expect(text).toContain('[usage.line] The line’s one tap')
    expect(text).not.toContain('[usage.screens]')
    expect(text).toContain(USAGE_RULES)
    expect(USAGE_RULES).toMatch(/never why/)
    expect(USAGE_RULES).toMatch(/possibility/)
  })
})

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: '', deleted: 0, synced_at: '' })
const reads = (store: Store) => [...store.rows.values()].filter((r) => r.app === BRAIN_APP && r.store === 'reads').map((r) => JSON.parse(r.body ?? '{}'))

function record(): Store {
  const store = memoryStore()
  put(store, 'facts', DAY, DAY, { day: DAY, builtAt: withUsage.builtAt, updatedAt: withUsage.builtAt, sheet: withUsage })
  const use = (id: number, day: string, at: string, kind: string, what?: string) => put(store, 'useLog', String(id), day, { id, day, at, kind, ...(what ? { what } : {}) })
  use(1, '2026-10-19', '2026-10-19T12:05:00.000Z', 'appOpened', 'launch')
  use(2, '2026-10-19', '2026-10-19T12:06:00.000Z', 'screen', 'pathChange')
  use(3, '2026-10-19', '2026-10-19T12:07:00.000Z', 'screen', 'partnerNotes')
  use(4, '2026-10-19', '2026-10-19T12:08:00.000Z', 'screen', 'her')
  use(5, '2026-10-19', '2026-10-19T12:09:00.000Z', 'mystery', 'x')
  use(6, '2026-10-18', '2026-10-18T23:30:00.000Z', 'checkinLeft', 'evening')
  use(7, '2026-10-01', '2026-10-01T12:00:00.000Z', 'lineWhy')
  return store
}

describe('the coach’s briefing', () => {
  it('reads nothing of how the app was used while the gate is closed: no section, no read logged, the text as it was', async () => {
    const store = record()
    const ctx = await contextFor(store, catalogue, accessFor('coach', GATED, readBrainPrefs({})), DAY, 'task:gated', new Date(`${DAY}T11:45:00Z`))
    expect(ctx.text).not.toContain('[usage]')
    expect(reads(store).map((r) => r.category)).not.toContain('usage')
    expect(coachBriefingText({ row: { path: 'social', candidates: [] } }, new Map(), ctx.text, false)).not.toContain('HOW LIFE MIRROR IS USED')
  })

  it('once open, reads what bears on the People row, logged by count and size, and adds the rule', async () => {
    const store = record()
    const ctx = await contextFor(store, catalogue, accessFor('coach', OPEN, readBrainPrefs({})), DAY, 'task:open', new Date(`${DAY}T11:45:00Z`))
    expect(ctx.text).toContain('[usage]')
    expect(ctx.text).toContain('Change on the People row')
    expect(ctx.text).toContain('The coach’s pick')
    expect(ctx.text).not.toContain('Screens in')
    const logged = reads(store).find((r) => r.category === 'usage')
    expect(logged).toMatchObject({ task: 'coach', count: 2, via: 'briefing' })
    expect(Object.keys(logged).sort()).toEqual(['at', 'bytes', 'category', 'count', 'day', 'id', 'task', 'via'])
    expect(coachBriefingText({ row: { path: 'social', candidates: [] } }, new Map(), ctx.text, false)).toContain(USAGE_RULES)
  })
})

describe('a slice of events', () => {
  const url = (q: string) => new URL(`https://w.test/claude/context?task=review&day=${DAY}&${q}`)

  it('is a week at most, from the last fourteen days, forty events at most, and a week to the task’s day unless asked', () => {
    expect(parseContextQuery(url('category=usageEvents'), DAY)).toMatchObject({ ok: true, q: { from: '2026-10-14', to: DAY, limit: 20 } })
    expect(parseContextQuery(url('category=usageEvents&from=2026-10-06&to=2026-10-12'), DAY)).toEqual({ ok: false, reason: 'a slice of events reaches back 14 days at most' })
    expect(parseContextQuery(url('category=usageEvents&from=2026-10-10&to=2026-10-20'), DAY)).toEqual({ ok: false, reason: 'a slice of events covers 7 days at most' })
    expect(parseContextQuery(url('category=usageEvents&limit=41'), DAY)).toEqual({ ok: false, reason: 'a slice of events holds 40 at most' })
    expect(parseContextQuery(url('category=usageEvents&from=2026-10-14&to=2026-10-20&limit=40'), DAY)).toMatchObject({ ok: true })
  })

  it('says each event in fixed words with its clock time, newest first; nothing of the Partner path, her record or an unknown kind', async () => {
    const store = record()
    const a = accessFor('review', OPEN, readBrainPrefs({}))
    const items = (await readCategory({ store, catalogue, a, timeZone: 'America/New_York' }, 'usageEvents', { from: '2026-10-14', to: DAY, limit: 20 })) ?? []
    expect(items).toEqual([
      { day: '2026-10-19', text: '08:06 opened Change on the People row' },
      { day: '2026-10-19', text: '08:05 opened Life Mirror' },
      { day: '2026-10-18', text: '19:30 left the evening check-in before its end' },
    ])
  })

  it('is read on demand only while open, and logged by count and size, never its words', async () => {
    const store = record()
    const r = await readOnDemand(store, catalogue, accessFor('review', OPEN, readBrainPrefs({})), 'usageEvents', { from: '2026-10-14', to: DAY, limit: 20 }, DAY, 'task:r', 100, new Date(`${DAY}T11:45:00Z`), 64 * 1024, false, 'America/New_York')
    expect(r?.items).toHaveLength(3)
    const logged = reads(store)
    expect(logged).toMatchObject([{ task: 'review', category: 'usageEvents', count: 3, via: 'context' }])
    expect(JSON.stringify(logged)).not.toMatch(/Change|Life Mirror|check-in/)
    expect(READABLE).toContain('usageEvents')
  })
})

describe('the read log for a sheet', () => {
  it('logs the usage facts a sheet carried to Claude, by count and size; nothing for a sheet that carried none', async () => {
    const store = memoryStore()
    await logUsageOnSheet(store, 'task:x', 'line', DAY, base, new Date(`${DAY}T11:45:00Z`))
    expect(reads(store)).toEqual([])
    const given = sheetForClaude(withUsage, accessFor('line', OPEN, readBrainPrefs({})))
    await logUsageOnSheet(store, 'task:x', 'line', DAY, given, new Date(`${DAY}T11:45:00Z`))
    const [row] = reads(store)
    const lines = given.facts.filter((x) => x.id.startsWith('usage.')).map((x) => `- ${DAY}: ${x.text}`).join('\n')
    expect(row).toMatchObject({ task: 'line', category: 'usage', count: 2, bytes: bytesOf(lines), via: 'briefing' })
    expect(JSON.stringify(row)).not.toContain('Why under the line')
  })
})

describe('what Claude says of it', () => {
  it('holds a text given usage to observation once it speaks of that use; nothing changes while it was given none', () => {
    const s = { names: [], bears: false }
    const text = 'Since you keep opening Change without choosing, this one is short.'
    expect(surfaceGuard(text, s)).toBeNull()
    expect(surfaceGuard(text, { ...s, usage: true })).toMatch(/reason for how the app was used/)
    expect(surfaceGuard('Opened Change 3 times; this one may suit the afternoon better.', { ...s, usage: true })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import catalogueJson from '../../src/catalogue.json'
import { CLOSED_GATES, forFreeChain, lineBriefing, permitted, type Gates } from './briefing'
import { buildMessages, buildReviewMessages, claudeBriefingText, LOCATION_RULES } from './prompt'
import { accessFor, factCategories, gatesFrom, readCategory, sheetForClaude, tagsOf, type Catalogue } from './retrieval'
import { APP, memoryStore } from './turso'

// Part 43 in the Worker: where the day was spent reaches Claude only through its own gate, under its
// switch; the free chain never reads it; while gated every prompt is as it was; the day's record as
// Claude reads it never carries it.

const DAY = '2026-10-20'
const catalogue: Catalogue = new Map((catalogueJson as unknown as { moves: { id: string; name: string; family: string; hiddenWith?: string; tags?: Record<string, unknown> }[] }).moves.map((m) => [m.id, { name: m.name, family: m.family, ...(m.hiddenWith ? { hiddenWith: m.hiddenWith } : {}), tags: tagsOf(m.tags) }]))
const f = (id: string, text: string, values: Fact['values'] = {}, tags: string[] = []): Fact => ({ id, tags, text, values })
const LOCATION: Fact[] = [
  f('location.today', 'Where today has been so far, as Life Mirror saw it while open: the morning at Home, then at Work.', { day: DAY, morning: 'home,work' }),
  f('location.yesterday', 'Where yesterday was, as Life Mirror saw it while open: the afternoon away from home, in a different area.', { day: '2026-10-19', afternoon: 'away' }),
]
const base: FactSheet = { version: 1, day: DAY, builtAt: `${DAY}T11:41:00.000Z`, hour: 7, weeks: 3, days: 22, direction: null, said: [], shortlist: [], facts: [f('week.today', 'Today is Tuesday.', {}, ['cue']), f('week.tomorrow', 'Tomorrow is Wednesday.', { day: '2026-10-21' }, ['cue'])] }
const withLocation: FactSheet = { ...base, facts: [...base.facts, ...LOCATION] }
const GATED: Gates = gatesFrom({ hideFaith: false })
const OPEN: Gates = gatesFrom({ hideFaith: false }, 'gated', 'open')
const locationIds = (s: FactSheet) => s.facts.map((x) => x.id).filter((id) => id.startsWith('location.'))

describe('the gate', () => {
  it('keeps where the day was spent from every task while it is closed, and from the free chain always', () => {
    expect(GATED.locationOpen).toBe(false)
    expect(CLOSED_GATES.locationOpen).toBe(false)
    for (const task of ['line', 'review', 'coach'] as const) {
      expect(permitted(task, 'claude', 'location', GATED)).toBe(false)
      expect(permitted(task, 'free', 'location', OPEN)).toBe(false)
    }
  })

  it('once open, gives it to the line and the review, not the coach, and its switch turns it off', () => {
    expect(permitted('line', 'claude', 'location', OPEN)).toBe(true)
    expect(permitted('review', 'claude', 'location', OPEN)).toBe(true)
    expect(permitted('coach', 'claude', 'location', OPEN)).toBe(false)
    expect(permitted('line', 'claude', 'location', OPEN, { location: false })).toBe(false)
  })

  it('files each location fact under location alone, never under the day’s record', () => {
    for (const x of LOCATION) expect(factCategories(x, new Map())).toEqual(['location'])
  })
})

describe('the sheet and the prompts', () => {
  const claude = (sheet: FactSheet, gates: Gates) => {
    const b = lineBriefing({ task: 'line', writer: 'claude', sheet, forDay: DAY, cards: [], said: [], writerModel: 'opus', gates, context: 'x' })
    if (!b.ok) throw new Error(b.reason)
    return b.briefing
  }
  const free = (sheet: FactSheet) => {
    const b = lineBriefing({ task: 'line', writer: 'free', sheet, forDay: DAY, cards: [], said: [] })
    if (!b.ok) throw new Error(b.reason)
    return b.briefing
  }

  it('show Claude none of it while gated, and the prompts are byte for byte as they were', () => {
    expect(locationIds(sheetForClaude(withLocation, accessFor('line', GATED, readBrainPrefs({}))))).toEqual([])
    expect(claudeBriefingText(claude(withLocation, GATED))).toBe(claudeBriefingText(claude(base, GATED)))
    expect(JSON.stringify(buildMessages(free(withLocation)))).toBe(JSON.stringify(buildMessages(free(base))))
    expect(JSON.stringify(buildReviewMessages(free(withLocation)))).toBe(JSON.stringify(buildReviewMessages(free(base))))
  })

  it('keep the free chain on the approved fact sheet, gate open or not', () => {
    expect(locationIds(forFreeChain(withLocation))).toEqual([])
    expect(locationIds(free(withLocation).sheet)).toEqual([])
  })

  it('once open, show the kinds of place and the rule that a place is context, never a cause; nothing while its switch is off', () => {
    const given = sheetForClaude(withLocation, accessFor('line', OPEN, readBrainPrefs({})))
    expect(locationIds(given)).toEqual(['location.today', 'location.yesterday'])
    const text = claudeBriefingText(claude(given, OPEN))
    expect(text).toContain('[location.today] Where today has been so far')
    expect(text).toContain(LOCATION_RULES)
    expect(LOCATION_RULES).toMatch(/never that a place caused a reading/)
    expect(locationIds(sheetForClaude(withLocation, accessFor('line', OPEN, readBrainPrefs({ switches: { location: false } }))))).toEqual([])
  })
})

describe('the day’s record as Claude reads it', () => {
  it('never carries where the day was spent, gate open or not', async () => {
    const store = memoryStore()
    store.put({ app: APP, store: 'days', id: DAY, day: DAY, body: JSON.stringify({ day: DAY, atOffice: false, withHer: true, pickupTime: null, churchDay: false, studyNight: false, where: { morning: ['away'], afternoon: ['regular', 'work'] } }), updated_at: '', deleted: 0, synced_at: '' })
    for (const gates of [GATED, OPEN]) {
      const items = (await readCategory({ store, catalogue, a: accessFor('line', gates, readBrainPrefs({})) }, 'dayRecord', { from: DAY, to: DAY, limit: 10 })) ?? []
      const text = items.map((i) => i.text).join(' | ')
      expect(text).toContain('the day:')
      expect(text).not.toMatch(/away|regular|work|where/i)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { COACH_BLOCK_KEYS, type FactSheet } from '../../src/factTypes'
import { CATEGORIES, CLOSED_GATES, COACH_CORE_KEYS, lineBriefing, permitted, PROFILES, WRITER_MODELS, type Gates } from './briefing'

// The briefing (Part 28): one module every prompt is built from, and the one permission check
// every read passes, closed by default.

const OPEN: Gates = { faithHidden: false, privateInSelection: true, claudeMayRead: true }

const sheet: FactSheet = {
  version: 1,
  day: '2026-09-18',
  builtAt: '2026-09-18T23:00:00.000Z',
  hour: 19,
  weeks: 3,
  days: 22,
  direction: null,
  said: [],
  facts: [
    { id: 'week.today', tags: ['cue'], text: 'Today is Friday; a daycare day with pickup at 17:30.', values: {} },
    { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Saturday; not a daycare day.', values: {} },
    { id: 'today.shortSleep', tags: ['sleep'], text: 'Sleep hours read “Under 5 hours” this morning.', values: {} },
  ],
}

describe('the permission check', () => {
  it('lets the free model chain read the fact sheet and nothing else, whatever the gates and switches say', () => {
    for (const task of ['line', 'review'] as const) {
      expect(permitted(task, 'free', 'factSheet', CLOSED_GATES)).toBe(true)
      for (const c of CATEGORIES.filter((x) => x !== 'factSheet')) expect(permitted(task, 'free', c, OPEN, { [c]: true }), `${task} ${c}`).toBe(false)
    }
    for (const c of CATEGORIES) expect(permitted('coach', 'free', c, OPEN), c).toBe(false)
  })

  it('keeps Claude to the fact sheet until the Rule 21 amendment names Anthropic', () => {
    expect(permitted('line', 'claude', 'factSheet', CLOSED_GATES)).toBe(true)
    expect(permitted('line', 'claude', 'notes', CLOSED_GATES)).toBe(false)
    expect(permitted('line', 'claude', 'notes', { ...CLOSED_GATES, claudeMayRead: true })).toBe(true)
  })

  it('applies the governing rules above every switch, then the switches, then the profile', () => {
    expect(permitted('line', 'claude', 'faith', { ...OPEN, faithHidden: true }, { faith: true })).toBe(false)
    expect(permitted('coach', 'claude', 'tier2', OPEN, { tier2: true })).toBe(false)
    expect(permitted('line', 'claude', 'tier2', OPEN)).toBe(true)
    expect(permitted('coach', 'claude', 'privateItems', { ...OPEN, privateInSelection: false })).toBe(false)
    expect(permitted('coach', 'claude', 'privateItems', OPEN)).toBe(true)
    expect(permitted('line', 'claude', 'reflections', OPEN, { reflections: false })).toBe(false)
    // The monthly check belongs to the coach alone.
    expect(permitted('line', 'claude', 'monthlyCheck', OPEN)).toBe(false)
    expect(permitted('review', 'claude', 'monthlyCheck', OPEN)).toBe(false)
    expect(permitted('coach', 'claude', 'monthlyCheck', OPEN)).toBe(true)
  })

  it('refuses a category no profile names, an invented one included', () => {
    expect(permitted('line', 'claude', 'contacts', OPEN)).toBe(false)
    expect(permitted('coach', 'claude', 'coachCore ', OPEN)).toBe(false)
    expect(permitted('coach', 'claude', 'peopleAround', OPEN)).toBe(false)
    for (const task of ['line', 'review', 'coach'] as const) for (const w of ['free', 'claude'] as const) for (const c of PROFILES[task][w]) expect(CATEGORIES).toContain(c)
  })

  it('states the coach’s decision core as an allowlist with no tier-2 key in it', () => {
    expect(COACH_CORE_KEYS).toEqual(['eligible', 'ineligibleReason', 'day', 'block', 'shape', 'stages', 'dateDay', 'perRep', 'row', 'requiresGoingOut'])
    // The phone writes the coach block with exactly these keys (Part 24): the two lists are one contract.
    expect([...COACH_CORE_KEYS]).toEqual([...COACH_BLOCK_KEYS])
    for (const k of COACH_CORE_KEYS) expect(k).not.toMatch(/tier|carried|context|seen|history/i)
    expect(PROFILES.coach.claude).not.toContain('tier2')
    expect(WRITER_MODELS).toEqual(['opus', 'fable', 'sonnet', 'haiku'])
  })
})

describe('the line briefing', () => {
  it('names the target day’s shape from the sheet’s own week fact, relabelled when the sheet is the day before', () => {
    const same = lineBriefing({ task: 'line', writer: 'free', sheet, forDay: '2026-09-18', cards: [], said: [] })
    expect(same.ok && same.briefing.shape).toBe('Today is Friday; a daycare day with pickup at 17:30.')
    const after = lineBriefing({ task: 'line', writer: 'free', sheet, forDay: '2026-09-19', cards: [], said: [] })
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.briefing).toMatchObject({ forDay: '2026-09-19', factsDay: '2026-09-18', shape: 'The day you are writing for, 2026-09-19, is Saturday; not a daycare day.', writerModel: null })
    expect(after.briefing.facts).toContain('You are writing for 2026-09-19, the day after')
    expect(after.briefing.facts).toContain('[today.shortSleep] On 2026-09-18: Sleep hours read')
  })

  it('refuses a sheet that is neither the day’s nor the day before’s, one that cannot say what the day holds, and a writer model outside the four', () => {
    expect(lineBriefing({ task: 'line', writer: 'free', sheet, forDay: '2026-09-20', cards: [], said: [] })).toEqual({ ok: false, reason: 'the sheet is for 2026-09-18, not 2026-09-20 or the day before it' })
    expect(lineBriefing({ task: 'line', writer: 'free', sheet, forDay: '2026-09-17', cards: [], said: [] }).ok).toBe(false)
    const blind = { ...sheet, facts: sheet.facts.filter((f) => f.id !== 'week.tomorrow') }
    expect(lineBriefing({ task: 'line', writer: 'free', sheet: blind, forDay: '2026-09-19', cards: [], said: [] })).toEqual({ ok: false, reason: 'the sheet for 2026-09-18 does not say what 2026-09-19 holds' })
    expect(lineBriefing({ task: 'line', writer: 'claude', sheet, forDay: '2026-09-18', cards: [], said: [], writerModel: 'gpt-5' as never }).ok).toBe(false)
    // `best` is not a value a subagent can take (the bridge proof), so it is refused like any other stranger.
    expect(lineBriefing({ task: 'line', writer: 'claude', sheet, forDay: '2026-09-18', cards: [], said: [], writerModel: 'best' as never }).ok).toBe(false)
    for (const writerModel of ['opus', 'fable', 'sonnet', 'haiku'] as const) expect(lineBriefing({ task: 'line', writer: 'claude', sheet, forDay: '2026-09-18', cards: [], said: [], writerModel })).toMatchObject({ ok: true, briefing: { writerModel } })
  })
})

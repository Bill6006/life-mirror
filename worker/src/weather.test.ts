import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import { forFreeChain, lineBriefing, type Gates } from './briefing'
import { buildMessages, buildReviewMessages, claudeBriefingText, WEATHER_RULES } from './prompt'
import { accessFor, factCategories, gatesFrom, sheetForClaude } from './retrieval'
import { retrieve } from './library'
import type { ClaimCard } from '../../src/libraryTypes'

// Stage 3, item 6, in the Worker: the day's weather and its comparisons reach Claude as the day's record, values only and
// never the area, under that record's switch; the free chain never reads them, and its prompts stay byte for byte as they
// were; Claude's rule for them is given only when such a fact is on the sheet. This ships before the app writes them.

const DAY = '2026-10-20'
const f = (id: string, text: string, values: Fact['values'] = {}, tags: string[] = []): Fact => ({ id, tags, text, values })
// In the phone's own words (weatherFacts in src/facts.ts): no tags, so the library's cards are drawn as before.
const WEATHER: Fact[] = [
  f('weather.today', 'Today’s forecast where you are: 2.3 mm of rain, 5.1 hours of sun, a high of 18 °C (64 °F).', { rain: 2.3, sun: 5.1, high: 18, highF: 64 }),
  f('assoc.weather.rain', 'Evenings of rainy days (1 mm of rain or more) read -4 against evenings of dry days, like for like on the morning’s band, 5 rainy days of 14 with weather (unclear).', { diff: -4, with: 52, without: 56, times: 5, days: 14, bands: 2, mm: 1, rainy: 5 }),
  f('assoc.weather.sun', 'Evenings of sunnier days read +6 against greyer ones, like for like on the morning’s band, 7 sunnier days of 14 with weather and daylight known, split at the middle day’s share of its daylight in sun (unclear).', { diff: 6, with: 58, without: 52, times: 7, days: 14, bands: 2, sunnier: 7, shared: 14 }),
]
const base: FactSheet = { version: 1, day: DAY, builtAt: `${DAY}T11:41:00.000Z`, hour: 7, weeks: 3, days: 22, direction: null, said: [], shortlist: [], facts: [f('week.today', 'Today is Tuesday.', {}, ['cue']), f('week.tomorrow', 'Tomorrow is Wednesday.', { day: '2026-10-21' }, ['cue']), f('path.4', 'The Social path is at stage 1.', { path: 'social' })] }
const full: FactSheet = { ...base, facts: [...base.facts, ...WEATHER] }
const OPEN: Gates = gatesFrom({ hideFaith: false })
const weatherIds = (s: FactSheet) => s.facts.map((x) => x.id).filter((id) => id.startsWith('weather.') || id.startsWith('assoc.weather.'))

describe('the categories', () => {
  it('file the weather and its comparisons with the day’s record', () => {
    expect(WEATHER.map((x) => factCategories(x, new Map()))).toEqual([['dayRecord'], ['dayRecord'], ['dayRecord']])
  })
})

describe('what Claude is shown', () => {
  it('gives the weather to the line and the review, and none of it with the day’s record switched off', () => {
    const all = ['weather.today', 'assoc.weather.rain', 'assoc.weather.sun']
    expect(weatherIds(sheetForClaude(full, accessFor('line', OPEN, readBrainPrefs({}))))).toEqual(all)
    expect(weatherIds(sheetForClaude(full, accessFor('review', OPEN, readBrainPrefs({}))))).toEqual(all)
    expect(weatherIds(sheetForClaude(full, accessFor('line', OPEN, readBrainPrefs({ switches: { dayRecord: false } }))))).toEqual([])
    expect(weatherIds(sheetForClaude(full, accessFor('review', OPEN, readBrainPrefs({ switches: { dayRecord: false } }))))).toEqual([])
  })

  it('never carries the area: no fact holds a latitude or a longitude', () => {
    for (const x of WEATHER) expect(Object.keys(x.values).some((k) => /lat|lon|area|place/i.test(k)), x.id).toBe(false)
  })
})

describe('the prompts', () => {
  const claude = (task: 'line' | 'review', sheet: FactSheet) => {
    const b = lineBriefing({ task, writer: 'claude', sheet, forDay: DAY, cards: [], said: [], writerModel: 'opus', gates: OPEN, context: 'x' })
    if (!b.ok) throw new Error(b.reason)
    return b.briefing
  }
  const free = (task: 'line' | 'review', sheet: FactSheet) => {
    const b = lineBriefing({ task, writer: 'free', sheet, forDay: DAY, cards: [], said: [] })
    if (!b.ok) throw new Error(b.reason)
    return b.briefing
  }

  it('keep the free chain on the approved fact sheet: no weather reaches it, and its prompts are byte for byte as they were', () => {
    expect(weatherIds(forFreeChain(full))).toEqual([])
    expect(JSON.stringify(buildMessages(free('line', forFreeChain(full))))).toBe(JSON.stringify(buildMessages(free('line', base))))
    expect(JSON.stringify(buildReviewMessages(free('review', forFreeChain(full))))).toBe(JSON.stringify(buildReviewMessages(free('review', base))))
    // A probe that could say otherwise: the free chain's prompt with the weather left on it would differ.
    expect(JSON.stringify(buildMessages(free('line', full)))).not.toBe(JSON.stringify(buildMessages(free('line', base))))
  })

  it('give Claude the weather’s rule only when a weather fact is on its sheet', () => {
    const line = claudeBriefingText(claude('line', sheetForClaude(full, accessFor('line', OPEN, readBrainPrefs({})))))
    expect(line).toContain('[weather.today] Today’s forecast where you are: 2.3 mm of rain')
    expect(line).toContain(WEATHER_RULES)
    // Without them, Claude's briefing is byte for byte as it was.
    expect(claudeBriefingText(claude('line', base))).not.toContain(WEATHER_RULES)
    expect(WEATHER_RULES).toMatch(/never that it caused a reading/)
  })
})

describe('the library’s cards', () => {
  it('are drawn as before: the weather facts carry no tag to weigh', () => {
    const card = (id: string, tags: string[]): ClaimCard => ({ id, claim: 'x', domain: 'behaviour-change', tags, grade: 'B', replication: 'replicated', effect: 'small', population: 'adults', sources: [], caveats: 'None known.', app: 'x', reviewed: '2026-10-01', status: 'admitted' }) as ClaimCard
    const cards = [card('cue-card', ['cue']), card('nature-card', ['nature'])]
    const before = retrieve(cards, base).map((c) => c.id)
    expect(before).toEqual(['cue-card'])
    expect(retrieve(cards, full).map((c) => c.id)).toEqual(before)
    // A probe that could say otherwise: the same facts tagged nature would draw the nature card.
    const tagged = { ...full, facts: full.facts.map((x) => (x.id === 'weather.today' ? { ...x, tags: ['nature'] } : x)) }
    expect(retrieve(cards, tagged).map((c) => c.id)).toEqual(['cue-card', 'nature-card'])
  })
})

import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import { forFreeChain, lineBriefing, type Gates } from './briefing'
import { buildMessages, buildReviewMessages, claudeBriefingText, MEMORY_RULES, WEEKLY_RULES } from './prompt'
import { accessFor, factCategories, gatesFrom, sheetForClaude } from './retrieval'
import { retrieve } from './library'
import type { ClaimCard } from '../../src/libraryTypes'

// Stage 3, group 1, in the Worker: the Brain's memory of its own lines and the weekly view's analyses
// reach Claude alone, each under the switches of what it was drawn from; the weekly facts reach the
// Sunday review alone; the free chain never reads either, and its prompts stay byte for byte as they
// were; Claude's rules for them are given only when such facts are on the sheet.

const DAY = '2026-10-20'
const f = (id: string, text: string, values: Fact['values'] = {}, tags: string[] = []): Fact => ({ id, tags, text, values })
// In the phone's own words (src/memoryFacts.ts, src/weeklyFacts.ts): no tags, so the library's cards are drawn as before.
const MEMORY: Fact[] = [
  f('memory.2026-10-18', 'The line seen on 2026-10-18 asked for a plan for Tamlic at the next check-in: a plan was made that day, and a step was started that day and marked done. It was received as: useful.', { day: '2026-10-18', ask: 'plan', aimId: 3, cue: 'nextCheckIn', planCue: 'nextCheckIn', taken: 'yes', kept: 'yes', went: 'done', ease: null, received: 'useful' }),
  f('memory.2026-10-19', 'The line seen on 2026-10-19 asked for nothing to tap. It was received as: untapped.', { day: '2026-10-19', ask: 'nothing', received: 'untapped' }),
]
const WEEKLY: Fact[] = [
  f('weekly.gap', 'The gap, from the weekly view, over 28 days with two logged blocks: typical 52 (the median day), good 64 (the top quarter’s floor), best 78 (the top tenth’s average); good days 32 percent of them, the last one 2 days ago.', { days: 28, typical: 52, good: 64, best: 78, goodPercent: 32, lastGoodDaysAgo: 2 }),
  f('weekly.best.faith', 'Best-days, from the weekly view, the faith practices among what you control, over the same 3 best days of 28: Five minutes of prayer: 2 of 3 best days, 4 of 25 others.', { days: 28, top: 3 }),
  f('weekly.best.social', 'Best-days, from the weekly view, the Social path reps among what you control, over the same 3 best days of 28: Greet someone by name: 2 of 3 best days, 4 of 25 others.', { days: 28, top: 3 }),
]
const base: FactSheet = { version: 1, day: DAY, builtAt: `${DAY}T11:41:00.000Z`, hour: 7, weeks: 3, days: 22, direction: null, said: [], shortlist: [], facts: [f('week.today', 'Today is Tuesday.', {}, ['cue']), f('week.tomorrow', 'Tomorrow is Wednesday.', { day: '2026-10-21' }, ['cue']), f('path.4', 'The Social path is at stage 1.', { path: 'social' })] }
const full: FactSheet = { ...base, facts: [...base.facts, ...MEMORY, ...WEEKLY] }
const OPEN: Gates = gatesFrom({ hideFaith: false })
const ids = (s: FactSheet, prefix: string) => s.facts.map((x) => x.id).filter((id) => id.startsWith(prefix))

describe('the categories', () => {
  it('file a line’s memory with the Brain’s own history, and with the commitment it named', () => {
    expect(factCategories(MEMORY[0], new Map())).toEqual(['brainHistory', 'commitments'])
    expect(factCategories(MEMORY[1], new Map())).toEqual(['brainHistory'])
    // A line about the Social path is the Social path's too; one about a faith practice is faith's.
    expect(factCategories(f('memory.2026-10-17', 'x', { aimId: 4 }), new Map([['4', 'social']]))).toEqual(['brainHistory', 'socialPath'])
    expect(factCategories(f('memory.2026-10-16', 'x', { aimId: 5, faith: 1 }), new Map())).toEqual(['brainHistory', 'commitments', 'faith'])
    expect(factCategories(f('memory.2026-10-16', 'x', { aimId: 5 }, ['faith']), new Map())).toEqual(['brainHistory', 'commitments', 'faith'])
  })

  it('file the weekly view’s analyses with the day’s record, and their faith and Social path parts under those too', () => {
    expect(WEEKLY.map((x) => factCategories(x, new Map()))).toEqual([['dayRecord'], ['dayRecord', 'faith'], ['dayRecord', 'socialPath']])
  })
})

describe('what Claude is shown', () => {
  it('gives the memory to the line and the review, and the weekly view to the review alone', () => {
    const line = sheetForClaude(full, accessFor('line', OPEN, readBrainPrefs({})))
    expect(ids(line, 'memory.')).toEqual(['memory.2026-10-18', 'memory.2026-10-19'])
    expect(ids(line, 'weekly.')).toEqual([])
    const review = sheetForClaude(full, accessFor('review', OPEN, readBrainPrefs({})))
    expect(ids(review, 'memory.')).toEqual(['memory.2026-10-18', 'memory.2026-10-19'])
    expect(ids(review, 'weekly.')).toEqual(['weekly.gap', 'weekly.best.faith', 'weekly.best.social'])
    // The coach reads neither: its profile names no Brain history, and the weekly view is the review's.
    const coach = sheetForClaude(full, accessFor('coach', OPEN, readBrainPrefs({})))
    expect([...ids(coach, 'memory.'), ...ids(coach, 'weekly.')]).toEqual([])
  })

  it('follows the switches of what each was drawn from', () => {
    expect(ids(sheetForClaude(full, accessFor('line', OPEN, readBrainPrefs({ switches: { brainHistory: false } }))), 'memory.')).toEqual([])
    expect(ids(sheetForClaude(full, accessFor('line', OPEN, readBrainPrefs({ switches: { commitments: false } }))), 'memory.')).toEqual(['memory.2026-10-19'])
    expect(ids(sheetForClaude(full, accessFor('review', OPEN, readBrainPrefs({ switches: { dayRecord: false } }))), 'weekly.')).toEqual([])
    expect(ids(sheetForClaude(full, accessFor('review', OPEN, readBrainPrefs({ switches: { faith: false } }))), 'weekly.')).toEqual(['weekly.gap', 'weekly.best.social'])
    expect(ids(sheetForClaude(full, accessFor('review', OPEN, readBrainPrefs({ switches: { socialPath: false } }))), 'weekly.')).toEqual(['weekly.gap', 'weekly.best.faith'])
    // The faith family hidden closes Faith for Claude whatever its switch says.
    expect(ids(sheetForClaude(full, accessFor('review', gatesFrom({ hideFaith: true }), readBrainPrefs({}))), 'weekly.')).toEqual(['weekly.gap', 'weekly.best.social'])
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

  it('keep the free chain on the approved fact sheet: neither reaches it, and its prompts are byte for byte as they were', () => {
    expect([...ids(forFreeChain(full), 'memory.'), ...ids(forFreeChain(full), 'weekly.')]).toEqual([])
    expect(JSON.stringify(buildMessages(free('line', forFreeChain(full))))).toBe(JSON.stringify(buildMessages(free('line', base))))
    expect(JSON.stringify(buildReviewMessages(free('review', forFreeChain(full))))).toBe(JSON.stringify(buildReviewMessages(free('review', base))))
  })

  it('give Claude the memory’s rule, and the weekly view’s to the review, only when such facts are on its sheet', () => {
    const line = claudeBriefingText(claude('line', sheetForClaude(full, accessFor('line', OPEN, readBrainPrefs({})))))
    expect(line).toContain('[memory.2026-10-18] The line seen on 2026-10-18')
    expect(line).toContain(MEMORY_RULES)
    expect(line).not.toContain(WEEKLY_RULES)
    const review = claudeBriefingText(claude('review', sheetForClaude(full, accessFor('review', OPEN, readBrainPrefs({})))))
    expect(review).toContain(MEMORY_RULES)
    expect(review).toContain(WEEKLY_RULES)
    // Without them, Claude's briefing is byte for byte as it was.
    expect(claudeBriefingText(claude('line', base))).not.toContain(MEMORY_RULES)
    expect(MEMORY_RULES).toMatch(/never push harder/)
    expect(MEMORY_RULES).toMatch(/never a verdict on the person/)
    expect(WEEKLY_RULES).toMatch(/an association, never a cause/)
  })
})

describe('the library’s cards', () => {
  it('are drawn as before: the memory and weekly facts carry no tag to weigh', () => {
    const card = (id: string, tags: string[]): ClaimCard => ({ id, claim: 'x', domain: 'behaviour-change', tags, grade: 'B', replication: 'replicated', effect: 'small', population: 'adults', sources: [], caveats: 'None known.', app: 'x', reviewed: '2026-10-01', status: 'admitted' }) as ClaimCard
    const cards = [card('cue-card', ['cue']), card('monitor-card', ['monitoring']), card('plan-card', ['plan'])]
    const before = retrieve(cards, base).map((c) => c.id)
    expect(before).toEqual(['cue-card'])
    expect(retrieve(cards, full).map((c) => c.id)).toEqual(before)
    // A probe that could say otherwise: the same facts tagged as the follow-up fact is would draw two more cards.
    const tagged = { ...full, facts: full.facts.map((x) => (x.id.startsWith('memory.') ? { ...x, tags: ['monitoring', 'plan'] } : x)) }
    expect(retrieve(cards, tagged).map((c) => c.id)).toEqual(['cue-card', 'monitor-card', 'plan-card'])
  })
})

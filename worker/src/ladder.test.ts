import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import { forFreeChain, lineBriefing, type Gates } from './briefing'
import { buildMessages, buildReviewMessages, claudeInstructions, EVIDENCE_RULE, hasLadder, LADDER_RULE, lineSystem, reviewSystem } from './prompt'
import { accessFor, factCategories, gatesFrom, sheetForClaude } from './retrieval'

// The learning repair in the Worker (stage R5): its tests on the evidence ladder (ladder.*) and its track record (track)
// are filed with the fact sheet, as the test cards are; the free chain reads them; and the ladder rule is said only to a
// writer whose sheet holds a ladder fact, so while the repair is closed on the phone every prompt reads as before.

const DAY = '2026-10-20'
const f = (id: string, text: string, values: Fact['values'] = {}, tags: string[] = []): Fact => ({ id, tags, text, values })
// Invented names only: the walk and its reading, as the catalogue words them.
const LADDER: Fact[] = [
  f('ladder.walk-ten.stress', 'Test: A ten-minute walk, now, on Stress over the next block: Likely: helps; offered 21 times and held back 20, each with the reading after it, over 14 days; when done +3.87 steps (+2.50 to +5.23); research +0.30.', { moveId: 'walk-ten', reading: 'stress', level: 'likely', direction: 'helps' }),
]
const TRACK = f('track', 'Its own track record: no early sign has resolved yet; of 1 likely call, 0 resolved, 1 still open; no established call yet.', { earlyResolved: 0, earlyHeld: 0, likelyOpen: 1 })
const base: FactSheet = { version: 1, day: DAY, builtAt: `${DAY}T11:41:00.000Z`, hour: 7, weeks: 3, days: 22, direction: null, said: [], shortlist: [], facts: [f('week.today', 'Today is Tuesday.', {}, ['cue']), f('week.tomorrow', 'Tomorrow is Wednesday.', { day: '2026-10-21' }, ['cue'])] }
const repaired: FactSheet = { ...base, facts: [...base.facts, ...LADDER, TRACK] }
const OPEN: Gates = gatesFrom({ hideFaith: false })
const LAST = '- Plain words, second person, no headings, no lists, no emoji.'

const free = (task: 'line' | 'review', sheet: FactSheet) => {
  const b = lineBriefing({ task, writer: 'free', sheet, forDay: DAY, cards: [], said: [] })
  if (!b.ok) throw new Error(b.reason)
  return b.briefing
}

describe('the ladder and the track record in the Worker', () => {
  it('are filed with the fact sheet, as the test cards are', () => {
    expect(factCategories(LADDER[0], new Map())).toEqual(['factSheet'])
    expect(factCategories(TRACK, new Map())).toEqual(['factSheet'])
    expect(factCategories(f('test.4', 'Card: …'), new Map())).toEqual(['factSheet'])
  })

  it('reach Claude for the line and the review, and the free chain, which reads the test cards they succeed', () => {
    for (const task of ['line', 'review'] as const) {
      const sheet = sheetForClaude(repaired, accessFor(task, OPEN, readBrainPrefs({})))
      expect(sheet.facts.map((x) => x.id)).toEqual(expect.arrayContaining(['ladder.walk-ten.stress', 'track']))
    }
    expect(forFreeChain(repaired).facts.map((x) => x.id)).toEqual(expect.arrayContaining(['ladder.walk-ten.stress', 'track']))
  })
})

describe('the ladder rule in the prompts', () => {
  it('is said only when the sheet holds a ladder fact: without one every prompt reads exactly as before', () => {
    expect(hasLadder(base)).toBe(false)
    expect(hasLadder(repaired)).toBe(true)
    expect(hasLadder({ facts: [TRACK] })).toBe(false)
    expect(lineSystem(undefined, false)).toBe(lineSystem())
    expect(reviewSystem(undefined, false)).toBe(reviewSystem())
    for (const task of ['line', 'review'] as const) expect(claudeInstructions(task, undefined, false)).toBe(claudeInstructions(task))
    for (const system of [lineSystem(), reviewSystem(), claudeInstructions('line'), claudeInstructions('review'), claudeInstructions('coach')]) expect(system).not.toContain(LADDER_RULE)
    expect(JSON.stringify(buildMessages(free('line', base)))).not.toContain('ladder.*')
  })

  it('with a ladder fact, tells every writer of a line or a review once, right after the evidence rule', () => {
    for (const system of [lineSystem(undefined, true), reviewSystem(undefined, true), claudeInstructions('line', undefined, true), claudeInstructions('review', undefined, true)]) {
      expect(system.split(LADDER_RULE).length - 1).toBe(1)
      expect(system).toContain(`${EVIDENCE_RULE}\n${LADDER_RULE}\n${LAST}`)
    }
    // The coach cites no tests and is never given it.
    expect(claudeInstructions('coach', undefined, true)).not.toContain(LADDER_RULE)
    expect(buildMessages(free('line', repaired))[0].content).toContain(LADDER_RULE)
    expect(buildReviewMessages(free('review', repaired))[0].content).toContain(LADDER_RULE)
  })
})

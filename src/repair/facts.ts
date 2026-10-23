import { hasMove, moveById } from '../catalogue'
import { copy } from '../copy'
import type { Fact } from '../factTypes'
import { readingById } from '../readings'
import type { RepairEvidence, TestShown, TrackLine } from './evidence'
import { rungWords } from './words'

// The learning repair for the Brain (stage R5). Requirement 16, word for word: "The Brain receives the graded beliefs and
// the track record, beside the test tiers and associations it reads today. The evidence-wording check holds its words to
// the ladder, and findings the owner can act on come before descriptive ones." Built from the same read Evidence shows; the
// test tiers it once sat beside were the retired engine's (2026-10-20).

const signed = (x: number) => `${x > 0 ? '+' : ''}${(Math.round(x * 100) / 100).toFixed(2)}`
const RANK: Record<string, number> = { none: 0, early: 1, likely: 2, established: 3 }

/** Findings the owner can act on first: calls that help, strongest first; then the other calls; then running tests with none. */
export function actionableFirst(a: TestShown, b: TestShown): number {
  const group = (t: TestShown) => (t.level !== 'none' && t.direction === 'helps' ? 0 : t.level !== 'none' ? 1 : 2)
  return group(a) - group(b) || RANK[b.level] - RANK[a.level] || a.key.localeCompare(b.key)
}

/** One test as the Brain reads it: its rung and direction, its counts, its estimate, research beside it. */
export function ladderFact(t: TestShown): Fact {
  const move = hasMove(t.moveId) ? moveById(t.moveId).name : t.moveId
  const reading = readingById(t.target).name
  const window = copy.catalogue.windows[t.window as keyof typeof copy.catalogue.windows] ?? t.window
  const research = hasMove(t.moveId) ? moveById(t.moveId).prior.effect : 0
  const rung = rungWords(t.level, t.direction)
  // Item 4 (2026-10-23): the call is on suggesting the move against suggesting nothing extra, the one effect the fair draws
  // identify; the size when done is that effect over the share done, which assumes it works only through doing it.
  const share = Math.round(t.share * 10)
  const suggested = t.itt !== null ? `; when suggested, ${signed(t.itt)} steps against nothing extra` : ''
  const estimate = t.theta !== null && t.lo !== null && t.hi !== null ? `; when done, an estimate of ${signed(t.theta)} steps (${signed(t.lo)} to ${signed(t.hi)}), the suggestion's effect over the share of times it was done (${share} in 10), assuming it works only through doing it` : ''
  const text = `Test: ${move}, for ${reading} over the ${window}: ${rung}${t.revised ? ', revised' : ''}, a call on suggesting it against suggesting nothing extra, whatever was then done; offered ${t.offered} times and held back ${t.heldBack}, each with the reading after it, over ${t.days} days${suggested}${estimate}; pooled with research, ${signed(t.belief)} steps when done; research alone ${signed(research)}${t.running ? '; being tested now' : ''}.`
  return {
    id: `ladder.${t.moveId}.${t.target}`,
    tags: ['monitoring'],
    text,
    values: { move, moveId: t.moveId, reading, window: t.window, level: t.level, direction: t.direction, revised: t.revised ? 1 : 0, running: t.running ? 1 : 0, offered: t.offered, heldBack: t.heldBack, days: t.days, theta: t.theta === null ? null : Math.round(t.theta * 100) / 100, itt: t.itt === null ? null : Math.round(t.itt * 100) / 100, share, belief: Math.round(t.belief * 100) / 100, research, ...(t.began ? { began: t.began } : {}) },
    n: t.offered + t.heldBack,
    tier: rung,
  }
}

/** The engine's own track record as the Brain reads it, in requirement 15's words. */
export function trackFact(lines: readonly TrackLine[]): Fact {
  const word = { early: ['early sign', 'early signs'], likely: ['likely call', 'likely calls'], established: ['established call', 'established calls'] } as const
  const parts = lines.map((l) => {
    const said = l.resolved > 0 ? `of ${l.resolved} ${word[l.rung][l.resolved === 1 ? 0 : 1]}, ${l.held} held` : `no ${word[l.rung][0]} has resolved yet`
    return `${said}${l.open ? ` (${l.open} still open)` : ''}${l.tightened ? `; ${word[l.rung][1]} need stronger evidence for now` : ''}`
  })
  const values: Record<string, number> = {}
  for (const l of lines) {
    values[`${l.rung}Resolved`] = l.resolved
    values[`${l.rung}Held`] = l.held
    values[`${l.rung}Open`] = l.open
    values[`${l.rung}Tightened`] = l.tightened ? 1 : 0
  }
  const tested = lines.some((l) => !l.enough) ? ' Until ten of a kind resolve, the rates tested on simulated people stand.' : ''
  return { id: 'track', tags: ['monitoring'], text: `The engine's own track record: ${parts.join('; ')}.${tested}`, values }
}

/** The repair's facts for the sheet: its tests, findings the owner can act on first, then its track record. */
export function repairFacts(ev: RepairEvidence): Fact[] {
  return [...[...ev.shown].sort(actionableFirst).map(ladderFact), trackFact(ev.track)]
}

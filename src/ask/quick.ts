import { hasMove, moveById } from '../catalogue'
import { copy } from '../copy'
import { fill, formatDayShort } from '../format'
import { readingById, type ReadingId } from '../readings'
import { clsOf, type Direction, type Level } from '../repair/engine'
import type { RepairEvidence, TestShown, TrackLine } from '../repair/evidence'
import { rungWords } from '../repair/words'
import { INGREDIENT_IDS } from '../score'
import { changesOf, citeOf, evidenceVersion, testsOf, type FindingChange } from './evidence'
import { contextNamed } from './match'
import type { AskCitation, AskStarter, QuickAnswer } from './types'

// The quick tier (Ask Life Mirror, stage A1, 2026-10-19; the agreed design's points 3 and 9): the starters and "Ask about
// this", answered at once from the repair's read, the same read Evidence shows and the Brain receives, laid out by the
// app. No Claude, no number the engine did not produce, and every finding in the words its rung allows.

const words = () => copy.askMirror

/**
 * Whether asking can lift a test in the queue (stage A3): the queue takes no test over seven days (the engine's
 * `waitingRanked`), which is drawn on its own days instead. src/ask/asked.test.ts holds the two together.
 */
export const liftable = (t: Pick<TestShown, 'window'>): boolean => clsOf(t.window as Parameters<typeof clsOf>[0]) !== 'multi'

/**
 * "Test it sooner" on a test's card (stage A3): when it was last asked about, and the button on any day it was not; for a
 * test over seven days, why asking cannot bring it sooner, and no button.
 */
export function soonerOf(t: Pick<TestShown, 'window'>, asked: string | null, today: string): { ownDays: string | null; asked: string | null; button: boolean } {
  if (!liftable(t)) return { ownDays: words().testOwnDays, asked: null, button: false }
  return { ownDays: null, asked: asked ? fill(words().soonerDone, { date: formatDayShort(asked) }) : null, button: asked !== today }
}

/**
 * "Test it"'s line for a context a typed question names (stage A3; point 13: "maps to one of requirement 7's pre-declared
 * contexts, never a new silo"): that context's own call of the test, or that it has none of its own yet. Null when the
 * question names none.
 */
export function testContextLine(t: TestShown, question: string): string | null {
  const named = contextNamed(question)
  if (!named) return null
  const w = words()
  const context = copy.repairEvidence.contexts[named.context][named.value]
  const own = t.ctx.find((x) => x.context === named.context && x.value === named.value)
  return own ? fill(w.testContext, { context, call: rungWords(own.level, own.direction) }) : fill(w.testContextNone, { context })
}

const nameOf = (moveId: string) => (hasMove(moveId) ? moveById(moveId).name : moveId)
const windowOf = (w: string) => copy.catalogue.windows[w as keyof typeof copy.catalogue.windows] ?? w
const readingName = (id: string) => readingById(id as ReadingId).name

function steps(x: number): string {
  const r = Math.round(x * 100) / 100
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}`
}

/** A finding's call in its rung's words, with its revised mark. */
function callOf(t: { level: Level; direction: Direction; revised: boolean }): string {
  return `${rungWords(t.level, t.direction)}${t.revised ? ` · ${words().revised}` : ''}`
}

function findingLine(t: TestShown): string {
  return fill(words().finding, { move: nameOf(t.moveId), reading: readingName(t.target), window: windowOf(t.window), call: callOf(t) })
}

const RANK: Record<Level, number> = { none: 0, early: 1, likely: 2, established: 3 }
const DIRECTION: Record<string, number> = { helps: 0, hurts: 1, little: 2 }
const READING_ORDER = (id: ReadingId) => {
  const i = INGREDIENT_IDS.indexOf(id)
  return i < 0 ? INGREDIENT_IDS.length : i
}

/** Calls in the order the design gives: established before likely before early, helps before hurts before little difference. */
function byCall(a: TestShown, b: TestShown): number {
  return RANK[b.level] - RANK[a.level] || (DIRECTION[a.direction ?? ''] ?? 3) - (DIRECTION[b.direction ?? ''] ?? 3) || a.key.localeCompare(b.key)
}

/** The calls at a rung, in that order. */
function callsOf(ev: Pick<RepairEvidence, 'shown'>): TestShown[] {
  return ev.shown.filter((t) => t.level !== 'none' && t.direction !== null).sort(byCall)
}

/** What a read keeps to compare against later: every call at a rung, and every test being run. */
function stateOf(ev: Pick<RepairEvidence, 'shown'>): TestShown[] {
  const keep = new Map<string, TestShown>()
  for (const t of [...callsOf(ev), ...ev.shown.filter((x) => x.running)]) keep.set(t.key, t)
  return [...keep.values()]
}

/** The engine's own track record by rung, in Evidence's words: early signs always, likely and established once they have any call. */
function trackLines(lines: readonly TrackLine[]): string[] {
  const r = copy.repairEvidence
  return lines
    .filter((l) => l.rung === 'early' || l.resolved + l.open > 0)
    .map((l) => `${l.resolved > 0 ? fill((l.resolved === 1 ? r.heldOne : r.held)[l.rung], { n: String(l.resolved), m: String(l.held) }) : r.noneResolved[l.rung]}${l.open > 0 ? ` ${fill(l.open === 1 ? r.openOne : r.open, { n: String(l.open) })}` : ''}`)
}

/** What changed, one line for each finding. */
export function changeLines(changes: readonly FindingChange[]): string[] {
  return changes.map((ch) => {
    const [moveId, target] = ch.key.split('|')
    const base = { move: nameOf(moveId), reading: readingName(target), before: callOf(ch.before) }
    return ch.after ? fill(words().change, { ...base, after: callOf(ch.after) }) : fill(words().changeGone, base)
  })
}

/** An answer laid out by the app, and the findings it cites. */
export interface Laid {
  answer: QuickAnswer
  cited: AskCitation[]
}

/** The read a new "What do you know" or "What's changed" compares against: the newest of either, when it was asked, and what it cited. */
export interface LastRead {
  day: string
  cited: readonly AskCitation[]
  version: string
}

/** The calls and tests being run now that the last read did not hold. */
function newSince(last: LastRead, ev: Pick<RepairEvidence, 'shown'>): TestShown[] {
  const had = new Set(last.cited.map((x) => x.key))
  return stateOf(ev).filter((t) => !had.has(t.key))
}

/** What changed since the last read: the findings it held, then the calls and tests begun since, each under its own heading; or that nothing has. */
function sinceSections(last: LastRead, ev: Pick<RepairEvidence, 'shown' | 'quiet'>): QuickAnswer['sections'] {
  const changed = changeLines(changesOf(last.cited, ev))
  const begun = newSince(last, ev).map((t) => fill(words().newLine, { move: nameOf(t.moveId), reading: readingName(t.target), window: windowOf(t.window), call: callOf(t) }))
  const date = formatDayShort(last.day)
  if (!changed.length && !begun.length) return [{ title: null, lines: [fill(words().nothingChanged, { date })] }]
  return [...(changed.length ? [{ title: fill(words().sinceLast, { date }), lines: changed }] : []), ...(begun.length ? [{ title: words().newTitle, lines: begun }] : [])]
}

/** "What do you know about me so far?": what changed since the last read first, then what helps, the other calls, the tests being run, and the track record. */
export function knowAnswer(ev: RepairEvidence, last: LastRead | null): Laid {
  const sections: QuickAnswer['sections'] = []
  if (last) sections.push(...sinceSections(last, ev))
  const calls = callsOf(ev)
  const helps = calls.filter((t) => t.direction === 'helps').sort((a, b) => READING_ORDER(a.target) - READING_ORDER(b.target) || byCall(a, b))
  const others = calls.filter((t) => t.direction !== 'helps')
  const running = ev.shown.filter((t) => t.running)
  if (helps.length) sections.push({ title: words().helpsTitle, lines: helps.map(findingLine) })
  if (others.length) sections.push({ title: words().otherTitle, lines: others.map(findingLine) })
  if (!calls.length) sections.push({ title: null, lines: [words().notEnough] })
  if (running.length) sections.push({ title: words().runningTitle, lines: running.map(findingLine) })
  const track = trackLines(ev.track)
  if (track.length) sections.push({ title: words().trackTitle, lines: track })
  return { answer: { sections }, cited: stateOf(ev).map(citeOf) }
}

/** "What's changed since last time?": each finding the last read held against now, and the calls and tests begun since. */
export function changedAnswer(ev: RepairEvidence, last: LastRead): Laid {
  return { answer: { sections: sinceSections(last, ev) }, cited: stateOf(ev).map(citeOf) }
}

/** A test whole, as "Ask about this" and "What should we test next" give it: its call, contexts, counts, estimate, research, whether it runs. */
function testLines(t: TestShown): string[] {
  const w = words()
  const r = copy.repairEvidence
  const lines = [callOf(t)]
  for (const x of t.ctx) lines.push(fill(w.context, { context: r.contexts[x.context as keyof typeof r.contexts][x.value], call: rungWords(x.level, x.direction) }))
  lines.push(fill(w.counts, { offered: String(t.offered), heldBack: String(t.heldBack), days: String(t.days) }))
  if (t.itt !== null) lines.push(fill(w.suggested, { itt: steps(t.itt) }))
  if (t.theta !== null && t.lo !== null && t.hi !== null) lines.push(fill(w.estimate, { theta: steps(t.theta), lo: steps(t.lo), hi: steps(t.hi), share: String(Math.round(t.share * 10)) }))
  if (hasMove(t.moveId)) lines.push(fill(w.research, { research: steps(moveById(t.moveId).prior.effect), belief: steps(t.belief) }))
  if (t.began) lines.push(fill(w.began, { date: formatDayShort(t.began) }))
  lines.push(t.running ? w.runningNow : w.notRunning)
  return lines
}

const titleOf = (t: { moveId: string; target: string; window: string }) => `${nameOf(t.moveId)}, ${fill(copy.evidence.forTarget, { target: readingName(t.target), window: windowOf(t.window) })}`

/** A finding still to be settled: any short of an established call. What would settle it is said only for one. */
const open = (t: TestShown) => t.level !== 'established'

/** "What should we test next?": the tests being run now, each whole, then the next the queue would take; what would settle a test, once. */
export function nextAnswer(ev: RepairEvidence): Laid {
  const w = words()
  const running = ev.shown.filter((t) => t.running)
  const sections: QuickAnswer['sections'] = running.map((t) => ({ title: titleOf(t), lines: testLines(t) }))
  // What would settle a test, right after the tests being run, before the queue: once, and only while one is not settled.
  if (running.some(open)) sections.push({ title: null, lines: [w.settle] })
  sections.push({ title: w.queueTitle, lines: ev.waiting.length ? ev.waiting.map((t) => fill(w.queueLine, { move: nameOf(t.moveId), reading: readingName(t.target), window: windowOf(t.window) })) : [w.queueNone] })
  return { answer: { sections }, cited: running.map(citeOf) }
}

/**
 * "Ask about this": each attached finding whole, with what would settle it while one is not settled; a finding no longer
 * among the tests said so; a line resting on none said so. A finding the question already names is not named again above it.
 */
export function aboutAnswer(keys: readonly string[], ev: RepairEvidence, question = ''): Laid {
  const w = words()
  const tests = testsOf(ev)
  if (!keys.length) return { answer: { sections: [{ title: null, lines: [w.aboutNone] }] }, cited: [] }
  const sections: QuickAnswer['sections'] = []
  const cited: AskCitation[] = []
  const found: TestShown[] = []
  for (const key of keys) {
    const t = tests.get(key)
    if (!t) {
      const [moveId, target, window] = key.split('|')
      sections.push({ title: null, lines: [fill(w.aboutGone, { key: titleOf({ moveId, target, window }) })] })
      continue
    }
    const title = titleOf(t)
    sections.push({ title: keys.length === 1 && question.includes(title) ? null : title, lines: testLines(t) })
    cited.push(citeOf(t))
    found.push(t)
  }
  if (found.some(open)) sections.push({ title: null, lines: [w.settle] })
  return { answer: { sections }, cited }
}

/** The tests a line on the Brain card cites, by key, from its ladder facts (`ladder.<move>.<reading>`). */
export function keysOfLine(factIds: readonly string[], ev: Pick<RepairEvidence, 'shown' | 'quiet'>): string[] {
  const out: string[] = []
  for (const id of factIds) {
    const m = /^ladder\.(.+)\.([a-zA-Z]+)$/.exec(id)
    if (!m) continue
    const t = [...ev.shown, ...ev.quiet].find((x) => x.moveId === m[1] && x.target === m[2])
    if (t && !out.includes(t.key)) out.push(t.key)
  }
  return out
}

/**
 * The starters with something real to say (point 3): "What do you know" once a test has fair draws on both sides; "What's
 * changed" once a read exists and the evidence has moved since it; "What should we test next" while the queue runs a test
 * or has one waiting. The deep tier waits for stage A2.
 */
export function startersShown(ev: Pick<RepairEvidence, 'shown' | 'quiet' | 'waiting'>, last: LastRead | null): AskStarter[] {
  const out: AskStarter[] = []
  if (ev.shown.length + ev.quiet.length > 0) out.push('know')
  if (last && last.version !== evidenceVersion(ev)) out.push('changed')
  if (ev.shown.some((t) => t.running) || ev.waiting.length > 0) out.push('next')
  return out
}

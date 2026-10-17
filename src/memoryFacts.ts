import { addDays, blockAt } from './blocks'
import type { LineAction, LineCue } from './brainShared'
import { copy } from './copy'
import type { Aim, BrainBrief, BriefFeedback, BriefLog, Card, CheckIn, DayContext, Intention, Offer, Outcome } from './db'
import { latestPlans } from './aims'
import { hasMove, moveById } from './catalogue'
import type { Fact } from './factTypes'
import { readingById, type ReadingId } from './readings'
import { isFaithPractice } from './rhythm'
import { SHORT_READINGS } from './settings'
import { wasShown, workerKey, workerShown } from './shown'

// The Brain with a memory (stage 3, group 1): one fact for each line seen in the 30 days before
// today, built from the phone's own record. What the line asked (its one tap, or nothing to tap),
// whether the tap was taken (the line's own action state: the plan made that day, the depth set
// short, the test set), whether the plan was kept (a step of it started on its day, the follow-up
// fact's own rule), how it went, and how the line was received. No words of the line: the sheet's
// "said" holds them. A faith practice keeps Rule 10: the general form, nothing kept, answered or
// counted. Claude's alone: the Worker files these under the Brain's own history and the commitment
// they name, and the free chain never reads them. No tags, so the library's cards are drawn as before.

export const MEMORY_DAYS = 30

export interface MemoryInput {
  today: string
  log: readonly BriefLog[]
  brainBriefs: readonly BrainBrief[]
  contexts: readonly DayContext[]
  feedback: readonly BriefFeedback[]
  intentions: readonly Intention[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  checkins: readonly CheckIn[]
  cards: readonly Pick<Card, 'moveId' | 'createdAt'>[]
  aims: readonly Aim[]
}

interface Seen {
  key: string
  day: string
  /** When it was first on screen: the moment the record says so, else when it was written. */
  shownAt: string
  action: LineAction | null
}

const CUE_WORDS: Readonly<Record<LineCue, string>> = { afterPickup: 'after pickup', afterBedtime: 'after her bedtime', nextCheckIn: 'at the next check-in' }
const WENT_WORDS = { done: 'marked done', partly: 'marked partly done', not: 'marked not done', unanswered: 'not answered' } as const
const EASE_WORDS = { hard: 'it felt hard', right: 'it felt about right', easy: 'it felt easy' } as const

/** The lines seen in the window, the phone's own and the Worker's, each with the moment it was first on screen. */
function seenLines(i: MemoryInput): Seen[] {
  const from = addDays(i.today, -MEMORY_DAYS)
  const inWindow = (day: string) => day >= from && day < i.today
  const phone = i.log.filter((l) => l.situationId !== null && inWindow(l.day) && wasShown(l, i.brainBriefs)).map((l) => ({ key: `phone:${l.day}:${l.id}`, day: l.day, shownAt: l.shownAt ?? l.at, action: l.action ?? null }))
  const worker = i.brainBriefs
    .filter((w) => w.kind === 'brief' && inWindow(w.day) && workerShown(w, i.contexts))
    .map((w) => {
      const key = workerKey(w)
      const marks = i.contexts.map((c) => c.shown?.[key]).filter((t): t is string => typeof t === 'string').sort()
      return { key, day: w.day, shownAt: marks[0] ?? w.at, action: w.action ?? null }
    })
  return [...phone, ...worker].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.shownAt < b.shownAt ? -1 : a.shownAt > b.shownAt ? 1 : 0))
}

/** A reading's name; an id no longer known is said as it was written. */
function readingName(id: string): string {
  try {
    return readingById(id as ReadingId).name
  } catch {
    return id
  }
}

/** How a commitment is named in a line's memory: by name while it is kept and not paused, else plainly. */
function aimWords(aim: Aim | undefined): string {
  if (!aim || aim.archivedAt !== null) return 'a commitment no longer kept'
  if (aim.pausedAt) return 'a commitment now paused'
  // Said mid-sentence; the Partner path is never planned by a line (Part 27), so it is never named here.
  if (aim.kind === 'path') return aim.path === 'social' ? copy.path.names.social.replace(/^The\b/, 'the') : 'a commitment'
  if (aim.name) return aim.name
  // A practice or a person is known by its step, as its card shows it.
  return aim.stepMoveId && hasMove(aim.stepMoveId) ? `the commitment “${moveById(aim.stepMoveId).name}”` : copy.aims.kinds[aim.kind].toLowerCase()
}

/** A line's one fact: what it asked and what the record shows came of it. */
function memoryOf(line: Seen, id: string, i: MemoryInput, received: string): Fact {
  const head = `The line seen on ${line.day}`
  const tail = ` It was received as: ${received}.`
  const a = line.action
  if (!a) return { id, tags: [], text: `${head} asked for nothing to tap.${tail}`, values: { day: line.day, ask: 'nothing', received } }

  if (a.kind === 'plan') {
    const aim = i.aims.find((x) => x.id === a.aimId)
    const name = aimWords(aim)
    // A faith practice is offered, never pushed or counted (Rule 10; stage 1, item g): the general form.
    if (aim && isFaithPractice(aim)) return { id, tags: [], text: `${head} was about ${name}, a faith practice: offered, never counted.${tail}`, values: { day: line.day, ask: 'plan', aimId: a.aimId, faith: 1, received } }
    const plan = latestPlans(i.intentions).find((p) => p.aimId === a.aimId && p.day === line.day) ?? null
    const asked = `${head} asked for a plan for ${name} ${CUE_WORDS[a.cue]}`
    if (!plan) return { id, tags: [], text: `${asked}: no plan for it was made that day.${tail}`, values: { day: line.day, ask: 'plan', aimId: a.aimId, cue: a.cue, taken: 'no', received } }
    const other = plan.cue !== a.cue ? `, ${CUE_WORDS[plan.cue]} instead` : ''
    if (plan.offerId === null) return { id, tags: [], text: `${asked}: a plan was made that day${other}, and no step of it was started that day.${tail}`, values: { day: line.day, ask: 'plan', aimId: a.aimId, cue: a.cue, planCue: plan.cue, taken: 'yes', kept: 'no', received } }
    const x = i.outcomes.find((o) => o.offerId === plan.offerId)
    const went = x?.outcome === 'done' ? 'done' : x?.outcome === 'partly' ? 'partly' : x?.outcome === 'no' ? 'not' : 'unanswered'
    const ease = went === 'done' || went === 'partly' ? (x?.ease ?? null) : null
    return {
      id,
      tags: [],
      text: `${asked}: a plan was made that day${other}, and a step was started that day and ${WENT_WORDS[went]}${ease ? `; ${EASE_WORDS[ease]}` : ''}.${tail}`,
      values: { day: line.day, ask: 'plan', aimId: a.aimId, cue: a.cue, planCue: plan.cue, taken: 'yes', kept: 'yes', went, ease, received },
    }
  }

  if (a.kind === 'depth') {
    // The depth set short shows in the next check-in begun after the line was seen: it asked the shorter set.
    const next = i.checkins.filter((c) => c.startedAt > line.shownAt).sort((x, y) => (x.startedAt < y.startedAt ? -1 : 1))[0]
    const short = next ? Boolean(next.asked?.length) && (next.asked ?? []).every((r) => SHORT_READINGS.includes(r)) : null
    const result = short === null ? 'no check-in has followed it yet' : short ? 'the next check-in after it asked the shorter set' : 'the next check-in after it still asked the full set'
    return { id, tags: [], text: `${head} asked for a lighter check-in: ${result}.${tail}`, values: { day: line.day, ask: 'depth', taken: short === null ? null : short ? 'yes' : 'no', received } }
  }

  const move = hasMove(a.moveId) ? moveById(a.moveId).name : a.moveId
  const reading = a.reading ? readingName(a.reading) : null
  const set = i.cards.some((c) => c.moveId === a.moveId && blockAt(new Date(c.createdAt)).day === line.day)
  const what = `to test ${move}${reading ? ` on ${reading}` : ''}${a.block ? ` in the ${a.block}` : ''}`
  return { id, tags: [], text: `${head} asked ${what}: ${set ? 'the test was set that day' : 'no test of it was set that day'}.${tail}`, values: { day: line.day, ask: 'test', move, moveId: a.moveId, reading, block: a.block ?? null, taken: set ? 'yes' : 'no', received } }
}

/** The memory facts, latest first: memory.<day>, and memory.<day>.2 and on for a day's later lines. */
export function memoryFacts(i: MemoryInput): Fact[] {
  const answer = new Map(i.feedback.map((f) => [f.briefKey, f.answer]))
  const out: Fact[] = []
  const perDay = new Map<string, number>()
  for (const line of seenLines(i)) {
    const k = (perDay.get(line.day) ?? 0) + 1
    perDay.set(line.day, k)
    out.push(memoryOf(line, k === 1 ? `memory.${line.day}` : `memory.${line.day}.${k}`, i, answer.get(line.key) ?? 'untapped'))
  }
  return out.reverse()
}

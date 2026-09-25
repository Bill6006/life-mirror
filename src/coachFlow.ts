import { editSkill, makeCurrent, setCurrentSkill, setRhythm, type SkillWords } from './aimFlow'
import { dayKey, daysBetween } from './blocks'
import { readBrainPrefs } from './brainShared'
import { ASK_KEEPS_DAYS, FAITH_WORDS, isPhysical, practised, reviewDue, revisionOf, skillSessions, SKILL_COACH, type CoachAsk, type CoachProposal, type Decision, type SkillChange } from './coachShared'
import { db, type Aim, type Skill } from './db'
import { rhythmOf, type Rhythm } from './rhythm'
import { withDefaults } from './settings'

// Parts 40 and 41 on the phone: asking the skill coach, the state each learning commitment's card
// reads, and every decision on what comes back. The app stays the authority: it decides when a
// review is due, what may be asked, and what is stored; a proposal changes nothing until you tap,
// and the commitment works by hand throughout. While the gate is closed none of this runs.

const PREVIEW_KEY = 'life-mirror.preview.skillCoach'

/** One ask or review check at a time on this phone: two quick taps, or two checks landing together, never write two of the same. */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}

/**
 * Where Parts 40 and 41 stand on this phone: closed; open, once the owner turns them on; or a
 * preview, which only an automated test browser can open, so they can be tested and seen. A
 * preview sends nothing to Claude: the Worker's own gate stays closed.
 */
export type CoachMode = 'gated' | 'preview' | 'open'

export function coachMode(gate: 'gated' | 'open' = SKILL_COACH): CoachMode {
  if (gate === 'open') return 'open'
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true && typeof localStorage !== 'undefined' && localStorage.getItem(PREVIEW_KEY) === '1' ? 'preview' : 'gated'
  } catch {
    return 'gated'
  }
}

/** Whether the skill coach shows on this phone at all. */
export function skillCoachOpen(mode: CoachMode = coachMode()): boolean {
  return mode !== 'gated'
}

/** A learning commitment's own words: what Claude would read of its goal. */
function goalWords(aim: Aim, skill: Skill | null): string[] {
  return [aim.name ?? '', aim.about ?? '', aim.method ?? '', skill?.name ?? '', skill?.method ?? '', skill?.how ?? '']
}

/** Whether Claude may be asked about this commitment: its Commitments switch on, its cloud copy set up (an ask travels through it), and no faith in its words while faith is hidden. */
function mayAskFor(aim: Aim, skill: Skill | null, switchOn: boolean, cloud: boolean, faithHidden: boolean): boolean {
  if (!switchOn || !cloud) return false
  return !(faithHidden && goalWords(aim, skill).some((w) => FAITH_WORDS.test(w)))
}

export interface OpenAsk {
  ask: CoachAsk
  /** Claude's answer, when it came and was written for the commitment as it stands. */
  proposal: CoachProposal | null
}

/** What one learning commitment's card shows of the skill coach. */
export interface AimCoach {
  mayAsk: boolean
  /** Whether its words read as physical: Claude is asked only after one safety question. */
  physical: boolean
  /** The last answer given to that question for this commitment, to start from next time; null if never asked. */
  care: string | null
  /** A suggestion asked for and not yet decided: pending, or answered. */
  setup: OpenAsk | null
  /** A progression review due on the current skill and not yet answered. */
  review: OpenAsk | null
}

const learningAims = () => db.aims.filter((a) => a.kind === 'certification' && a.archivedAt === null).toArray()
const currentOf = (aim: Aim, skills: readonly Skill[]) => (typeof aim.currentSkillId === 'number' ? (skills.find((s) => s.id === aim.currentSkillId) ?? null) : null)
const newest = (asks: readonly CoachAsk[]) => [...asks].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : (b.id ?? 0) - (a.id ?? 0)))[0] ?? null

/**
 * Each learning commitment's coach state, read in one go so the screen's live query follows every
 * table it shows: whether Claude may be asked, the setup ask still open, and the review still open.
 * An answer written for the commitment as it stood before an edit is dropped; an ask no run
 * answered within three days is let go. Null while the gate is closed.
 */
export async function coachStates(today: string, mode: CoachMode = coachMode()): Promise<Map<number, AimCoach> | null> {
  if (mode === 'gated') return null
  const [aims, skills, asks, proposals, settingsRow, prefsRow] = await Promise.all([learningAims(), db.skills.toArray(), db.coachAsks.toArray(), db.coachProposals.toArray(), db.settings.get(1), db.brainPrefs.get('prefs')])
  const settings = withDefaults(settingsRow)
  const switchOn = readBrainPrefs(prefsRow).switches.commitments !== false
  // An ask travels through the cloud copy; a preview's goes nowhere, so it needs none.
  const cloud = mode === 'preview' || Boolean(settings.cloud.token)
  const out = new Map<number, AimCoach>()
  for (const aim of aims) {
    const id = aim.id as number
    const current = currentOf(aim, skills)
    const rev = revisionOf(aim, current)
    const mine = asks.filter((a) => a.aimId === id && !a.decision)
    const answer = (ask: CoachAsk) => proposals.find((p) => p.askId === ask.id && p.revision === rev && p.revision === ask.revision) ?? null
    const s = newest(mine.filter((a) => a.kind === 'setup'))
    const sp = s ? answer(s) : null
    const setup = s && s.revision === rev && (sp !== null || daysBetween(s.day, today) <= ASK_KEEPS_DAYS) ? { ask: s, proposal: sp } : null
    const r = current ? newest(mine.filter((a) => a.kind === 'review' && a.skillId === current.id)) : null
    const cared = newest(asks.filter((a) => a.aimId === id && typeof a.care === 'string'))
    out.set(id, { mayAsk: mayAskFor(aim, current, switchOn, cloud, settings.hideFaith), physical: isPhysical(goalWords(aim, current)), care: cared?.care ?? null, setup, review: r ? { ask: r, proposal: answer(r) } : null })
  }
  return out
}

/**
 * Asks Claude for a suggestion for a learning commitment's current skill (Part 40): a first one, or
 * another after one you set aside. One open ask at a time; nothing is asked while the gate is
 * closed, while the Commitments switch is off, without a cloud copy, or for a commitment paused or
 * finished. A physical goal is asked about only with the answer to its one safety question ('' for
 * nothing to add). Returns the ask, or null when none was made.
 */
export function askSuggestion(aimId: number, now: Date = new Date(), after?: string, mode: CoachMode = coachMode(), care?: string): Promise<number | null> {
  if (mode === 'gated') return Promise.resolve(null)
  return serial(() => askNow(aimId, now, after, mode, care))
}

async function askNow(aimId: number, now: Date, after: string | undefined, mode: CoachMode, care: string | undefined): Promise<number | null> {
  const day = dayKey(now)
  const states = await coachStates(day, mode)
  const state = states?.get(aimId)
  if (!state?.mayAsk) return null
  if (state.setup && !state.setup.proposal) return state.setup.ask.id ?? null
  if (state.physical && care === undefined) return null
  return db.transaction('rw', [db.aims, db.skills, db.coachAsks], async () => {
    const aim = await db.aims.get(aimId)
    if (!aim || aim.kind !== 'certification' || aim.pausedAt || aim.finishedAt || aim.archivedAt) return null
    const current = currentOf(aim, await db.skills.toArray())
    return (await db.coachAsks.add({ aimId, kind: 'setup', revision: revisionOf(aim, current), day, at: now.toISOString(), claude: true, ...(after ? { after } : {}), ...(state.physical ? { care: (care ?? '').trim().slice(0, 200) } : {}) })) as number
  })
}

async function decide(askId: number, decision: Decision, now: Date): Promise<void> {
  await db.coachAsks.update(askId, { decision, decidedAt: now.toISOString() })
}

async function proposalOf(askId: number): Promise<{ ask: CoachAsk; proposal: CoachProposal } | null> {
  const [ask, proposal] = await Promise.all([db.coachAsks.get(askId), db.coachProposals.where('askId').equals(askId).first()])
  return ask && proposal && !ask.decision ? { ask, proposal } : null
}

/** A rhythm Claude proposed, kept only when it makes sense to the app; the app enforces its rest days. */
const rhythmFrom = (r: unknown): Rhythm | null => rhythmOf(r)

/** Whether a suggestion still stands against the commitment as it is now: one written before an edit is dropped. */
async function fresh(ask: CoachAsk): Promise<boolean> {
  const aim = await db.aims.get(ask.aimId)
  if (!aim) return false
  return revisionOf(aim, currentOf(aim, await db.skills.toArray())) === ask.revision
}

/**
 * Use this (Part 40): the suggestion becomes the current skill, as Claude's, with its method, how,
 * minutes, safety line and likely next; its rhythm is set when it gave one. The skill it replaces
 * stays in the history. Nothing happens for an answer written before an edit.
 */
export async function useSuggestion(askId: number, now: Date = new Date()): Promise<boolean> {
  const found = await proposalOf(askId)
  if (!found?.proposal.suggestion || !(await fresh(found.ask))) return false
  const s = found.proposal.suggestion
  return applySkill(found.ask, { name: s.skill, method: s.method ?? undefined, how: s.how, minutes: s.minutes }, 'claude', s.rhythm, { safety: s.safety, likelyNext: s.likelyNext }, 'used', now)
}

/** Edit first: the suggestion, changed by you, becomes the current skill; still Claude's if its name stands, yours if you renamed it. */
export async function editedSuggestion(askId: number, words: SkillWords, rhythm: Rhythm | null, now: Date = new Date()): Promise<boolean> {
  const found = await proposalOf(askId)
  if (!found?.proposal.suggestion || !words.name.trim() || !(await fresh(found.ask))) return false
  const s = found.proposal.suggestion
  const same = words.name.trim().toLowerCase() === s.skill.toLowerCase()
  return applySkill(found.ask, words, same ? 'claude' : 'you', rhythm, { safety: s.safety, likelyNext: s.likelyNext }, 'edited', now)
}

async function applySkill(ask: CoachAsk, words: SkillWords, source: 'you' | 'claude', rhythm: Rhythm | null | undefined, extra: { safety: string | null; likelyNext: string | null }, decision: Decision, now: Date): Promise<boolean> {
  const id = await setCurrentSkill(ask.aimId, words, now, source)
  if (id === null) return false
  await db.skills.update(id, { safety: extra.safety ?? undefined, likelyNext: extra.likelyNext ?? undefined })
  if (rhythm !== undefined) await setRhythm(ask.aimId, rhythm ? rhythmFrom(rhythm) : null)
  await decide(ask.id as number, decision, now)
  return true
}

/** Another suggestion: this one set aside, and another asked for with the same safety answer; the D7 cap may leave it for tomorrow. */
export async function anotherSuggestion(askId: number, now: Date = new Date(), mode: CoachMode = coachMode()): Promise<number | null> {
  const ask = await db.coachAsks.get(askId)
  if (!ask || ask.decision) return null
  const proposal = await db.coachProposals.where('askId').equals(askId).first()
  await decide(askId, 'another', now)
  return askSuggestion(ask.aimId, now, proposal?.id, mode, ask.care ?? '')
}

/**
 * Skip ahead (Workstream 6): the likely next skill Claude named with the current one becomes
 * current, as Claude's; the one before stays in the history. Your tap alone moves it.
 */
export async function takeLikelyNext(aimId: number, now: Date = new Date()): Promise<number | null> {
  const aim = await db.aims.get(aimId)
  if (!aim || aim.kind !== 'certification' || aim.pausedAt || aim.finishedAt || aim.archivedAt) return null
  const current = currentOf(aim, await db.skills.toArray())
  if (!current?.likelyNext) return null
  return setCurrentSkill(aimId, { name: current.likelyNext, method: current.method }, now, 'claude')
}

/** Write my own: the suggestion set aside; the card's own form is yours. */
export async function writeOwnSkill(askId: number, now: Date = new Date()): Promise<void> {
  const ask = await db.coachAsks.get(askId)
  if (ask && !ask.decision) await decide(askId, 'own', now)
}

/**
 * Puts a progression review in place for each learning commitment whose current skill is due
 * (Part 41): six different practice days and a week behind the skill, again after every six more,
 * or three Hard sessions in a row on three different days. Claude is asked when it may be; else the
 * phone asks the same question neutrally. One open review at a time; nothing while the gate is
 * closed or the commitment is paused. Returns how many were put in place.
 */
export function ensureReviews(today: string, now: Date = new Date(), mode: CoachMode = coachMode()): Promise<number> {
  if (mode === 'gated') return Promise.resolve(0)
  return serial(() => reviewsNow(today, now, mode))
}

async function reviewsNow(today: string, now: Date, mode: CoachMode): Promise<number> {
  const [aims, skills, offers, outcomes, asks, states] = await Promise.all([learningAims(), db.skills.toArray(), db.offers.toArray(), db.outcomes.toArray(), db.coachAsks.toArray(), coachStates(today, mode)])
  let added = 0
  for (const aim of aims) {
    const id = aim.id as number
    const current = currentOf(aim, skills)
    if (!current || aim.finishedAt) continue
    const mine = asks.filter((a) => a.aimId === id && a.kind === 'review' && a.skillId === current.id)
    if (mine.some((a) => !a.decision)) continue
    const answered = mine.filter((a) => a.decision).sort((a, b) => ((a.decidedAt ?? a.at) < (b.decidedAt ?? b.at) ? -1 : 1)).pop() ?? null
    const since = current.startedAt ? dayKey(new Date(current.startedAt)) : null
    const p = practised(skillSessions(current.id as number, since, offers, outcomes))
    const state = reviewDue({ days: p.days, sessions: p.sessions, since, today, last: answered ? { days: answered.days ?? 0, at: answered.decidedAt ?? answered.at } : null, paused: Boolean(aim.pausedAt) })
    if (!state.due || !state.kind) continue
    await db.coachAsks.add({ aimId: id, kind: 'review', revision: revisionOf(aim, current), day: today, at: now.toISOString(), claude: states?.get(id)?.mayAsk === true, skillId: current.id, days: state.days, hardRun: state.hardRun, reason: state.kind })
    added++
  }
  return added
}

/** What you did with a review, and what it changes: nothing for Keep; the practice for Adjust; a new current skill for Progress, a simpler one for Simplify, or the one you write. The goal never changes. */
export type ReviewAnswer =
  | { decision: 'kept' }
  | { decision: 'adjusted' | 'progressed' | 'simplified'; change: SkillChange }
  | { decision: 'earlier'; skillId: number }
  | { decision: 'wroteNext'; words: SkillWords; rhythm?: Rhythm | null }

/**
 * Answers an open review (Part 41). Keep restarts the six-day count. A change to the practice edits
 * the current skill; a new skill becomes current (the one before stays in the history), as Claude's
 * when it came from its answer, as yours when you wrote it. Nothing changes until this tap.
 */
export async function answerReview(askId: number, a: ReviewAnswer, now: Date = new Date()): Promise<boolean> {
  const ask = await db.coachAsks.get(askId)
  if (!ask || ask.kind !== 'review' || ask.decision) return false
  const aim = await db.aims.get(ask.aimId)
  const current = aim ? currentOf(aim, await db.skills.toArray()) : null
  if (!aim || !current || current.id !== ask.skillId) return false
  if (a.decision === 'earlier') await makeCurrent(ask.aimId, a.skillId, now)
  else if (a.decision === 'wroteNext') {
    if ((await setCurrentSkill(ask.aimId, a.words, now, 'you')) === null) return false
    if (a.rhythm !== undefined) await setRhythm(ask.aimId, a.rhythm)
  } else if (a.decision !== 'kept') {
    const c = a.change
    const renamed = c.skill !== undefined && c.skill.trim().toLowerCase() !== current.name.toLowerCase()
    if (renamed) {
      // Claude's only when its answer to this review named that skill; a name you typed is yours.
      const proposal = await db.coachProposals.where('askId').equals(askId).first()
      const named = proposal?.revision === ask.revision ? proposal.review?.change?.skill : undefined
      const theirs = named !== undefined && named.trim().toLowerCase() === (c.skill as string).trim().toLowerCase()
      const id = await setCurrentSkill(ask.aimId, { name: c.skill as string, method: c.method ?? current.method, how: c.how, minutes: c.minutes }, now, theirs ? 'claude' : 'you')
      if (id === null) return false
      if (c.safety) await db.skills.update(id, { safety: c.safety })
    } else await editSkill(current.id as number, { name: current.name, method: c.method ?? current.method, how: c.how ?? current.how, minutes: c.minutes ?? current.minutes })
    if (c.rhythm !== undefined) await setRhythm(ask.aimId, c.rhythm ? rhythmFrom(c.rhythm) : null)
  }
  await decide(askId, a.decision, now)
  return true
}

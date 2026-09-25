import { BANNED_WORDS, USAGE_VERDICT } from './brainShared'

// Parts 40 and 41 (Workstream 6), shared by the phone and the Worker: Claude suggests a learning
// commitment's current skill and how to practise it, and reviews its progression; the owner decides.
// A proposal changes nothing until the owner taps; the app stays the authority over eligibility,
// rhythm, rest days and what is stored. Here: the gate, the shapes, the checks every answer passes,
// the revision a proposal is written for, and when a review is due.

/**
 * Whether Parts 40 and 41 are switched on (2026-09-25). Built, tested and deployed dark while the
 * Claude reliability monitoring runs: no ask is written, no run is fired, no card is shown, and the
 * monitored prompts do not move. Opened only when the reliability reports complete, their
 * thresholds pass, and the owner approves; the phone and the Worker read this one value.
 */
export const SKILL_COACH: 'gated' | 'open' = 'gated'

/** D7: at most two on-demand suggestion runs a day, only after the day's line and the coach. */
export const MAX_SETUP_RUNS_A_DAY = 2
/** The earliest ordinary review: six different practice days on the current skill (D1, amended), never an advancement. */
export const REVIEW_DAYS = 6
/** And at least seven calendar days behind the skill: a burst of practice cannot reach a review in a week. */
export const REVIEW_MIN_CALENDAR_DAYS = 7
/** Three sessions in a row marked Hard, on three different days, bring a review forward: evidence, never proof. */
export const HARD_RUN = 3
/** An ask no run answered within this many days is let go; the manual path was there all along. */
export const ASK_KEEPS_DAYS = 3

export type AskKind = 'setup' | 'review'
export type Verdict = 'keep' | 'adjust' | 'progress' | 'simplify'
export const VERDICTS: readonly Verdict[] = ['keep', 'adjust', 'progress', 'simplify']

/** What you did with an answer. Setup: taken as it was, taken after editing, another asked for, your own written instead. Review: its verdict taken, or yours. */
export type Decision = 'used' | 'edited' | 'another' | 'own' | 'kept' | 'adjusted' | 'progressed' | 'simplified' | 'earlier' | 'wroteNext'

/**
 * An ask of the skill coach, on the phone and synced: a first suggestion (or another) for one
 * commitment, or a progression review the app found due. A review answered on the phone alone
 * (Claude not asked) is kept the same way, so the count restarts from it.
 */
export interface CoachAsk {
  id?: number
  aimId: number
  kind: AskKind
  /** The commitment's revision when asked: an answer written for an older one is dropped. */
  revision: string
  day: string
  at: string
  /** Whether Claude was asked; false for a review the phone asks alone. */
  claude: boolean
  /** Another suggestion: the proposal it replaces. */
  after?: string
  /** For a physical goal, the answer to the one safety question asked before Claude suggests: an injury or a condition to respect; '' when there was nothing to add. */
  care?: string
  /** A review: the skill reviewed, its practice days when it fell due, whether three Hard sessions in a row were behind it, and which brought it: six more days, or those three. */
  skillId?: number
  days?: number
  hardRun?: boolean
  reason?: 'ordinary' | 'struggle'
  decision?: Decision
  decidedAt?: string
}

/** Claude's suggestion for a commitment's current skill (Part 40). */
export interface SkillSuggestion {
  skill: string
  method: string | null
  how: string
  minutes: number | null
  rhythm: { perWeek: number; restDays: number } | null
  why: string
  physical: boolean
  /** For a physical skill, always: what to watch for, and rest. Not medical advice. */
  safety: string | null
  likelyNext: string | null
}

/** What a review would change, in full: the skill or its practice, never the goal. */
export interface SkillChange {
  skill?: string
  method?: string
  how?: string
  minutes?: number
  rhythm?: { perWeek: number; restDays: number } | null
  safety?: string
}

/** Claude's progression review (Part 41): a verdict, its evidence as facts, and the change in full. */
export interface ReviewSuggestion {
  verdict: Verdict
  evidence: string[]
  why: string
  change: SkillChange | null
}

/** A proposal as the Worker stores it and the phone reads it: one per ask. */
export interface CoachProposal {
  id: string
  askId: number
  aimId: number
  kind: AskKind
  revision: string
  day: string
  at: string
  model: string
  askedModel: string
  suggestion?: SkillSuggestion
  review?: ReviewSuggestion
}

export const proposalIdOf = (askId: number): string => `ask:${askId}`

// ─── The revision a proposal is written for ─────────────────────────────────────────────────────

type AimLike = { id?: number; name?: string; about?: string; method?: string; rhythm?: { perWeek: number; restDays: number } | null; schedule?: readonly number[]; pausedAt?: string | null; finishedAt?: string | null; currentSkillId?: number | null }
type SkillLike = { id?: number; name: string; method?: string; how?: string; minutes?: number } | null

/** FNV-1a over the words: short, stable, the same on the phone and in the Worker. */
function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** A commitment's revision: changes whenever its goal, its current skill or that skill's practice, its rhythm, its fixed days, or its pause does. */
export function revisionOf(aim: AimLike, skill: SkillLike): string {
  const r = aim.rhythm ? `${aim.rhythm.perWeek}/${aim.rhythm.restDays}` : ''
  const parts = [aim.name ?? '', aim.about ?? '', aim.method ?? '', r, (aim.schedule ?? []).join(','), aim.pausedAt ? 'p' : '', aim.finishedAt ? 'f' : '', String(aim.currentSkillId ?? ''), skill ? [skill.id ?? '', skill.name, skill.method ?? '', skill.how ?? '', skill.minutes ?? ''].join('|') : '']
  return fnv(parts.join('␟'))
}

// ─── What makes a goal physical ─────────────────────────────────────────────────────────────────

/** Words that make a goal a physical one: its suggestion always carries a safety line, and its rest days are kept. */
export const PHYSICAL_WORDS = /\b(handstands?|headstands?|inversions?|cartwheels?|backflips?|muscle-?ups?|push-?ups?|pull-?ups?|chin-?ups?|dips|planks?|squats?|deadlifts?|bench press|barbells?|dumbbells?|kettlebells?|weightlifting|powerlifting|calisthenics|gymnastics|yoga|pilates|stretch(?:es|ing)?|flexibility|mobility|splits|sprint(?:s|ing)?|jogging|marathons?|5k|10k|swim(?:s|ming)?|climbing|bouldering|cycling|martial arts?|karate|judo|jiu-?jitsu|boxing|kickboxing|muay thai|wrestling|dance|dancing|ballet|salsa|skating|skiing|snowboarding|surfing|tennis|basketball|football|soccer|volleyball|golf|parkour|juggling|hiking)\b/i

/** Whether a goal is physical, from its own words or Claude's reading of it. */
export function isPhysical(texts: readonly (string | null | undefined)[], claudeSays = false): boolean {
  return claudeSays || texts.some((t) => typeof t === 'string' && PHYSICAL_WORDS.test(t))
}

// ─── The checks every answer passes ─────────────────────────────────────────────────────────────

/** Faith words (Rule 10): while faith is hidden, none may be said. The retrieval layer reads the same list. */
export const FAITH_WORDS = /\b(faith|church|god|pray(?:s|ed|ing|er|ers)?|bible|scripture|worship|sermon|jesus|christ|lord|spiritual|devotions?|devotional|congregation|ministry|pastor)\b/i
/** No percentages, levels, points or readiness: counts in words (Workstream 6). */
export const SCORE_WORDS = /\d+\s?%|\bper ?cent\b|\bpercentage\b|\breadiness\b|\bready score\b|\bmastery\b|\bmastered\b|\bxp\b|\bexperience points\b|\blevel\s?\d|\blevel(?:led|ed|ing)? up\b|\bscore(?:s|d)?\b|\b\d+\s?\/\s?10\b|\bout of 10\b|\bgrade [a-f]\b/i
/** Silence and refusal are not failure (Rule 2): no line says a day was missed or a person fell short. */
export const SHORTFALL_WORDS = /\b(missed|skipped|slack(?:ed|ing)?|fell off|gave up|giving up|not trying|no effort|lack of (?:effort|consistency|discipline|commitment)|inconsistent|unreliable)\b/i
/** What only the paths may teach (Rules 9 and 23): an in-person social act, dating, or a particular person. */
export const PEOPLE_WORDS = /\b(dating|on a date|a date with|first date|flirt\w*|romance|romantic|girlfriend|boyfriend|your partner|ask (?:her|him|them|someone) out|pick-?up lines?|approach (?:a stranger|strangers|someone)|talk to (?:a )?strangers?|strike up (?:a )?conversations?|make (?:new )?friends|small talk|charisma|social skills?|networking event)\b/i
/** A goal is never shrunk or dropped: Simplify changes the skill or its practice. */
export const GOAL_DROP = /\b(drop|abandon|quit|give up on|stop (?:learning|practi[sc]ing)|replace (?:the |your )?goal|a different goal|a smaller goal|lower (?:the |your )?goal)\b/i
/** The person, explained: a reason given for them as a fact, or a verdict on them. */
const PERSON_EXPLAIN = /\bbecause you(?:'re| are)?\b|\byou(?:'re| are) (?:not|too|just) (?:ready|good|able|talented|disciplined|consistent|committed|motivated|a natural)\b|\byou (?:lack|don['’]t have) (?:the )?(?:talent|discipline|patience|focus)\b/i

export interface CoachContext {
  /** The commitment's own words: its goal, what you said would change the advice, its skills. */
  goal: string
  physical: boolean
  faithHidden: boolean
  /** Private items' names, while they may not be shown. */
  names: readonly string[]
  /** Every number the briefing gave for this commitment: any other number is refused. */
  numbers: ReadonlySet<string>
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Why one piece of text from Claude may not be shown, or null. */
export function coachTextRefusal(text: string, c: CoachContext): string | null {
  for (const w of BANNED_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) return `uses the word "${w}"`
  if (SCORE_WORDS.test(text)) return 'gives a percentage, level, score or readiness; say counts in words'
  if (SHORTFALL_WORDS.test(text)) return 'reads silence or a refusal as a shortfall; say what the record holds'
  if (USAGE_VERDICT.test(text) || PERSON_EXPLAIN.test(text)) return 'passes a verdict on the person or explains them; speak of the practice'
  if (PEOPLE_WORDS.test(text)) return 'belongs to the Social or Partner path, never a commitment'
  if (c.faithHidden && FAITH_WORDS.test(text)) return 'speaks of faith while faith is hidden'
  for (const name of c.names) if (name && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, 'iu').test(text)) return 'names a private item while its name may not be shown'
  for (const n of text.match(/\d+(?:[.,:]\d+)*/g) ?? []) if (!c.numbers.has(n.replace(/,/g, ''))) return `the number ${n} is not in the briefing`
  return null
}

type Check<T> = { ok: true; value: T } | { ok: false; reason: string }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
function text(v: unknown, max: number, label: string, required: boolean): Check<string | null> {
  if (v === null || v === undefined || v === '') return required ? { ok: false, reason: `no ${label}` } : { ok: true, value: null }
  if (typeof v !== 'string') return { ok: false, reason: `${label} is not text` }
  const t = v.trim()
  if (!t) return required ? { ok: false, reason: `no ${label}` } : { ok: true, value: null }
  if (t.length > max) return { ok: false, reason: `${label} is ${t.length} characters; at most ${max}` }
  return { ok: true, value: t }
}
function rhythmOf(v: unknown): Check<{ perWeek: number; restDays: number } | null> {
  if (v === null || v === undefined) return { ok: true, value: null }
  const r = obj(v)
  const perWeek = r.perWeek
  const restDays = r.restDays ?? 0
  if (!Number.isInteger(perWeek) || (perWeek as number) < 1 || (perWeek as number) > 7) return { ok: false, reason: 'a rhythm is one to seven sessions a week' }
  if (!Number.isInteger(restDays) || (restDays as number) < 0 || (restDays as number) > 2) return { ok: false, reason: 'rest days between sessions are none, one or two' }
  if ((perWeek as number) * ((restDays as number) + 1) > 7) return { ok: false, reason: 'that many sessions a week cannot keep that many rest days between them' }
  return { ok: true, value: { perWeek: perWeek as number, restDays: restDays as number } }
}
function minutesOf(v: unknown): Check<number | null> {
  if (v === null || v === undefined) return { ok: true, value: null }
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 240) return { ok: false, reason: 'a session is one to 240 minutes' }
  return { ok: true, value: v as number }
}

/** The numbers an answer's own fields carry (minutes, sessions a week, rest days): they are its own, not claims about the record. */
function ownNumbers(c: CoachContext, extra: readonly (number | null | undefined)[]): CoachContext {
  const numbers = new Set(c.numbers)
  for (const n of extra) if (typeof n === 'number') numbers.add(String(n))
  return { ...c, numbers }
}

/**
 * A suggestion for a commitment's current skill (Part 40), checked: its shape and lengths; no
 * percentage, level or score; no verdict on or explanation of the person; nothing only the paths may
 * teach; no faith while hidden, no private name while hidden; every number from the briefing or its
 * own fields; and a physical goal always with its safety line.
 */
export function checkSuggestion(raw: unknown, c: CoachContext): Check<SkillSuggestion> {
  const o = obj(raw)
  const skill = text(o.skill, 80, 'skill', true)
  const method = text(o.method, 60, 'method', false)
  const how = text(o.how, 240, 'how', true)
  const why = text(o.why, 200, 'why', true)
  const safety = text(o.safety, 240, 'safety line', false)
  const likelyNext = text(o.likelyNext, 80, 'likely next', false)
  const minutes = minutesOf(o.minutes)
  const rhythm = rhythmOf(o.rhythm)
  for (const f of [skill, method, how, why, safety, likelyNext, minutes, rhythm]) if (!f.ok) return f
  if (!skill.ok || !method.ok || !how.ok || !why.ok || !safety.ok || !likelyNext.ok || !minutes.ok || !rhythm.ok) return { ok: false, reason: 'shape' }
  const physical = isPhysical([c.goal, skill.value, how.value], o.physical === true) || c.physical
  if (physical && !safety.value) return { ok: false, reason: 'a physical skill needs its safety line' }
  const own = ownNumbers(c, [minutes.value, rhythm.value?.perWeek, rhythm.value?.restDays])
  for (const t of [skill.value, method.value, how.value, why.value, safety.value, likelyNext.value]) {
    if (!t) continue
    const r = coachTextRefusal(t, own)
    if (r) return { ok: false, reason: r }
  }
  return { ok: true, value: { skill: skill.value as string, method: method.value, how: how.value as string, minutes: minutes.value, rhythm: rhythm.value, why: why.value as string, physical, safety: safety.value, likelyNext: likelyNext.value } }
}

/**
 * A progression review (Part 41), checked: one of the four verdicts; one to three pieces of evidence
 * as facts; the change in full for Adjust, Progress and Simplify, and none for Keep; Adjust keeps the
 * skill and changes its practice, Progress names another skill, Simplify changes the skill or its
 * practice and never the goal; no Progress when three Hard sessions brought the review forward; and
 * every text held to the same checks as a suggestion.
 */
export function checkReview(raw: unknown, c: CoachContext & { currentSkill: string; hardRun: boolean }): Check<ReviewSuggestion> {
  const o = obj(raw)
  const verdict = o.verdict
  if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) return { ok: false, reason: 'the verdict is keep, adjust, progress or simplify' }
  if (verdict === 'progress' && c.hardRun) return { ok: false, reason: 'three Hard sessions in a row bring a review forward for Keep, Adjust or Simplify, never Progress' }
  const evidence = Array.isArray(o.evidence) ? o.evidence : []
  if (evidence.length < 1 || evidence.length > 3) return { ok: false, reason: 'one to three pieces of evidence' }
  const ev: string[] = []
  for (const e of evidence) {
    const t = text(e, 160, 'evidence', true)
    if (!t.ok) return t
    ev.push(t.value as string)
  }
  const why = text(o.why, 200, 'why', true)
  if (!why.ok) return why
  let change: SkillChange | null = null
  if (verdict === 'keep') {
    if (o.change !== null && o.change !== undefined && Object.keys(obj(o.change)).length) return { ok: false, reason: 'Keep changes nothing' }
  } else {
    const ch = obj(o.change)
    const skill = text(ch.skill, 80, 'skill', false)
    const method = text(ch.method, 60, 'method', false)
    const how = text(ch.how, 240, 'how', false)
    const safety = text(ch.safety, 240, 'safety line', false)
    const minutes = minutesOf(ch.minutes)
    const rhythm = 'rhythm' in ch ? rhythmOf(ch.rhythm) : ({ ok: true, value: undefined } as const)
    for (const f of [skill, method, how, safety, minutes, rhythm]) if (!f.ok) return f
    if (!skill.ok || !method.ok || !how.ok || !safety.ok || !minutes.ok || !rhythm.ok) return { ok: false, reason: 'shape' }
    if ('goal' in ch) return { ok: false, reason: 'a review changes the skill or its practice, never the goal' }
    const same = skill.value !== null && skill.value.toLowerCase() === c.currentSkill.trim().toLowerCase()
    const practice = method.value !== null || how.value !== null || minutes.value !== null || rhythm.value !== undefined
    if (verdict === 'adjust' && ((skill.value !== null && !same) || !practice)) return { ok: false, reason: 'Adjust keeps the skill and changes how it is practised' }
    if (verdict === 'progress' && (skill.value === null || same)) return { ok: false, reason: 'Progress names the next skill' }
    if (verdict === 'simplify' && skill.value === null && !practice) return { ok: false, reason: 'Simplify names a simpler skill or a simpler practice' }
    const physical = isPhysical([c.goal, skill.value, how.value]) || c.physical
    if (physical && skill.value !== null && !same && !safety.value) return { ok: false, reason: 'a new physical skill needs its safety line' }
    change = { ...(skill.value && !same ? { skill: skill.value } : {}), ...(method.value ? { method: method.value } : {}), ...(how.value ? { how: how.value } : {}), ...(minutes.value !== null ? { minutes: minutes.value } : {}), ...(rhythm.value !== undefined ? { rhythm: rhythm.value } : {}), ...(safety.value ? { safety: safety.value } : {}) }
  }
  const own = ownNumbers(c, [change?.minutes, change?.rhythm?.perWeek, change?.rhythm?.restDays])
  for (const t of [...ev, why.value as string, change?.skill, change?.method, change?.how, change?.safety]) {
    if (!t) continue
    const r = coachTextRefusal(t, own)
    if (r) return { ok: false, reason: r }
    if (GOAL_DROP.test(t)) return { ok: false, reason: 'a review changes the skill or its practice, never the goal' }
  }
  return { ok: true, value: { verdict: verdict as Verdict, evidence: ev, why: why.value as string, change } }
}

// ─── A skill's sessions, counted the one way ────────────────────────────────────────────────────

/** An offer and an outcome as both the phone's tables and the synced rows hold them. */
export interface OfferLike {
  id?: number
  day: string
  moveId: string
  skippedAt?: string | null
}
export interface OutcomeLike {
  offerId: number
  outcome: string | null
  at: string
  ease?: 'hard' | 'right' | 'easy'
  note?: string
  why?: string | null
}

export interface SkillSession {
  day: string
  at: string
  outcome: 'done' | 'partly' | 'no'
  ease?: 'hard' | 'right' | 'easy'
  note?: string
  why?: string
}

const RUNG = /^rung:(\d+):[1-6]$/

/**
 * One skill's sessions since it became current, oldest first, by the day each began: done, partly,
 * and refused (No or Not now, with the reason when given). A review counts only done and partly;
 * a refusal keeps its unblock offer and never triggers anything. The phone and the Worker both
 * count through here.
 */
export function skillSessions(skillId: number, since: string | null, offers: readonly OfferLike[], outcomes: readonly OutcomeLike[]): SkillSession[] {
  const mine = new Map<number, string>()
  for (const o of offers) {
    if (typeof o.id !== 'number' || o.skippedAt) continue
    const rung = RUNG.exec(o.moveId)
    if (o.moveId !== `skill:${skillId}` && !(rung && Number(rung[1]) === skillId)) continue
    if (since !== null && o.day < since) continue
    mine.set(o.id, o.day)
  }
  const out: SkillSession[] = []
  for (const x of outcomes) {
    const day = mine.get(x.offerId)
    if (day === undefined || (x.outcome !== 'done' && x.outcome !== 'partly' && x.outcome !== 'no')) continue
    out.push({ day, at: x.at, outcome: x.outcome, ...(x.ease ? { ease: x.ease } : {}), ...(x.note ? { note: x.note } : {}), ...(x.why ? { why: x.why } : {}) })
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1))
}

/** The practice a review reads: the sessions done or partly done, and the different days they fell on. */
export function practised(sessions: readonly SkillSession[]): { sessions: SkillSession[]; days: string[] } {
  const done = sessions.filter((s) => s.outcome === 'done' || s.outcome === 'partly')
  return { sessions: done, days: [...new Set(done.map((s) => s.day))].sort() }
}

// ─── When a review is due ───────────────────────────────────────────────────────────────────────

export interface ReviewInput {
  /** The different days the current skill was practised (done or partly), since it became current. */
  days: readonly string[]
  /** Its sessions since it became current, oldest first, each with the day it began and how it went when you said. */
  sessions: readonly { day: string; at: string; ease?: 'hard' | 'right' | 'easy' }[]
  /** The day it became current, when known. */
  since: string | null
  today: string
  /** The practice days counted at the last review you answered on this skill, and when you answered it. */
  last: { days: number; at: string } | null
  paused: boolean
}

export interface ReviewState {
  due: boolean
  /** Ordinary: six more practice days and a week behind the skill. Struggle: three Hard sessions in a row, on three different days. */
  kind: 'ordinary' | 'struggle' | null
  days: number
  hardRun: boolean
}

const dayNumber = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000

/**
 * Whether a learning commitment's current skill is due for a progression review, and why. Six
 * different practice days are the earliest ordinary point, with at least seven calendar days behind
 * the skill; again after every six more since the last review you answered. Several sessions on one
 * day count once. Three sessions in a row marked Hard, on three different days, bring it forward.
 * Refusals never count, and neither does silence: only sessions done or partly done, and ease you
 * gave. Never while paused.
 */
export function reviewDue(i: ReviewInput): ReviewState {
  const days = [...new Set(i.days)].sort()
  const n = days.length
  if (i.paused) return { due: false, kind: null, days: n, hardRun: false }
  const base = i.last?.days ?? 0
  const behind = i.since !== null && dayNumber(i.today) - dayNumber(i.since) >= REVIEW_MIN_CALENDAR_DAYS
  const ordinary = n >= base + REVIEW_DAYS && (i.last !== null || behind)
  const after = i.last?.at ?? ''
  const recent = [...i.sessions].filter((s) => s.at > after).sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-HARD_RUN)
  const hardRun = recent.length === HARD_RUN && recent.every((s) => s.ease === 'hard') && new Set(recent.map((s) => s.day)).size === HARD_RUN
  if (ordinary) return { due: true, kind: 'ordinary', days: n, hardRun }
  if (hardRun) return { due: true, kind: 'struggle', days: n, hardRun }
  return { due: false, kind: null, days: n, hardRun: false }
}

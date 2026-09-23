import { MAX_WORDS, nearRepeat, validateOutput, validateReview, type BrainOutput } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import { generateCandidates, generateValid, newUsage, neuronsOf, textOf, type Check, type Runner } from './ai'
import { lineBriefing, type LineBriefing, type Said } from './briefing'
import type { Env } from './env'
import { loadLibrary, retrieve } from './library'
import { buildChoiceMessages, buildMessages, buildReviewMessages, parseOutput } from './prompt'
import { addDays, localTime, minutesOf, type LocalTime } from './time'
import type { BriefRow, Store } from './turso'

// The day's line, and on Sunday the week reviewed (Part 28). The line is written once the
// morning check-in is on a sheet built after it, so it speaks from today; with no morning
// check-in by the fallback time it is written from the newest sheet, relabelled for the day as
// Part 19 requires. Two calls: three candidates, then one chosen from those that passed the
// validator, the day guard and the repeat check. Every row carries its days, its trigger, every
// refusal on the way and what it cost.

const MAX_FACTS_AGE_MS = 48 * 3_600_000
const FALLBACK_DEFAULT = '11:00'
/** The days the repeat check looks back over. */
const REPEAT_DAYS = 7

export type Trigger = NonNullable<BriefRow['trigger']>

export interface BriefResult {
  wrote: boolean
  reason: string
  day?: string
  /** The day the line was written for, and the day its facts described. */
  forDay?: string
  factsDay?: string
  trigger?: Trigger
  model?: string
  attempts?: string[]
  candidates?: number
  neurons?: number
  text?: string
  mode?: string
  cardIds?: string[]
  action?: unknown
}

export interface BriefOptions {
  force?: boolean
  fetcher?: typeof fetch
}

type JobEnv = Pick<Env, 'TIMEZONE' | 'BRIEF_HOUR' | 'MODELS' | 'LIBRARY_URL' | 'FALLBACK_TIME'>

/** The newest sheet among yesterday's and today's, or why there is none to speak from. */
async function latestFacts(store: Store, day: string, now: Date): Promise<{ sheet: FactSheet } | string> {
  const found = (await Promise.all([addDays(day, -1), day].map((d) => store.readFacts(d)))).filter((f): f is NonNullable<typeof f> => f !== null)
  const facts = found.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
  if (!facts) return 'no facts for yesterday or today'
  if (now.getTime() - Date.parse(facts.updatedAt) > MAX_FACTS_AGE_MS) return `facts too old (${facts.updatedAt})`
  return { sheet: facts.sheet }
}

/**
 * Whether the day's line is due now, and from which sheet: today's, once it carries the morning
 * check-in and was built after it; otherwise, from the fallback time, the newest sheet.
 */
async function dueFacts(store: Store, day: string, local: LocalTime, now: Date, fallback: string): Promise<{ sheet: FactSheet; trigger: Trigger } | string> {
  const today = await store.readFacts(day)
  const morning = today?.sheet.checkedIn?.morning
  if (today && morning && today.sheet.day === day && Date.parse(today.sheet.builtAt) >= Date.parse(morning)) return { sheet: today.sheet, trigger: 'checkin' }
  if (local.hour * 60 + local.minute < minutesOf(fallback)) return 'waiting for the morning check-in'
  const f = await latestFacts(store, day, now)
  return typeof f === 'string' ? f : { sheet: f.sheet, trigger: 'fallback' }
}

/** What was said lately, by the Worker and by the phone, with how each landed. */
async function saidLately(store: Store, sheet: FactSheet): Promise<Said[]> {
  const feedback = new Map((await store.readFeedback()).map((f) => [f.briefKey, f.answer]))
  return [...(await store.readSaid(7)).map((s) => ({ day: s.day, text: s.text, feedback: feedback.get(`worker:${s.id}`) ?? null })), ...sheet.said.filter((s) => s.source === 'phone').map((s) => ({ day: s.day, text: s.text, feedback: s.feedback }))]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 10)
}

const modelsOf = (env: JobEnv) => env.MODELS.split(',').map((m) => m.trim()).filter(Boolean)
const round1 = (n: number) => Math.round(n * 10) / 10

/** A candidate as the validator reads it, then the repeat check against the lines of the last seven days before this one. */
function lineCheck(b: LineBriefing): Check<BrainOutput> {
  const earlier = b.said.filter((s) => s.day < b.forDay && s.day >= addDays(b.forDay, -REPEAT_DAYS))
  return (raw) => {
    const v = validateOutput(raw, b.sheet, b.cards, MAX_WORDS, b.forDay)
    if (!v.ok) return v
    const day = nearRepeat(v.value.text, earlier)
    return day ? { ok: false, reason: `nearly repeats the line said on ${day}; say something else, or the same from a new angle` } : v
  }
}

export async function runBrief(env: JobEnv, store: Store, run: Runner, now: Date, opts: BriefOptions = {}): Promise<BriefResult> {
  const started = Date.now()
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  const id = `${day}:brief`
  let due: { sheet: FactSheet; trigger: Trigger } | string
  if (opts.force) {
    const f = await latestFacts(store, day, now)
    due = typeof f === 'string' ? f : { sheet: f.sheet, trigger: 'forced' }
  } else {
    if (await store.hasBrief(id)) return { wrote: false, reason: 'written already', day }
    due = await dueFacts(store, day, local, now, env.FALLBACK_TIME ?? FALLBACK_DEFAULT)
  }
  if (typeof due === 'string') return { wrote: false, reason: due, day }

  const cards = retrieve(await loadLibrary(env.LIBRARY_URL, opts.fetcher), due.sheet)
  // The one path to a prompt: the briefing, for today, relabelled when the sheet is yesterday's; refused when it cannot say what today holds.
  const built = lineBriefing({ task: 'line', writer: 'free', sheet: due.sheet, forDay: day, cards, said: await saidLately(store, due.sheet) })
  if (!built.ok) return { wrote: false, reason: built.reason, day }
  const b = built.briefing

  const attempts: string[] = []
  const usage = newUsage()
  const generated = await generateCandidates(modelsOf(env), run, buildMessages(b), lineCheck(b), 4000, attempts, usage)
  if (!generated) return { wrote: false, reason: 'no model produced a line that passed', day, attempts, neurons: round1(usage.neurons) }

  // Two or more passed: the same model chooses one for the day; an answer that names none keeps the first.
  let out = generated.valid[0]
  if (generated.valid.length > 1) {
    try {
      const raw = await run(generated.model, buildChoiceMessages(b, generated.valid), 1500)
      usage.calls++
      usage.neurons += neuronsOf(raw)
      const parsed = parseOutput(textOf(raw)) as { choice?: unknown } | null
      const n = Number(parsed?.choice)
      if (Number.isInteger(n) && n >= 1 && n <= generated.valid.length) out = generated.valid[n - 1]
      else attempts.push(`${generated.model}: the choice named no candidate, so the first stands`)
    } catch (e) {
      attempts.push(`${generated.model}: the choice failed (${e instanceof Error ? e.message : String(e)}), so the first stands`)
    }
  }

  const at = now.toISOString()
  const row: BriefRow = {
    id,
    day,
    kind: 'brief',
    text: out.text,
    mode: out.mode,
    factIds: out.factIds,
    cardIds: out.cardIds,
    action: out.action,
    model: generated.model,
    at,
    factsDay: b.factsDay,
    forDay: day,
    trigger: due.trigger,
    shape: b.shape,
    refusals: attempts,
    candidates: generated.valid.length,
    neurons: round1(usage.neurons),
    calls: usage.calls,
    latencyMs: Date.now() - started,
  }
  await store.writeBrief(row, at)
  return { wrote: true, reason: 'brief', day, forDay: day, factsDay: b.factsDay, trigger: due.trigger, model: generated.model, attempts, candidates: generated.valid.length, neurons: row.neurons, text: row.text, mode: row.mode, cardIds: row.cardIds, action: row.action }
}

/** Sunday, at the brief hour: the week in three parts, each held to the rules of a line, written once beside the day's line. */
export async function runReview(env: JobEnv, store: Store, run: Runner, now: Date, opts: BriefOptions = {}): Promise<BriefResult> {
  const started = Date.now()
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  if (!opts.force && (local.weekday !== 0 || local.hour !== Number(env.BRIEF_HOUR))) return { wrote: false, reason: 'not Sunday at the hour', day }
  const id = `${day}:review`
  if (!opts.force && (await store.hasBrief(id))) return { wrote: false, reason: 'written already', day }
  const facts = await latestFacts(store, day, now)
  if (typeof facts === 'string') return { wrote: false, reason: facts, day }

  const cards = retrieve(await loadLibrary(env.LIBRARY_URL, opts.fetcher), facts.sheet, 16)
  const built = lineBriefing({ task: 'review', writer: 'free', sheet: facts.sheet, forDay: day, cards, said: await saidLately(store, facts.sheet) })
  if (!built.ok) return { wrote: false, reason: built.reason, day }
  const b = built.briefing
  const attempts: string[] = []
  const usage = newUsage()
  const generated = await generateValid(modelsOf(env), run, buildReviewMessages(b), (raw) => validateReview(raw, b.sheet, b.cards, day), 4000, attempts, usage)
  if (!generated) return { wrote: false, reason: 'no model produced a review that passed', day, attempts, neurons: round1(usage.neurons) }

  const at = now.toISOString()
  const { held, didNot, change, factIds, cardIds } = generated.output
  const row: BriefRow = { id, day, kind: 'review', text: `${held} ${didNot} ${change}`, mode: 'strategy', factIds, cardIds, action: null, parts: { held, didNot, change }, model: generated.model, at, factsDay: b.factsDay, forDay: day, trigger: opts.force ? 'forced' : 'sunday', shape: b.shape, refusals: attempts, neurons: round1(usage.neurons), calls: usage.calls, latencyMs: Date.now() - started }
  await store.writeBrief(row, at)
  return { wrote: true, reason: 'review', day, forDay: day, factsDay: b.factsDay, trigger: row.trigger, model: generated.model, attempts, neurons: row.neurons, text: row.text, mode: row.mode, cardIds }
}

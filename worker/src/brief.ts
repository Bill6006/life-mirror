import { validateReview } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import { generateCandidates, generateValid, newUsage, neuronsOf, textOf, type Runner } from './ai'
import { forFreeChain, lineBriefing } from './briefing'
import { firmFor, lineCheck, saidLately } from './checks'
import { claudeOn, fallbackReason, rowIdOf, startTask, taskIdOf, timeoutMinutes, type ClaudeTask } from './claude'
import type { Env } from './env'
import { loadLibrary, retrieve } from './library'
import { buildChoiceMessages, buildMessages, buildReviewMessages, parseOutput } from './prompt'
import { addDays, localTime, minutesOf, type LocalTime } from './time'
import type { BriefRow, Store, TaskRow } from './turso'

// The day's line, and on Sunday the week reviewed (Parts 28, 30 and 31). The line is written once
// the morning check-in is on a sheet built after it, so it speaks from today; with no morning
// check-in by the fallback time it is written from the newest sheet, relabelled for the day as
// Part 19 requires. With Claude switched on, the Worker marks the day's task and fires the
// owner's routine, then waits: a line comes back through /claude/line, or after a failed fire,
// two refusals or twenty minutes, the free model chain writes. The free chain makes two calls:
// three candidates, then one chosen from those that passed the validator, the day guard and the
// repeat check. Every row carries its days, its trigger, who wrote it, every refusal and its cost.

const MAX_FACTS_AGE_MS = 48 * 3_600_000
const FALLBACK_DEFAULT = '11:00'

export type Trigger = NonNullable<BriefRow['trigger']>

export interface BriefResult {
  wrote: boolean
  reason: string
  day?: string
  /** The day the line was written for, and the day its facts described. */
  forDay?: string
  factsDay?: string
  trigger?: Trigger
  writer?: 'claude' | 'free'
  model?: string
  attempts?: string[]
  candidates?: number
  neurons?: number
  text?: string
  mode?: string
  cardIds?: string[]
  action?: unknown
  /** Why the free chain stood in for Claude, when it did. */
  fallback?: string
}

export interface BriefOptions {
  force?: boolean
  /** By hand: which writer, whatever the switch says. */
  writer?: 'claude' | 'free'
  /** For the library and the catalogue. */
  fetcher?: typeof fetch
  /** For the routine's fire. */
  fireFetcher?: typeof fetch
  /** For the tests: How firm's gate (Pass 2); the deployed Worker reads the shared constant. */
  howFirm?: 'gated' | 'open'
}

type JobEnv = Pick<Env, 'TIMEZONE' | 'BRIEF_HOUR' | 'MODELS' | 'LIBRARY_URL' | 'FALLBACK_TIME' | 'CLAUDE_WRITER' | 'CLAUDE_FIRE_URL' | 'CLAUDE_FIRE_TOKEN' | 'CLAUDE_TIMEOUT_MINUTES' | 'CATALOGUE_URL'>

type Due = { sheet: FactSheet; trigger: Trigger }

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
async function dueFacts(store: Store, day: string, local: LocalTime, now: Date, fallback: string): Promise<Due | string> {
  const today = await store.readFacts(day)
  const morning = today?.sheet.checkedIn?.morning
  if (today && morning && today.sheet.day === day && Date.parse(today.sheet.builtAt) >= Date.parse(morning)) return { sheet: today.sheet, trigger: 'checkin' }
  if (local.hour * 60 + local.minute < minutesOf(fallback)) return 'waiting for the morning check-in'
  const f = await latestFacts(store, day, now)
  return typeof f === 'string' ? f : { sheet: f.sheet, trigger: 'fallback' }
}

const modelsOf = (env: JobEnv) => env.MODELS.split(',').map((m) => m.trim()).filter(Boolean)
const round1 = (n: number) => Math.round(n * 10) / 10

/** Records on the day's task that the free chain wrote in its place, and why. */
async function markFallback(store: Store, t: TaskRow | null, reason: string, now: Date, wrote: boolean): Promise<void> {
  if (!t) return
  await store.writeTask({ ...t, status: 'fallback', fallbackReason: reason, ...(wrote ? { writer: 'free' as const, writtenAt: now.toISOString() } : {}) })
}

/** The free model chain's line: three candidates, one chosen; stored with who wrote it, and why it stood in for Claude when it did. */
async function writeFreeLine(env: JobEnv, store: Store, run: Runner, now: Date, day: string, due: Due, opts: BriefOptions, started: number, fallback?: string): Promise<BriefResult> {
  // The free chain reads the fact sheet alone: never how Life Mirror is used (Follow-up F1), never where the day was spent (Part 43).
  const sheet = forFreeChain(due.sheet)
  const cards = retrieve(await loadLibrary(env.LIBRARY_URL, opts.fetcher), sheet)
  // The one path to a prompt: the briefing, for today, relabelled when the sheet is yesterday's; refused when it cannot say what today holds.
  const firm = await firmFor(store, opts.howFirm)
  const built = lineBriefing({ task: 'line', writer: 'free', sheet, forDay: day, cards, said: await saidLately(store, sheet), firm })
  if (!built.ok) return { wrote: false, reason: built.reason, day, ...(fallback ? { fallback } : {}) }
  const b = built.briefing

  const attempts: string[] = []
  const usage = newUsage()
  const generated = await generateCandidates(modelsOf(env), run, buildMessages(b), lineCheck(b), 4000, attempts, usage)
  if (!generated) return { wrote: false, reason: 'no model produced a line that passed', day, attempts, neurons: round1(usage.neurons), ...(fallback ? { fallback } : {}) }

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
    id: `${day}:brief`,
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
    writer: 'free',
    ...(fallback ? { fallback } : {}),
    ...(out.firmness ? { firmness: out.firmness, ...(firm === 'adaptive' ? { adaptive: true as const } : {}) } : {}),
  }
  // Standing in for Claude: a line Claude posted while the chain was writing stands, and this one is dropped.
  if (fallback && !opts.force && (await store.hasBrief(row.id))) return { wrote: false, reason: 'written already', day }
  await store.writeBrief(row, at)
  return { wrote: true, reason: 'brief', day, forDay: day, factsDay: b.factsDay, trigger: due.trigger, writer: 'free', model: generated.model, attempts, candidates: generated.valid.length, neurons: row.neurons, text: row.text, mode: row.mode, cardIds: row.cardIds, action: row.action, ...(fallback ? { fallback } : {}) }
}

/** Whether Claude writes this run: by hand, the writer asked for; otherwise the switch. */
const claudeWrites = (env: JobEnv, opts: BriefOptions) => (opts.writer ? opts.writer === 'claude' : claudeOn(env))

/**
 * A Claude task under way for the day: nothing to do while it may still write; otherwise the free
 * chain writes, from the task's own sheet, and the task records why.
 */
async function followTask(env: JobEnv, store: Store, now: Date, t: TaskRow, write: (due: Due, fallback: string) => Promise<BriefResult>): Promise<BriefResult> {
  const why = fallbackReason(t, now, timeoutMinutes(env))
  if (!why) return { wrote: false, reason: 'waiting for Claude', day: t.day }
  const facts = await store.readFacts(t.factsDay)
  if (!facts) {
    await markFallback(store, t, `${why}; the sheet for ${t.factsDay} is gone`, now, false)
    return { wrote: false, reason: `the sheet for ${t.factsDay} is gone`, day: t.day, fallback: why }
  }
  const r = await write({ sheet: facts.sheet, trigger: t.trigger }, why)
  // Claude's line landed while the chain wrote: the task is Claude's, not a fallback.
  if (!r.wrote && r.reason === 'written already') return r
  await markFallback(store, t, why, now, r.wrote)
  return r
}

/** Starts Claude's task for the day; a fire that fails sends the day to the free chain at once. */
async function startClaude(env: JobEnv, store: Store, now: Date, task: ClaudeTask, day: string, due: Due, opts: BriefOptions, write: (due: Due, fallback: string) => Promise<BriefResult>): Promise<BriefResult> {
  const t = await startTask(env, store, now, task, day, due.trigger, due.sheet.day, Boolean(opts.force), opts.fireFetcher)
  if (t.status === 'fired') return { wrote: false, reason: 'Claude is writing', day, forDay: day, factsDay: due.sheet.day, trigger: due.trigger, writer: 'claude' }
  const r = await write(due, t.fallbackReason ?? 'the fire failed')
  await markFallback(store, t, t.fallbackReason ?? 'the fire failed', now, r.wrote)
  return r
}

export async function runBrief(env: JobEnv, store: Store, run: Runner, now: Date, opts: BriefOptions = {}): Promise<BriefResult> {
  const started = Date.now()
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  const id = rowIdOf('line', day)
  const claude = claudeWrites(env, opts)
  const free = (due: Due, fallback?: string) => writeFreeLine(env, store, run, now, day, due, opts, started, fallback)

  if (!opts.force) {
    if (await store.hasBrief(id)) return { wrote: false, reason: 'written already', day }
    // A task already under way today decides first: wait for Claude, or let the free chain write.
    const t = claude ? await store.readTask(taskIdOf('line', day)) : null
    if (t) return followTask(env, store, now, t, free)
  }

  let due: Due | string
  if (opts.force) {
    const f = await latestFacts(store, day, now)
    due = typeof f === 'string' ? f : { sheet: f.sheet, trigger: 'forced' }
  } else due = await dueFacts(store, day, local, now, env.FALLBACK_TIME ?? FALLBACK_DEFAULT)
  if (typeof due === 'string') return { wrote: false, reason: due, day }

  if (claude) return startClaude(env, store, now, 'line', day, due, opts, free)
  return free(due)
}

/** The free model chain's review: three parts, each held to the rules of a line. */
async function writeFreeReview(env: JobEnv, store: Store, run: Runner, now: Date, day: string, whole: FactSheet, trigger: Trigger, opts: BriefOptions, started: number, fallback?: string): Promise<BriefResult> {
  // The free chain reads the fact sheet alone: never how Life Mirror is used (Follow-up F1), never where the day was spent (Part 43).
  const sheet = forFreeChain(whole)
  const cards = retrieve(await loadLibrary(env.LIBRARY_URL, opts.fetcher), sheet, 16)
  const firm = await firmFor(store, opts.howFirm)
  const built = lineBriefing({ task: 'review', writer: 'free', sheet, forDay: day, cards, said: await saidLately(store, sheet), firm })
  if (!built.ok) return { wrote: false, reason: built.reason, day, ...(fallback ? { fallback } : {}) }
  const b = built.briefing
  const attempts: string[] = []
  const usage = newUsage()
  const generated = await generateValid(modelsOf(env), run, buildReviewMessages(b), (raw) => validateReview(raw, b.sheet, b.cards, day, b.firm ? { pref: b.firm } : undefined), 4000, attempts, usage)
  if (!generated) return { wrote: false, reason: 'no model produced a review that passed', day, attempts, neurons: round1(usage.neurons), ...(fallback ? { fallback } : {}) }

  const at = now.toISOString()
  const { held, didNot, change, factIds, cardIds, firmness } = generated.output
  const row: BriefRow = { id: `${day}:review`, day, kind: 'review', text: `${held} ${didNot} ${change}`, mode: 'strategy', factIds, cardIds, action: null, parts: { held, didNot, change }, model: generated.model, at, factsDay: b.factsDay, forDay: day, trigger, shape: b.shape, refusals: attempts, neurons: round1(usage.neurons), calls: usage.calls, latencyMs: Date.now() - started, writer: 'free', ...(fallback ? { fallback } : {}), ...(firmness ? { firmness, ...(firm === 'adaptive' ? { adaptive: true as const } : {}) } : {}) }
  if (fallback && !opts.force && (await store.hasBrief(row.id))) return { wrote: false, reason: 'written already', day }
  await store.writeBrief(row, at)
  return { wrote: true, reason: 'review', day, forDay: day, factsDay: b.factsDay, trigger, writer: 'free', model: generated.model, attempts, neurons: row.neurons, text: row.text, mode: row.mode, cardIds, ...(fallback ? { fallback } : {}) }
}

/** Sunday, at the brief hour: the week in three parts, each held to the rules of a line, written once beside the day's line. */
export async function runReview(env: JobEnv, store: Store, run: Runner, now: Date, opts: BriefOptions = {}): Promise<BriefResult> {
  const started = Date.now()
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  const id = rowIdOf('review', day)
  const claude = claudeWrites(env, opts)
  const free = (due: Due, fallback?: string) => writeFreeReview(env, store, run, now, day, due.sheet, due.trigger, opts, started, fallback)

  if (!opts.force) {
    // A review task under way decides first, whatever the hour, so a late run still falls back.
    const t = claude ? await store.readTask(taskIdOf('review', day)) : null
    if (t) {
      if (await store.hasBrief(id)) return { wrote: false, reason: 'written already', day }
      return followTask(env, store, now, t, free)
    }
    if (local.weekday !== 0 || local.hour !== Number(env.BRIEF_HOUR)) return { wrote: false, reason: 'not Sunday at the hour', day }
    if (await store.hasBrief(id)) return { wrote: false, reason: 'written already', day }
  }
  const facts = await latestFacts(store, day, now)
  if (typeof facts === 'string') return { wrote: false, reason: facts, day }
  const due: Due = { sheet: facts.sheet, trigger: opts.force ? 'forced' : 'sunday' }
  if (claude) return startClaude(env, store, now, 'review', day, due, opts, free)
  return free(due)
}

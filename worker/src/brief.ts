import { validateOutput, validateReview } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import { generateValid, type Runner } from './ai'
import type { Env } from './env'
import { loadLibrary, retrieve } from './library'
import { buildMessages, buildReviewMessages, type Said } from './prompt'
import { addDays, localTime } from './time'
import type { BriefRow, Store } from './turso'

// The morning line, and on Sunday the week reviewed. At the brief hour, the newest fact sheet
// the phone wrote (yesterday's, usually) goes to the model chain with the cards it touches and
// what was said recently; the validated answer is written once as a row of the Worker's own.

const MAX_FACTS_AGE_MS = 48 * 3_600_000

export interface BriefResult {
  wrote: boolean
  reason: string
  day?: string
  model?: string
  attempts?: string[]
  text?: string
  mode?: string
  cardIds?: string[]
  action?: unknown
}

export interface BriefOptions {
  force?: boolean
  fetcher?: typeof fetch
}

type JobEnv = Pick<Env, 'TIMEZONE' | 'BRIEF_HOUR' | 'MODELS' | 'LIBRARY_URL'>

/** The newest sheet among yesterday's and today's, or why there is none to speak from. */
async function latestFacts(store: Store, day: string, now: Date): Promise<{ sheet: FactSheet } | string> {
  const found = (await Promise.all([addDays(day, -1), day].map((d) => store.readFacts(d)))).filter((f): f is NonNullable<typeof f> => f !== null)
  const facts = found.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
  if (!facts) return 'no facts for yesterday or today'
  if (now.getTime() - Date.parse(facts.updatedAt) > MAX_FACTS_AGE_MS) return `facts too old (${facts.updatedAt})`
  return { sheet: facts.sheet }
}

/** What was said lately, by the Worker and by the phone, with how each landed. */
async function saidLately(store: Store, sheet: FactSheet): Promise<Said[]> {
  const feedback = new Map((await store.readFeedback()).map((f) => [f.briefKey, f.answer]))
  return [...(await store.readSaid(7)).map((s) => ({ day: s.day, text: s.text, feedback: feedback.get(`worker:${s.id}`) ?? null })), ...sheet.said.filter((s) => s.source === 'phone').map((s) => ({ day: s.day, text: s.text, feedback: s.feedback }))]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 10)
}

const modelsOf = (env: JobEnv) => env.MODELS.split(',').map((m) => m.trim()).filter(Boolean)

export async function runBrief(env: JobEnv, store: Store, run: Runner, now: Date, opts: BriefOptions = {}): Promise<BriefResult> {
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  if (!opts.force && local.hour !== Number(env.BRIEF_HOUR)) return { wrote: false, reason: `not the hour (${local.hour})`, day }
  const id = `${day}:brief`
  if (!opts.force && (await store.hasBrief(id))) return { wrote: false, reason: 'written already', day }
  const facts = await latestFacts(store, day, now)
  if (typeof facts === 'string') return { wrote: false, reason: facts, day }

  const cards = retrieve(await loadLibrary(env.LIBRARY_URL, opts.fetcher), facts.sheet)
  const attempts: string[] = []
  const generated = await generateValid(modelsOf(env), run, buildMessages(facts.sheet, cards, await saidLately(store, facts.sheet)), (raw) => validateOutput(raw, facts.sheet, cards), 4000, attempts)
  if (!generated) return { wrote: false, reason: 'no model produced a line that passed', day, attempts }

  const at = now.toISOString()
  const out = generated.output
  const row: BriefRow = { id, day, kind: 'brief', text: out.text, mode: out.mode, factIds: out.factIds, cardIds: out.cardIds, action: out.action, model: generated.model, at, factsDay: facts.sheet.day }
  await store.writeBrief(row, at)
  return { wrote: true, reason: 'brief', day, model: generated.model, attempts, text: row.text, mode: row.mode, cardIds: row.cardIds, action: row.action }
}

/** Sunday, at the brief hour: the week in three parts, each held to the rules of a line, written once beside the day's line. */
export async function runReview(env: JobEnv, store: Store, run: Runner, now: Date, opts: BriefOptions = {}): Promise<BriefResult> {
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  if (!opts.force && (local.weekday !== 0 || local.hour !== Number(env.BRIEF_HOUR))) return { wrote: false, reason: 'not Sunday at the hour', day }
  const id = `${day}:review`
  if (!opts.force && (await store.hasBrief(id))) return { wrote: false, reason: 'written already', day }
  const facts = await latestFacts(store, day, now)
  if (typeof facts === 'string') return { wrote: false, reason: facts, day }

  const cards = retrieve(await loadLibrary(env.LIBRARY_URL, opts.fetcher), facts.sheet, 16)
  const attempts: string[] = []
  const generated = await generateValid(modelsOf(env), run, buildReviewMessages(facts.sheet, cards, await saidLately(store, facts.sheet)), (raw) => validateReview(raw, facts.sheet, cards), 4000, attempts)
  if (!generated) return { wrote: false, reason: 'no model produced a review that passed', day, attempts }

  const at = now.toISOString()
  const { held, didNot, change, factIds, cardIds } = generated.output
  const row: BriefRow = { id, day, kind: 'review', text: `${held} ${didNot} ${change}`, mode: 'strategy', factIds, cardIds, action: null, parts: { held, didNot, change }, model: generated.model, at, factsDay: facts.sheet.day }
  await store.writeBrief(row, at)
  return { wrote: true, reason: 'review', day, model: generated.model, attempts, text: row.text, mode: row.mode, cardIds }
}

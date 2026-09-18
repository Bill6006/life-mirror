import type { Env } from './env'
import { loadLibrary, retrieve } from './library'
import { buildMessages, type Said } from './prompt'
import { generateValid, type Runner } from './ai'
import type { BriefRow, Store } from './turso'
import { addDays, localTime } from './time'

// The morning line. At the brief hour, the newest fact sheet the phone wrote (yesterday's,
// usually) goes to the model chain with the cards it touches and what was said recently; the
// validated answer is written once as the day's line. Sunday's line reviews the week.

const MAX_FACTS_AGE_MS = 48 * 3_600_000

export interface BriefResult {
  wrote: boolean
  reason: string
  day?: string
  model?: string
  attempts?: string[]
}

export interface BriefOptions {
  force?: boolean
  fetcher?: typeof fetch
}

export async function runBrief(env: Pick<Env, 'TIMEZONE' | 'BRIEF_HOUR' | 'MODELS' | 'LIBRARY_URL'>, store: Store, run: Runner, now: Date, opts: BriefOptions = {}): Promise<BriefResult> {
  const local = localTime(now, env.TIMEZONE)
  const day = local.day
  if (!opts.force && local.hour !== Number(env.BRIEF_HOUR)) return { wrote: false, reason: `not the hour (${local.hour})`, day }
  const id = `${day}:brief`
  if (!opts.force && (await store.hasBrief(id))) return { wrote: false, reason: 'written already', day }

  const found = (await Promise.all([addDays(day, -1), day].map((d) => store.readFacts(d)))).filter((f): f is NonNullable<typeof f> => f !== null)
  const facts = found.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
  if (!facts) return { wrote: false, reason: 'no facts for yesterday or today', day }
  if (now.getTime() - Date.parse(facts.updatedAt) > MAX_FACTS_AGE_MS) return { wrote: false, reason: `facts too old (${facts.updatedAt})`, day }

  const library = await loadLibrary(env.LIBRARY_URL, opts.fetcher)
  const cards = retrieve(library, facts.sheet)
  const feedback = new Map((await store.readFeedback()).map((f) => [f.briefKey, f.answer]))
  const said: Said[] = [
    ...(await store.readSaid(7)).map((s) => ({ day: s.day, text: s.text, feedback: feedback.get(`worker:${s.id}`) ?? null })),
    ...facts.sheet.said.filter((s) => s.source === 'phone').map((s) => ({ day: s.day, text: s.text, feedback: s.feedback })),
  ]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 10)
  const kind = local.weekday === 0 ? 'review' : 'brief'
  const models = env.MODELS.split(',').map((m) => m.trim()).filter(Boolean)
  const attempts: string[] = []
  const generated = await generateValid(models, run, buildMessages(kind, facts.sheet, cards, said), facts.sheet, cards, 800, attempts)
  if (!generated) return { wrote: false, reason: 'no model produced a line that passed', day, attempts }

  const at = now.toISOString()
  const row: BriefRow = { id, day, kind: 'brief', text: generated.output.text, mode: generated.output.mode, factIds: generated.output.factIds, cardIds: generated.output.cardIds, model: generated.model, at, factsDay: facts.sheet.day, ...(kind === 'review' ? { weekly: true } : {}) }
  await store.writeBrief(row, at)
  return { wrote: true, reason: kind, day, model: generated.model, attempts: generated.attempts }
}

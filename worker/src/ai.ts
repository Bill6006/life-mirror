import type { Env } from './env'
import { parseOutput, type Message } from './prompt'

// The model chain. Each model gets two tries, the second carrying the validator's reason; a
// failure of any kind falls to the next model; when the chain is spent, nothing is written and
// the phone's own line stands.

export type Runner = (model: string, messages: Message[], maxTokens: number) => Promise<unknown>

/**
 * Every model here answers in the chat-completion shape, and the reasoning ones spend their
 * tokens thinking before the answer: the budget is generous and, where the model takes it,
 * the effort is asked low so the answer arrives.
 */
export function aiRunner(ai: Env['AI']): Runner {
  return (model, messages, maxTokens) => ai.run(model, { messages, max_tokens: maxTokens, temperature: 0.4, ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}) })
}

/** The text in a Workers AI answer, whichever shape the model family returns it in. */
export function textOf(result: unknown): string {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''
  const r = result as Record<string, unknown>
  if (typeof r.response === 'string') return r.response
  if (Array.isArray(r.output)) {
    const parts: string[] = []
    for (const item of r.output as Record<string, unknown>[]) {
      if (item.type === 'message' && Array.isArray(item.content)) for (const c of item.content as Record<string, unknown>[]) if (typeof c.text === 'string') parts.push(c.text)
    }
    if (parts.length) return parts.join('\n')
  }
  if (Array.isArray(r.choices)) {
    const first = r.choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined
    if (typeof first?.message?.content === 'string') return first.message.content
    if (typeof first?.text === 'string') return first.text
  }
  if (typeof r.result === 'object' && r.result) return textOf(r.result)
  return ''
}

/** The neurons an answer cost, as Workers AI reports them on it; zero when it does not say. */
export function neuronsOf(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const n = (result as { usage?: { neurons?: unknown } }).usage?.neurons
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

/** What a job spent: calls made and neurons used, summed across the chain and its retries. */
export interface Usage {
  calls: number
  neurons: number
}

export const newUsage = (): Usage => ({ calls: 0, neurons: 0 })

export type Check<T> = (raw: unknown) => { ok: true; value: T } | { ok: false; reason: string }

export interface Generation<T> {
  output: T
  model: string
}

/** Runs the chain until an answer passes the check. What each try was refused for goes into `attempts`, in order, for the log. */
export async function generateValid<T>(models: readonly string[], run: Runner, messages: Message[], check: Check<T>, maxTokens = 4000, attempts: string[] = [], usage: Usage = newUsage()): Promise<Generation<T> | null> {
  for (const model of models) {
    let thread = messages
    for (let attempt = 0; attempt < 2; attempt++) {
      let text = ''
      try {
        const raw = await run(model, thread, maxTokens)
        usage.calls++
        usage.neurons += neuronsOf(raw)
        text = textOf(raw)
      } catch (e) {
        attempts.push(`${model}: ${e instanceof Error ? e.message : String(e)}`)
        break
      }
      const parsed = parseOutput(text)
      const v = parsed === null ? ({ ok: false, reason: 'no JSON in the answer' } as const) : check(parsed)
      if (v.ok) return { output: v.value, model }
      attempts.push(`${model}: ${v.reason}`)
      thread = [...thread, { role: 'assistant', content: text.slice(0, 2000) }, { role: 'user', content: `That answer was refused: ${v.reason}. Answer again, JSON only, keeping every rule.` }]
    }
  }
  return null
}

/** The candidates in an answer: a list under "candidates", or one line given on its own. */
function candidatesOf(parsed: unknown): unknown[] {
  if (!parsed || typeof parsed !== 'object') return []
  const list = (parsed as { candidates?: unknown }).candidates
  return Array.isArray(list) ? list.slice(0, 3) : [parsed]
}

export interface Candidates<T> {
  valid: T[]
  model: string
}

/**
 * Runs the chain until an answer holds at least one candidate that passes the check (Part 28).
 * Each refused candidate's reason goes into `attempts`, whether or not another passed, so the
 * log shows every refusal; a try with none passing is asked again with the reasons.
 */
export async function generateCandidates<T>(models: readonly string[], run: Runner, messages: Message[], check: Check<T>, maxTokens = 4000, attempts: string[] = [], usage: Usage = newUsage()): Promise<Candidates<T> | null> {
  for (const model of models) {
    let thread = messages
    for (let attempt = 0; attempt < 2; attempt++) {
      let text = ''
      try {
        const raw = await run(model, thread, maxTokens)
        usage.calls++
        usage.neurons += neuronsOf(raw)
        text = textOf(raw)
      } catch (e) {
        attempts.push(`${model}: ${e instanceof Error ? e.message : String(e)}`)
        break
      }
      const list = candidatesOf(parseOutput(text))
      const valid: T[] = []
      const reasons: string[] = list.length ? [] : ['no JSON in the answer']
      for (const c of list) {
        const v = check(c)
        if (v.ok) valid.push(v.value)
        else reasons.push(v.reason)
      }
      for (const r of reasons) attempts.push(`${model}: ${r}`)
      if (valid.length) return { valid, model }
      const refused = reasons.length === 1 ? `That answer was refused: ${reasons[0]}.` : `Those candidates were refused: ${reasons.map((r, i) => `${i + 1}) ${r}`).join('; ')}.`
      thread = [...thread, { role: 'assistant', content: text.slice(0, 3000) }, { role: 'user', content: `${refused} Answer again, JSON only, keeping every rule.` }]
    }
  }
  return null
}

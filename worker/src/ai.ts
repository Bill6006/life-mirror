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

export type Check<T> = (raw: unknown) => { ok: true; value: T } | { ok: false; reason: string }

export interface Generation<T> {
  output: T
  model: string
}

/** Runs the chain until an answer passes the check. What each try was refused for goes into `attempts`, in order, for the log. */
export async function generateValid<T>(models: readonly string[], run: Runner, messages: Message[], check: Check<T>, maxTokens = 4000, attempts: string[] = []): Promise<Generation<T> | null> {
  for (const model of models) {
    let thread = messages
    for (let attempt = 0; attempt < 2; attempt++) {
      let text = ''
      try {
        text = textOf(await run(model, thread, maxTokens))
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

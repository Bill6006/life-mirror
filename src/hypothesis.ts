import { BLOCKS, type Block } from './blocks'
import { hasMove, moveById } from './catalogue'
import type { Card } from './db'
import { readings, type ReadingId } from './readings'
import { INGREDIENTS } from './score'

// An outside hypothesis enters only through this format, as a card to test, never as something
// to believe: {"move": "walk-ten", "alternative": "nap-ten", "target": "energy", "context": "afternoon"}.

export interface Hypothesis {
  move: string
  alternative: string
  target: ReadingId
  context: Block
}

export type Parsed = { ok: true; hypothesis: Hypothesis } | { ok: false; error: 'notJson' | 'fields' | 'move' | 'alternative' | 'target' | 'context' | 'same' }

export function parseHypothesis(text: string): Parsed {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'notJson' }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'fields' }
  const r = raw as Record<string, unknown>
  const move = typeof r.move === 'string' ? r.move.trim() : ''
  const alternative = typeof r.alternative === 'string' ? r.alternative.trim() : ''
  const target = typeof r.target === 'string' ? r.target.trim() : ''
  const context = typeof r.context === 'string' ? r.context.trim() : ''
  if (!move || !alternative || !target || !context) return { ok: false, error: 'fields' }
  if (!hasMove(move)) return { ok: false, error: 'move' }
  if (alternative !== 'nothing' && !hasMove(alternative)) return { ok: false, error: 'alternative' }
  if (move === alternative) return { ok: false, error: 'same' }
  if (!readings.some((x) => x.id === target) || !INGREDIENTS[target]) return { ok: false, error: 'target' }
  if (!(BLOCKS as readonly string[]).includes(context)) return { ok: false, error: 'context' }
  return { ok: true, hypothesis: { move, alternative, target: target as ReadingId, context: context as Block } }
}

/** The card an imported hypothesis becomes: the same record as any card, marked imported, and nothing else. */
export function cardFromHypothesis(h: Hypothesis, now: string): Card {
  const move = moveById(h.move)
  const window = move.targets.find((t) => t.reading === h.target)?.window ?? move.targets[0]?.window ?? 'nextBlock'
  return { createdAt: now, situationKey: `${h.context}:${h.target}`, block: h.context, target: h.target, moveId: h.move, alternativeId: h.alternative, window, worthwhile: 1, origin: 'import' }
}

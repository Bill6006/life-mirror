import { useState } from 'preact/hooks'
import { moveById } from './catalogue'
import { copy } from './copy'
import type { Offer, OutcomeWhy, WinOutcome } from './db'
import { useLive } from './live'
import { offerName, outcomeFor } from './offerFlow'
import { NOTHING } from './offers'

const ANSWERS: readonly WinOutcome[] = ['done', 'partly', 'no']

export interface Answer {
  outcome: WinOutcome | null
  why: OutcomeWhy | null
  passiveOutcome: 'done' | 'no' | null
}

/**
 * The one-tap question at the start of the next check-in: what happened, kept apart from what
 * was offered. After a No, one optional tap for why, never required, never asked twice. If a
 * passive item rode alongside, one tap for that too; when the move was already recorded from
 * the card, that one tap is all that is asked.
 */
export function OutcomeAsk({ offer, onAnswer, notice = null }: { offer: Offer; onAnswer: (a: Answer) => void; notice?: string | null }) {
  const [outcome, setOutcome] = useState<WinOutcome | null | undefined>(undefined)
  const [why, setWhy] = useState<OutcomeWhy | null | undefined>(undefined)
  const passive = offer.passiveId ? moveById(offer.passiveId) : null
  const nothing = offer.moveId === NOTHING
  const existing = useLive(() => outcomeFor(offer.id), [offer.id])
  const c = copy.ask
  if (existing === undefined) return <section class="screen" />

  // Recorded from the card already: the move's answer stands, only the passive item is asked.
  const passiveOnly = existing !== null && passive !== null && existing.passiveOutcome === null
  const askWhy = !passiveOnly && outcome === 'no' && why === undefined
  const askPassive = passive !== null && (passiveOnly || (outcome !== undefined && !askWhy))

  function finish(passiveOutcome: 'done' | 'no' | null) {
    if (passiveOnly && existing) onAnswer({ outcome: existing.outcome, why: existing.why, passiveOutcome })
    else onAnswer({ outcome: outcome ?? null, why: why ?? null, passiveOutcome })
  }

  function chooseOutcome(o: WinOutcome | null) {
    setOutcome(o)
    if (o !== 'no' && !passive) onAnswer({ outcome: o, why: null, passiveOutcome: null })
  }

  function chooseWhy(w: OutcomeWhy | null) {
    setWhy(w)
    if (!passive) onAnswer({ outcome: 'no', why: w, passiveOutcome: null })
  }

  return (
    <section class="screen" data-testid="outcome-ask">
      <header class="screen-head">
        <p class="eyebrow">{offer.kind === 'pickup' ? c.titlePickup : offer.kind === 'step' || offer.kind === 'study' ? c.titleStep : offer.kind === 'unblock' ? c.titleUnblock : c.title}</p>
      </header>
      <h1 class="title">{offerName(offer, copy.move.nothing)}</h1>
      {notice && (
        <p class="note ink" data-testid="rung-moved">
          {notice}
        </p>
      )}

      {outcome === undefined && !passiveOnly && (
        <>
          <p class="note">{nothing ? c.questionNothing : c.question}</p>
          <div class="card">
            <ul class="rows">
              {ANSWERS.map((a) => (
                <li key={a}>
                  <button type="button" class="row anchor" data-testid="outcome" onClick={() => chooseOutcome(a)}>
                    <span class="anchor-mark" aria-hidden="true" />
                    <span class="row-main">{copy.extras.winOutcome[a]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div class="actions">
            <button type="button" class="textbtn" onClick={() => onAnswer({ outcome: null, why: null, passiveOutcome: null })}>
              {c.skip}
            </button>
          </div>
        </>
      )}

      {askWhy && (
        <>
          <p class="note">{c.whyQuestion}</p>
          <div class="card">
            <ul class="rows">
              {(['noTime', 'didntWant'] as const).map((w) => (
                <li key={w}>
                  <button type="button" class="row anchor" data-testid="why" onClick={() => chooseWhy(w)}>
                    <span class="anchor-mark" aria-hidden="true" />
                    <span class="row-main">{c.why[w]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div class="actions">
            <button type="button" class="textbtn" onClick={() => chooseWhy(null)}>
              {c.whySkip}
            </button>
          </div>
        </>
      )}

      {askPassive && passive && (
        <>
          <p class="note">{fill(c.passiveQuestion, { item: passive.name })}</p>
          <div class="actions">
            <button type="button" class="pill-quiet" data-testid="passive-done" onClick={() => finish('done')}>
              {c.passiveDone}
            </button>
            <button type="button" class="pill-quiet" onClick={() => finish('no')}>
              {c.passiveNo}
            </button>
            <button type="button" class="textbtn" onClick={() => finish(null)}>
              {c.skip}
            </button>
          </div>
        </>
      )}

      <p class="note faint">{c.note}</p>
    </section>
  )
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
}

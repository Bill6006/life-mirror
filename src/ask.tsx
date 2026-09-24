import { useState } from 'preact/hooks'
import { moveById } from './catalogue'
import { copy } from './copy'
import { easeRetired } from './aims'
import { db, getSettings, type Ease, type Offer, type OutcomeWhy, type WinOutcome } from './db'
import { parseSkillSessionId } from './ladder'
import { useLive } from './live'
import { offerName, outcomeFor } from './offerFlow'
import { NOTHING } from './offers'

const ANSWERS: readonly WinOutcome[] = ['done', 'partly', 'no']

export interface Answer {
  outcome: WinOutcome | null
  why: OutcomeWhy | null
  passiveOutcome: 'done' | 'no' | null
  /** A learning session's one optional tap on how it went (Workstream 6), after Done or Partly. */
  ease: Ease | null
}

const EASES: readonly Ease[] = ['hard', 'right', 'easy']

/**
 * The one-tap question at the start of the next check-in: what happened, kept apart from what
 * was offered. After a No, one optional tap for why, never required, never asked twice. If a
 * passive item rode alongside, one tap for that too; when the move was already recorded from
 * the card, that one tap is all that is asked.
 */
export function OutcomeAsk({ offer, onAnswer, notice = null }: { offer: Offer; onAnswer: (a: Answer) => void; notice?: string | null }) {
  const [outcome, setOutcome] = useState<WinOutcome | null | undefined>(undefined)
  // A learning session asks how it went, one optional tap, until that tap has gone unused a dozen sessions running.
  const learning = parseSkillSessionId(offer.moveId) !== null
  const easeOff = useLive(async () => (learning ? easeRetired(await db.offers.toArray(), await db.outcomes.toArray(), (await getSettings()).easeBack) : true), [offer.id])
  const [why, setWhy] = useState<OutcomeWhy | null | undefined>(undefined)
  const passive = offer.passiveId ? moveById(offer.passiveId) : null
  const nothing = offer.moveId === NOTHING
  const existing = useLive(() => outcomeFor(offer.id), [offer.id])
  const c = copy.ask
  if (existing === undefined || easeOff === undefined) return <section class="screen" />

  // Recorded from the card already: the move's answer stands, only the passive item is asked.
  const passiveOnly = existing !== null && passive !== null && existing.passiveOutcome === null
  const askWhy = !passiveOnly && outcome === 'no' && why === undefined
  const askPassive = passive !== null && (passiveOnly || (outcome !== undefined && !askWhy))
  const askEase = learning && !easeOff && (outcome === 'done' || outcome === 'partly')

  function finish(passiveOutcome: 'done' | 'no' | null) {
    if (passiveOnly && existing) onAnswer({ outcome: existing.outcome, why: existing.why, passiveOutcome, ease: null })
    else onAnswer({ outcome: outcome ?? null, why: why ?? null, passiveOutcome, ease: null })
  }

  function chooseOutcome(o: WinOutcome | null) {
    setOutcome(o)
    if (learning && !easeOff && (o === 'done' || o === 'partly')) return
    if (o !== 'no' && !passive) onAnswer({ outcome: o, why: null, passiveOutcome: null, ease: null })
  }

  function chooseWhy(w: OutcomeWhy | null) {
    setWhy(w)
    if (!passive) onAnswer({ outcome: 'no', why: w, passiveOutcome: null, ease: null })
  }

  function chooseEase(e: Ease | null) {
    onAnswer({ outcome: outcome ?? null, why: null, passiveOutcome: null, ease: e })
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
            <button type="button" class="textbtn" onClick={() => onAnswer({ outcome: null, why: null, passiveOutcome: null, ease: null })}>
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

      {askEase && (
        <>
          <p class="note">{copy.aims.easeQuestion}</p>
          <div class="card">
            <ul class="rows">
              {EASES.map((e) => (
                <li key={e}>
                  <button type="button" class="row anchor" data-testid="ease" onClick={() => chooseEase(e)}>
                    <span class="anchor-mark" aria-hidden="true" />
                    <span class="row-main">{copy.aims.ease[e]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div class="actions">
            <button type="button" class="textbtn" data-testid="ease-skip" onClick={() => chooseEase(null)}>
              {c.whySkip}
            </button>
          </div>
          <p class="note faint">{copy.aims.easeNote}</p>
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

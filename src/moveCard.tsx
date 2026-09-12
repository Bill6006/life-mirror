import { useEffect, useState } from 'preact/hooks'
import { moveById } from './catalogue'
import { copy } from './copy'
import { updateSettings, type Offer, type Outcome } from './db'
import { fill, formatTime, formatWhen } from './format'
import { useLive } from './live'
import { privateAssociationsToday } from './learningFlow'
import { cardById, doneOpen, nameOf, offerCounts, outcomeFor, recordDoneNow } from './offerFlow'
import { NOTHING } from './offers'
import { anchorFor, headword, readingById } from './readings'
import { INGREDIENTS } from './score'

function times(n: number): string {
  return n === 1 ? copy.move.once : n === 2 ? copy.move.twice : fill(copy.move.nTimes, { n: String(n) })
}

function windowOf(w: string): string {
  return copy.catalogue.windows[w as keyof typeof copy.catalogue.windows] ?? w
}

function reasonText(offer: Offer): string | null {
  if (!offer.whyNot) return null
  const r = copy.move.whyNotReasons[offer.whyNot.reason as keyof typeof copy.move.whyNotReasons] ?? offer.whyNot.reason
  return fill(copy.move.whyNotLine, { move: nameOf(offer.whyNot.moveId, copy.move.nothing), reason: r })
}

/**
 * One small move: what to do, why this (a calculation from your record, with its counts),
 * why not the move you might have expected, and what it is testing: the card, written first,
 * visible and never loud.
 */
export function MoveCard({ offer, outcome, onSkip, compact = false }: { offer: Offer; outcome?: Outcome | null; onSkip?: () => void; compact?: boolean }) {
  const c = copy.move
  const nothing = offer.moveId === NOTHING
  const move = nothing ? null : moveById(offer.moveId)
  const card = useLive(() => cardById(offer.cardId), [offer.cardId])
  const counts = useLive(() => offerCounts(offer.situationKey, offer.moveId), [offer.situationKey, offer.moveId, outcome?.id])
  const target = readingById(offer.target)
  const arrow = INGREDIENTS[offer.target] === 'up' ? '↑' : '↓'
  const whyNot = reasonText(offer)
  const passive = offer.passiveId ? moveById(offer.passiveId) : null
  const privates = useLive(() => (offer.block === 'evening' ? privateAssociationsToday(offer.day) : Promise.resolve([])), [offer.day, offer.block])
  const round = (v: number | null) => (v === null ? '—' : String(Math.round(v)))

  // The outcome logged for this offer: from the card at the moment, or at the next check-in.
  const logged = useLive(() => outcomeFor(offer.id), [offer.id])
  const known = outcome ?? logged ?? null
  // The Done tap opens once the move's stated minutes have passed and closes with the block; the clock is read again every so often.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  const canDone = !compact && !known && offer.closedAt === null && offer.skippedAt === null && doneOpen(offer)

  // Once logged, the card is a fact line: no box, nothing sits there unticked.
  if (!compact && known && known.outcome) {
    const state = known.outcome === 'done' ? c.done : copy.extras.winOutcome[known.outcome]
    return (
      <div class="card pad move-card is-done" data-testid="move-card" data-kind={offer.kind}>
        <p class="eyebrow small">{offer.kind === 'pickup' ? c.pickupTitle : c.title}</p>
        <p class="move-fact" data-testid="move-fact">
          {fill(c.doneLine, { name: nothing ? c.nothing : (move?.name ?? ''), state, time: formatTime(known.at) })}
        </p>
      </div>
    )
  }

  return (
    <div class={compact ? 'card pad move-card compact' : 'card pad move-card'} data-testid="move-card" data-kind={offer.kind}>
      <p class="eyebrow small">{offer.kind === 'pickup' ? c.pickupTitle : c.title}</p>
      <h2 class="move-title" data-testid="move-name">
        {nothing ? c.nothing : move?.name}
      </h2>
      <p class="move-what">{nothing ? c.nothingWhat : move?.what}</p>
      {move && (
        <p class="move-meta">
          {move.minutes === 0 ? copy.catalogue.noTime : fill(copy.catalogue.minutes, { n: String(move.minutes) })} · {fill(copy.catalogue.effort, { level: copy.catalogue.efforts[move.effort] })} ·{' '}
          {fill(copy.catalogue.needsLabel, { needs: move.needs.length ? move.needs.map((n) => copy.catalogue.needs[n]).join(', ') : copy.catalogue.needsNothing })}
        </p>
      )}
      {passive && (
        <p class="move-passive">
          {c.alongside}: <span class="ink">{passive.name}</span>
        </p>
      )}

      <div class="calc">
        <p class="calc-line">
          <span class="calc-key">{c.why}</span> ·{' '}
          {offer.kind === 'pickup'
            ? c.whyPickup
            : nothing
              ? fill(c.whyNothing, { target: target.name, phrase: headword(anchorFor(offer.target, Math.max(1, Math.min(5, offer.reading === 0 ? 3 : 3)) as 1)) })
              : fill(c.whyLine, { target: target.name, arrow, window: windowOf(card?.window ?? 'nextBlock') })}
        </p>
        <p class="calc-line">
          <span class="calc-key">{c.evidence}</span> · {c.tierLittle} ·{' '}
          {counts ? fill(c.evidenceLine, { n: times(counts.offered), done: String(counts.done), partly: String(counts.partly) }) : '…'}
        </p>
        {whyNot && (
          <p class="calc-line">
            <span class="calc-key">{c.whyNot}</span> · {whyNot}
          </p>
        )}
        {privates &&
          privates
            .filter((p) => p.association.withEvent.n >= 3 && p.association.without.n >= 3)
            .map((p) => (
              <p key={p.itemId} class="calc-line" data-testid="private-line">
                {fill(c.privateInline, { name: p.name, with: round(p.association.withEvent.mean), without: round(p.association.without.mean), n: String(p.association.withEvent.n), m: String(p.association.without.n), alternative: moveById(p.alternativeId).name })}
              </p>
            ))}
        <p class="calc-line testing">
          <span class="calc-key">{c.testing}</span> ·{' '}
          {card === undefined
            ? '…'
            : card === null
              ? c.testingNone
              : fill(c.testingLine, {
                  move: move?.name ?? c.nothing,
                  alternative: moveById(card.alternativeId).name,
                  target: target.name.toLowerCase(),
                  window: windowOf(card.window),
                  id: String(card.id),
                  date: formatWhen(card.createdAt),
                })}
          {offer.coinFlip && ` ${c.coinFlip}`}
        </p>
      </div>

      {known && known.outcome && (
        <p class="move-state">
          {c.happened}: {copy.extras.winOutcome[known.outcome]}
          {known.why && ` · ${copy.ask.why[known.why]}`}
        </p>
      )}
      {known && !known.outcome && <p class="move-state muted">{c.passedOver}</p>}
      {!known && offer.closedAt === null && !compact && <p class="move-state muted">{c.pending}</p>}

      {(canDone || onSkip || move?.family === 'faith') && offer.closedAt === null && !known && (
        <div class="actions">
          {canDone && (
            <button type="button" class="textbtn ink" data-testid="move-done" onClick={() => void recordDoneNow(offer)}>
              {c.done}
            </button>
          )}
          {onSkip && (
            <button type="button" class="textbtn" onClick={onSkip}>
              {c.skip}
            </button>
          )}
          {move?.family === 'faith' && (
            <button type="button" class="textbtn faint" onClick={() => void updateSettings((s) => ({ ...s, hideFaith: true }))}>
              {c.hideFaith}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

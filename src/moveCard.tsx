import { useEffect, useState } from 'preact/hooks'
import { moveById } from './catalogue'
import { copy } from './copy'
import { updateSettings, type Offer, type Outcome } from './db'
import { fill, formatTime, formatWhen } from './format'
import { useLive } from './live'
import { privateAssociationsToday, tierOfCard } from './learningFlow'
import { answerPassive, cardById, doneOpen, nameOf, offerCounts, outcomeFor, recordDoneNow, replacementsFor } from './offerFlow'
import { NOTHING } from './offers'
import { anchorFor, headword, readingById } from './readings'
import { INGREDIENTS } from './score'
import { Disclosure, Tag } from './ui'

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
  // The card's own tier, as Evidence shows it; never a fixed word (Part 33).
  const tier = useLive(() => (offer.cardId === null ? Promise.resolve(null) : tierOfCard(offer.cardId, offer.day)), [offer.cardId, offer.day, outcome?.id])
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
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  const canDone = !compact && !known && offer.closedAt === null && offer.skippedAt === null && doneOpen(offer)
  // Skip says what it will do: another move when one fits now, else plain Skip (D6). Read again with the clock, since it can open a write.
  const [others, setOthers] = useState<number | null>(null)
  useEffect(() => {
    if (!onSkip) return
    let live = true
    void replacementsFor(offer).then((n) => live && setOthers(n))
    return () => {
      live = false
    }
  }, [offer.id, offer.skippedAt, onSkip === undefined, tick])

  // Once logged, the card is a fact line: no box, nothing sits there unticked.
  if (!compact && known && known.outcome) {
    const state = known.outcome === 'done' ? c.done : copy.extras.winOutcome[known.outcome]
    return (
      <div class="card pad move-card is-done" data-testid="move-card" data-kind={offer.kind}>
        <p class="eyebrow small">{offer.kind === 'pickup' ? c.pickupTitle : c.title}</p>
        <p class="move-fact" data-testid="move-fact">
          {fill(c.doneLine, { name: nothing ? c.nothing : (move?.name ?? ''), state, time: formatTime(known.at) })}
        </p>
        {passive && known.passiveOutcome === null && offer.closedAt === null && (
          <div class="actions" data-testid="passive-inline">
            <span class="note">{fill(copy.ask.passiveQuestion, { item: passive.name })}</span>
            <button type="button" class="pill-quiet" data-testid="passive-inline-done" onClick={() => void answerPassive(offer, 'done')}>
              {copy.ask.passiveDone}
            </button>
            <button type="button" class="pill-quiet" data-testid="passive-inline-no" onClick={() => void answerPassive(offer, 'no')}>
              {copy.ask.passiveNo}
            </button>
          </div>
        )}
      </div>
    )
  }

  const whyText =
    offer.kind === 'pickup'
      ? c.whyPickup
      : nothing
        ? fill(c.whyNothing, { target: target.name, phrase: headword(anchorFor(offer.target, Math.max(1, Math.min(5, offer.reading === 0 ? 3 : 3)) as 1)) })
        : fill(c.whyLine, { target: target.name, arrow, window: windowOf(card?.window ?? 'nextBlock') })
  const shownPrivates = (privates ?? []).filter((p) => p.association.withEvent.n >= 3 && p.association.without.n >= 3)

  return (
    <div class={compact ? 'card pad move-card compact' : 'card pad move-card'} data-testid="move-card" data-kind={offer.kind}>
      <div class="move-head">
        <p class="eyebrow small">{offer.kind === 'pickup' ? c.pickupTitle : c.title}</p>
        {card && <Tag>{c.testing}</Tag>}
      </div>
      <h2 class="move-title" data-testid="move-name">
        {nothing ? c.nothing : move?.name}
      </h2>
      <p class="move-what">{nothing ? c.nothingWhat : move?.what}</p>
      {move && (
        <ul class="move-facts" data-testid="move-facts">
          <li class="fact">{move.minutes === 0 ? copy.catalogue.noTime : fill(copy.catalogue.minutes, { n: String(move.minutes) })}</li>
          <li class="fact">{fill(copy.catalogue.effort, { level: copy.catalogue.efforts[move.effort] })}</li>
          <li class="fact">{fill(copy.catalogue.needsLabel, { needs: move.needs.length ? move.needs.map((n) => copy.catalogue.needs[n]).join(', ') : copy.catalogue.needsNothing })}</li>
        </ul>
      )}
      {passive && (
        <p class="move-passive">
          <span class="along-k">{c.alongside}</span>
          <span class="ink">{passive.name}</span>
        </p>
      )}

      {/* Why this, the evidence, why not that, what the record says of a private item, and the test: one tap away, in the same words. */}
      <Disclosure label={copy.disclose.moveWhy} testid="move-why">
        <div class="calc evidence" data-testid="move-evidence">
          <div class="ev">
            <span class="calc-key">{c.why}</span>
            <span class="calc-line">{whyText}</span>
          </div>
          <div class="ev">
            <span class="calc-key">{c.evidence}</span>
            <span class="calc-line">
              <span class="tier" data-testid="move-tier">{copy.evidence.tiers[tier ?? 'little']}</span> {counts ? fill(c.evidenceLine, { n: times(counts.offered), done: String(counts.done), partly: String(counts.partly) }) : '…'}
            </span>
          </div>
          {whyNot && (
            <div class="ev">
              <span class="calc-key">{c.whyNot}</span>
              <span class="calc-line">{whyNot}</span>
            </div>
          )}
          {shownPrivates.map((p) => (
            <div key={p.itemId} class="ev">
              <span class="calc-line" data-testid="private-line">
                {fill(c.privateInline, { name: p.name, with: round(p.association.withEvent.mean), without: round(p.association.without.mean), n: String(p.association.withEvent.n), m: String(p.association.without.n), alternative: moveById(p.alternativeId).name })}
              </span>
            </div>
          ))}
          <div class="ev test">
            <span class="calc-key">{c.testing}</span>
            <span class="calc-line testing">
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
            </span>
          </div>
        </div>
      </Disclosure>

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
          {onSkip && others !== null && (
            <button type="button" class="textbtn" data-testid="move-skip" onClick={onSkip}>
              {others > 0 ? c.skip : c.skipOnly}
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

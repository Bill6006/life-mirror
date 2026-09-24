import { useState } from 'preact/hooks'
import { blockAt } from './blocks'
import { NavRow } from './controls'
import { copy } from './copy'
import { getSettings } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { MoveCard } from './moveCard'
import { deleteOutcome, offerForSlot, offerHistory, pendingOffers, skipOffer } from './offerFlow'
import { readingById } from './readings'
import { ScreenHead } from './ui'

/** The Moves tab: the live move with why and testing, then the doors to History and the catalogue. */
export function MovesScreen({ onHistory, onCatalogue, onEvidence }: { onHistory: () => void; onCatalogue: () => void; onEvidence: () => void }) {
  const today = blockAt(new Date())
  const settings = useLive(getSettings, [])
  const here = useLive(() => offerForSlot(today.day, today.block), [today.day, today.block])
  const pickup = useLive(() => offerForSlot(today.day, today.block, 'pickup'), [today.day, today.block])
  const pending = useLive(pendingOffers, [])
  if (!settings || here === undefined || pickup === undefined || pending === undefined) return <section class="screen" />
  const offer = here ?? pending.find((o) => o.kind === 'block') ?? null
  const c = copy.move

  return (
    <section class="screen">
      <ScreenHead title={copy.tabs.moves} day={today.day} />

      {settings.hideMoves ? (
        <p class="note">{c.hidden}</p>
      ) : offer ? (
        <MoveCard offer={offer} onSkip={offer === here ? () => void skipOffer(offer) : undefined} />
      ) : (
        <div class="card pad">
          <p class="eyebrow small">{c.title}</p>
          <p class="note no-gap">{c.none}</p>
        </div>
      )}
      {!settings.hideMoves && pickup && <MoveCard offer={pickup} onSkip={() => void skipOffer(pickup)} />}

      {/* The doors, each with one line; the note on how tiers are computed now sits inside Evidence, where the tiers are. */}
      <div class="card doors">
        <ul class="rows">
          <NavRow label={copy.evidence.title} note={copy.movesTab.evidenceDoor} onClick={onEvidence} />
          <NavRow label={copy.history.title} note={copy.movesTab.historyDoor} onClick={onHistory} />
          <NavRow label={copy.catalogue.read} note={copy.movesTab.catalogueDoor} onClick={onCatalogue} />
        </ul>
      </div>
    </section>
  )
}

/** Every offer, its card, and what happened: three records, shown as three. */
export function HistoryScreen({ onClose }: { onClose: () => void }) {
  const entries = useLive(() => offerHistory(copy.move.nothing), [])
  const [confirm, setConfirm] = useState<number | null>(null)
  if (!entries) return <section class="screen" />
  const h = copy.history

  return (
    <section class="screen">
      <header class="screen-head">
        <p class="eyebrow">{h.title}</p>
        <p class="date">{fill(h.count, { n: String(entries.length) })}</p>
      </header>
      <p class="note faint">{copy.movesTab.historyNote}</p>
      {entries.length === 0 ? (
        <p class="note">{h.empty}</p>
      ) : (
        <div class="card">
          <ul class="rows">
            {entries.map(({ offer, card, outcome, moveName }) => {
              const status = offer.skippedAt ? h.skipped : outcome ? (outcome.outcome ? copy.extras.winOutcome[outcome.outcome] : h.unanswered) : h.pending
              return (
                <li key={offer.id} class="row is-static history-row" data-testid="history-row">
                  <span class="row-main">
                    {moveName}
                    <span class="sub">
                      {formatDayShort(offer.day)} · {copy.blocks[offer.block]}
                      {offer.kind === 'pickup' ? ` · ${h.pickup}` : offer.kind === 'study' ? ` · ${h.study}` : offer.kind === 'step' ? ` · ${h.step}` : offer.kind === 'unblock' ? ` · ${h.unblock}` : ` · ${readingById(offer.target).name}`}
                      {offer.coinFlip ? ` · ${h.coinFlip}` : ''} · {fill(h.offer, { id: String(offer.id) })} ·{' '}
                      {card ? fill(h.card, { id: String(card.id), window: copy.catalogue.windows[card.window as keyof typeof copy.catalogue.windows] ?? card.window }) : h.noCard} ·{' '}
                      {outcome ? fill(h.outcome, { id: String(outcome.id) }) : h.noOutcome}
                      {outcome?.why ? ` · ${copy.ask.why[outcome.why]}` : ''}
                    </span>
                  </span>
                  <span class="row-side ink">{status}</span>
                  {outcome && outcome.id !== undefined && (
                    <button type="button" class="textbtn faint" data-testid="history-delete" onClick={() => (confirm === outcome.id ? void deleteOutcome(outcome).then(() => setConfirm(null)) : setConfirm(outcome.id as number))}>
                      {confirm === outcome.id ? h.deleteConfirm : h.deleteAnswer}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

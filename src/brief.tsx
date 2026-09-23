import { useEffect, useState } from 'preact/hooks'
import { applyLineAction, chooseAndLog, feedbackFor, lineActionState, recordFeedback, todaysLine, whyFor, type ActionState, type BriefLine } from './brainFlow'
import { hasMove, moveById, NOTHING } from './catalogue'
import { copy } from './copy'
import { fill } from './format'
import { briefData, type LastNight, type YesterdayMove } from './forecastFlow'
import { gradeWord } from './library'
import { useLive } from './live'
import { nameOf } from './offerFlow'
import { readingById } from './readings'

// The brief on Now. First the brain's line for the day: the Worker's when it wrote one, else the
// phone's own, chosen by the situation engine from the fact sheet and the library. Under it, the
// one tap that does what the line says when there is one, one tap that says how it landed, and
// Why, which shows the facts and the cards behind it. Then the lines none of the other screens
// carry: what last night carried against mornings like it, a stretch starting or steady, and
// yesterday's move as one reading. Counts and ranges, not claims.

const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v)))

/** Line one: last night against the mornings after evenings like it; else yesterday beside what happened. */
export function lastNightLine(b: { lastNight: LastNight | null; yesterday: { expected: number; actual: number; hit: boolean } | null }): string {
  const c = copy.brief
  if (b.lastNight) {
    const event = c.lastNightEvents[b.lastNight.key]
    if (b.lastNight.with === null || b.lastNight.without === null) return fill(c.lastNightFirst, { event, n: String(b.lastNight.n) })
    return fill(c.lastNight, { event, with: pct(b.lastNight.with), without: pct(b.lastNight.without), n: String(b.lastNight.n) })
  }
  if (b.yesterday) return fill(c.yesterday, { expected: String(b.yesterday.expected), actual: String(b.yesterday.actual), result: b.yesterday.hit ? c.hit : c.miss })
  return c.yesterdayNone
}

/** Line three: yesterday's move, read this morning against what is usual. One reading, not a finding. */
export function moveLine(m: YesterdayMove | null): string | null {
  if (!m) return null
  const c = copy.brief
  const steps = String(Math.round(Math.abs(m.effect) * 10) / 10)
  const base = { target: readingById(m.target).name, steps, dir: m.effect >= 0 ? c.above : c.under }
  // "Nothing today" is a choice, not a move with a name: it gets a sentence of its own.
  if (m.moveId === NOTHING) return fill(c.moveNothing, base)
  return fill(c.move, { ...base, name: nameOf(m.moveId, copy.move.nothing), arm: m.arm === 'done' ? copy.move.done : copy.extras.winOutcome.partly })
}

/** What the one tap says it will do, in the line's own terms. */
function actionLabel(line: BriefLine, state: ActionState): string {
  const c = copy.brain
  const a = line.action
  if (!a) return ''
  if (a.kind === 'plan') return fill(c.actionPlan, { cue: copy.aims.cues[state.cue ?? a.cue].toLowerCase(), time: state.time ?? '' })
  if (a.kind === 'depth') return c.actionDepth
  return fill(c.actionTest, { move: hasMove(a.moveId) ? moveById(a.moveId).name : a.moveId })
}

/** The brain's line for the day. Kept while its situation holds; looked at again whenever the screen opens or the record changes. */
function BrainLine({ day, version }: { day: string; version: number }) {
  const line = useLive(() => todaysLine(day), [day])
  const key = line?.key ?? null
  const fb = useLive(() => feedbackFor(key), [key])
  const act = useLive(() => lineActionState(day, line?.action ?? null), [day, key, version])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const why = useLive(() => (open && line ? whyFor(line, day) : Promise.resolve(null)), [open, key])
  useEffect(() => {
    if (busy) return
    setBusy(true)
    void chooseAndLog(day).finally(() => setBusy(false))
  }, [version, day])
  if (!line) return null
  const c = copy.brain
  return (
    <div class="brain-line">
      <p class="calc-line ink" data-testid="brief-line">
        {line.text}
      </p>
      {line.action && act?.state === 'open' && (
        <div class="actions">
          <button type="button" class="pill-quiet" data-testid="brief-action" onClick={() => void applyLineAction(day, line.action as NonNullable<BriefLine['action']>)}>
            {actionLabel(line, act)}
          </button>
        </div>
      )}
      {line.action && act?.state === 'done' && (
        <p class="note faint no-gap" data-testid="brief-acted">
          {c.acted[line.action.kind]}
        </p>
      )}
      <div class="taps" role="group" aria-label={c.tapLabel}>
        {fb === null && (
          <>
            <button type="button" class="when-chip" data-testid="brief-useful" onClick={() => void recordFeedback(day, line, 'useful')}>
              {c.useful}
            </button>
            <button type="button" class="when-chip" data-testid="brief-knew" onClick={() => void recordFeedback(day, line, 'knew')}>
              {c.knew}
            </button>
            <button type="button" class="when-chip" data-testid="brief-not" onClick={() => void recordFeedback(day, line, 'not')}>
              {c.not}
            </button>
          </>
        )}
        <button type="button" class={open ? 'when-chip is-on' : 'when-chip'} aria-pressed={open} data-testid="brief-why" onClick={() => setOpen((v) => !v)}>
          {c.why}
        </button>
      </div>
      {fb && (
        <p class="note faint no-gap" data-testid="brief-noted">
          {c.noted}
        </p>
      )}
      {open && why && (
        <div class="calc" data-testid="brief-why-panel">
          <p class="calc-line">
            <span class="calc-key">{c.whyFacts}</span>
          </p>
          {why.facts.length === 0 && <p class="calc-line">{c.whyNoFacts}</p>}
          {why.facts.map((f) => (
            <p key={f.id} class="calc-line">
              {f.text}
            </p>
          ))}
          {why.cards.length > 0 && (
            <p class="calc-line">
              <span class="calc-key">{c.whyCards}</span>
            </p>
          )}
          {why.cards.map((card) => (
            <p key={card.id} class="calc-line">
              {card.claim} <span class="muted">{fill(c.whyCard, { grade: gradeWord(card.grade), effect: card.effect, source: card.sources[0]?.cite ?? '' })}</span>
            </p>
          ))}
        </div>
      )}
      {line.source === 'worker' && <p class="note faint no-gap">{fill(c.fromWorker, { model: line.model ?? '' })}</p>}
    </div>
  )
}

export function Brief({ day, version = 0 }: { day: string; version?: number }) {
  const b = useLive(() => briefData(day), [day])
  const c = copy.brief
  if (!b) return null
  const move = b.ready ? moveLine(b.move) : null
  return (
    <div class="card pad brief" data-testid="brief">
      <p class="eyebrow small">{c.title}</p>
      <BrainLine day={day} version={version} />
      {!b.ready ? (
        <p class="note no-gap" data-testid="brief-starts">
          {fill(c.starts, { d: String(b.days) })}
        </p>
      ) : (
        <>
          <div class="calc">
            <p class="calc-line ink" data-testid="brief-last-night">
              {lastNightLine(b)}
            </p>
            {move && (
              <p class="calc-line" data-testid="brief-move">
                {move}
              </p>
            )}
          </div>
          {b.warning?.warning ? (
            <div class="conclusion" data-testid="brief-warning">
              <p class="calc-line ink">{fill(c.warning, { under: String(b.warning.under), of: String(b.warning.of), chips: String(b.warning.chips), necessities: String(b.warning.necessities) })}</p>
            </div>
          ) : (
            b.steady && (
              <p class="calc-line" data-testid="brief-steady">
                {fill(c.steady, { inside: String(b.steady.inside), of: String(b.steady.of) })}
              </p>
            )
          )}
          {b.whatIf !== null && <p class="note faint no-gap">{fill(c.whatIf, { v: String(b.whatIf) })}</p>}
        </>
      )}
    </div>
  )
}

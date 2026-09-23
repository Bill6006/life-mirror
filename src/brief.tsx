import { useEffect, useState } from 'preact/hooks'
import { applyLineAction, chooseAndLog, feedbackFor, lineActionState, lineTiming, recordFeedback, todaysLine, whyFor, writtenBy, type ActionState, type BriefLine } from './brainFlow'
import { hasMove, moveById, NOTHING } from './catalogue'
import { copy } from './copy'
import { fill } from './format'
import { briefData, type Brief as BriefData, type LastNight, type YesterdayMove } from './forecastFlow'
import { gradeWord } from './library'
import { useLive } from './live'
import { nameOf } from './offerFlow'
import { readingById } from './readings'

// The brief on Now. The brain's line for the day comes first: the Worker's when it wrote one,
// else the phone's own, chosen by the situation engine from the fact sheet and the library.
// Visible by default, and nothing else: the line, its one action (or the note after it was
// taken), the taps, a one-word writer tag when a model wrote it, and the stretch warning unless
// the line is itself the stretch line. Everything else sits behind Why, in three labelled
// sections: why this line, also from your record, written by. With no line the card shows its
// readings as it always has, so it is never empty. Counts and ranges, not claims. The title says
// when the line is meant to be acted on, from its action alone, never its words: now, later today
// or for today; with no line it names the window the readings cover (owner, 2026-09-23).

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

/** Whether the line itself speaks to the stretch: the phone's stretch situation, or a Worker line citing the stretch fact. */
export function isStretchLine(line: Pick<BriefLine, 'situationId' | 'factIds'> | null): boolean {
  return Boolean(line && (line.situationId === 'stretch' || line.factIds.includes('stretch')))
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

/** The early warning: a conclusion, in the double-rule register. */
function Warning({ b }: { b: BriefData }) {
  const c = copy.brief
  if (!b.warning?.warning) return null
  return (
    <div class="conclusion" data-testid="brief-warning">
      <p class="calc-line ink">{fill(c.warning, { under: String(b.warning.under), of: String(b.warning.of), chips: String(b.warning.chips), necessities: String(b.warning.necessities) })}</p>
    </div>
  )
}

/** The brief's own readings: last night, yesterday's move, steady (or, with no line, the warning), what-if; before seven days, the note that says so. */
function Readings({ b, withWarning }: { b: BriefData; withWarning: boolean }) {
  const c = copy.brief
  if (!b.ready) {
    return (
      <p class="note no-gap" data-testid="brief-starts">
        {fill(c.starts, { d: String(b.days) })}
      </p>
    )
  }
  const move = moveLine(b.move)
  return (
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
      {withWarning && b.warning?.warning ? (
        <Warning b={b} />
      ) : (
        b.steady && (
          <p class="calc-line" data-testid="brief-steady">
            {fill(c.steady, { inside: String(b.steady.inside), of: String(b.steady.of) })}
          </p>
        )
      )}
      {b.whatIf !== null && (
        <p class="note faint no-gap" data-testid="brief-what-if">
          {fill(c.whatIf, { v: String(b.whatIf) })}
        </p>
      )}
    </>
  )
}

/** Why, opened: the grounds of the line, the brief's other readings, and who wrote it. Nothing here is lost; it is one tap away. */
function WhyPanel({ day, line, b }: { day: string; line: BriefLine; b: BriefData }) {
  const why = useLive(() => whyFor(line, day), [line.key, day, line.factIds.join('|')])
  const c = copy.brain
  return (
    <div class="calc why-panel" data-testid="brief-why-panel">
      <p class="calc-line why-head">
        <span class="calc-key">{c.whyLine}</span>
      </p>
      {why && (
        <>
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
        </>
      )}
      <p class="calc-line why-head">
        <span class="calc-key">{c.whyAlso}</span>
      </p>
      {/* When the line is the stretch line the warning sits here, beside the readings it rests on; otherwise it stayed on the card. */}
      <Readings b={b} withWarning={isStretchLine(line)} />
      <p class="calc-line why-head">
        <span class="calc-key">{c.whyWriter}</span>
      </p>
      <p class="calc-line" data-testid="brief-writer">
        {writtenBy(line, c)}
      </p>
    </div>
  )
}

/** The line, its one action, and the taps. Kept while its situation holds; looked at again whenever the screen opens or the record changes. */
function BrainLine({ day, line, act, open, onToggle }: { day: string; line: BriefLine; act: ActionState | null | undefined; open: boolean; onToggle: () => void }) {
  const fb = useLive(() => feedbackFor(line.key), [line.key])
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
        {fb && (
          <span class="note faint no-gap" data-testid="brief-noted">
            {c.noted}
          </span>
        )}
        <button type="button" class={open ? 'when-chip is-on' : 'when-chip'} aria-pressed={open} data-testid="brief-why" onClick={onToggle}>
          {c.why}
        </button>
      </div>
    </div>
  )
}

export function Brief({ day, version = 0 }: { day: string; version?: number }) {
  const b = useLive(() => briefData(day), [day])
  const line = useLive(() => todaysLine(day), [day])
  const act = useLive(() => (line ? lineActionState(day, line.action ?? null) : Promise.resolve(null)), [day, line?.key, JSON.stringify(line?.action ?? null), version])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (busy) return
    setBusy(true)
    void chooseAndLog(day).finally(() => setBusy(false))
  }, [version, day])
  const c = copy.brief
  if (!b || line === undefined) return null
  // While the action's state is still being read the title is blank, rather than a time the line has not established.
  const when = line === null ? c.title : line.action && act === undefined ? '' : copy.brain.when[lineTiming(line.action, act)]
  return (
    <div class="card pad brief" data-testid="brief">
      <div class="brief-head">
        <p class="eyebrow small" data-testid="brief-when">
          {when}
        </p>
        {line?.source === 'worker' && (
          <span class="writer-tag" data-testid="brief-writer-tag">
            {copy.brain.writerTag}
          </span>
        )}
      </div>
      {line ? (
        <>
          <BrainLine day={day} line={line} act={act} open={open} onToggle={() => setOpen((v) => !v)} />
          {b.ready && !isStretchLine(line) && <Warning b={b} />}
          {open && <WhyPanel day={day} line={line} b={b} />}
        </>
      ) : (
        <Readings b={b} withWarning />
      )}
    </div>
  )
}

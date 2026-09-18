import { useEffect, useState } from 'preact/hooks'
import { chooseAndLog, feedbackFor, recordFeedback, todaysLine } from './brainFlow'
import { copy } from './copy'
import { fill } from './format'
import { briefData, type LastNight, type YesterdayMove } from './forecastFlow'
import { useLive } from './live'
import { nameOf } from './offerFlow'
import { readingById } from './readings'

// The brief on Now. First the brain's line for the day: the Worker's when it wrote one, else the
// phone's own, chosen by the situation engine from the fact sheet and the library, with one tap
// under it that says how it landed. Then the lines none of the other screens carry: what last
// night carried against mornings like it, a stretch starting or steady, and yesterday's move as
// one reading. Counts and ranges, not claims.

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
  return fill(c.move, { name: nameOf(m.moveId, copy.move.nothing), arm: m.arm === 'done' ? copy.move.done : copy.extras.winOutcome.partly, target: readingById(m.target).name, steps, dir: m.effect >= 0 ? c.above : c.under })
}

/** The brain's line for the day, with one tap under it. Kept while its situation holds; looked at again whenever the screen opens or the record changes. */
function BrainLine({ day, version }: { day: string; version: number }) {
  const line = useLive(() => todaysLine(day), [day])
  const key = line?.key ?? null
  const fb = useLive(() => feedbackFor(key), [key])
  const [busy, setBusy] = useState(false)
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
      {fb === null ? (
        <div class="taps" role="group" aria-label={c.tapLabel}>
          <button type="button" class="when-chip" data-testid="brief-useful" onClick={() => void recordFeedback(day, line, 'useful')}>
            {c.useful}
          </button>
          <button type="button" class="when-chip" data-testid="brief-knew" onClick={() => void recordFeedback(day, line, 'knew')}>
            {c.knew}
          </button>
          <button type="button" class="when-chip" data-testid="brief-not" onClick={() => void recordFeedback(day, line, 'not')}>
            {c.not}
          </button>
        </div>
      ) : (
        fb && (
          <p class="note faint no-gap" data-testid="brief-noted">
            {c.noted}
          </p>
        )
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

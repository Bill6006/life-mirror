import { copy } from './copy'
import { fill } from './format'
import { briefData, type LastNight, type YesterdayMove } from './forecastFlow'
import { useLive } from './live'
import { nameOf } from './offerFlow'
import { readingById } from './readings'

// The brief on Now, three lines, none of them on any other screen in this form: what last night
// carried, set against the mornings after evenings like it; whether a stretch is starting, or
// steady; and what yesterday's move did, one reading, never a finding. Counts and ranges, not claims.

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

export function Brief({ day }: { day: string }) {
  const b = useLive(() => briefData(day), [day])
  const c = copy.brief
  if (!b) return null
  if (!b.ready) {
    return (
      <div class="card pad brief" data-testid="brief">
        <p class="eyebrow small">{c.title}</p>
        <p class="note no-gap" data-testid="brief-starts">
          {fill(c.starts, { d: String(b.days) })}
        </p>
      </div>
    )
  }
  const move = moveLine(b.move)
  return (
    <div class="card pad brief" data-testid="brief">
      <p class="eyebrow small">{c.title}</p>
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
    </div>
  )
}

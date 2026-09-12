import { copy } from './copy'
import { fill } from './format'
import { briefData } from './forecastFlow'
import { useLive } from './live'

// The morning brief on Now, three lines: today's shape by block as you usually are, yesterday's
// forecast beside what happened, and either the early warning (a conclusion, with its tier of
// evidence: a count) or the model that made the forecast. Ranges, never claims.

function rangeOf(f: { point: number; lo: number; hi: number } | null): string {
  if (!f) return '—'
  return `${f.point} (${fill(copy.brief.range, { lo: String(f.lo), hi: String(f.hi) })})`
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
  const [m, a, e] = b.today.map((t) => t.forecast)
  const y = b.yesterday
  return (
    <div class="card pad brief" data-testid="brief">
      <p class="eyebrow small">{c.title}</p>
      <div class="calc">
        <p class="calc-line ink" data-testid="brief-today">
          {fill(c.today, { m: rangeOf(m), a: rangeOf(a), e: rangeOf(e) })}
        </p>
        <p class="calc-line" data-testid="brief-yesterday">
          {y ? fill(c.yesterday, { expected: String(y.expected), actual: String(y.actual), result: y.hit ? c.hit : c.miss }) : c.yesterdayNone}
        </p>
      </div>
      {b.warning?.warning ? (
        <div class="conclusion" data-testid="brief-warning">
          <p class="calc-line ink">{fill(c.warning, { under: String(b.warning.under), of: String(b.warning.of), chips: String(b.warning.chips), necessities: String(b.warning.necessities) })}</p>
        </div>
      ) : (
        <p class="calc-line" data-testid="brief-model">
          {fill(c.model, { model: b.model ? c.models[b.model] : '—' })}
        </p>
      )}
      {b.whatIf !== null && <p class="note faint no-gap">{fill(c.whatIf, { v: String(b.whatIf) })}</p>}
    </div>
  )
}

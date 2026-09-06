import { useState } from 'preact/hooks'
import { blockAt, BLOCKS } from './blocks'
import { Heatmap, MiniTrace, PairBar, Trace } from './charts'
import { copy } from './copy'
import { allCheckIns } from './db'
import { fill, formatDayLong, weekdayInitial } from './format'
import { useLive } from './live'
import { readingById, type ReadingId } from './readings'
import { CONTEXT_IDS } from './score'
import { contextTrace, dayValues, heatmapRows, latestLogged, weekSeries } from './series'
import { MIN_SHARED, movesTogether } from './stats'

function signed(rho: number): string {
  const v = Math.round(rho * 100) / 100
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2)
}

/** Your own record, drawn. Every chart here is a calculation from the check-ins; each carries its caption. */
export function MirrorScreen() {
  const today = blockAt(new Date())
  const all = useLive(allCheckIns, [])
  const [overlayId, setOverlayId] = useState<ReadingId | null>(null)
  if (!all) return <section class="screen" />

  const todayVals = dayValues(all, today.day)
  const latest = latestLogged(todayVals)
  const overlay = overlayId ? contextTrace(all, today.day, overlayId) : null
  const week = weekSeries(all, today.day)
  const rows = heatmapRows(all, today.day)
  const pairs = movesTogether(all)
  const loggedToday = BLOCKS.filter((b) => todayVals.values[b] !== null).length
  const min = String(MIN_SHARED)

  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="eyebrow">{copy.tabs.mirror}</h1>
        <p class="date">{formatDayLong(today.day)}</p>
      </header>

      {all.length === 0 && <p class="note">{copy.mirror.empty}</p>}

      <h2 class="section">{copy.mirror.today}</h2>
      <div class="card chart-card">
        <Trace day={todayVals} overlay={overlay} latest={latest} />
        <ul class="chips overlay-chips" aria-label={copy.mirror.overlay}>
          <li>
            <button type="button" class={overlayId === null ? 'chip is-on' : 'chip'} aria-pressed={overlayId === null} onClick={() => setOverlayId(null)}>
              {copy.mirror.overlayNone}
            </button>
          </li>
          {CONTEXT_IDS.map((id) => (
            <li key={id}>
              <button type="button" class={overlayId === id ? 'chip is-on' : 'chip'} aria-pressed={overlayId === id} onClick={() => setOverlayId(id)}>
                {readingById(id).name}
              </button>
            </li>
          ))}
        </ul>
        <p class="calc-line caption">{fill(copy.mirror.todayCaption, { n: String(loggedToday) })}</p>
      </div>

      <h2 class="section">{copy.mirror.week}</h2>
      <div class="card chart-card">
        <div class="week">
          {week.map((d) => (
            <div key={d.day} class="week-day">
              <MiniTrace day={d} />
              <span class={d.day === today.day ? 'week-label is-today' : 'week-label'}>{weekdayInitial(d.day)}</span>
            </div>
          ))}
        </div>
        <p class="calc-line caption">{copy.mirror.weekCaption}</p>
      </div>

      <h2 class="section">{copy.mirror.heatmap}</h2>
      <div class="card chart-card">
        <Heatmap rows={rows} today={today.day} current={today.block} />
        <p class="calc-line caption">{fill(copy.mirror.heatCaption, { days: String(rows.length) })}</p>
      </div>

      <h2 class="section">{copy.mirror.together}</h2>
      <div class="card">
        <p class="note in-card together-note">{copy.mirror.togetherNote}</p>
        {pairs.length === 0 ? (
          <p class="note in-card faint">{fill(copy.mirror.togetherEmpty, { min })}</p>
        ) : (
          <ul class="rows">
            {pairs.slice(0, 10).map((p) => (
              <li key={`${p.a}-${p.b}`} class="row is-static">
                <span class="row-main">
                  {readingById(p.a).name} · {readingById(p.b).name}
                  <span class="sub">{fill(copy.mirror.shared, { n: String(p.n) })}</span>
                </span>
                <PairBar rho={p.rho} />
                <span class="row-side ink mono">{signed(p.rho)}</span>
              </li>
            ))}
          </ul>
        )}
        <p class="calc-line caption in-card">{fill(copy.mirror.togetherCaption, { min })}</p>
      </div>
    </section>
  )
}

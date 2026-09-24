import { useState } from 'preact/hooks'
import { blockAt, BLOCKS } from './blocks'
import { BEFORE_MIN, comesBefore, type BeforePair } from './beforeDays'
import { Heatmap, IntervalBar, MiniTrace, Trace } from './charts'
import { NavRow } from './controls'
import { copy } from './copy'
import { allCheckIns } from './db'
import { fill, weekdayInitial } from './format'
import { useLive } from './live'
import { readingById, type ReadingId } from './readings'
import { CONTEXT_IDS } from './score'
import { contextTrace, dayValues, heatmapRows, latestLogged, weekSeries } from './series'
import { Disclosure, ScreenHead, SectionLabel } from './ui'

const round = (v: number) => String(Math.round(v))
const signed = (v: number) => (Math.round(v) > 0 ? '+' : Math.round(v) < 0 ? '−' : '') + String(Math.abs(Math.round(v)))

/** One pair: the evening, then what the morning after read against like evenings, with its interval. */
function BeforeRow({ p, span }: { p: BeforePair; span: number }) {
  const c = copy.beforeDays
  const event = fill(c.event, { reading: readingById(p.reading).name.toLowerCase(), level: c[p.level] })
  if (!p.enough || p.diff === null || p.lo === null || p.hi === null) {
    return (
      <li class="before-row" data-testid="before-gathering">
        <span class="before-event">{event}</span>
        <span class="before-line">{fill(c.tooFew, { n: String(Math.min(p.withN, p.withoutN)), need: String(BEFORE_MIN) })}</span>
      </li>
    )
  }
  const dir = Math.round(p.diff) > 0 ? c.higher : Math.round(p.diff) < 0 ? c.lower : null
  return (
    <li class="before-row" data-testid="before-pair">
      <span class="before-event">{event}</span>
      <span class="before-line">
        {c.outcome} ·{' '}
        {dir ? fill(c.diff, { dir, points: round(Math.abs(p.diff)), n: String(p.withN), lo: signed(p.lo), hi: signed(p.hi) }) : fill(c.diffSame, { n: String(p.withN), lo: signed(p.lo), hi: signed(p.hi) })}
      </span>
      <IntervalBar lo={p.lo} hi={p.hi} est={p.diff} span={span} />
    </li>
  )
}

/** Your own record, drawn. Every chart here is a calculation from the check-ins; each carries its caption. */
export function MirrorScreen({ onWeekly }: { onWeekly: () => void }) {
  const today = blockAt(new Date())
  const all = useLive(allCheckIns, [])
  const [overlayId, setOverlayId] = useState<ReadingId | null>(null)
  if (!all) return <section class="screen" />

  const todayVals = dayValues(all, today.day)
  const latest = latestLogged(todayVals)
  const overlay = overlayId ? contextTrace(all, today.day, overlayId) : null
  const week = weekSeries(all, today.day)
  const rows = heatmapRows(all, today.day)
  const before = comesBefore(all, today.day)
  const shown = before.filter((p) => p.enough)
  const gathering = before.filter((p) => !p.enough)
  // Every interval on one axis, so the pairs can be read against each other.
  const span = Math.max(10, ...shown.flatMap((p) => [Math.abs(p.lo as number), Math.abs(p.hi as number)]))
  const loggedToday = BLOCKS.filter((b) => todayVals.values[b] !== null).length
  const c = copy.beforeDays
  const min = String(BEFORE_MIN)

  return (
    <section class="screen">
      <ScreenHead title={copy.tabs.mirror} day={today.day} />

      {all.length === 0 && <p class="note">{copy.mirror.empty}</p>}

      <div class="card">
        <ul class="rows">
          <NavRow label={copy.weekly.door} note={copy.weekly.doorNote} onClick={onWeekly} />
        </ul>
      </div>

      <SectionLabel index={0}>{copy.mirror.today}</SectionLabel>
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

      <SectionLabel index={1}>{copy.mirror.week}</SectionLabel>
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

      <SectionLabel index={2}>{copy.mirror.heatmap}</SectionLabel>
      <div class="card chart-card">
        <Heatmap rows={rows} today={today.day} current={today.block} />
        <p class="calc-line caption">{fill(copy.mirror.heatCaption, { days: String(rows.length) })}</p>
      </div>

      <SectionLabel index={3} testid="before-days">
        {c.title}
      </SectionLabel>
      <div class="card pad" data-testid="before-card">
        <p class="note together-note">{c.note}</p>
        {shown.length === 0 && <p class="note faint">{fill(c.empty, { need: min })}</p>}
        {shown.length > 0 && (
          <ul class="rows">
            {shown.map((p) => (
              <BeforeRow key={`${p.reading}-${p.level}`} p={p} span={span} />
            ))}
          </ul>
        )}
        {gathering.length > 0 && (
          <Disclosure label={fill(c.moreTooFew, { n: String(gathering.length) })} testid="before-gathering-more">
            <ul class="rows">
              {gathering.map((p) => (
                <BeforeRow key={`${p.reading}-${p.level}`} p={p} span={span} />
              ))}
            </ul>
          </Disclosure>
        )}
        <p class="calc-line caption">{fill(c.caption, { need: min })}</p>
      </div>
    </section>
  )
}

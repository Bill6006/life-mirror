import { useState } from 'preact/hooks'
import { blockAt } from './blocks'
import { WeekAhead } from './charts'
import { hasMove, moveById } from './catalogue'
import { copy } from './copy'
import { fill, formatDayShort } from './format'
import { lowestAhead } from './forecast'
import { weeklyData } from './forecastFlow'
import { useLive } from './live'
import { readingById } from './readings'

// Mirror → The weekly view: the scorecard, the week ahead, best-days, the gap, what moved, what
// lasts, catalogue health, and the extension prompt. Counts and calculations, each with what it
// rests on; best-days stays silent under its threshold and always says how many days it has.

const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v * 100)))
const num = (v: number | null, digits = 0) => (v === null ? '—' : v.toFixed(digits))
const steps = (v: number) => `${v > 0 ? '+' : ''}${(Math.round(v * 100) / 100).toFixed(2)}`

export function WeeklyScreen({ onClose }: { onClose: () => void }) {
  const today = blockAt(new Date()).day
  const w = useLive(() => weeklyData(today), [today])
  const [copied, setCopied] = useState(false)
  const c = copy.weekly
  if (!w) return <section class="screen" />
  const sc = w.scorecard
  const seconds = (ms: number | null) => (ms === null ? c.none : fill(c.seconds, { s: String(Math.round(ms / 1000)) }))

  return (
    <section class="screen catalogue" data-testid="weekly">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>

      <h2 class="section is-lead">{c.ahead}</h2>
      <div class="card pad is-chart" data-testid="week-ahead">
        {w.weekAheadReady ? (
          <>
            <div class="week-chart">
              <WeekAhead rows={w.weekAhead} />
            </div>
            <p class="note no-gap">{fill(c.aheadCaption, { day: formatDayShort(w.weekAhead[lowestAhead(w.weekAhead)].day) })}</p>
          </>
        ) : (
          <p class="note no-gap">{c.aheadNone}</p>
        )}
      </div>

      <h2 class="section">{c.baseline}</h2>
      {w.shift?.shifted ? (
        <div class="card pad">
          <div class="conclusion" data-testid="baseline-shift">
            <p class="calc-line ink">{fill(c.shifted, { since: formatDayShort(w.shift.since), before: String(w.shift.before.n), beforeMean: String(w.shift.before.mean), after: String(w.shift.after.n), afterMean: String(w.shift.after.mean), diff: String(w.shift.diff), t: String(Math.abs(w.shift.t)) })}</p>
          </div>
        </div>
      ) : (
        <div class="card pad">
          <p class="note no-gap" data-testid="baseline-steady">
            {w.shift ? fill(c.steady, { days: String(w.shift.days), t: String(Math.abs(w.shift.t)) }) : c.baselineNone}
          </p>
        </div>
      )}

      <h2 class="section">{c.scorecard}</h2>
      <div class="card pad">
        <div class="calc">
          <p class="calc-line" data-testid="hit-rate">
            {sc.scored ? fill(c.hitRate, { rate: pct(sc.hitRate), n: String(sc.scored), miss: num(sc.averageMiss, 1) }) : c.hitRateNone}
          </p>
          <p class="calc-line">{fill(c.declared, { declared: String(sc.declared), replicated: String(sc.replicated) })}</p>
          <p class="calc-line">{fill(c.gaveBack, { gaveBack: String(sc.gaveBack), all: String(sc.checkins) })}</p>
          <p class="calc-line">{fill(c.answering, { m: seconds(sc.medianAnswerMs.morning), a: seconds(sc.medianAnswerMs.afternoon), e: seconds(sc.medianAnswerMs.evening) })}</p>
        </div>
      </div>

      <h2 class="section">{c.best}</h2>
      <div class="card pad" data-testid="best-days">
        {w.best.silent ? (
          <p class="note no-gap" data-testid="best-silent">
            {fill(c.bestSilent, { days: String(w.best.days) })}
          </p>
        ) : (
          <>
            <p class="note">{fill(c.bestNote, { k: String(w.best.top.length), days: String(w.best.days) })}</p>
            <p class="move-meta">{c.control}</p>
            <div class="calc">
              {w.best.controlled.map((d) => (
                <p key={d.label} class="calc-line">
                  {fill(c.diffLine, { label: d.label, onBest: String(d.onBest), ofBest: String(d.ofBest), onOthers: String(d.onOthers), ofOthers: String(d.ofOthers) })}
                </p>
              ))}
            </div>
            <p class="move-meta">{c.notControl}</p>
            <div class="calc">
              {w.best.uncontrolled.map((d) => (
                <p key={d.label} class="calc-line">
                  {fill(c.diffLine, { label: d.label, onBest: String(d.onBest), ofBest: String(d.ofBest), onOthers: String(d.onOthers), ofOthers: String(d.ofOthers) })}
                </p>
              ))}
            </div>
          </>
        )}
      </div>

      <h2 class="section">{c.gapTitle}</h2>
      <div class="card pad">
        {w.gap.typical === null ? (
          <p class="note no-gap">{c.gapNone}</p>
        ) : (
          <div class="calc">
            <p class="calc-line ink">{fill(c.gapLine, { typical: num(w.gap.typical), good: num(w.gap.good), best: num(w.gap.best) })}</p>
            <p class="calc-line">{fill(c.gapOften, { often: pct(w.gap.howOften), days: String(w.gap.days), ago: num(w.gap.lastGoodDaysAgo) })}</p>
            <p class="calc-line">{c.gapAim}</p>
          </div>
        )}
      </div>

      <h2 class="section">{c.moved}</h2>
      <div class="card pad">
        {w.moved.reading.delta === null ? (
          <p class="note no-gap">{c.movedNone}</p>
        ) : (
          <div class="calc">
            <p class="calc-line ink">{fill(c.movedReading, { thisWeek: num(w.moved.reading.thisWeek), lastWeek: num(w.moved.reading.lastWeek), delta: steps(w.moved.reading.delta) })}</p>
            {w.moved.ingredients.map((m) => (
              <p key={m.reading} class="calc-line">
                {fill(c.movedLine, { reading: readingById(m.reading).name, delta: steps(m.delta as number) })}
              </p>
            ))}
          </div>
        )}
      </div>

      <h2 class="section">{c.lasts}</h2>
      <div class="card pad">
        <div class="calc">
          {w.lasts.decays.length === 0 ? (
            <p class="calc-line">{c.lastsNone}</p>
          ) : (
            w.lasts.decays.map((d) => (
              <p key={d.moveId} class="calc-line">
                {fill(c.lastsLine, { move: hasMove(d.moveId) ? moveById(d.moveId).name : d.moveId, days: String(d.daysHeld), runs: String(d.runs) })}
              </p>
            ))
          )}
          {w.lasts.byReward.map((r) => (
            <p key={r.reward} class="calc-line">
              {fill(c.rewardLine, { reward: copy.catalogue.tagNames[r.reward as keyof typeof copy.catalogue.tagNames] ?? r.reward, first: r.first ? steps(r.first.mean) : c.rewardNone, n: String(r.first?.n ?? 0), later: r.later ? steps(r.later.mean) : c.rewardNone, m: String(r.later?.n ?? 0) })}
            </p>
          ))}
        </div>
        <p class="note faint no-gap">{c.lastsNote}</p>
      </div>

      <h2 class="section">{c.health}</h2>
      <div class="card pad">
        <div class="calc">
          {w.health.map((h) => (
            <p key={h.family} class="calc-line" data-testid="family-health" data-reachable={h.reachable ? 'true' : 'false'}>
              {fill(c.healthLine, { name: h.name, live: String(h.live), offered: String(h.offered), done: String(h.done) })}
              {!h.reachable && ` · ${fill(c.unreachable, { blocker: copy.move.whyNotReasons[h.blocker as keyof typeof copy.move.whyNotReasons] ?? h.blocker ?? '' })}`}
            </p>
          ))}
        </div>
        <p class="note faint no-gap">{c.healthNote}</p>
      </div>

      <h2 class="section">{c.prompt}</h2>
      <p class="note">{c.promptNote}</p>
      <div class="card pad">
        <pre class="prompt" data-testid="weekly-prompt">
          {w.prompt}
        </pre>
        <div class="actions">
          <button
            type="button"
            class="pill-quiet"
            onClick={() => {
              void navigator.clipboard?.writeText(w.prompt).then(() => setCopied(true))
            }}
          >
            {copied ? c.copied : c.copy}
          </button>
        </div>
      </div>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

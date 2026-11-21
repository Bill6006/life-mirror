import { useState } from 'preact/hooks'
import { blockAt } from './blocks'
import { contextWords } from './people'
import { WeekAhead } from './charts'
import { flatWeek, type FlatWeek } from './forecast'
import { hasMove, moveById } from './catalogue'
import { copy } from './copy'
import { daysAgoWords, fill, formatDayShort } from './format'
import { weeklyData } from './forecastFlow'
import { useLive } from './live'
import { WeekReviewCard } from './weekReview'
import { Disclosure } from './ui'
import { readingById } from './readings'
import { standingLine } from './counted/words'
import type { Difference, Moved, Scorecard } from './weekly'
import { missingLines, missLines, togetherLine } from './honesty/words'
import { CHECK_LOOKS, CHECK_MIN_DAYS, type MovedCheck } from './movedCheck'
import { dayAndMonth } from './heldPairs'

// Mirror → The weekly view (final UI polish, 2026-09-26): the week ahead (its line, the graph, always
// shown, how often it lands, and its ranges and way under Details), the week reviewed, what moved this week, the baseline and the gap; then the
// deeper diagnostics, each closed until opened and nothing in it left out: best-days, the scorecard,
// what lasts, catalogue health, people around, and the extension prompt. Counts and calculations,
// each with what it rests on; best-days stays silent under its threshold and always says how many days it has.

const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v * 100)))
const num = (v: number | null, digits = 0) => (v === null ? '—' : v.toFixed(digits))
const steps = (v: number) => `${v > 0 ? '+' : ''}${(Math.round(v * 100) / 100).toFixed(2)}`

/**
 * A reading's move this week in its own direction, and which way that went (stage 1, item a): "Stress:
 * down 0.50 steps, better". The delta is kept with the helpful direction positive; the words never are.
 */
export function movedWords(m: Moved): string {
  const c = copy.weekly
  const reading = readingById(m.reading).name
  const raw = (m.thisWeek ?? 0) - (m.lastWeek ?? 0)
  if (Math.abs(raw) < 0.005) return fill(c.movedSame, { reading })
  return fill(c.movedLine, { reading, dir: raw > 0 ? c.movedUp : c.movedDown, steps: (Math.round(Math.abs(raw) * 100) / 100).toFixed(2), way: (m.delta ?? 0) > 0 ? c.movedBetter : c.movedWorse })
}

/** The week's range in plain words, whichever way it runs from tomorrow to a week out: never said to widen when it does not. */
export function aheadRangeLine(flat: Pick<FlatWeek, 'near' | 'far'>): string {
  const c = copy.weekly
  return flat.near.lo === flat.far.lo && flat.near.hi === flat.far.hi
    ? fill(c.aheadFlatRangeSame, { lo: String(flat.near.lo), hi: String(flat.near.hi) })
    : fill(c.aheadFlatRange, { lo: String(flat.near.lo), hi: String(flat.near.hi), lo2: String(flat.far.lo), hi2: String(flat.far.hi) })
}

/**
 * The moved forecasts beside the plain ones (Batch 3, 2026-11-21), under the Scorecard's hit rate, in the approved
 * contract's words and shape: until the first look, how many are scored and when they are first read; from a look, the
 * look's own counts, its two average misses, the verdict as written down beforehand, and what follows from it.
 */
export function movedCheckLines(m: MovedCheck): string[] {
  const c = copy.weekly.movedCheck
  const r = m.reading
  if (!r || m.verdict === null) return [fill(c.scored, { n: String(m.scored) }), fill(c.pending, { first: String(CHECK_LOOKS[0]), days: String(CHECK_MIN_DAYS) })]
  const n = String(r.n)
  const day = dayAndMonth(r.readOn)
  const after = m.verdict === 'watch' ? fill(c.watching, { day, next: String(m.next), now: String(m.scored) }) : m.verdict === 'keep' ? fill(c.kept, { day }) : fill(c.stopped, { day })
  return [fill(c.scored, { n }), fill(c.held, { a: String(r.held), b: String(r.plainHeld), n }), fill(c.miss, { x: r.miss.toFixed(1), y: r.plainMiss.toFixed(1) }), fill(c.verdict, { verdict: c.verdicts[m.verdict] }), after]
}

/** From how many scored day-ahead forecasts the week-ahead card says what was measured, and never before (2026-11-12). */
export const MEASURED_FROM = 20

/**
 * The small line under the week's graph (2026-11-12; item 8 of the forecast follow-ups, 2026-11-19). Until twenty
 * day-ahead forecasts are scored: when it will say how often they land. From then: how many of the forecasts made before
 * their check-ins landed inside their range, as counted. Never a rate that was not measured.
 */
export function rangeWords(sc: Pick<Scorecard, 'scored' | 'hitRate'>): string {
  const c = copy.weekly
  if (sc.scored < MEASURED_FROM || sc.hitRate === null) return c.modelPending
  return fill(c.modelMeasured, { n: String(sc.scored), hits: String(Math.round(sc.hitRate * sc.scored)), rate: pct(sc.hitRate) })
}

/** Under Details, until twenty day-ahead forecasts are scored: how the range is built. From then nothing: the line under the graph says what was counted. */
export function sizedWords(sc: Pick<Scorecard, 'scored' | 'hitRate'>): string | null {
  return sc.scored < MEASURED_FROM || sc.hitRate === null ? copy.weekly.modelBuilt : null
}

/** The week's range a day out and at its far end, from its own days: the first and the last with a forecast. */
export function weekRanges(rows: readonly { expected: number | null; lo: number | null; hi: number | null }[]): Pick<FlatWeek, 'near' | 'far'> | null {
  const known = rows.filter((r): r is { expected: number; lo: number; hi: number } => r.expected !== null && r.lo !== null && r.hi !== null)
  if (!known.length) return null
  const first = known[0]
  const last = known[known.length - 1]
  return { near: { lo: first.lo, hi: first.hi }, far: { lo: last.lo, hi: last.hi } }
}

/** One condition of best days: its counts on the best days and on the others, then where it stands, in the standard's own words. */
function BestLine({ d, family }: { d: Difference; family: number }) {
  return (
    <p class="calc-line" data-testid="best-line">
      {fill(copy.weekly.diffLine, { label: d.label, onBest: String(d.onBest), ofBest: String(d.ofBest), onOthers: String(d.onOthers), ofOthers: String(d.ofOthers) })}
      {' '}
      {/* Its standing on a line of its own, so the words are never broken across the counts (seen on the screen, 2026-11-12). */}
      <span class="before-line best-standing" data-testid="best-standing">
        {standingLine({ standing: d.standing, family })}
      </span>
    </p>
  )
}

export function WeeklyScreen({ onClose }: { onClose: () => void }) {
  const today = blockAt(new Date()).day
  const w = useLive(() => weeklyData(today), [today])
  const [copied, setCopied] = useState(false)
  const c = copy.weekly
  if (!w) return <section class="screen" />
  const sc = w.scorecard
  const flat = w.weekAheadReady ? flatWeek(w.weekAhead, w.model) : null
  const ranges = weekRanges(w.weekAhead)
  const sized = sizedWords(sc)
  const seconds = (ms: number | null) => (ms === null ? c.none : fill(c.seconds, { s: String(Math.round(ms / 1000)) }))

  return (
    <section class="screen catalogue" data-testid="weekly">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>

      <h2 class="section">{c.ahead}</h2>
      <div class="card pad" data-testid="week-ahead">
        {w.weekAheadReady ? (
          <>
            {/* Days with no meaningful difference: said as one level first (the final checklist, item 3). Then the graph,
                always shown, how often its forecasts land, and under Details, closed until opened, its ranges and its way
                (the forecast follow-ups, item 8, 2026-11-19). */}
            {flat && (
              <p class="ink no-gap" data-testid="week-ahead-summary">
                {fill(flat.why === 'blind' ? c.aheadFlatBlind : c.aheadFlatNone, { level: String(flat.level) })}
              </p>
            )}
            <div class="week-chart">
              <WeekAhead rows={w.weekAhead} low={w.weekAheadLow} />
            </div>
            {w.model && (
              <p class="note no-gap" data-testid="week-ahead-rate">
                {rangeWords(sc)}
              </p>
            )}
            <Disclosure label={copy.disclose.details} testid="week-ahead-details" class="week-ahead-details">
              <div class="calc">
                {ranges && (
                  <p class="calc-line" data-testid="week-ahead-range">
                    {aheadRangeLine(ranges)}
                  </p>
                )}
                {w.model && (
                  <p class="calc-line" data-testid="week-ahead-model">
                    {fill(c.model, { model: copy.brief.models[w.model] })}
                    {!flat && w.weekAheadAlike && ` ${c.aheadAlike}`}
                  </p>
                )}
                {w.model && sized && (
                  <p class="calc-line" data-testid="week-ahead-sized">
                    {sized}
                  </p>
                )}
              </div>
            </Disclosure>
          </>
        ) : (
          <p class="note no-gap">{c.aheadNone}</p>
        )}
      </div>

      <WeekReviewCard day={today} />

      <h2 class="section">{c.moved}</h2>
      <div class="card pad">
        {w.moved.reading.delta === null ? (
          <p class="note no-gap">{c.movedNone}</p>
        ) : (
          <div class="calc">
            <p class="calc-line ink">{fill(c.movedReading, { thisWeek: num(w.moved.reading.thisWeek), lastWeek: num(w.moved.reading.lastWeek), delta: steps(w.moved.reading.delta) })}</p>
            {w.moved.ingredients.map((m) => (
              <p key={m.reading} class="calc-line">
                {movedWords(m)}
              </p>
            ))}
          </div>
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

      <h2 class="section">{c.gapTitle}</h2>
      <div class="card pad">
        {w.gap.typical === null ? (
          <p class="note no-gap">{c.gapNone}</p>
        ) : (
          <div class="calc">
            <p class="calc-line ink">{fill(c.gapLine, { typical: num(w.gap.typical), good: num(w.gap.good), best: num(w.gap.best) })}</p>
            <p class="calc-line">{fill(c.gapOften, { often: pct(w.gap.howOften), days: String(w.gap.days), ago: w.gap.lastGoodDaysAgo === null ? '—' : daysAgoWords(w.gap.lastGoodDaysAgo, copy.when) })}</p>
            <p class="calc-line">{c.gapAim}</p>
          </div>
        )}
      </div>

      {/* The deeper diagnostics: each closed until opened, with everything in it (final UI polish, 2026-09-26). */}
      <h2 class="section" data-testid="weekly-deeper">
        {c.deeper}
      </h2>
      <Disclosure label={c.best} testid="weekly-best">
        <div class="card pad" data-testid="best-days">
          {w.best.failed ? (
            <p class="note no-gap" data-testid="best-failed">
              {c.bestFailed}
            </p>
          ) : w.best.silent ? (
            <p class="note no-gap" data-testid="best-silent">
              {fill(c.bestSilent, { days: String(w.best.days) })}
            </p>
          ) : (
            <>
              <p class="note">{fill(c.bestNote, { k: String(w.best.top.length), days: String(w.best.days) })}</p>
              <p class="note faint" data-testid="best-rule">
                {w.best.family === 0 ? fill(c.bestTooFew, { k: String(w.best.top.length) }) : fill(c.bestRule, { family: String(w.best.family) })}
              </p>
              <p class="move-meta">{c.control}</p>
              <div class="calc">
                {w.best.controlled.length === 0 && (
                  <p class="calc-line" data-testid="best-control-none">
                    {c.controlNone}
                  </p>
                )}
                {w.best.controlled.map((d) => (
                  <BestLine key={d.label} d={d} family={w.best.family} />
                ))}
              </div>
              {w.best.own && w.best.own.length > 0 && (
                <>
                  <p class="move-meta">{c.own}</p>
                  <div class="calc" data-testid="best-own">
                    {w.best.own.map((d, i) => (
                      <BestLine key={i} d={d} family={w.best.family} />
                    ))}
                  </div>
                </>
              )}
              <p class="move-meta">{c.notControl}</p>
              <div class="calc">
                {w.best.uncontrolled.length === 0 && (
                  <p class="calc-line" data-testid="best-not-control-none">
                    {c.notControlNone}
                  </p>
                )}
                {w.best.uncontrolled.map((d) => (
                  <BestLine key={d.label} d={d} family={w.best.family} />
                ))}
              </div>
            </>
          )}
        </div>
      </Disclosure>

      <Disclosure label={c.scorecard} testid="weekly-scorecard">
        <div class="card pad">
          <div class="calc">
            <p class="calc-line" data-testid="hit-rate">
              {sc.scored ? fill(c.hitRate, { rate: pct(sc.hitRate), n: String(sc.scored), miss: num(sc.averageMiss, 1) }) : c.hitRateNone}
            </p>
            {/* Batch 3 (2026-11-21): the forecasts the challenger moved, set beside the plain ones, read by the rule frozen beforehand. */}
            {movedCheckLines(w.movedCheck).map((line) => (
              <p key={line} class="calc-line" data-testid="moved-check">
                {line}
              </p>
            ))}
            {/* The learning engine's own count (stage R7), or that it could not read the record. */}
            <p class="calc-line" data-testid="scorecard-tests">{sc.repair ? fill(c.declaredRepair, { underWay: String(sc.repair.underWay), resolved: String(sc.repair.resolved), held: String(sc.repair.held) }) : copy.repairEvidence.failedNow}</p>
            <p class="calc-line">{fill(c.gaveBack, { gaveBack: String(sc.gaveBack), all: String(sc.checkins) })}</p>
            <p class="calc-line">{fill(c.answering, { m: seconds(sc.medianAnswerMs.morning), a: seconds(sc.medianAnswerMs.afternoon), e: seconds(sc.medianAnswerMs.evening) })}</p>
          </div>
        </div>
      </Disclosure>

      {/* The honesty checks the record runs on itself (stage R7), among the diagnostics: readings that move together this
          month, where the forecast misses, and whether what goes missing follows how you were. How things moved, never why. */}
      <Disclosure label={copy.honesty.title} testid="weekly-honesty">
        <div class="card pad" data-testid="honesty">
          <p class="note faint">{copy.honesty.note}</p>
          <div class="calc">
            {w.checks.together.length === 0 ? (
              <p class="calc-line" data-testid="honesty-together">
                <span class="calc-key">{copy.honesty.togetherTitle}</span> · {copy.honesty.togetherNone}
              </p>
            ) : (
              w.checks.together.map((p) => (
                <p key={p.key} class="calc-line" data-testid="honesty-together">
                  <span class="calc-key">{copy.honesty.togetherTitle}</span> · {togetherLine(p)} {copy.honesty.togetherWhere}
                </p>
              ))
            )}
            {missLines(w.checks.misses).map((line) => (
              <p key={line} class="calc-line" data-testid="honesty-misses">
                <span class="calc-key">{copy.honesty.missesTitle}</span> · {line}
              </p>
            ))}
            <p class="calc-line" data-testid="honesty-missing">
              <span class="calc-key">{copy.honesty.missingTitle}</span> · {missingLines(w.checks.missing).join(' ')}
            </p>
          </div>
        </div>
      </Disclosure>

      <Disclosure label={c.lasts} testid="weekly-lasts">
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
      </Disclosure>

      <Disclosure label={c.health} testid="weekly-health">
        <div class="card pad">
          <div class="calc">
            {w.health.map((h) => (
              <p key={h.family} class="calc-line" data-testid="family-health" data-reachable={h.reachable ? 'true' : 'false'}>
                {fill(c.healthLine, { name: h.name, live: String(h.live), offered: String(h.offered), done: String(h.done) })}
                {h.dead.length > 0 && ` · ${fill(c.deadLine, { moves: h.dead.map((d) => `${d.name} (${copy.move.whyNotReasons[d.blocker as keyof typeof copy.move.whyNotReasons] ?? d.blocker})`).join('; ') })}`}
                {!h.reachable && ` · ${fill(c.unreachable, { blocker: copy.move.whyNotReasons[h.blocker as keyof typeof copy.move.whyNotReasons] ?? h.blocker ?? '' })}`}
              </p>
            ))}
          </div>
          <p class="note faint no-gap">{c.healthNote}</p>
        </div>
      </Disclosure>

      <Disclosure label={copy.people.healthTitle} testid="weekly-people">
        <div class="card pad" data-testid="people-health">
          <div class="calc">
            {w.people.length === 0 && <p class="calc-line">{copy.people.healthNone}</p>}
            {w.people.map((p) => (
              <p key={`${p.kind}|${p.block}`} class="calc-line">
                {fill(w.pathOn ? copy.people.uncoveredPath : copy.people.uncovered, { context: contextWords(p.kind, p.block), times: p.n === 1 ? copy.people.once : fill(copy.people.times, { n: String(p.n) }) })}
              </p>
            ))}
          </div>
        </div>
      </Disclosure>

      <Disclosure label={c.prompt} testid="weekly-extension">
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
      </Disclosure>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

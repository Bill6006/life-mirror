import { blockAt } from './blocks'
import { PathEvidence } from './pathEvidence'
import { CaffeineEvidenceCard } from './caffeineEvidence'
import { hasMove, moveById } from './catalogue'
import { copy } from './copy'
import { fill, formatDayShort, formatWhen } from './format'
import { evidence, type CardEvidence } from './learningFlow'
import { useLive } from './live'
import { NOTHING } from './offers'
import { readingById } from './readings'
import { MIN_PER_ARM } from './tiers'
import { HARD_MEASURES } from './workouts'
import { allCheckIns, db, getSettings } from './db'
import { ownChipAnswer } from './ownChips'
import { ownChipsOf } from './settings'
import type { Association } from './associations'
import { WEATHER_CREDIT_URL, weatherEvidence } from './weather'

// Moves → Evidence: every active card with its tier, counts and interval; what the tags have
// learned; the weight card; the observational associations; and the plain line about months
// and uncertainty. Every number carries its register: facts plain, calculations behind a single
// rule, conclusions behind a double rule with their tier.

function steps(x: number): string {
  const r = Math.round(x * 100) / 100
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}`
}

const pctOf = (v: number | null) => (v === null ? '—' : String(Math.round(v)))

function nameOf(id: string): string {
  if (id === NOTHING) return copy.move.nothing
  if (id === 'equal') return copy.evidence.equalWeights
  return hasMove(id) ? moveById(id).name : id
}

function CardBlock({ e }: { e: CardEvidence }) {
  const c = copy.evidence
  const { card, stats } = e
  const target = readingById(card.target).name
  const window = copy.catalogue.windows[card.window as keyof typeof copy.catalogue.windows] ?? card.window
  const origin = card.origin && card.origin !== 'app' ? c.origins[card.origin as keyof typeof c.origins] : null
  return (
    <li class="move" data-testid="evidence-card" data-tier={stats.tier}>
      <h3 class="move-name">{fill(c.against, { move: nameOf(card.moveId), alternative: nameOf(card.alternativeId) })}</h3>
      <p class="move-meta">
        {fill(c.forTarget, { target, window })}
        {origin && ` · ${origin}`}
      </p>
      <div class="conclusion" data-testid="tier">
        <p class="calc-line ink">{c.tiers[stats.tier]}</p>
        {e.association ? (
          <>
            <p class="calc-line" data-testid="passive-association">
              {fill(c.passiveLine, { n: String(e.association.times), target, with: pctOf(e.association.withEvent.mean), without: pctOf(e.association.without.mean), k: String(e.association.withEvent.n), m: String(e.association.without.n) })}
            </p>
            <p class="calc-line">{c.associationNote}</p>
          </>
        ) : (
          <>
        <p class="calc-line">{fill(c.counts, { done: String(stats.n.done), doneAll: String(stats.n.doneAll), alternative: String(stats.n.alternative), alternativeAll: String(stats.n.alternativeAll) })}</p>
        {stats.interval && (
          <p class="calc-line">{fill(c.interval, { diff: steps(stats.interval.diff), lo: steps(stats.interval.lo), hi: steps(stats.interval.hi), level: String(Math.round(stats.interval.level * 100)) })}</p>
        )}
        {stats.estimator && (
          <p class="calc-line" data-testid="estimator">
            {c.estimators[stats.estimator]}
          </p>
        )}
        {stats.estimator === 'adaptive' && stats.slice && <p class="calc-line">{fill(c.sliceLine, { done: String(stats.n.done), alternative: String(stats.n.alternative), diff: steps(stats.slice.diff), lo: steps(stats.slice.lo), hi: steps(stats.slice.hi) })}</p>}
        {(card.origin === 'signFlip' || card.origin === 'import') && !(stats.n.done >= MIN_PER_ARM && stats.n.alternative >= MIN_PER_ARM) && <p class="calc-line">{c.scheduled}</p>}
        {stats.declared && (
          <p class="calc-line">
            {fill(c.declared, { date: formatDayShort(stats.declared.at), done: String(stats.replication?.done ?? 0), alternative: String(stats.replication?.alternative ?? 0) })} · {stats.replication?.holds ? c.replicated : c.notReplicated}
          </p>
        )}
          </>
        )}
      </div>
      <div class="calc">
        {stats.partlyMean !== null && <p class="calc-line">{fill(c.partly, { mean: steps(stats.partlyMean), n: String(stats.n.partly) })}</p>}
        {e.belief && (
          <p class="calc-line">
            {fill(c.research, { mean: steps(e.belief.research.mean) })} · {e.belief.record ? fill(c.record, { mean: steps(e.belief.record.mean), n: String(Math.round(e.belief.record.n * 10) / 10) }) : c.noRecord}
          </p>
        )}
        {e.energy && <p class="calc-line">{fill(c.energy, { mean: steps(e.energy.mean), n: String(e.energy.n) })}</p>}
        {e.spill.length > 0 && <p class="calc-line">{fill(c.spill, { list: e.spill.map((s) => fill(c.spillItem, { reading: readingById(s.reading as never).name, mean: steps(s.mean), n: String(s.n) })).join(', ') })}</p>}
        {e.decay && <p class="calc-line">{fill(c.decay, { days: String(e.decay.daysHeld), runs: String(e.decay.runs) })}</p>}
      </div>
      <p class="move-source">{fill(c.card, { id: String(card.id), date: formatWhen(card.createdAt) })}</p>
    </li>
  )
}

/**
 * Your own chips (stage 3, item 5), each by its label, answered from your record like for like as the built-in chips are:
 * the mornings after evenings that showed it and carried it, against those that showed it and started the same. Read here
 * on the phone alone: nothing of it goes to the day's sheet.
 */
function OwnChipsEvidence({ today }: { today: string }) {
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  if (!settings || !all) return null
  const own = ownChipsOf(settings)
  if (own.length === 0) return null
  const c = copy.evidence
  return (
    <>
      <h2 class="section">{c.ownTitle}</h2>
      <div class="card pad">
        <div class="calc">
          {own.map((ch) => {
            const a = ownChipAnswer(all, ch.id, today)
            const n = a.times === 1 ? c.oneEvening : fill(c.nEvenings, { n: String(a.times) })
            const line =
              a.times === 0
                ? fill(c.ownNone, { label: ch.label })
                : a.withEvent.mean === null
                  ? fill(c.ownNoNext, { label: ch.label, n })
                  : a.without.mean === null
                    ? fill(c.ownUnmatched, { label: ch.label, n, with: pctOf(a.withEvent.mean), k: String(a.withEvent.n) })
                    : fill(c.ownLine, { label: ch.label, n, with: pctOf(a.withEvent.mean), without: pctOf(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
            return (
              <p key={ch.id} class="calc-line" data-testid="own-chip-evidence">
                {line}
              </p>
            )
          })}
        </div>
        <p class="note faint no-gap">{c.associationNote}</p>
      </div>
    </>
  )
}

/** A like-for-like difference in points on the reading out of 100, said whole against the other side. */
function diffWords(a: Association, other: string): string {
  const c = copy.evidence
  const d = Math.round(a.diff ?? 0)
  if (d === 0) return fill(c.noDifferent, { other })
  const n = String(Math.abs(d))
  return d > 0 ? fill(d === 1 ? c.pointHigher : c.pointsHigher, { n, other }) : fill(d === -1 ? c.pointLower : c.pointsLower, { n, other })
}

/**
 * The weather (stage 3, item 6), while its switch is on and once 14 days hold it: rainy days against dry ones and sunnier
 * against greyer, each the evening's reading like for like on the morning's band, with Open-Meteo's credit beside it.
 */
function WeatherEvidence({ today }: { today: string }) {
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const days = useLive(() => db.days.toArray(), [])
  if (!settings?.weather.on || !all || !days) return null
  const ev = weatherEvidence(all, days, today)
  if (!ev) return null
  const c = copy.evidence
  const compared = (a: Association, other: string) => (a.diff === null ? c.weatherNotComparable : fill(c.weatherDiff, { diff: diffWords(a, other), k: String(a.withEvent.n), m: String(a.without.n) }))
  return (
    <>
      <h2 class="section">{c.weatherTitle}</h2>
      <div class="card pad">
        <div class="calc">
          <p class="calc-line" data-testid="weather-rain-line">
            {fill(c.weatherRain, { n: String(ev.rainy), days: String(ev.days) })} {compared(ev.rain, c.otherDry)}
          </p>
          <p class="calc-line" data-testid="weather-sun-line">
            {fill(c.weatherSun, { n: String(ev.sunnier), days: String(ev.shared) })} {compared(ev.sun, c.otherGrey)}
          </p>
        </div>
        <p class="note faint no-gap">
          {c.associationNote}{' '}
          <a class="credit" href={WEATHER_CREDIT_URL} target="_blank" rel="noopener noreferrer" data-testid="weather-evidence-credit">
            {copy.weather.credit}
          </a>
        </p>
      </div>
    </>
  )
}

export function EvidenceScreen({ onClose }: { onClose: () => void }) {
  const today = blockAt(new Date()).day
  const ev = useLive(() => evidence(today), [today])
  const c = copy.evidence
  if (!ev) return <section class="screen" />
  const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v)))

  return (
    <section class="screen catalogue" data-testid="evidence">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
        <p class="date">{fill(c.observationsLine, { n: String(ev.observations), weeks: String(ev.weeks) })}</p>
      </header>
      <p class="note">{c.intro}</p>
      <p class="note faint">{c.register}</p>
      <p class="note faint">{copy.movesTab.tiersNote}</p>

      <h2 class="section">{c.cards}</h2>
      {ev.cards.length === 0 ? (
        <p class="note">{c.none}</p>
      ) : (
        <div class="card">
          <ul class="moves">
            {ev.cards.map((e) => (
              <CardBlock key={e.card.id} e={e} />
            ))}
          </ul>
        </div>
      )}

      <PathEvidence />

      <h2 class="section">{c.nothingTitle}</h2>
      <div class="card pad">
        <div class="calc">
          <p class="calc-line" data-testid="nothing-line">
            {fill(c.nothingLine, { offered: String(ev.nothing.offered), done: String(ev.nothing.done), skipped: String(ev.nothing.skipped) })}
          </p>
        </div>
      </div>

      <h2 class="section">{c.tagsTitle}</h2>
      <div class="card pad">
        <div class="calc">
          {ev.tags.map((t) => (
            <p key={t.id} class="calc-line">
              {fill(c.tagLine, { name: copy.catalogue.tagNames[t.id as keyof typeof copy.catalogue.tagNames] ?? t.id, research: steps(t.research.mean), record: t.record ? steps(t.record.mean) : c.tagNone, n: String(Math.round((t.record?.n ?? 0) * 10) / 10) })}
            </p>
          ))}
        </div>
      </div>

      <h2 class="section">{c.weights}</h2>
      <div class="card pad">
        {ev.weightCards.length === 0 ? (
          <p class="note no-gap">{c.weightsNone}</p>
        ) : (
          ev.weightCards.map(({ card, stats }) => (
            <div key={card.id} class="conclusion" data-testid="weight-card">
              <p class="calc-line ink">{c.tiers[stats.tier]}</p>
              <p class="calc-line">
                {fill(c.weightLine, { equal: stats.errorEqual.toFixed(1), weighted: stats.errorWeighted.toFixed(1), diff: stats.interval ? stats.interval.diff.toFixed(1) : '—', lo: stats.interval ? stats.interval.lo.toFixed(1) : '—', hi: stats.interval ? stats.interval.hi.toFixed(1) : '—', n: String(stats.n) })}
              </p>
              <p class="calc-line">{Object.entries(card.weights ?? {}).map(([id, w]) => `${readingById(id as never).name} ${w}`).join(' · ')}</p>
            </div>
          ))
        )}
        <p class="note faint no-gap">{c.weightNote}</p>
      </div>

      {(ev.coolingOff || ev.bigSocial || ev.heavyCaffeine || ev.workouts) && (
        <>
          <h2 class="section">{c.eventsTitle}</h2>
          <div class="card pad">
            <div class="calc">
              {ev.coolingOff && (
                <p class="calc-line" data-testid="cooling-off-line">
                  <span class="calc-key">{c.coolingTitle}</span> ·{' '}
                  {fill(c.coolingLine, { n: String(ev.coolingOff.association.times), with: pct(ev.coolingOff.association.withEvent.mean), without: pct(ev.coolingOff.association.without.mean), blocks: ev.coolingOff.duration ? String(ev.coolingOff.duration.blocks) : '—', events: String(ev.coolingOff.duration?.events ?? 0) })}
                </p>
              )}
              {ev.bigSocial && (
                <p class="calc-line" data-testid="big-social-line">
                  <span class="calc-key">{c.socialTitle}</span> · {fill(c.socialLine, { n: String(ev.bigSocial.times), with: pct(ev.bigSocial.withEvent.mean), without: pct(ev.bigSocial.without.mean) })}
                </p>
              )}
              {ev.heavyCaffeine && (
                <p class="calc-line" data-testid="caffeine-line">
                  <span class="calc-key">{c.caffeineTitle}</span> · {fill(c.caffeineLine, { n: String(ev.heavyCaffeine.times), with: pct(ev.heavyCaffeine.withEvent.mean), without: pct(ev.heavyCaffeine.without.mean) })}
                </p>
              )}
              {ev.workouts && (
                <p class="calc-line" data-testid="workout-line">
                  <span class="calc-key">{c.workoutTitle}</span> · {fill(c.workoutLine, { n: String(ev.workouts.times), with: pct(ev.workouts.withEvent.mean), without: pct(ev.workouts.without.mean) })}
                </p>
              )}
              {ev.eveningWorkout && (
                <p class="calc-line" data-testid="evening-workout-line">
                  <span class="calc-key">{c.eveningWorkoutTitle}</span> ·{' '}
                  {fill(c.eveningWorkoutLine, { n: ev.eveningWorkout.morning.times === 1 ? c.oneEvening : fill(c.nEvenings, { n: String(ev.eveningWorkout.morning.times) }), with: pct(ev.eveningWorkout.morning.withEvent.mean), without: pct(ev.eveningWorkout.morning.without.mean), sleepWith: pct(ev.eveningWorkout.sleep.withEvent.mean), sleepWithout: pct(ev.eveningWorkout.sleep.without.mean) })}
                </p>
              )}
              {ev.hardWorkout && (
                <p class="calc-line" data-testid="hard-workout-line">
                  <span class="calc-key">{c.hardWorkoutTitle}</span> ·{' '}
                  {fill(c.hardWorkoutLine, {
                    n: ev.hardWorkout.times === 1 ? c.oneDay : fill(c.nDays, { n: String(ev.hardWorkout.times) }),
                    list: HARD_MEASURES.map((id) => {
                      const d = ev.hardWorkout?.measures[id].diff ?? null
                      return fill(c.hardWorkoutItem, { reading: readingById(id).name.toLowerCase(), diff: d === null ? c.notComparable : `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}` })
                    }).join(', '),
                  })}
                </p>
              )}
            </div>
            <p class="note faint no-gap">{c.associationNote}</p>
          </div>
        </>
      )}

      <OwnChipsEvidence today={today} />

      <WeatherEvidence today={today} />

      <CaffeineEvidenceCard ev={ev.caffeine} />

      <h2 class="section">{c.privates}</h2>
      <div class="card pad">
        {ev.privates.length === 0 ? (
          <p class="note no-gap">{c.privateOff}</p>
        ) : (
          <div class="calc">
            {ev.privates.map((p) => (
              <p key={`${p.itemId}|${p.block}`} class="calc-line" data-testid="private-association">
                {fill(c.privateLine[p.block], { name: p.name, with: pct(p.association.withEvent.mean), without: pct(p.association.without.mean), n: String(p.association.withEvent.n), m: String(p.association.without.n), alternative: nameOf(p.alternativeId) })}
              </p>
            ))}
            <p class="calc-line">{c.associationNote}</p>
          </div>
        )}
      </div>

      <h2 class="section">{c.brings}</h2>
      <div class="card pad">
        {ev.bringsYouBack.length === 0 ? (
          <p class="note no-gap">{c.bringsNone}</p>
        ) : (
          <div class="calc">
            {ev.bringsYouBack.slice(0, 5).map((b) => (
              <p key={b.moveId} class="calc-line">
                {fill(c.bringsLine, { move: nameOf(b.moveId), n: String(b.n) })}
              </p>
            ))}
          </div>
        )}
      </div>

      <p class="note faint">{c.months}</p>
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

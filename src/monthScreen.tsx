import { blockAt } from './blocks'
import { activeAims, allIntentions, liveSkills } from './aimFlow'
import { hasMove, moveById } from './catalogue'
import { NavRow } from './controls'
import { copy } from './copy'
import { allCheckIns, db, getSettings, type Aim } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { firstReviewDay, monthAgoToday, monthReview, MONTH_MIN_ANSWERS, MONTH_MIN_DAYS, type MonthAgoDay, type MonthReview } from './month'
import { readingById } from './readings'
import { SubHead } from './ui'

// Mirror → The month, and Mirror's look back at a month ago today (stage 3, group 4). From the record
// alone, no model: counts and averages, each with what it rests on; nothing grades.

/** A commitment by its name, or a practice or a person by its step, as its card shows it. */
function nameOf(aim: Aim): string {
  return aim.name ?? (aim.stepMoveId && hasMove(aim.stepMoveId) ? moveById(aim.stepMoveId).name : copy.aims.kinds[aim.kind])
}

/** Everything the month's review reads, in one go. */
async function monthData(today: string): Promise<{ review: MonthReview | null; first: string | null }> {
  const [checkins, aims, skills, intentions, outside, settings, offers, outcomes] = await Promise.all([allCheckIns(), activeAims(), liveSkills(), allIntentions(), db.outside.toArray(), getSettings(), db.offers.toArray(), db.outcomes.toArray()])
  const first = checkins.reduce<string | null>((f, c) => (f === null || c.day < f ? c.day : f), null)
  return { review: monthReview(today, { checkins, offers, outcomes, aims, skills, intentions, outside, hideFaith: settings.hideFaith, nameOf }), first }
}

/** The day a month back, when the record holds anything of it. */
export async function monthAgoData(today: string): Promise<MonthAgoDay | null> {
  const [checkins, offers, outcomes, outside, settings] = await Promise.all([allCheckIns(), db.offers.toArray(), db.outcomes.toArray(), db.outside.toArray(), getSettings()])
  return monthAgoToday(today, checkins, { offers, outcomes, hideFaith: settings.hideFaith }, outside)
}

/** The month's name as the screen says it: "September 2026". */
function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1, 12).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export function MonthScreen({ onWords, onClose }: { onWords: () => void; onClose: () => void }) {
  const today = blockAt(new Date()).day
  const data = useLive(() => monthData(today), [today])
  const c = copy.month
  if (!data) return <section class="screen" />
  const r = data.review
  return (
    <section class="screen" data-testid="month">
      <SubHead title={c.title} back={copy.tabs.mirror} onBack={onClose} />
      <p class="note">{c.note}</p>
      {!r ? (
        <p class="note" data-testid="month-none">
          {fill(c.none, { day: formatDayShort(firstReviewDay(data.first ?? today)) })}
        </p>
      ) : (
        <>
          <h2 class="section" data-testid="month-name">
            {monthName(r.month)}
          </h2>
          {r.from && <p class="note faint">{fill(c.from, { day: formatDayShort(r.from) })}</p>}
          <div class="card pad">
            <div class="calc" data-testid="month-reading">
              <p class="calc-line">{fill(c.checkins, { n: String(r.checkins.completed), days: String(r.checkins.days), of: String(r.days) })}</p>
              {r.reading.mean === null ? (
                <p class="calc-line">{fill(c.readingFew, { min: String(MONTH_MIN_DAYS), days: String(r.reading.days) })}</p>
              ) : (
                <>
                  <p class="calc-line ink">{fill(c.reading, { mean: String(r.reading.mean), days: String(r.reading.days) })}</p>
                  {r.reading.before && <p class="calc-line">{fill(c.readingBefore, { mean: String(r.reading.before.mean), days: String(r.reading.before.days) })}</p>}
                  {r.reading.high && r.reading.low && <p class="calc-line">{fill(c.highLow, { high: String(r.reading.high.value), highDay: formatDayShort(r.reading.high.day), low: String(r.reading.low.value), lowDay: formatDayShort(r.reading.low.day) })}</p>}
                </>
              )}
            </div>
          </div>

          <h2 class="section">{c.movedTitle}</h2>
          <div class="card pad">
            <div class="calc" data-testid="month-moved">
              {r.moved.length === 0 ? (
                <p class="calc-line">{fill(c.movedNone, { min: String(MONTH_MIN_ANSWERS) })}</p>
              ) : (
                r.moved.map((m) => {
                  const raw = Math.round((m.thisMonth - m.before) * 100) / 100
                  const reading = readingById(m.reading).name
                  return (
                    <p key={m.reading} class="calc-line">
                      {raw === 0 ? fill(c.movedSame, { reading }) : fill(c.movedLine, { reading, dir: raw > 0 ? copy.weekly.movedUp : copy.weekly.movedDown, steps: String(Math.abs(raw)), way: m.delta > 0 ? copy.weekly.movedBetter : copy.weekly.movedWorse })}
                    </p>
                  )
                })
              )}
            </div>
          </div>

          {r.commitments.length > 0 && (
            <>
              <h2 class="section">{c.commitments}</h2>
              <div class="card pad">
                <div class="calc" data-testid="month-commitments">
                  {r.commitments.map((a) => (
                    <p key={a.name} class="calc-line">
                      {a.faith
                        ? fill(c.faith, { name: a.name })
                        : fill(a.planned ? c.sessions : c.sessionsNoPlan, { name: a.name, done: String(a.done), what: a.learning ? plural(a.done, c.sessionOne, c.sessionMany) : plural(a.done, c.stepOne, c.stepMany), kept: String(a.kept), planned: String(a.planned) })}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )}

          <h2 class="section">{c.moves}</h2>
          <div class="card pad">
            <div class="calc" data-testid="month-moves">
              {r.moves.done === 0 ? (
                <p class="calc-line">{c.movesNone}</p>
              ) : (
                <>
                  <p class="calc-line">{fill(c.movesLine, { n: String(r.moves.done) })}</p>
                  <p class="calc-line">{fill(c.movesMost, { list: r.moves.most.map((m) => `${m.name} (${m.n})`).join(', ') })}</p>
                </>
              )}
              <p class="calc-line">{fill(c.workouts, { n: String(r.workoutDays) })}</p>
            </div>
          </div>

          <div class="card">
            <ul class="rows">
              <NavRow label={copy.words.door} note={fill(c.notes, { n: String(r.notes) })} onClick={onWords} testid="month-words" />
            </ul>
          </div>
        </>
      )}
    </section>
  )
}

/** Mirror's look back: the day a month ago, only when the record holds something of it. */
export function MonthAgoCard({ day }: { day: MonthAgoDay }) {
  const c = copy.monthAgo
  return (
    <div class="card pad" data-testid="month-ago">
      <p class="title-sm">
        {c.title} · {formatDayShort(day.day)}
      </p>
      <div class="calc">
        {day.value !== null && day.band && <p class="calc-line ink">{fill(c.reading, { value: String(day.value), band: (copy.bands as Record<string, string>)[day.band].toLowerCase() })}</p>}
        {day.blocks.length > 0 && <p class="calc-line ink">{fill(c.blocks, { list: day.blocks.map((b) => fill(c.block, { block: copy.blocks[b.block], value: String(b.value) })).join(', ') })}</p>}
        {day.notes.map((n) => (
          <p key={n.block} class="calc-line said" data-testid="month-ago-note">
            {fill(c.note, { block: copy.blocks[n.block], note: n.note })}
          </p>
        ))}
        {day.done.length > 0 && <p class="calc-line">{fill(c.done, { list: day.done.join(', ') })}</p>}
        {day.workout && <p class="calc-line">{c.workout}</p>}
      </div>
    </div>
  )
}

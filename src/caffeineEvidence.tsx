import { bandsLabel, windowsLabel, type CaffeineEvidence, type ReadingComparison, type ReportedComparison, type SleepComparison } from './caffeineRecord'
import { copy } from './copy'
import type { Compared, Stood } from './counted/compare'
import { standingInline } from './counted/words'
import { CAFFEINE_LAST } from './db'
import { fill } from './format'

// Evidence → Caffeine (Part 22): the habit line, each comparison with its counts, and the notes
// that keep them honest. A group under five shows its count and nothing else; nothing here is a
// cause, and no untapped window is ever read as none.

function signed(v: number, digits = 0): string {
  const r = digits ? v.toFixed(digits) : String(Math.round(v))
  return v > 0 ? `+${r}` : r
}

/** A mean sleep-hours position in hours: each step of the scale is an hour band, from under five to over eight. */
function hoursOf(position: number): string {
  return (position + 3.5).toFixed(1)
}

/** Where each comparison stands in the sheet's family; null when the comparisons could not be worked out. */
type Stands = ReadonlyMap<string, Stood> | null

/** A comparison's standing as the card says it beside its number; null while it is too few to compare. */
function saidAt(stood: Stands, c: Compared | null | undefined): string | null {
  const s = c && stood ? stood.get(c.id) : undefined
  return s && s.standing !== 'tooFew' ? standingInline(s) : null
}

function SleepLines<K>({ title, cmp, label, testid, stood }: { title: string; cmp: SleepComparison<K>; label: (keys: K[]) => string; testid: string; stood: Stands }) {
  const c = copy.caffeine.ev
  // Each difference with where it stands (the one standard, 2026-11-12); one that is too few to compare is not said.
  const [hours, quality] = [saidAt(stood, cmp.compared?.hours), saidAt(stood, cmp.compared?.quality)]
  const parts = [cmp.hoursDiff !== null && hours ? fill(c.sleepMinutes, { minutes: signed(cmp.hoursDiff * 60), standing: hours }) : null, cmp.qualityDiff !== null && quality ? fill(c.sleepQuality, { quality: signed(cmp.qualityDiff, 1), standing: quality }) : null].filter((x): x is string => x !== null)
  return (
    <div class="caffeine-cmp" data-testid={testid}>
      <p class="calc-line ink">{title}</p>
      {cmp.groups.length === 0 && <p class="calc-line">{c.nothingYet}</p>}
      {cmp.groups.map((g) => {
        const unit = g.n === 1 ? c.units.day : c.units.days
        return (
          <p key={label(g.keys)} class="calc-line" data-testid={`${testid}-group`}>
            {g.hours === null
              ? fill(c.groupCount, { label: label(g.keys), n: String(g.n), unit })
              : fill(c.groupSleep, { label: label(g.keys), n: String(g.n), unit, hours: hoursOf(g.hours), quality: g.quality === null ? '—' : g.quality.toFixed(1) })}
          </p>
        )
      })}
      {cmp.groups.length === 1 && <p class="calc-line">{c.tooFew}</p>}
      {cmp.groups.length >= 2 &&
        (cmp.unmatched ? (
          <p class="calc-line" data-testid={`${testid}-unmatched`}>
            {c.unmatchedSleep}
          </p>
        ) : stood === null ? (
          <p class="calc-line" data-testid={`${testid}-failed`}>
            {c.failed}
          </p>
        ) : parts.length === 0 ? (
          <p class="calc-line" data-testid={`${testid}-few`}>
            {c.notYet}
          </p>
        ) : cmp.none ? (
          <p class="calc-line" data-testid={`${testid}-none`}>
            {c.none}
          </p>
        ) : (
          <p class="calc-line" data-testid={`${testid}-diff`}>
            {fill(c.sleepDiff, { parts: parts.join(c.and) })}
          </p>
        ))}
    </div>
  )
}

function ReadingLines<K>({ title, cmp, label, units, unmatched, testid, stood }: { title: string; cmp: ReadingComparison<K>; label: (keys: K[]) => string; units: [string, string]; unmatched: string; testid: string; stood: Stands }) {
  const c = copy.caffeine.ev
  const said = saidAt(stood, cmp.compared)
  return (
    <div class="caffeine-cmp" data-testid={testid}>
      <p class="calc-line ink">{title}</p>
      {cmp.groups.length === 0 && <p class="calc-line">{c.nothingYet}</p>}
      {cmp.groups.map((g) => {
        const unit = g.n === 1 ? units[0] : units[1]
        return (
          <p key={label(g.keys)} class="calc-line" data-testid={`${testid}-group`}>
            {g.value === null ? fill(c.groupCount, { label: label(g.keys), n: String(g.n), unit }) : fill(c.groupReading, { label: label(g.keys), n: String(g.n), unit, value: String(Math.round(g.value)) })}
          </p>
        )
      })}
      {cmp.groups.length === 1 && <p class="calc-line">{c.tooFew}</p>}
      {cmp.groups.length >= 2 &&
        (cmp.unmatched ? (
          <p class="calc-line" data-testid={`${testid}-unmatched`}>
            {unmatched}
          </p>
        ) : stood === null ? (
          <p class="calc-line" data-testid={`${testid}-failed`}>
            {c.failed}
          </p>
        ) : said === null || cmp.diff === null ? (
          <p class="calc-line" data-testid={`${testid}-few`}>
            {c.notYet}
          </p>
        ) : cmp.none ? (
          <p class="calc-line" data-testid={`${testid}-none`}>
            {c.noneReading}
          </p>
        ) : (
          <p class="calc-line" data-testid={`${testid}-diff`}>
            {fill(c.readingDiff, { diff: signed(cmp.diff), standing: said })}
          </p>
        ))}
    </div>
  )
}

/** The secondary comparison, labelled for what it is: reported against shown and none reported. */
function reportedLabel(keys: ('reported' | 'untapped')[]): string {
  const c = copy.caffeine.ev
  return keys.map((k) => (k === 'reported' ? c.reportedLabel : c.untappedLabel)).join(copy.caffeine.or)
}

function ReportedLines({ cmp, stood }: { cmp: ReportedComparison; stood: Stands }) {
  const c = copy.caffeine.ev
  return (
    <>
      <ReadingLines title={c.reported} cmp={cmp} label={reportedLabel} units={[c.units.checkIn, c.units.checkIns]} unmatched={c.unmatchedTime} testid="caffeine-reported" stood={stood} />
      {cmp.droppedMornings > 0 && (
        <p class="calc-line" data-testid="caffeine-dropped">
          {fill(c.droppedMornings, { n: String(cmp.droppedMornings) })}
        </p>
      )}
      {cmp.habitual && (
        <p class="calc-line" data-testid="caffeine-withdrawal">
          {c.withdrawal}
        </p>
      )}
    </>
  )
}

export function CaffeineEvidenceCard({ ev, stood }: { ev: CaffeineEvidence; stood: Stands }) {
  const c = copy.caffeine.ev
  const h = ev.habit
  return (
    <>
      <h2 class="section">{c.title}</h2>
      <div class="card pad" data-testid="caffeine-evidence">
        <div class="calc">
          <p class="calc-line" data-testid="caffeine-habit">
            {fill(c.habit, { reported: String(h.reportedDays), usual: h.usualMorning ? copy.caffeine.bands[h.usualMorning] : c.usualNone, untapped: `${h.untapped} ${h.untapped === 1 ? c.units.window : c.units.windows}` })}
          </p>
          <SleepLines title={c.byDayBand} cmp={ev.byDayBand} label={bandsLabel} testid="caffeine-bands" stood={stood} />
          <SleepLines title={c.byLatestWindow} cmp={ev.byLatestWindow} label={windowsLabel} testid="caffeine-latest" stood={stood} />
          <ReadingLines title={c.byMorningBand} cmp={ev.byMorningBand} label={bandsLabel} units={[c.units.morning, c.units.mornings]} unmatched={c.unmatchedMorning} testid="caffeine-morning" stood={stood} />
          <ReportedLines cmp={ev.reported} stood={stood} />
          {CAFFEINE_LAST.some((l) => ev.last[l] > 0) && (
            <p class="calc-line" data-testid="caffeine-last-counts">
              {fill(c.last, { list: CAFFEINE_LAST.filter((l) => ev.last[l] > 0).map((l) => `${copy.caffeine.lastOptions[l].toLowerCase()} ${ev.last[l]}`).join(', ') })}
            </p>
          )}
        </div>
        <p class="note faint no-gap">{c.note}</p>
      </div>
    </>
  )
}

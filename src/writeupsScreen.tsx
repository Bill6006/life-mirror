import { useState } from 'preact/hooks'
import { blockAt } from './blocks'
import { copy } from './copy'
import { PATTERNS_ID, readPatterns, type StoredFollowed } from './counted/stored'
import { standingLine } from './counted/words'
import { db } from './db'
import { fill, formatDayShort, formatMonth } from './format'
import { useLive } from './live'
import { forgetNoticed } from './noteEvents/flow'
import { refreshPatterns } from './patternsFlow'
import { markObservation, writeUpsNow } from './writeups/flow'
import type { ShownObservation, ShownWriteUp } from './writeups/join'

/** How many of an observation's days are named before the rest are counted. */
const DAYS_NAMED = 6

/**
 * "Forget everything it learned", the Brain's own (2026-11-13): the write-ups, the patterns followed from them and
 * what was noticed in notes, gone from every screen and every count from this moment. One step to confirm. The
 * Worker's rows stay on record, as its lines do; the owner's own record is untouched.
 */
export function ForgetLearned() {
  const [asking, setAsking] = useState(false)
  const c = copy.brainScreen.writeups
  const forget = () => void forgetNoticed().then(() => refreshPatterns(blockAt(new Date()).day))
  return (
    <div class="card pad" data-testid="forget-learned">
      <p class="note faint">{c.forgetNote}</p>
      {asking ? (
        <p class="note no-gap">
          {c.forgetAsk}{' '}
          <button type="button" class="textbtn" data-testid="forget-learned-yes" onClick={forget}>
            {c.forgetYes}
          </button>{' '}
          <button type="button" class="textbtn" data-testid="forget-learned-no" onClick={() => setAsking(false)}>
            {c.forgetNo}
          </button>
        </p>
      ) : (
        <button type="button" class="textbtn" data-testid="forget-learned-open" onClick={() => setAsking(true)}>
          {c.forget}
        </button>
      )}
    </div>
  )
}

/** The days an observation came from, the first few named and the rest counted. */
function daysLine(days: readonly string[]): string {
  const c = copy.brainScreen.writeups
  // A day's own words hold a comma ("Mon, Sep 14"), so the days are set apart by a dot.
  const named = days.slice(0, DAYS_NAMED).map(formatDayShort).join(' · ')
  return days.length > DAYS_NAMED ? fill(c.fromMore, { days: named, n: String(days.length - DAYS_NAMED) }) : fill(c.from, { days: named })
}

function ObservationCard({ o, noticedOn, count }: { o: ShownObservation; noticedOn: string; count?: StoredFollowed }) {
  const c = copy.brainScreen.writeups
  // The counts follow the mark: the pattern table is built again, which no screen waits for.
  const mark = (wrong: boolean) => void markObservation(o.markId, wrong).then(() => refreshPatterns(blockAt(new Date()).day))
  return (
    <div class="card pad" data-testid="writeup-observation">
      <p class="note" data-testid="writeup-text">
        {o.text}
      </p>
      <p class="note faint" data-testid="writeup-days">
        {daysLine(o.days)}
      </p>
      {/* One marked wrong counts for nothing, so it says nothing of being counted. */}
      {o.followed && !o.wrong && (
        <p class="note faint" data-testid="writeup-followed">
          {/* Counted on what came after the day it was noticed; until a later occasion exists, it says from when it is counted. */}
          {count && count.n + count.m > 0 ? `${fill(c.followedSince, { day: formatDayShort(noticedOn), k: String(count.k), n: String(count.n) })} ${standingLine(count)}.` : fill(c.followed, { day: formatDayShort(noticedOn) })}
        </p>
      )}
      {o.wrong ? (
        <p class="note faint no-gap" data-testid="writeup-marked">
          {c.marked}{' '}
          <button type="button" class="textbtn" data-testid="writeup-undo" onClick={() => mark(false)}>
            {c.undo}
          </button>
        </p>
      ) : (
        <button type="button" class="textbtn" data-testid="writeup-wrong" onClick={() => mark(true)}>
          {c.wrong}
        </button>
      )}
    </div>
  )
}

/** One reading of a month: what was recorded, then what Claude noticed, each observation with the days it came from. */
function Reading({ w, counted }: { w: ShownWriteUp; counted: ReadonlyMap<string, StoredFollowed> }) {
  const c = copy.brainScreen.writeups
  return (
    <>
      <p class="note faint" data-testid="writeup-read-on">
        {fill(c.readOn, { day: formatDayShort(w.day) })}
      </p>
      {w.recorded.length > 0 && <h2 class="section">{c.recorded}</h2>}
      {w.recorded.map((o) => (
        <ObservationCard key={o.markId} o={o} noticedOn={w.day} count={counted.get(o.markId)} />
      ))}
      {w.noticed.length > 0 && (
        <>
          <h2 class="section">{c.noticed}</h2>
          <p class="note faint">{c.noticedNote}</p>
        </>
      )}
      {w.noticed.map((o) => (
        <ObservationCard key={o.markId} o={o} noticedOn={w.day} count={counted.get(o.markId)} />
      ))}
    </>
  )
}

/**
 * Settings → Brain → Monthly write-ups (2026-11-13): each month Claude read in full, and what stood out, in two
 * labelled parts. One control on each observation: mark it wrong. A month's newest reading is shown, with an earlier
 * one beside it, never under it. An observation whose day is gone, or whose kind of record is switched off, is not
 * here at all.
 */
export function WriteUpsScreen({ onClose }: { onClose: () => void }) {
  const months = useLive(writeUpsNow, [])
  // The followed patterns' counts, as the pattern table last kept them.
  const table = useLive(async () => readPatterns(await db.patterns.get(PATTERNS_ID)) ?? null, [])
  const counted = new Map((table?.followed ?? []).map((f) => [f.id, f]))
  const [open, setOpen] = useState<string | null>(null)
  const [earlier, setEarlier] = useState<string | null>(null)
  const c = copy.brainScreen.writeups
  if (!months) return <section class="screen" />
  const month = months.find((m) => m.month === open)
  if (month) {
    const reading = month.earlier.find((w) => w.id === earlier) ?? month.newest
    const others = [month.newest, ...month.earlier].filter((w) => w.id !== reading.id)
    return (
      <section class="screen" data-testid="writeup-screen">
        <header class="screen-head">
          <p class="eyebrow">{formatMonth(month.month)}</p>
        </header>
        <Reading w={reading} counted={counted} />
        {others.map((w) => (
          <button key={w.id} type="button" class="textbtn" data-testid="writeup-other" onClick={() => setEarlier(w.id === month.newest.id ? null : w.id)}>
            {fill(w.id === month.newest.id ? c.newest : c.earlier, { day: formatDayShort(w.day) })}
          </button>
        ))}
        <div class="actions">
          <button
            type="button"
            class="textbtn"
            data-testid="writeup-back"
            onClick={() => {
              setOpen(null)
              setEarlier(null)
            }}
          >
            {c.back}
          </button>
        </div>
      </section>
    )
  }
  return (
    <section class="screen" data-testid="writeups-screen">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note">{c.intro}</p>
      {months.length === 0 && (
        <p class="note faint" data-testid="writeups-none">
          {c.none}
        </p>
      )}
      {months.length > 0 && (
        <div class="card">
          {months.map((m) => {
            const n = m.newest.recorded.length + m.newest.noticed.length
            return (
              <button key={m.month} type="button" class="switch-row" data-testid="writeups-month" onClick={() => setOpen(m.month)}>
                <span class="row-main">
                  {formatMonth(m.month)}
                  <span class="sub">{fill(n === 1 ? c.thing : c.things, { n: String(n), day: formatDayShort(m.newest.day) })}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {months.length > 0 && <ForgetLearned />}
      <div class="actions">
        <button type="button" class="textbtn" data-testid="writeups-done" onClick={onClose}>
          {c.done}
        </button>
      </div>
    </section>
  )
}

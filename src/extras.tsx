import { useEffect, useRef, useState } from 'preact/hooks'
import { addDays, parseDay, type Block, type Slot } from './blocks'
import { afternoonAssociation, coolingOffDuration } from './associations'
import { chipRetired, chipStates } from './audit'
import { CaffeineCard } from './caffeine'
import { useSyncedText } from './controls'
import { chipAnswer, chipShownAt, SHOWN_CHIPS, type ChipKey } from './chips'
import { useChipsSeen } from './chipsSeen'
import { RECOVERY_GAP } from './catalogue'
import { copy } from './copy'
import {
  allCheckIns,
  answerWin,
  askedOf,
  db,
  JOURNAL_MAX,
  ensureDayContext,
  getCheckIn,
  getDayContext,
  getSettings,
  markPrivateShown,
  placedIn,
  privateItems,
  setDayContext,
  setExtra,
  setNecessity,
  setTeethBrushed,
  setNote,
  setOwnChip,
  setPrivateLogged,
  setWin,
  updateSettings,
  winFor,
  type CheckIn,
  type ExtraKey,
  type PrivateItem,
  type WinOutcome,
} from './db'
import { fill, formatDayShort } from './format'
import { awayOn } from './postWindowFlow'
import { awayStatus } from './awayFlow'
import { redrawForDay, syncRecoveryGap } from './offerFlow'
import { useLive } from './live'
import { teethOf, TEETH_COUNTS, type TeethBrushed } from './necessities'
import type { ReadingId } from './readings'
import { askedReadings, ownChipsOf, type Weekday } from './settings'
import { ownChipAnswer, ownChipRetired, ownChipStates, ownShownKey } from './ownChips'
import type { Association } from './associations'
import { journalFor, saveJournal } from './journal'
import { Disclosure } from './ui'

const OUTCOMES: readonly WinOutcome[] = ['done', 'partly', 'no']
const CHIPS: readonly ChipKey[] = ['nothingLanded', 'hardToSeePoint', 'coolingOff', 'bigSocial', 'napped', 'outside', 'sweet']

/**
 * The evening's optional extras, one tap each, every tap saved at once. Skipping costs one
 * tap on Done. "Felt close to God today?" carries its own permanent off switch. The two chips
 * about how today landed are answered at once from your own record.
 */
/** How many times a chip was marked before, said as a sentence starts it: Once, or 3 times (stage 1, item q). */
const timesBefore = (n: number) => (n === 1 ? copy.extras.timesOnce : fill(copy.extras.timesN, { n: String(n) }))

/** A chip's answer from your own record, in words: first time, the times with no morning after, unmatched, or like for like. */
function chipAnswerWords(a: Association): string {
  const round = (v: number | null) => (v === null ? '' : String(Math.round(v)))
  if (a.times === 0) return copy.extras.chipFirst
  if (a.withEvent.mean === null) return fill(copy.extras.chipTimesNoNext, { times: timesBefore(a.times) })
  if (a.without.mean === null) return fill(copy.extras.chipUnmatched, { times: timesBefore(a.times), mean: round(a.withEvent.mean), k: String(a.withEvent.n) })
  return fill(copy.extras.chipTimes, { times: timesBefore(a.times), mean: round(a.withEvent.mean), without: round(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
}


/** A phrase kept on one line inside a label, so a narrow phone never breaks it at its hyphen ("check-" / "in?"), as it did until 2026-10-18. */
function keepTogether(label: string, phrase: string) {
  const at = label.indexOf(phrase)
  if (at < 0) return label
  return (
    <>
      {label.slice(0, at)}
      <span class="keep-together">{phrase}</span>
      {label.slice(at + phrase.length)}
    </>
  )
}
export function ExtrasScreen({ day, block, onDone, onAway }: { day: string; block: Block; onDone: () => void; onAway?: () => void }) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const settings = useLive(getSettings, [])
  const items = useLive(privateItems, [])
  const all = useLive(allCheckIns, [])
  const todayWin = useLive(() => winFor(day), [day])
  const tomorrowWin = useLive(() => winFor(addDays(day, 1)), [day])
  useEffect(() => {
    if (settings) void ensureDayContext(day, settings)
  }, [settings?.updatedAt, day])
  const contexts = useLive(() => db.days.toArray(), [])
  // The final checklist: whether this evening's move carries the recovery gap, and whether today is a church day to ask about.
  const gapTonight = useLive(() => db.offers.where('day').equals(day).filter((o) => o.kind === 'block' && o.block === 'evening' && o.skippedAt === null && o.passiveId === RECOVERY_GAP).count(), [day])
  const churchToday = contexts?.some((c) => c.day === day && c.churchDay === true) ?? false
  // Phase 12: a chip untapped across thirty logged evenings stops appearing; Settings brings it back.
  const states = settings && all && contexts ? chipStates(all, contexts, settings.chipsBack, day) : []
  const showing = (id: Parameters<typeof chipRetired>[0]) => !chipRetired(id, states)
  // Stage 3, item 5: your own chips still asked and not stopped; they and the newer built-in chips on screen are marked once seen.
  const ownAll = settings ? ownChipsOf(settings) : []
  const ownStates = settings && all ? ownChipStates(all, ownAll, settings.chipsBack, day) : []
  const own = ownAll.filter((ch) => !ownChipRetired(ch.id, ownStates))
  const chipsRef = useRef<HTMLDivElement>(null)
  useChipsSeen(chipsRef, { day, block }, record && settings && all && contexts ? [...CHIPS.filter((k) => SHOWN_CHIPS.includes(k) && showing(k)), ...own.map((ch) => ownShownKey(ch.id))].filter((k) => !record.extras?.chipsShown?.[k]) : [])

  if (record === undefined || !settings || !items || !all || !contexts || todayWin === undefined || tomorrowWin === undefined) return <section class="screen" />

  const slot = { day, block }
  const asked = record ? askedOf(record) : askedReadings(block, settings.depth, settings.retiredReadings, { day, morning: all.find((c) => c.day === day && c.block === 'morning') ?? null })
  const ex = record?.extras ?? {}
  const toggle = (key: ExtraKey) => {
    // Today marked a big social day, or the mark taken back: this evening's move carries the recovery gap from now, or no longer.
    void setExtra(slot, asked, key, !ex[key]).then(() => (key === 'bigSocial' ? syncRecoveryGap(day, !ex[key]) : undefined))
  }
  // Pass 3: the items placed at this check-in, and only those.
  const placed = items.filter((it) => placedIn(it, block))

  return (
    <section class="screen" data-testid="extras">
      <header class="screen-head">
        <p class="eyebrow">{copy.extras.title}</p>
        <p class="date">{copy.extras.note}</p>
      </header>

      {settings.extras.minimumWin && todayWin && (
        <>
          <h2 class="section">{copy.extras.yesterdayWin}</h2>
          <div class="card pad">
            <p class="win-text">{todayWin.text}</p>
            <div class="seg">
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  class={todayWin.outcome === o ? 'seg-opt is-on' : 'seg-opt'}
                  aria-pressed={todayWin.outcome === o}
                  onClick={() => void answerWin(day, todayWin.outcome === o ? null : o)}
                >
                  {copy.extras.winOutcome[o]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <CaffeineCard day={day} block={block} />

      <div class="card">
        <ul class="rows">
          {settings.extras.dinner && <ExtraRow label={copy.extras.dinner} on={Boolean(ex.dinner)} onLabel={copy.extras.yes} onClick={() => toggle('dinner')} />}
          {settings.extras.faith && <ExtraRow label={copy.extras.faith} on={Boolean(ex.closeToGod)} onLabel={copy.extras.yes} onClick={() => toggle('closeToGod')} />}
          {settings.extras.privateLog && placed.length > 0 && <PrivateLog slot={slot} asked={asked} items={placed} logged={ex.private} />}
        </ul>
      </div>

      {settings.extras.faith && (
        <button type="button" class="textbtn faint" onClick={() => void updateSettings((s) => ({ ...s, extras: { ...s.extras, faith: false } }))}>
          {copy.extras.faithOff}
        </button>
      )}

      <h2 class="section">{copy.extras.chips}</h2>
      <div class="card" ref={chipsRef}>
        <ul class="rows">
          {CHIPS.filter(showing).map((key) => {
            const on = Boolean(ex[key])
            const answer = chipAnswerWords(chipAnswer(all, key, day))
            const cooling = key === 'coolingOff' && on ? coolingOffDuration(all, day) : null
            return (
              <li key={key} data-chip={key}>
                <button type="button" class={on ? 'row anchor is-picked' : 'row anchor'} aria-pressed={on} data-testid={`chip-${key}`} onClick={() => toggle(key)}>
                  <span class="anchor-mark" aria-hidden="true" />
                  <span class="row-main">{copy.extras[key]}</span>
                </button>
                {key === 'bigSocial' && !on && churchToday && (
                  <p class="note faint no-gap church-ask" data-testid="church-ask">
                    {copy.extras.churchAsk}
                  </p>
                )}
                {on && (
                  <div class="calc chip-answer" data-testid="chip-answer">
                    <p class="calc-line">{answer}</p>
                    {cooling && <p class="calc-line">{fill(copy.extras.coolingAnswer, { blocks: cooling.blocks === 1 ? copy.extras.coolingBlocksOne : fill(copy.extras.coolingBlocksN, { n: String(cooling.blocks) }), events: cooling.events === 1 ? copy.extras.coolingEventsOne : fill(copy.extras.coolingEventsN, { n: String(cooling.events) }) })}</p>}
                    {key === 'bigSocial' && (gapTonight ?? 0) > 0 && (
                      <p class="calc-line" data-testid="recovery-note">
                        {copy.extras.recoveryNote}
                      </p>
                    )}
                    {(key === 'nothingLanded' || key === 'hardToSeePoint') && settings.direction && <p class="calc-line ink">{fill(copy.extras.chipDirection, { line: settings.direction })}</p>}
                  </div>
                )}
              </li>
            )
          })}
          {/* Stage 3, item 5: your own chips, by their labels, after the built-in ones. */}
          {own.map((ch) => {
            const on = Boolean(ex.own?.[ch.id])
            return (
              <li key={ch.id} data-chip={ownShownKey(ch.id)}>
                <button type="button" class={on ? 'row anchor is-picked' : 'row anchor'} aria-pressed={on} data-testid={`own-chip-${ch.id}`} onClick={() => void setOwnChip(slot, asked, ch.id, !on)}>
                  <span class="anchor-mark" aria-hidden="true" />
                  <span class="row-main">{ch.label}</span>
                </button>
                {on && (
                  <div class="calc chip-answer" data-testid="chip-answer">
                    <p class="calc-line">{chipAnswerWords(ownChipAnswer(all, ch.id, day))}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <h2 class="section">{copy.necessities.title}</h2>
      <div class="card">
        <ul class="rows">
          {(['shower', 'teeth', 'food'] as const).filter(showing).map((key) =>
            key === 'teeth' ? (
              <CountRow key={key} label={copy.necessities.teeth} value={teethOf(ex)} testid="necessity-teeth" onPick={(n) => void setTeethBrushed(slot, asked, n)} />
            ) : (
              <ExtraRow key={key} label={copy.necessities[key]} on={Boolean(ex.necessities?.[key])} onLabel={copy.necessities.missed} testid={`necessity-${key}`} onClick={() => void setNecessity(slot, asked, key, !ex.necessities?.[key])} />
            ),
          )}
        </ul>
      </div>

      <TodayChips day={day} block={block} onAway={onAway} />

      <h2 class="section">{copy.extras.noteLabel}</h2>
      {/* Let it out sits directly under the note, in the same card: one compact row, not a card of its own. */}
      <div class="card pad note-card">
        <LineInput initial={ex.note ?? ''} placeholder={copy.extras.notePlaceholder} testid="note-input" onSave={(text) => void setNote(slot, asked, text)} />
        <JournalBox day={day} />
      </div>

      {settings.extras.minimumWin && (
        <>
          <h2 class="section">{copy.extras.tomorrowWin}</h2>
          <div class="card pad">
            <LineInput initial={tomorrowWin?.text ?? ''} placeholder={copy.extras.winPlaceholder} onSave={(text) => void setWin(addDays(day, 1), day, text)} />
            {tomorrowWin && <p class="note faint no-gap">{copy.extras.winSet}</p>}
          </div>
        </>
      )}

      <button type="button" class="pill-ink" onClick={onDone}>
        {copy.extras.done}
      </button>
    </section>
  )
}

/**
 * Today, if different: the exceptions to the week as statement chips, inside the check-in and
 * never on Now (Rules 19 and 20), on every block's summary, since the away flag decides what is
 * offered all day. Each changes today alone.
 */
export function TodayChips({ day, block, onAway }: { day: string; block: Block; onAway?: () => void }) {
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const contexts = useLive(() => db.days.toArray(), [])
  useEffect(() => {
    if (settings) void ensureDayContext(day, settings)
  }, [settings?.updatedAt, day])
  const ctx = useLive(() => getDayContext(day), [day])
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const states = settings && all && contexts ? chipStates(all, contexts, settings.chipsBack, day) : []
  // Stage 3, item 5: Out among people today is marked once seen at this check-in.
  const cardRef = useRef<HTMLDivElement>(null)
  useChipsSeen(cardRef, { day, block }, record && ctx && !chipRetired('amongPeople', states) && !record.extras?.chipsShown?.amongPeople ? ['amongPeople'] : [])
  if (!settings || !all || !contexts || !ctx) return null
  const weekday = parseDay(day).getDay() as Weekday
  const office = settings.week.officeDays[weekday]
  // Away from home (post-window, gated): one row to the trip's own screen; on a trip's day the office row gives way to it. Closed, the rows are as they were.
  const away = awayOn() && onAway !== undefined
  const trip = away ? awayStatus(settings.away, day) : null
  const onTripToday = away && Boolean(ctx.awayFromHome)
  // Stage 3, item 5: a chip that changes the day draws this block's move again when nobody has touched it.
  const change = (patch: Parameters<typeof setDayContext>[1]) => void setDayContext(day, patch).then(() => redrawForDay(day, block))
  return (
    <>
      <h2 class="section">{copy.today.context}</h2>
      <div class="card" ref={cardRef}>
        <ul class="rows">
          {!chipRetired('away', states) && <ExtraRow label={copy.today.awayToday} on={!ctx.withHer} onLabel={copy.extras.yes} testid="chip-away" onClick={() => change({ withHer: !ctx.withHer })} />}
          {!onTripToday && (
            <ExtraRow
              label={office ? copy.today.homeToday : copy.today.officeToday}
              on={Boolean(ctx.atOffice) !== office}
              onLabel={copy.extras.yes}
              testid="chip-office"
              onClick={() => change({ atOffice: !ctx.atOffice })}
            />
          )}
          {/* Unwell today (the owner's decision, 2026-10-10): optional, today alone, and never retired, since a rare mark is still the one that matters. */}
          <ExtraRow label={copy.today.unwellToday} on={Boolean(ctx.unwell)} onLabel={copy.extras.yes} testid="chip-unwell" onClick={() => change({ unwell: !ctx.unwell })} />
          {/* Out among people today (stage 3, item 5): people around in every block, for today alone; it stops appearing like the others. */}
          {!chipRetired('amongPeople', states) && <ExtraRow label={copy.today.amongPeople} on={Boolean(ctx.amongPeople)} onLabel={copy.extras.yes} testid="chip-among-people" chip="amongPeople" onClick={() => change({ amongPeople: !ctx.amongPeople })} />}
          {away && <ExtraRow label={copy.away.row} on={onTripToday} onLabel={trip?.state === 'away' ? fill(copy.away.untilShort, { to: formatDayShort(trip.range.to) }) : ''} testid="chip-away-from-home" onClick={() => onAway?.()} />}
        </ul>
      </div>
    </>
  )
}

/**
 * The private log at one check-in (Pass 3): the items placed there, one tap each, behind one row so
 * their names stay out of sight until you open it. Opening it marks them shown, so an item left
 * untapped is known to have been seen and left, and one never shown enters no comparison (Rule 2).
 */
export function PrivateLog({ slot, asked, items, logged }: { slot: Slot; asked: readonly ReadingId[]; items: readonly PrivateItem[]; logged: Record<string, true> | undefined }) {
  const [open, setOpen] = useState(false)
  const n = items.filter((it) => logged?.[String(it.id)]).length
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) void markPrivateShown(slot, asked, items.map((it) => it.id as number))
  }
  return (
    <>
      <li>
        <button type="button" class="row private-log-row" onClick={toggle} aria-expanded={open} data-testid="private-log">
          <span class="row-main">{copy.extras.private}</span>
          <span class="row-side">{n > 0 ? fill(copy.extras.privateLogged, { n: String(n) }) : ''}</span>
          <span class="chev" aria-hidden="true">
            {open ? '⌄' : '›'}
          </span>
        </button>
      </li>
      {open &&
        items.map((it) => (
          <ExtraRow
            key={it.id}
            label={it.name}
            on={Boolean(logged?.[String(it.id)])}
            onLabel={copy.extras.logged}
            indent
            testid={`private-item-${it.id}`}
            onClick={() => void setPrivateLogged(slot, asked, it.id as number, !logged?.[String(it.id)])}
          />
        ))}
    </>
  )
}

function ExtraRow({ label, on, onLabel, indent = false, testid, chip, onClick }: { label: string; on: boolean; onLabel: string; indent?: boolean; testid?: string; chip?: string; onClick: () => void }) {
  return (
    <li data-chip={chip}>
      <button type="button" class={`row anchor${on ? ' is-picked' : ''}${indent ? ' is-indent' : ''}`} aria-pressed={on} data-testid={testid} onClick={onClick}>
        <span class="anchor-mark" aria-hidden="true" />
        <span class="row-main">{label}</span>
        <span class="row-side ink">{on ? onLabel : ''}</span>
      </button>
    </li>
  )
}

/**
 * Something sweet since the last check-in? on an afternoon's summary (stage 3, item 5), as the evening has it among
 * its chips: one optional tap, answered at once from your own record, like for like, the evenings after afternoons
 * that carried it against the evenings after afternoons that started the same. Untapped, it stops appearing like the others.
 */
export function SweetChip({ record }: { record: CheckIn }) {
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const shown = settings !== undefined && all !== undefined && !chipRetired('sweet', chipStates(all, [], settings.chipsBack, record.day))
  const cardRef = useRef<HTMLDivElement>(null)
  useChipsSeen(cardRef, { day: record.day, block: record.block }, shown && !record.extras?.chipsShown?.sweet ? ['sweet'] : [])
  if (!shown || !all) return null
  const on = Boolean(record.extras?.sweet)
  const a = afternoonAssociation(all, record.day, (c) => Boolean(c.extras?.sweet), (c) => chipShownAt('sweet', c))
  const round = (v: number | null) => (v === null ? '' : String(Math.round(v)))
  const answer =
    a.times === 0
      ? copy.extras.chipFirst
      : a.withEvent.mean === null
        ? fill(copy.extras.sweetNoNext, { times: timesBefore(a.times) })
        : a.without.mean === null
          ? fill(copy.extras.sweetUnmatched, { times: timesBefore(a.times), mean: round(a.withEvent.mean), k: String(a.withEvent.n) })
          : fill(copy.extras.sweetTimes, { times: timesBefore(a.times), mean: round(a.withEvent.mean), without: round(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
  return (
    <>
      <div class="card" ref={cardRef}>
        <ul class="rows">
          <li data-chip="sweet">
            <button type="button" class={on ? 'row anchor is-picked' : 'row anchor'} aria-pressed={on} data-testid="chip-sweet" onClick={() => void setExtra({ day: record.day, block: record.block }, askedOf(record), 'sweet', !on)}>
              <span class="anchor-mark" aria-hidden="true" />
              <span class="row-main">{keepTogether(copy.extras.sweet, 'check-in?')}</span>
            </button>
            {on && (
              <div class="calc chip-answer" data-testid="chip-answer">
                <p class="calc-line">{answer}</p>
              </div>
            )}
          </li>
        </ul>
      </div>
    </>
  )
}

/** A count asked as three explicit taps, 0, 1 and 2 (twice or more); a tap on the count already set takes it back to unknown. Nothing is ever set by itself. */
function CountRow({ label, value, testid, onPick }: { label: string; value: TeethBrushed | null; testid: string; onPick: (n: TeethBrushed | null) => void }) {
  return (
    <li>
      <div class={`row anchor is-static${value !== null ? ' is-picked' : ''}`} data-testid={testid}>
        <span class="anchor-mark" aria-hidden="true" />
        <span class="row-main" id={`${testid}-label`}>
          {label}
        </span>
        <span class="count-picks" role="group" aria-labelledby={`${testid}-label`}>
          {TEETH_COUNTS.map((n) => (
            <button key={n} type="button" class={value === n ? 'when-chip count-chip is-on' : 'when-chip count-chip'} aria-pressed={value === n} aria-label={copy.necessities.teethCounts[n]} data-testid={`${testid}-${n}`} onClick={() => onPick(value === n ? null : n)}>
              {n}
            </button>
          ))}
        </span>
      </div>
    </li>
  )
}

/**
 * Let it out (agreed 2026-10-15): a collapsed row under the note, in the note's card, that opens a large
 * box. Skipping it is not opening it, and it bears on nothing the check-in completes. Saved as it is
 * written, and on leaving.
 */
function JournalBox({ day }: { day: string }) {
  const entry = useLive(() => journalFor(day), [day])
  const [text, setText] = useState<string | null>(null)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flush = () => {
    clearTimeout(timer.current)
    if (pending.current === null) return
    const words = pending.current
    pending.current = null
    void saveJournal(day, words)
  }
  // Leaving the screen with words not yet saved saves them.
  useEffect(() => flush, [day])
  if (entry === undefined) return null
  const value = text ?? entry?.text ?? ''
  const c = copy.journal
  return (
    <Disclosure label={c.row} sub={entry?.text.trim() ? c.rowWritten : undefined} testid="journal-open" class="journal-row">
      <div class="pad">
        <textarea
          class="input journal-input"
          rows={10}
          maxLength={JOURNAL_MAX}
          value={value}
          placeholder={c.placeholder}
          aria-label={c.row}
          data-testid="journal-input"
          onInput={(e) => {
            const words = (e.currentTarget as HTMLTextAreaElement).value
            setText(words)
            pending.current = words
            clearTimeout(timer.current)
            timer.current = setTimeout(flush, 800)
          }}
          onBlur={flush}
        />
      </div>
    </Disclosure>
  )
}

export function LineInput({ initial, placeholder, testid, onSave }: { initial: string; placeholder: string; testid?: string; onSave: (text: string) => void }) {
  const [text, setText] = useSyncedText(initial)
  return (
    <input
      class="input"
      type="text"
      maxLength={200}
      placeholder={placeholder}
      value={text}
      data-testid={testid}
      onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => onSave(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}

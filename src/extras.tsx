import { useEffect, useState } from 'preact/hooks'
import { addDays, parseDay, type Block } from './blocks'
import { coolingOffDuration } from './associations'
import { chipRetired, chipStates } from './audit'
import { chipAnswer, morningChipAnswer, type ChipKey } from './chips'
import { copy } from './copy'
import {
  allCheckIns,
  answerWin,
  askedOf,
  db,
  ensureDayContext,
  getCheckIn,
  getDayContext,
  getSettings,
  privateItems,
  setDayContext,
  setExtra,
  setNecessity,
  setNote,
  setPrivateLogged,
  setWin,
  updateSettings,
  winFor,
  type ExtraKey,
  type WinOutcome,
} from './db'
import { fill } from './format'
import { useLive } from './live'
import { askedReadings, type Weekday } from './settings'

const OUTCOMES: readonly WinOutcome[] = ['done', 'partly', 'no']
const CHIPS: readonly ChipKey[] = ['nothingLanded', 'hardToSeePoint', 'coolingOff', 'bigSocial']

/**
 * The evening's optional extras, one tap each, every tap saved at once. Skipping costs one
 * tap on Done. "Felt close to God today?" carries its own permanent off switch. The two chips
 * about how today landed are answered at once from your own record.
 */
export function ExtrasScreen({ day, block, onDone }: { day: string; block: Block; onDone: () => void }) {
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
  const [showPrivate, setShowPrivate] = useState(false)

  if (record === undefined || !settings || !items || !all || !contexts || todayWin === undefined || tomorrowWin === undefined) return <section class="screen" />
  // Phase 12: a chip untapped across thirty logged evenings stops appearing; Settings brings it back.
  const states = chipStates(all, contexts, settings.chipsBack, day)
  const showing = (id: Parameters<typeof chipRetired>[0]) => !chipRetired(id, states)

  const slot = { day, block }
  const asked = record ? askedOf(record) : askedReadings(block, settings.depth, settings.retiredReadings)
  const ex = record?.extras ?? {}
  const toggle = (key: ExtraKey) => void setExtra(slot, asked, key, !ex[key])
  const loggedPrivate = items.filter((it) => ex.private?.[String(it.id)]).length

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

      <div class="card">
        <ul class="rows">
          {settings.extras.caffeine && <ExtraRow label={copy.extras.caffeine} on={Boolean(ex.caffeine)} onLabel={copy.extras.yes} onClick={() => toggle('caffeine')} />}
          {settings.extras.dinner && <ExtraRow label={copy.extras.dinner} on={Boolean(ex.dinner)} onLabel={copy.extras.yes} onClick={() => toggle('dinner')} />}
          {settings.extras.faith && <ExtraRow label={copy.extras.faith} on={Boolean(ex.closeToGod)} onLabel={copy.extras.yes} onClick={() => toggle('closeToGod')} />}
          {settings.extras.privateLog && items.length > 0 && (
            <li>
              <button type="button" class="row" onClick={() => setShowPrivate((s) => !s)} aria-expanded={showPrivate}>
                <span class="row-main">{copy.extras.private}</span>
                <span class="row-side">{loggedPrivate > 0 ? fill(copy.extras.privateLogged, { n: String(loggedPrivate) }) : ''}</span>
                <span class="chev" aria-hidden="true">{showPrivate ? '⌄' : '›'}</span>
              </button>
            </li>
          )}
          {showPrivate &&
            settings.extras.privateLog &&
            items.map((it) => (
              <ExtraRow
                key={it.id}
                label={it.name}
                on={Boolean(ex.private?.[String(it.id)])}
                onLabel={copy.extras.logged}
                indent
                onClick={() => void setPrivateLogged(slot, asked, it.id as number, !ex.private?.[String(it.id)])}
              />
            ))}
        </ul>
      </div>

      {settings.extras.faith && (
        <button type="button" class="textbtn faint" onClick={() => void updateSettings((s) => ({ ...s, extras: { ...s.extras, faith: false } }))}>
          {copy.extras.faithOff}
        </button>
      )}

      <h2 class="section">{copy.extras.chips}</h2>
      <div class="card">
        <ul class="rows">
          {CHIPS.filter(showing).map((key) => {
            const on = Boolean(ex[key])
            const a = chipAnswer(all, key, day)
            const round = (v: number | null) => (v === null ? '' : String(Math.round(v)))
            const answer =
              a.times === 0
                ? copy.extras.chipFirst
                : a.withEvent.mean === null
                  ? fill(copy.extras.chipTimesNoNext, { n: String(a.times) })
                  : a.without.mean === null
                    ? fill(copy.extras.chipUnmatched, { n: String(a.times), mean: round(a.withEvent.mean), k: String(a.withEvent.n) })
                    : fill(copy.extras.chipTimes, { n: String(a.times), mean: round(a.withEvent.mean), without: round(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
            const cooling = key === 'coolingOff' && on ? coolingOffDuration(all, day) : null
            return (
              <li key={key}>
                <button type="button" class={on ? 'row anchor is-picked' : 'row anchor'} aria-pressed={on} data-testid={`chip-${key}`} onClick={() => toggle(key)}>
                  <span class="anchor-mark" aria-hidden="true" />
                  <span class="row-main">{copy.extras[key]}</span>
                </button>
                {on && (
                  <div class="calc chip-answer" data-testid="chip-answer">
                    <p class="calc-line">{answer}</p>
                    {cooling && <p class="calc-line">{fill(copy.extras.coolingAnswer, { blocks: String(cooling.blocks), events: String(cooling.events) })}</p>}
                    {key === 'bigSocial' && <p class="calc-line">{copy.extras.recoveryNote}</p>}
                    {(key === 'nothingLanded' || key === 'hardToSeePoint') && settings.direction && <p class="calc-line ink">{fill(copy.extras.chipDirection, { line: settings.direction })}</p>}
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
          {(['shower', 'teeth', 'food'] as const).filter(showing).map((key) => (
            <ExtraRow key={key} label={copy.necessities[key]} on={Boolean(ex.necessities?.[key])} onLabel={copy.necessities.missed} testid={`necessity-${key}`} onClick={() => void setNecessity(slot, asked, key, !ex.necessities?.[key])} />
          ))}
        </ul>
      </div>
      <p class="note faint">{copy.necessities.note}</p>

      <TodayChips day={day} />

      <h2 class="section">{copy.extras.noteLabel}</h2>
      <div class="card pad">
        <LineInput initial={ex.note ?? ''} placeholder={copy.extras.notePlaceholder} testid="note-input" onSave={(text) => void setNote(slot, asked, text)} />
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
 * This morning: one statement chip, heavy caffeine, on the morning's summary. Answered at once
 * from the record like the evening chips (the afternoons after mornings that carried it, against
 * the afternoons after mornings that started the same) and retiring like them. Dose and timing
 * stay out: one tap.
 */
export function MorningChips({ day }: { day: string }) {
  const record = useLive(() => getCheckIn(day, 'morning'), [day])
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const contexts = useLive(() => db.days.toArray(), [])
  if (record === undefined || !settings || !all || !contexts) return null
  const states = chipStates(all, contexts, settings.chipsBack, day)
  if (chipRetired('heavyCaffeine', states)) return null
  const asked = record ? askedOf(record) : askedReadings('morning', settings.depth, settings.retiredReadings)
  const on = Boolean(record?.extras?.heavyCaffeine)
  const a = morningChipAnswer(all, day)
  const round = (v: number | null) => (v === null ? '' : String(Math.round(v)))
  const answer =
    a.times === 0
      ? copy.extras.chipFirst
      : a.withEvent.mean === null
        ? fill(copy.extras.morningTimesNoNext, { n: String(a.times) })
        : a.without.mean === null
          ? fill(copy.extras.morningUnmatched, { n: String(a.times), mean: round(a.withEvent.mean), k: String(a.withEvent.n) })
          : fill(copy.extras.morningTimes, { n: String(a.times), mean: round(a.withEvent.mean), without: round(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
  return (
    <>
      <h2 class="section">{copy.extras.morningChips}</h2>
      <div class="card">
        <ul class="rows">
          <li>
            <button type="button" class={on ? 'row anchor is-picked' : 'row anchor'} aria-pressed={on} data-testid="chip-heavyCaffeine" onClick={() => void setExtra({ day, block: 'morning' }, asked, 'heavyCaffeine', !on)}>
              <span class="anchor-mark" aria-hidden="true" />
              <span class="row-main">{copy.extras.heavyCaffeine}</span>
            </button>
            {on && (
              <div class="calc chip-answer" data-testid="chip-answer">
                <p class="calc-line">{answer}</p>
              </div>
            )}
          </li>
        </ul>
      </div>
      <p class="note faint">{copy.extras.morningNote}</p>
    </>
  )
}

/**
 * Today, if different: the exceptions to the week as statement chips, inside the check-in and
 * never on Now (Rules 19 and 20), on every block's summary, since the away flag decides what is
 * offered all day. Each changes today alone.
 */
export function TodayChips({ day }: { day: string }) {
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const contexts = useLive(() => db.days.toArray(), [])
  useEffect(() => {
    if (settings) void ensureDayContext(day, settings)
  }, [settings?.updatedAt, day])
  const ctx = useLive(() => getDayContext(day), [day])
  if (!settings || !all || !contexts || !ctx) return null
  const states = chipStates(all, contexts, settings.chipsBack, day)
  const weekday = parseDay(day).getDay() as Weekday
  const office = settings.week.officeDays[weekday]
  return (
    <>
      <h2 class="section">{copy.today.context}</h2>
      <div class="card">
        <ul class="rows">
          {!chipRetired('away', states) && <ExtraRow label={copy.today.awayToday} on={!ctx.withHer} onLabel={copy.extras.yes} testid="chip-away" onClick={() => void setDayContext(day, { withHer: !ctx.withHer })} />}
          <ExtraRow
            label={settings.week.studyNights[weekday] ? copy.today.notStudyNight : copy.today.studyNight}
            on={ctx.studyNight !== settings.week.studyNights[weekday]}
            onLabel={copy.extras.yes}
            testid="chip-study"
            onClick={() => void setDayContext(day, { studyNight: !ctx.studyNight })}
          />
          <ExtraRow
            label={office ? copy.today.homeToday : copy.today.officeToday}
            on={Boolean(ctx.atOffice) !== office}
            onLabel={copy.extras.yes}
            testid="chip-office"
            onClick={() => void setDayContext(day, { atOffice: !ctx.atOffice })}
          />
        </ul>
      </div>
      <p class="note faint">{copy.today.note}</p>
    </>
  )
}

function ExtraRow({ label, on, onLabel, indent = false, testid, onClick }: { label: string; on: boolean; onLabel: string; indent?: boolean; testid?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" class={`row anchor${on ? ' is-picked' : ''}${indent ? ' is-indent' : ''}`} aria-pressed={on} data-testid={testid} onClick={onClick}>
        <span class="anchor-mark" aria-hidden="true" />
        <span class="row-main">{label}</span>
        <span class="row-side ink">{on ? onLabel : ''}</span>
      </button>
    </li>
  )
}

function LineInput({ initial, placeholder, testid, onSave }: { initial: string; placeholder: string; testid?: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial)
  useEffect(() => setText(initial), [initial])
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

import { useEffect, useState } from 'preact/hooks'
import { addDays, type Block } from './blocks'
import { copy } from './copy'
import {
  answerWin,
  askedOf,
  getCheckIn,
  getSettings,
  privateItems,
  setExtra,
  setPrivateLogged,
  setWin,
  updateSettings,
  winFor,
  type ExtraKey,
  type WinOutcome,
} from './db'
import { fill } from './format'
import { useLive } from './live'
import { askedReadings } from './settings'

const OUTCOMES: readonly WinOutcome[] = ['done', 'partly', 'no']

/**
 * The evening's optional extras, one tap each, every tap saved at once. Skipping costs one
 * tap on Done. "Felt close to God today?" carries its own permanent off switch.
 */
export function ExtrasScreen({ day, block, onDone }: { day: string; block: Block; onDone: () => void }) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const settings = useLive(getSettings, [])
  const items = useLive(privateItems, [])
  const todayWin = useLive(() => winFor(day), [day])
  const tomorrowWin = useLive(() => winFor(addDays(day, 1)), [day])
  const [showPrivate, setShowPrivate] = useState(false)

  if (record === undefined || !settings || !items || todayWin === undefined || tomorrowWin === undefined) return <section class="screen" />

  const slot = { day, block }
  const asked = record ? askedOf(record) : askedReadings(block, settings.depth)
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

      {settings.extras.minimumWin && (
        <>
          <h2 class="section">{copy.extras.tomorrowWin}</h2>
          <div class="card pad">
            <WinInput initial={tomorrowWin?.text ?? ''} onSave={(text) => void setWin(addDays(day, 1), day, text)} />
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

function ExtraRow({ label, on, onLabel, indent = false, onClick }: { label: string; on: boolean; onLabel: string; indent?: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" class={`row anchor${on ? ' is-picked' : ''}${indent ? ' is-indent' : ''}`} aria-pressed={on} onClick={onClick}>
        <span class="anchor-mark" aria-hidden="true" />
        <span class="row-main">{label}</span>
        <span class="row-side ink">{on ? onLabel : ''}</span>
      </button>
    </li>
  )
}

function WinInput({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial)
  useEffect(() => setText(initial), [initial])
  return (
    <input
      class="input"
      type="text"
      maxLength={140}
      placeholder={copy.extras.winPlaceholder}
      value={text}
      onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => onSave(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}

import { useEffect, useState } from 'preact/hooks'
import { BLOCKS, blockAt } from './blocks'
import { SwitchRow } from './controls'
import { copy } from './copy'
import { getDayContext, getSettings } from './db'
import { fill, formatDayShort, formatHHMM } from './format'
import { useLive } from './live'
import { PLACE_KINDS, type PlaceKind, type Where } from './location'
import { answerQuestion, forgetAll, forgetPlace, nameHere, namedPlaces, pendingQuestion, permissionState, renamePlace, turnOff, turnOn, type LocationStatus } from './locationFlow'
import { daylightFor, sunPlace } from './settings'
import { sunLocal } from './sun'

// Part 43: Settings → Location Context, and the one question on Now. The smallest set of controls:
// on or off, name where you are, rename or forget a place, forget everything; the daylight it sets.

/** The last kind of place today's record noted, and the part of the day, in words; null for none. */
function lastNoted(where: Partial<Record<(typeof BLOCKS)[number], Where[]>> | undefined): string | null {
  const c = copy.location
  for (const b of [...BLOCKS].reverse()) {
    const list = where?.[b]
    if (list?.length) return fill(c.whereAt, { where: c.where[list[list.length - 1]], block: b })
  }
  return null
}

export function LocationSection() {
  const settings = useLive(getSettings, [])
  const places = useLive(namedPlaces, [])
  const today = useLive(() => getDayContext(blockAt(new Date()).day), [])
  const [status, setStatus] = useState<LocationStatus | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: number; kind: PlaceKind; label: string } | null>(null)
  const on = settings?.location.on === true
  // A refusal the phone gave to an actual reading stands over an unasked state the permission query may still report.
  useEffect(() => {
    void permissionState().then((p) => setStatus((cur) => (cur === 'denied' && p === 'prompt' ? cur : p)))
  }, [on])
  if (!settings || !places || today === undefined) return <section class="screen" />
  const c = copy.location
  const day = blockAt(new Date()).day
  const where = sunPlace(settings)
  const sun = where ? sunLocal(day, where.place) : null
  const light = daylightFor(settings, day)
  const noted = lastNoted(today?.where)
  const statusLine = !on ? c.status.off : status === 'granted' || status === null ? (noted ? fill(c.status.granted, { where: noted }) : c.status.grantedNone) : c.status[status]
  const named = places.filter((p) => p.kind !== 'none')

  async function toggle(next: boolean) {
    setMsg(null)
    if (!next) return void (await turnOff())
    setStatus(await turnOn())
  }

  async function name(kind: PlaceKind) {
    setMsg(null)
    const r = await nameHere(kind)
    setMsg(c.named[r])
  }

  return (
    <>
      <p class="note">{c.intro}</p>
      <div class="card">
        <SwitchRow label={c.switch} note={c.switchNote} on={on} onChange={(v) => void toggle(v)} testid="location-switch" />
      </div>
      <p class="note faint" data-testid="location-status">
        {statusLine}
      </p>

      {on && status === 'granted' && (
        <div class="card pad" data-testid="location-name-here">
          <p class="setting-label">{c.nameHere}</p>
          <div class="chips" role="group" aria-label={c.nameHere}>
            {PLACE_KINDS.map((k) => (
              <button key={k} type="button" class="when-chip" data-testid={`location-name-${k}`} onClick={() => void name(k)}>
                {c.kinds[k]}
              </button>
            ))}
          </div>
          <p class="note faint no-gap">{msg ?? c.nameHereNote}</p>
        </div>
      )}

      <h2 class="section">{c.known}</h2>
      <div class="card pad" data-testid="location-places">
        {named.length === 0 && <p class="note faint no-gap">{c.knownNone}</p>}
        {named.map((p) =>
          editing?.id === p.id ? (
            <div key={p.id} class="place-edit" data-testid="location-edit">
              <div class="chips" role="group" aria-label={c.rename}>
                {PLACE_KINDS.map((k) => (
                  <button key={k} type="button" class={editing.kind === k ? 'when-chip is-on' : 'when-chip'} aria-pressed={editing.kind === k} onClick={() => setEditing({ ...editing, kind: k })}>
                    {c.kinds[k]}
                  </button>
                ))}
              </div>
              {editing.kind === 'regular' && (
                <input class="input" type="text" maxLength={40} placeholder={c.labelPlaceholder} value={editing.label} aria-label={c.labelPlaceholder} onInput={(e) => setEditing({ ...editing, label: (e.currentTarget as HTMLInputElement).value })} />
              )}
              <div class="actions">
                <button type="button" class="pill-quiet" data-testid="location-save" onClick={() => void renamePlace(p.id, editing.kind, editing.label.trim() || null).then(() => setEditing(null))}>
                  {c.save}
                </button>
                <button type="button" class="textbtn" onClick={() => setEditing(null)}>
                  {c.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div key={p.id} class="place-row" data-testid="location-place">
              <p class="calc-line no-gap">
                <span class="ink">{p.kind === 'regular' && p.label ? p.label : c.kinds[p.kind as PlaceKind]}</span> · {fill(c.namedOn, { day: formatDayShort(p.learnedAt.slice(0, 10)) })}
              </p>
              <div class="actions">
                <button type="button" class="link" data-testid="location-rename" onClick={() => setEditing({ id: p.id, kind: p.kind as PlaceKind, label: p.label ?? '' })}>
                  {c.rename}
                </button>
                <button type="button" class="link" data-testid="location-forget" onClick={() => void forgetPlace(p.id)}>
                  {c.forget}
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <h2 class="section">{c.daylight}</h2>
      <div class="card pad">
        <p class="calc-line no-gap" data-testid="location-daylight">
          {where && sun
            ? fill(where.from === 'auto' ? c.daylightAuto : c.daylightTyped, { rise: formatHHMM(sun.rise), set: formatHHMM(sun.set) })
            : fill(c.daylightFixed, { from: formatHHMM(light.from), to: formatHHMM(light.to) })}
        </p>
      </div>

      <h2 class="section">{c.kept}</h2>
      <div class="card pad">
        <p class="note no-gap" data-testid="location-kept">
          {c.keptNote}
        </p>
      </div>
      <div class="actions">
        <button type="button" class="textbtn" data-testid="location-forget-all" onClick={() => void forgetAll()}>
          {c.forgetAll}
        </button>
      </div>
      <p class="note faint">{c.forgetAllNote}</p>
    </>
  )
}

/** The one question on Now: a place seen on three different days, asked once, with what it looks like first. */
export function PlaceQuestion() {
  const q = useLive(() => pendingQuestion(blockAt(new Date()).day), [])
  if (!q) return null
  const c = copy.location
  const { candidate, guess } = q
  const kinds: (PlaceKind | 'none')[] = [...(guess ? [guess] : []), ...PLACE_KINDS.filter((k) => k !== guess), 'none']
  return (
    <div class="card pad place-question" data-testid="place-question">
      <p class="eyebrow small">{c.question.eyebrow}</p>
      <p class="calc-line">
        {fill(c.question.text, { n: String(candidate.days) })} {guess ? fill(c.question.guess, { kind: c.kinds[guess] }) : c.question.ask}
      </p>
      <div class="chips" role="group" aria-label={c.question.eyebrow}>
        {kinds.map((k) => (
          <button key={k} type="button" class={k === guess ? 'when-chip is-on' : 'when-chip'} data-testid={`place-answer-${k}`} onClick={() => void answerQuestion(candidate.id as number, k)}>
            {c.kinds[k]}
          </button>
        ))}
        {/* The last chip of the same group, so its target keeps the group's own spacing in every theme. */}
        <button type="button" class="when-chip" data-testid="place-later" onClick={() => void answerQuestion(candidate.id as number, 'later')}>
          {c.question.later}
        </button>
      </div>
    </div>
  )
}

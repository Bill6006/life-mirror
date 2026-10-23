import { useState } from 'preact/hooks'
import { churchSchedule, cleanTimes } from './church'
import { Seg } from './controls'
import { copy } from './copy'
import { refreshChurchToday, updateSettings } from './db'
import { fill, formatHHMM } from './format'
import type { Settings, Weekday } from './settings'

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]
/** A weekday's name, as the week's line says it. */
const weekdayName = (d: Weekday): string => new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'long' })

// Sabbath Day and Third Day in Settings (Item 3, 2026-10-23): where the Church day label was, two tabs and Edit times; under
// them the one weekday grid, editing the tab chosen; the chosen schedule's service times behind Edit times, closed until
// tapped. An edit re-shapes today at most, never an earlier day.

/** A time not yet in the list, for Add a time: the evening service first. */
function nextTime(times: readonly string[]): string {
  return ['19:30', '07:30', '14:30', '10:00', '12:00', '17:00'].find((t) => !times.includes(t)) ?? '12:00'
}

/** The week's line on the Settings screen: "Sabbath Saturday · Third Day Tuesday", or that there is no church day. */
export function churchSummary(w: Settings['week']): string {
  const n = copy.settingsNav
  const s = churchSchedule(w)
  const parts = [s.sabbath.day !== null ? fill(n.sabbathOn, { day: weekdayName(s.sabbath.day) }) : null, s.third.day !== null ? fill(n.thirdOn, { day: weekdayName(s.third.day) }) : null].filter((x): x is string => x !== null)
  return parts.length ? parts.join(' · ') : n.churchNone
}

export function ChurchSchedule({ week }: { week: Settings['week'] }) {
  const c = copy.week
  const [which, setWhich] = useState<'sabbath' | 'third'>('sabbath')
  const [editing, setEditing] = useState(false)
  const s = churchSchedule(week)
  const cur = which === 'sabbath' ? s.sabbath : s.third
  const name = which === 'sabbath' ? c.sabbathDay : c.thirdDay
  const save = (change: (w: Settings['week']) => Settings['week']) => void updateSettings((st) => ({ ...st, week: change(st.week) })).then(() => refreshChurchToday())
  const setDay = (v: string) => {
    const day = v === 'none' ? null : (Number(v) as Weekday)
    save((w) => (which === 'sabbath' ? { ...w, churchDay: day } : { ...w, thirdDay: day }))
  }
  const setTimes = (times: string[]) => save((w) => (which === 'sabbath' ? { ...w, sabbathServices: cleanTimes(times) } : { ...w, thirdDayServices: cleanTimes(times) }))
  const head = (
    <div class="church-head" role="tablist" aria-label={c.churchDay}>
      {(['sabbath', 'third'] as const).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={which === k} class={which === k ? 'church-tab is-on' : 'church-tab'} data-testid={`church-tab-${k}`} onClick={() => setWhich(k)}>
          {k === 'sabbath' ? c.sabbathDay : c.thirdDay}
        </button>
      ))}
      <button type="button" class="textbtn church-edit" aria-expanded={editing} data-testid="church-times-open" onClick={() => setEditing((v) => !v)}>
        {c.editTimes}
      </button>
    </div>
  )
  return (
    <div data-testid="church-schedule">
      <Seg head={head} label={name} class="seg-days" value={cur.day === null ? 'none' : String(cur.day)} options={[...WEEKDAYS.map((d) => ({ v: String(d), l: c.days[d] })), { v: 'none', l: c.none }]} onChange={setDay} />
      {editing && (
        <div class="church-times" data-testid="church-times" aria-label={name}>
          {cur.services.length === 0 && <p class="note faint no-gap">{c.timesNone}</p>}
          {cur.services.map((t, i) => (
            <div key={`${which}-${t}`} class="church-time" data-testid="church-time-row">
              <input
                type="time"
                value={t}
                aria-label={fill(c.serviceAt, { n: String(i + 1) })}
                data-testid="church-time"
                onChange={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value
                  if (v) setTimes(cur.services.map((x, j) => (j === i ? v : x)))
                }}
              />
              <button type="button" class="textbtn" aria-label={fill(c.removeTime, { time: formatHHMM(t) })} data-testid="church-time-remove" onClick={() => setTimes(cur.services.filter((_, j) => j !== i))}>
                {c.remove}
              </button>
            </div>
          ))}
          <button type="button" class="textbtn" data-testid="church-time-add" onClick={() => setTimes([...cur.services, nextTime(cur.services)])}>
            {c.addTime}
          </button>
        </div>
      )}
    </div>
  )
}

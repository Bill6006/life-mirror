import { useState } from 'preact/hooks'
import { blockAt } from './blocks'
import { copy } from './copy'
import { getSettings } from './db'
import { fill, formatDayLong, formatDayShort } from './format'
import { useLive } from './live'
import { awayStatus, endAway, setAway, type AwayStatus } from './awayFlow'
import type { AwayProblem } from './postWindow'
import { SubHead } from './ui'

/** The trip in one line, as Now, Settings and the check-in's row say it; null when none is set. */
export function awayLine(status: AwayStatus): string | null {
  if (!status) return null
  const a = copy.away
  return status.state === 'away' ? fill(a.until, { to: formatDayLong(status.range.to) }) : fill(a.ahead, { from: formatDayLong(status.range.from), to: formatDayLong(status.range.to) })
}

/** The trip short, for a row's line: until when, or from when to when; null when none is set. */
export function awayShort(status: AwayStatus): string | null {
  if (!status) return null
  const a = copy.away
  return status.state === 'away' ? fill(a.untilRow, { to: formatDayShort(status.range.to) }) : fill(a.aheadRow, { from: formatDayShort(status.range.from), to: formatDayShort(status.range.to) })
}

/**
 * Away from home (post-window, gated; agreed 2026-10-04): its own screen. A trip's first and last
 * day, the last required, so it always ends by itself; while one is set, when it runs and the way to
 * end it. Only the dates are kept, never where. Reached only while the gate is open: from Settings,
 * from a check-in's "Today, if different" and from the line on Now.
 */
export function AwayScreen({ onClose }: { onClose: () => void }) {
  const settings = useLive(getSettings, [])
  const today = blockAt(new Date()).day
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [problem, setProblem] = useState<AwayProblem | null>(null)
  if (!settings) return <section class="screen" />
  const a = copy.away
  const status = awayStatus(settings.away, today)
  // A trip under way keeps its first day; only its last may move.
  const started = status?.state === 'away' && status.range.from < today
  const fromValue = from ?? status?.range.from ?? today
  const toValue = to ?? status?.range.to ?? ''
  const line = awayLine(status)

  async function save(): Promise<void> {
    const p = await setAway(fromValue, toValue)
    if (p === 'gated') return
    setProblem(p)
    if (p === null) {
      setFrom(null)
      setTo(null)
    }
  }

  async function end(): Promise<void> {
    await endAway()
    setFrom(null)
    setTo(null)
    setProblem(null)
  }

  return (
    <section class="screen" data-testid="away-screen">
      <SubHead title={a.title} back={a.back} onBack={onClose} />
      <p class="note">{a.about}</p>
      {line && (
        <p class="note ink" data-testid="away-status">
          {line}
        </p>
      )}
      <div class="card pad">
        <div class="setting">
          <label class="setting-label" for="away-from">
            {a.from}
          </label>
          <input id="away-from" class="input" type="date" value={fromValue} min={started ? undefined : today} disabled={started} data-testid="away-from" onInput={(e) => setFrom((e.currentTarget as HTMLInputElement).value)} />
        </div>
        <div class="setting">
          <label class="setting-label" for="away-to">
            {a.to}
          </label>
          <input id="away-to" class="input" type="date" value={toValue} min={fromValue} required data-testid="away-to" onInput={(e) => setTo((e.currentTarget as HTMLInputElement).value)} />
        </div>
        {problem ? (
          <p class="note" role="alert" data-testid="away-problem">
            {a.problems[problem]}
          </p>
        ) : (
          <p class="note faint">{a.ends}</p>
        )}
        <div class="actions">
          <button type="button" class="pill-quiet" data-testid="away-save" onClick={() => void save()}>
            {status ? a.change : a.set}
          </button>
          {status && (
            <button type="button" class="textbtn" data-testid="away-end" onClick={() => void end()}>
              {status.state === 'away' ? a.end : a.remove}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

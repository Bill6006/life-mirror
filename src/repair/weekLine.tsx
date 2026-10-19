import { copy } from '../copy'
import { fill } from '../format'
import { useLive } from '../live'
import { answerWeek, weekState } from './flow'
import { repairOn } from './gate'

/**
 * The learning week on Now (stage R3): the invitation while one stands, Yes and Not now, or a quiet line while a week
 * runs. Nothing while the learning repair is closed on this phone.
 */
export function WeekLine({ day }: { day: string }) {
  const on = repairOn()
  const state = useLive(() => (on ? weekState(day) : Promise.resolve(null)), [day, on])
  if (!state) return null
  const c = copy.learningWeek
  if (state.invitation)
    return (
      <div class="card pad" data-testid="week-invite">
        <p class="eyebrow small">{c.title}</p>
        <p class="muted">{c.what}</p>
        <div class="actions">
          <button type="button" class="pill-quiet" data-testid="week-yes" onClick={() => void answerWeek(day, true)}>
            {c.yes}
          </button>
          <button type="button" class="pill-quiet" data-testid="week-not-now" onClick={() => void answerWeek(day, false)}>
            {c.notNow}
          </button>
        </div>
      </div>
    )
  if (state.weekDay !== null)
    return (
      <div class="card pad" data-testid="week-running">
        <details class="calc week-running">
          <summary class="calc-line">{fill(c.running, { n: String(state.weekDay) })}</summary>
          <p class="muted">{c.runningWhat}</p>
        </details>
      </div>
    )
  return null
}

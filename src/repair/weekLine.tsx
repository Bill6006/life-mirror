import { copy } from '../copy'
import { fill } from '../format'
import { useLive } from '../live'
import { guardRepair } from './breaker'
import { answerWeek, weekState } from './flow'
import { useEngineFailed } from './gate'

/**
 * The learning week on Now (stage R3): the invitation while one stands, Yes and Not now, or a quiet line while a week
 * runs. Nothing while the engine cannot read the record on this phone.
 */
export function WeekLine({ day }: { day: string }) {
  const failed = useEngineFailed()
  const state = useLive(() => (failed ? Promise.resolve(null) : guardRepair(day, () => weekState(day), null)), [day, failed])
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

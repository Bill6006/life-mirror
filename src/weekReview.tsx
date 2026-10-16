import { useEffect } from 'preact/hooks'
import { markShown, weekReview, writtenBy } from './brainFlow'
import { copy } from './copy'
import { clockTimes12 } from './format'
import { useLive } from './live'

/**
 * The week, reviewed, at the head of the weekly view: what held, what did not, and one change.
 * The Worker's three parts when it wrote them this week, held to the same rules as a line; else
 * the record's own, from the trajectories and the strongest strategy the sheet supports.
 */
export function WeekReviewCard({ day }: { day: string }) {
  const r = useLive(() => weekReview(day), [day])
  // The Worker's review counts as said only once it has been on screen (stage 1, item m).
  useEffect(() => {
    if (r?.source === 'worker' && r.key) void markShown({ key: r.key, source: 'worker' })
  }, [r?.key])
  const c = copy.brain.review
  if (!r) return null
  return (
    <>
      <h2 class="section">{c.title}</h2>
      <div class="card pad" data-testid="week-review">
        <div class="calc">
          <p class="calc-line">
            <span class="calc-key">{c.held}</span> · <span data-testid="week-review-held">{clockTimes12(r.held)}</span>
          </p>
          <p class="calc-line">
            <span class="calc-key">{c.didNot}</span> · <span data-testid="week-review-did-not">{clockTimes12(r.didNot)}</span>
          </p>
          <p class="calc-line ink">
            <span class="calc-key">{c.change}</span> · <span data-testid="week-review-change">{clockTimes12(r.change)}</span>
          </p>
        </div>
        <p class="note faint no-gap" data-testid="week-review-writer">
          {writtenBy(r, c)}
        </p>
      </div>
    </>
  )
}

import { copy } from './copy'

/** Rule 1 of the plan: facts, calculations and conclusions always look different. */
export function LegendScreen({ onClose }: { onClose: () => void }) {
  const c = copy.legend
  return (
    <section class="screen">
      <p class="eyebrow">{c.title}</p>
      <p class="note">{c.intro}</p>

      <div class="legend-item">
        <h2 class="title-sm">{c.facts}</h2>
        <p class="note">{c.factsNote}</p>
      </div>
      <div class="legend-item calc">
        <h2 class="title-sm">{c.calcs}</h2>
        <p class="calc-line">{c.calcsNote}</p>
      </div>
      <div class="legend-item">
        <h2 class="title-sm">{c.conclusions}</h2>
        <p class="note">{c.conclusionsNote}</p>
      </div>

      <h2 class="section">{c.recipe}</h2>
      <p class="note">{c.recipeNote}</p>
      <h2 class="section">{c.stances}</h2>
      <p class="note">{c.stancesNote}</p>
      <h2 class="section">{c.context}</h2>
      <p class="note">{c.contextNote}</p>
      <h2 class="section">{c.silence}</h2>
      <p class="note">{c.silenceNote}</p>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

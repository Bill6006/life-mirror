import { copy } from './copy'

/** Rule 1 of the plan: facts, calculations and conclusions always look different. */
export function LegendScreen({ onClose }: { onClose: () => void }) {
  const c = copy.legend
  return (
    <section class="screen">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note">{c.intro}</p>

      <div class="card pad">
        <div class="legend-item">
          <h2 class="title-sm">{c.facts}</h2>
          <p class="note no-gap">{c.factsNote}</p>
        </div>
        <div class="legend-item calc">
          <h2 class="title-sm">{c.calcs}</h2>
          <p class="calc-line no-gap">{c.calcsNote}</p>
        </div>
        <div class="legend-item last">
          <h2 class="title-sm">{c.conclusions}</h2>
          <p class="note no-gap">{c.conclusionsNote}</p>
        </div>
      </div>

      <h2 class="section">{c.recipe}</h2>
      <div class="card pad">
        <p class="note no-gap">{c.recipeNote}</p>
      </div>
      <h2 class="section">{c.stances}</h2>
      <div class="card pad">
        <p class="note no-gap">{c.stancesNote}</p>
      </div>
      <h2 class="section">{c.context}</h2>
      <div class="card pad">
        <p class="note no-gap">{c.contextNote}</p>
      </div>
      <h2 class="section">{c.silence}</h2>
      <div class="card pad">
        <p class="note no-gap">{c.silenceNote}</p>
      </div>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

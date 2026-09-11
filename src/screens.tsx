import { copy } from './copy'
import { fill } from './format'
import { LAST_PHASE, PHASE_OF, SHIPPED_THROUGH } from './phases'

type Coming = keyof typeof PHASE_OF

/** A small hairline sketch of what the tab will hold: a protected step, climbing. */
function Sketch() {
  return (
    <svg class="sketch" viewBox="0 0 320 96" aria-hidden="true">
      <polyline class="sk-line" points="12,84 84,84 84,62 156,62 156,40 228,40 228,18 308,18" />
      <circle class="sk-accent" cx="268" cy="18" r="4" />
      <rect class="sk-line" x="108" y="46" width="24" height="16" rx="3" />
      <path class="sk-line" d="M113 46 v-4 a7 7 0 0 1 14 0 v4" />
    </svg>
  )
}

/** A quiet panel for a tab that is not built yet: what it will hold, and which phase brings it. */
export function ComingPanel({ tab }: { tab: Coming }) {
  const c = copy.panels[tab]
  const phase = PHASE_OF[tab]
  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="eyebrow">{copy.tabs[tab]}</h1>
      </header>
      <div class="card panel">
        <Sketch />
        <h2 class="panel-title">{c.title}</h2>
        <p class="panel-body">{c.body}</p>
        <p class="panel-when">{c.when}</p>
        <div class="phases" aria-hidden="true">
          {Array.from({ length: LAST_PHASE + 1 }, (_, i) => (
            <span key={i} class={i <= SHIPPED_THROUGH ? 'phase is-done' : i === phase ? 'phase is-this' : 'phase'} />
          ))}
        </div>
        <p class="phases-label">{fill(copy.panels.strip, { shipped: String(SHIPPED_THROUGH), last: String(LAST_PHASE), phase: String(phase) })}</p>
      </div>
    </section>
  )
}

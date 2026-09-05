import { copy } from './copy'
import { fill } from './format'
import { LAST_PHASE, PHASE_OF, SHIPPED_THROUGH } from './phases'

type Coming = keyof typeof PHASE_OF

/** Small hairline sketches of what each tab will hold. */
function Sketch({ kind }: { kind: Coming }) {
  if (kind === 'mirror') {
    return (
      <svg class="sketch" viewBox="0 0 320 96" aria-hidden="true">
        <polyline class="sk-line" points="12,64 60,52 108,58 156,34 204,42 252,26 300,30" />
        {[12, 60, 108, 156, 204, 252].map((x, i) => (
          <circle key={x} class="sk-dot" cx={x} cy={[64, 52, 58, 34, 42, 26][i]} r="2.5" />
        ))}
        <circle class="sk-accent" cx="300" cy="30" r="4" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3, 4, 5, 6].map((c) => (
            <rect key={`${r}-${c}`} class="sk-cell" x={12 + c * 14} y={76 + r * 6} width="11" height="4" rx="1" style={{ opacity: 0.25 + ((r * 7 + c) % 5) * 0.15 }} />
          )),
        )}
      </svg>
    )
  }
  if (kind === 'moves') {
    return (
      <svg class="sketch" viewBox="0 0 320 96" aria-hidden="true">
        <circle class="sk-line" cx="48" cy="48" r="22" />
        <circle class="sk-accent" cx="48" cy="48" r="4" />
        <line class="sk-line" x1="80" y1="48" x2="150" y2="48" />
        <polyline class="sk-line" points="142,40 150,48 142,56" />
        <rect class="sk-line" x="164" y="30" width="144" height="36" rx="18" />
        <line class="sk-line" x1="184" y1="44" x2="270" y2="44" />
        <line class="sk-line" x1="184" y1="54" x2="240" y2="54" />
      </svg>
    )
  }
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
        <Sketch kind={tab} />
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

import { copy } from './copy'

/**
 * Always reachable, never handled by the app: real numbers for people who do this. The plan's
 * therapeutic layer points here; the app itself only opens the door.
 */
export function CrisisScreen({ onClose }: { onClose: () => void }) {
  const c = copy.crisis
  return (
    <section class="screen" data-testid="crisis">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note">{c.intro}</p>
      <div class="card">
        <ul class="rows">
          <li>
            <a class="row" href="tel:988">
              <span class="row-main">
                {c.lifeline}
                <span class="sub">{c.lifelineNote}</span>
              </span>
              <span class="chev" aria-hidden="true">›</span>
            </a>
          </li>
          <li>
            <a class="row" href="sms:741741?body=HOME">
              <span class="row-main">
                {c.textLine}
                <span class="sub">{c.textLineNote}</span>
              </span>
              <span class="chev" aria-hidden="true">›</span>
            </a>
          </li>
          <li>
            <a class="row" href="tel:911">
              <span class="row-main">
                {c.emergency}
                <span class="sub">{c.emergencyNote}</span>
              </span>
              <span class="chev" aria-hidden="true">›</span>
            </a>
          </li>
        </ul>
      </div>
      <p class="note faint">{c.abroad}</p>
      <p class="note faint">{c.note}</p>
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

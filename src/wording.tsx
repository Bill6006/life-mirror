import { copy } from './copy'
import { description, headword, readings } from './readings'

/** Every reading and its five phrases, least to most, exactly as the check-in shows them. */
export function WordingScreen({ onClose }: { onClose: () => void }) {
  return (
    <section class="screen">
      <header class="screen-head">
        <p class="eyebrow">{copy.settings.wording}</p>
      </header>
      <p class="note">{copy.wording.intro}</p>
      <p class="note">{copy.wording.sets}</p>

      {readings.map((r) => (
        <div key={r.id} class="wording-reading">
          <h2 class="title-sm">{r.name}</h2>
          <p class="note faint">{r.prompt}</p>
          <div class="card">
            <ul class="rows">
              {r.anchors.map((a) => {
                const desc = description(a)
                return (
                  <li key={a} class="row is-static">
                    <span class="row-main">
                      <span class="head">{headword(a)}</span>
                      {desc && <span class="desc"> — {desc}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ))}

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

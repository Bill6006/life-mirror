import { copy } from './copy'
import { db } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { activeAnchors, description, headword, readings } from './readings'

/** Every reading and its five phrases, least to most, exactly as the check-in shows them. */
export function WordingScreen({ onClose }: { onClose: () => void }) {
  const swaps = useLive(() => db.anchorSwaps.toArray(), [])
  if (!swaps) return <section class="screen" />
  return (
    <section class="screen">
      <header class="screen-head">
        <p class="eyebrow">{copy.settings.wording}</p>
      </header>
      <p class="note">{copy.wording.intro}</p>
      <p class="note">{copy.wording.sets}</p>
      <p class="note faint">{copy.wording.alternatesNote}</p>

      {readings.map((r) => (
        <div key={r.id} class="wording-reading">
          <h2 class="title-sm">{r.name}</h2>
          <p class="note faint">{r.prompt}</p>
          <div class="card">
            <ul class="rows">
              {activeAnchors(r.id).map((a, i) => {
                const desc = description(a)
                const swap = swaps.find((s) => s.reading === r.id && s.position === i + 1) ?? null
                const alt = swap ? null : (r.alternates?.[i] ?? null)
                return (
                  <li key={a} class="row is-static">
                    <span class="row-main">
                      <span class="head">{headword(a)}</span>
                      {desc && <span class="desc"> — {desc}</span>}
                      {alt && (
                        <span class="sub" data-testid="alternate">
                          {fill(copy.wording.alternate, { phrase: alt })}
                        </span>
                      )}
                      {swap && (
                        <span class="sub" data-testid="swapped">
                          {fill(copy.wording.swapped, { date: formatDayShort(swap.at), from: swap.from })}
                        </span>
                      )}
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

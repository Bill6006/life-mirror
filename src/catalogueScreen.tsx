import { families, movesInFamily, type Move } from './catalogue'
import { copy } from './copy'
import { fill } from './format'
import { readingById } from './readings'

// Every move, readable in full on the phone. Nothing here suggests anything; Phase 6 does that.

function targetsLine(m: Move): string {
  return m.targets.map((t) => `${readingById(t.reading).name} ${t.direction === 'up' ? '↑' : '↓'} · ${copy.catalogue.windows[t.window]}`).join(' · ')
}

function MoveCard({ m, names }: { m: Move; names: Map<string, string> }) {
  const c = copy.catalogue
  const takes = m.minutes === 0 ? c.noTime : fill(c.minutes, { n: String(m.minutes) })
  const needs = m.needs.length ? m.needs.map((n) => c.needs[n]).join(', ') : c.needsNothing
  return (
    <li class="move" id={`move-${m.id}`}>
      <h3 class="move-name">{m.name}</h3>
      <p class="move-what">{m.what}</p>
      <p class="move-meta">
        {takes} · {fill(c.effort, { level: c.efforts[m.effort] })} · {fill(c.needsLabel, { needs })}
      </p>
      <p class="move-meta">
        {c.shouldMove}: {targetsLine(m)}
      </p>
      <p class="move-meta">
        {c.when}: {m.when.map((b) => copy.blocks[b].toLowerCase()).join(', ')}
        {m.countsToward.length > 0 && ` · ${c.countsToward}: ${m.countsToward.map((k) => c.counters[k]).join(', ')}`}
      </p>
      {m.conflicts.length > 0 && (
        <p class="move-meta">
          {c.notAlongside}: {m.conflicts.map((id) => names.get(id) ?? id).join('; ')}
        </p>
      )}
      {m.replaces.length > 0 && (
        <p class="move-meta">
          {c.standsInFor}: {m.replaces.join(', ')}
        </p>
      )}
      <p class="move-source">
        <span class="move-strength">{c.strengths[m.source.strength]}</span> · {m.source.who} ({m.source.year}). {m.source.what}.
      </p>
    </li>
  )
}

export function CatalogueScreen({ onClose }: { onClose: () => void }) {
  const c = copy.catalogue
  const names = new Map<string, string>()
  for (const f of families) for (const m of movesInFamily(f.id)) names.set(m.id, m.name)
  const total = names.size
  return (
    <section class="screen catalogue">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
        <p class="date">{fill(c.count, { n: String(total), families: String(families.length) })}</p>
      </header>
      <p class="note">{c.intro}</p>
      <p class="note">{c.strengthNote}</p>
      <p class="note faint">{c.vetoNote}</p>

      <ul class="chips family-chips">
        {families.map((f) => (
          <li key={f.id}>
            <a class="chip" href={`#family-${f.id}`}>
              {f.name}
            </a>
          </li>
        ))}
      </ul>

      {families.map((f) => {
        const list = movesInFamily(f.id)
        return (
          <div key={f.id} id={`family-${f.id}`} class="family">
            <h2 class="section">
              {f.name} · {list.length}
            </h2>
            <div class="card">
              <ul class="moves" data-testid="family-moves">
                {list.map((m) => (
                  <MoveCard key={m.id} m={m} names={names} />
                ))}
              </ul>
            </div>
          </div>
        )
      })}

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

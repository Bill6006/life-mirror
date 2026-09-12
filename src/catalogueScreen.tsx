import { extensionPrompt, families, filterTags, isParked, isProposed, learnedTags, moves, movesInFamily, proposals, research, type Move, type Source } from './catalogue'
import { copy } from './copy'
import { fill } from './format'
import { readingById } from './readings'

// Every move, readable in full on the phone, with its tags and its starting belief; the learned
// tags and their priors; the research behind the layer; the extension prompt. Nothing here
// suggests anything: proposed entries are read and vetoed, and Green wires them.

function targetsLine(m: Move): string {
  return m.targets.map((t) => `${readingById(t.reading).name} ${t.direction === 'up' ? '↑' : '↓'} · ${copy.catalogue.windows[t.window]}`).join(' · ')
}

function effectWords(effect: number): string {
  const c = copy.catalogue.effectWords
  return c[String(effect) as keyof typeof c] ?? String(effect)
}

function tagsLine(m: Move): string {
  const c = copy.catalogue
  const parts = [...m.tags.ingredients.map((t) => c.tagNames[t]), ...m.tags.reward.map((t) => c.tagNames[t]), fill(c.intensity, { level: c.efforts[m.tags.intensity] })]
  return parts.join(' · ')
}

function SourceLine({ s }: { s: Source }) {
  const c = copy.catalogue
  return (
    <p class="move-source">
      <span class="move-strength">{c.strengths[s.strength]}</span> · {s.who} ({s.year}). {s.what}.
    </p>
  )
}

function statusLine(m: Move): string | null {
  const c = copy.catalogue
  const parts: string[] = []
  if (isProposed(m)) parts.push(`${c.proposed} · ${c.proposedNote}`)
  if (isParked(m)) parts.push(c.parked)
  if (m.ladder) parts.push(fill(c.ladderRung, { n: String(m.ladder.rung) }))
  if (m.setup) parts.push(m.setup.kind === 'necessity' && m.setup.necessity ? fill(c.setupKinds.necessity, { necessity: c.necessities[m.setup.necessity] }) : (c.setupKinds[m.setup.kind as keyof typeof c.setupKinds] ?? m.setup.kind))
  if (m.passive) parts.push(c.passiveProposed)
  return parts.length ? parts.join(' · ') : null
}

function MoveCard({ m, names }: { m: Move; names: Map<string, string> }) {
  const c = copy.catalogue
  const takes = m.minutes === 0 ? c.noTime : fill(c.minutes, { n: String(m.minutes) })
  const needs = m.needs.length ? m.needs.map((n) => c.needs[n]).join(', ') : c.needsNothing
  const first = m.targets[0]
  const status = statusLine(m)
  return (
    <li class={isProposed(m) ? 'move is-proposed' : 'move'} id={`move-${m.id}`} data-proposed={isProposed(m) ? 'true' : undefined}>
      <h3 class="move-name">{m.name}</h3>
      {status && <p class="move-status">{status}</p>}
      <p class="move-what">{m.what}</p>
      <p class="move-meta">
        {takes} · {fill(c.effort, { level: c.efforts[m.effort] })} · {fill(c.costLabel, { level: c.efforts[m.costToAssign] })} · {fill(c.needsLabel, { needs })}
      </p>
      <p class="move-meta">
        {c.shouldMove}: {targetsLine(m)}
      </p>
      <p class="move-meta">
        {c.tags}: {tagsLine(m)}
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
      <p class="calc-line prior" data-testid="prior">
        <span class="calc-key">{c.prior}</span> ·{' '}
        {fill(c.priorLine, { target: readingById(first.reading).name, arrow: first.direction === 'up' ? '↑' : '↓', effect: effectWords(m.prior.effect), window: c.windows[first.window] })} · {m.prior.note}.
      </p>
      <SourceLine s={m.source} />
    </li>
  )
}

export function CatalogueScreen({ onClose }: { onClose: () => void }) {
  const c = copy.catalogue
  const names = new Map<string, string>()
  for (const m of moves) names.set(m.id, m.name)
  const proposed = moves.filter(isProposed).length
  return (
    <section class="screen catalogue">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
        <p class="date">{fill(c.count, { n: String(moves.length), families: String(families.length), proposed: String(proposed) })}</p>
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
        <li>
          <a class="chip" href="#research">
            {c.researchTitle}
          </a>
        </li>
      </ul>

      <h2 class="section" id="learned">
        {c.learnedTitle}
      </h2>
      <p class="note">{c.learnedNote}</p>
      <div class="card">
        <ul class="moves" data-testid="learned-tags">
          {learnedTags.map((t) => (
            <li key={t.id} class="move">
              <h3 class="move-name">{t.name}</h3>
              <p class="move-what">{t.what}</p>
              <p class="calc-line prior">
                <span class="calc-key">{c.prior}</span> · {t.prior.note}.
              </p>
              <SourceLine s={t.source} />
            </li>
          ))}
        </ul>
      </div>

      <h2 class="section">{c.filterTitle}</h2>
      <p class="note">{c.filterNote}</p>
      <div class="card">
        <ul class="moves">
          {filterTags.map((t) => (
            <li key={t.id} class="move">
              <h3 class="move-name">{t.name}</h3>
              <p class="move-what">{t.what}</p>
            </li>
          ))}
        </ul>
      </div>

      {families.map((f) => {
        const list = movesInFamily(f.id)
        return (
          <div key={f.id} id={`family-${f.id}`} class="family">
            <h2 class="section">
              {f.name} · {list.length}
            </h2>
            {f.id === 'money' && <p class="note">{proposals.money.note}</p>}
            {f.id === 'charisma' && <p class="note">{proposals.charisma.note}</p>}
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

      <h2 class="section">{c.tradesTitle}</h2>
      <div class="card pad">
        <p class="note">{proposals.money.note}</p>
        <p class="note">{proposals.charisma.note}</p>
        <p class="note">
          {c.passiveProposed}: {proposals.passive.map((id) => names.get(id) ?? id).join(', ')}.
        </p>
        <p class="calc-line">
          <span class="calc-key">{c.wiringLabel}</span> · {proposals.wiring}
        </p>
      </div>

      <h2 class="section" id="research">
        {c.researchTitle}
      </h2>
      <p class="note">{c.researchNote}</p>
      {research.map((r) => (
        <div key={r.id} class="card pad research" data-testid="research">
          <h3 class="move-name">{r.name}</h3>
          {r.sources.map((s) => (
            <SourceLine key={s.who + s.year} s={s} />
          ))}
          <p class="move-meta">{c.contributes}:</p>
          <ul class="plain">
            {r.contributes.map((line) => (
              <li key={line} class="move-meta">
                {line}
              </li>
            ))}
          </ul>
          <p class="calc-line">
            <span class="calc-key">{c.chipsLabel}</span> · {r.chips}
          </p>
        </div>
      ))}

      <h2 class="section">{c.extensionTitle}</h2>
      <p class="note">{extensionPrompt.intro}</p>
      <div class="card pad">
        <pre class="prompt" data-testid="extension-prompt">
          {extensionPrompt.template}
        </pre>
      </div>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

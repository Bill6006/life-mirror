import { extensionPrompt, families, filterTags, isParked, isProposed, learnedTags, moves, movesInFamily, pathReps, paths, proposals, research, type Move, type Path, type Source } from './catalogue'
import { cardById, gradeWord } from './library'
import { blockAt } from './blocks'
import { copy } from './copy'
import { updateSettings } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { standingSince } from './offerFlow'
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
  for (const p of paths) {
    const place = m.path?.[p.id]
    if (place) parts.push(`${fill(c.paths.onPath, { path: p.name, n: String(place.stage) })}, ${place.advances ? c.paths.advances : c.paths.movesNothing}`)
  }
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
  // A one-time setup already made: the day it was, and the one word that brings it back (Rule 13).
  const standing = useLive(() => (m.setup ? standingSince(m.id) : Promise.resolve(null)), [m.id])
  return (
    <li class={isProposed(m) ? 'move is-proposed' : 'move'} id={`move-${m.id}`} data-proposed={isProposed(m) ? 'true' : undefined}>
      <h3 class="move-name">{m.name}</h3>
      {status && <p class="move-status">{status}</p>}
      {standing && (
        <p class="move-status" data-testid="standing">
          {fill(c.standingSince, { date: formatDayShort(standing) })} ·{' '}
          <button type="button" class="textbtn faint" data-testid="came-undone" onClick={() => void updateSettings((s) => ({ ...s, setupUndone: { ...s.setupUndone, [m.id]: blockAt(new Date()).day } }))}>
            {c.cameUndone}
          </button>
        </p>
      )}
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

/** One rep as a path shows it: whether it moves the stage, where it happens, the cue, the crutch, when it is done, and any limit on it. */
function PathRep({ m, path }: { m: Move; path: Path }) {
  const c = copy.catalogue.paths
  const place = m.path?.[path.id]
  return (
    <li class={isProposed(m) ? 'move is-proposed' : 'move'} data-testid="path-rep">
      <h4 class="move-name">
        <a href={`#move-${m.id}`}>{m.name}</a>
      </h4>
      <p class="move-meta">
        {place?.advances ? c.advances : c.movesNothing}
        {m.settings?.length ? ` · ${c.where}: ${m.settings.map((k) => c.settingNames[k]).join(', ')}` : ''}
        {m.channel ? ` · ${c.channel}: ${path.channels?.find((ch) => ch.id === m.channel)?.name ?? m.channel}` : ''}
        {isProposed(m) ? ` · ${copy.catalogue.proposed}` : ''}
      </p>
      {m.cue && (
        <p class="move-meta">
          {c.cue}: {m.cue}
        </p>
      )}
      {m.crutch && (
        <p class="move-meta">
          {c.crutch}: {m.crutch}
        </p>
      )}
      {m.doneWhen && <p class="move-meta">{m.doneWhen}</p>}
      {m.guardrail && <p class="move-status">{m.guardrail}</p>}
    </li>
  )
}

/** A path in full (Parts 23 and 26): its stages and reps, the rule and its sources, what is counted and never counted, what is left out, and the evidence. */
function PathSection({ path }: { path: Path }) {
  const c = copy.catalogue.paths
  return (
    <div id={`path-${path.id}`} class="family" data-testid="path">
      <h2 class="section">
        {path.name} · {path.stages.length}
      </h2>
      <p class="note">{path.what}</p>
      {path.stages.map((st) => {
        const reps = pathReps(path.id, st.n)
        const acts = (path.acts ?? []).filter((a) => a.stage === st.n)
        return (
          <div key={st.n} class="card pad" data-testid="path-stage">
            <h3 class="move-name">{fill(c.stage, { n: String(st.n), name: st.name })}</h3>
            <p class="move-what">{st.what}</p>
            <p class="move-meta">
              {c.notProgress}: {st.notProgress}
            </p>
            <p class="move-status">{c.moves[st.advance ?? 'counts']}</p>
            {reps.length > 0 && (
              <ul class="moves">
                {reps.map((m) => (
                  <PathRep key={m.id} m={m} path={path} />
                ))}
              </ul>
            )}
            {acts.map((a) => (
              <div key={a.id} class="calc" data-testid="path-act">
                <p class="calc-line ink">{a.name}</p>
                <p class="calc-line">{a.what}</p>
                {a.questions && (
                  <p class="calc-line">
                    {c.questions}: {a.questions.join(' ')}
                  </p>
                )}
                {a.help && (
                  <p class="calc-line">
                    {c.help}: {a.help}
                  </p>
                )}
                <SourceLine s={a.source} />
              </div>
            ))}
          </div>
        )
      })}
      <div class="card pad">
        <p class="calc-line ink">{c.rule}</p>
        <p class="calc-line">{path.rule.note}</p>
        {path.rule.sources.map((s) => (
          <SourceLine key={s.who + s.year} s={s} />
        ))}
        <p class="calc-line ink">{c.settingsTitle}</p>
        {Object.entries(path.settingKinds).map(([k, v]) => (
          <p key={k} class="calc-line">
            {c.settingNames[k as keyof typeof c.settingNames]}: {v}
          </p>
        ))}
        {(path.channels ?? []).map((ch) => (
          <div key={ch.id} data-testid="path-channel">
            <p class="calc-line ink">
              {c.channel}: {ch.name}, {c.channelOff}
            </p>
            <p class="calc-line">{ch.what}</p>
          </div>
        ))}
        <p class="calc-line ink">{c.counted}</p>
        <p class="calc-line">{path.counted}</p>
        <p class="calc-line ink">{c.neverCounted}</p>
        <p class="calc-line" data-testid="never-counted">
          {path.neverCounted.join('; ')}.
        </p>
        <p class="calc-line ink">{c.excluded}</p>
        {path.excluded.map((e) => (
          <p key={e.what} class="calc-line">
            {e.what}: {e.why}
          </p>
        ))}
        {path.parents && (
          <>
            <p class="calc-line ink">{c.parents}</p>
            <p class="calc-line">{path.parents}</p>
          </>
        )}
      </div>
      <div class="card pad" data-testid="path-evidence">
        <p class="calc-line ink">{c.evidence}</p>
        <p class="note faint">{c.evidenceNote}</p>
        {path.cards.map((id) => {
          const card = cardById(id)
          if (!card) return null
          const status = card.status === 'disputed' ? c.disputed : card.status === 'draft' ? c.draft : c.admitted
          return (
            <p key={id} class="calc-line">
              <span class="calc-key">{gradeWord(card.grade)}</span> · {card.claim} ({status}; {card.sources[0].cite})
            </p>
          )
        })}
      </div>
    </div>
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
        {paths.map((p) => (
          <li key={p.id}>
            <a class="chip" href={`#path-${p.id}`}>
              {p.name}
            </a>
          </li>
        ))}
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

      <h2 class="section" id="paths">
        {c.paths.title}
      </h2>
      <p class="note">{c.paths.note}</p>
      {paths.map((p) => (
        <PathSection key={p.id} path={p} />
      ))}

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

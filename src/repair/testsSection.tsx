import { hasMove, moveById } from '../catalogue'
import { copy } from '../copy'
import { fill, formatDayShort } from '../format'
import { useLive } from '../live'
import { readingById } from '../readings'
import { guardRepair } from './breaker'
import { repairEvidence, type RepairEvidence, type TestShown, type TrackLine } from './evidence'
import { rungWords } from './words'
import { askOn } from '../ask/gate'
import type { AskAboutThis } from '../ask/askScreen'

// Moves → Evidence while the learning repair is on (stage R4): it opens with what helps you and the tests nearest
// finishing (part 2), then the engine's own track record (requirement 15) and each test with its rung on the evidence
// ladder in place of the tiers (requirement 8). Facts plain, calculations behind a single rule, conclusions behind a
// double rule with their rung, as the rest of Evidence.

function steps(x: number): string {
  const r = Math.round(x * 100) / 100
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}`
}


const nameOf = (moveId: string) => (hasMove(moveId) ? moveById(moveId).name : moveId)
const windowOf = (w: string) => copy.catalogue.windows[w as keyof typeof copy.catalogue.windows] ?? w

function TestBlock({ t, onAsk }: { t: TestShown; onAsk?: (about: AskAboutThis) => void }) {
  const c = copy.repairEvidence
  return (
    <li class="move" data-testid="repair-test" data-level={t.level} data-direction={t.direction ?? ''}>
      <h3 class="move-name">{nameOf(t.moveId)}</h3>
      <p class="move-meta">
        {fill(copy.evidence.forTarget, { target: readingById(t.target).name, window: windowOf(t.window) })}
        {t.running && ` · ${c.running}`}
      </p>
      <div class="conclusion">
        <p class="calc-line ink" data-testid="repair-rung">
          {rungWords(t.level, t.direction)}
          {t.revised && ` · ${c.revised}`}
        </p>
        {t.ctx.map((x) => (
          <p key={`${x.context}=${x.value}`} class="calc-line" data-testid="repair-context">
            {fill(c.contextLine, { context: c.contexts[x.context as keyof typeof c.contexts][x.value], call: rungWords(x.level, x.direction) })}
          </p>
        ))}
      </div>
      <div class="calc">
        <p class="calc-line">{fill(c.counts, { offered: String(t.offered), heldBack: String(t.heldBack), days: String(t.days) })}</p>
        {t.theta !== null && t.lo !== null && t.hi !== null && <p class="calc-line">{fill(c.estimate, { theta: steps(t.theta), lo: steps(t.lo), hi: steps(t.hi) })}</p>}
      </div>
      {/* Ask Life Mirror (stage A1, gated): a new thread with this test attached, answered at once. */}
      {askOn() && onAsk && (
        <div class="actions">
          <button
            type="button"
            class="textbtn"
            data-testid="repair-ask"
            onClick={() => onAsk({ keys: [t.key], source: 'evidence', question: fill(copy.askMirror.aboutTitle, { what: `${nameOf(t.moveId)}, ${fill(copy.evidence.forTarget, { target: readingById(t.target).name, window: windowOf(t.window) })}` }) })}
          >
            {copy.askMirror.about}
          </button>
        </div>
      )}
    </li>
  )
}

/** The engine's own track record (requirement 15): early signs always, likely and established once they have any call. */
function TrackBlock({ lines }: { lines: TrackLine[] }) {
  const c = copy.repairEvidence
  const shown = lines.filter((l) => l.rung === 'early' || l.resolved + l.open > 0)
  return (
    <div class="card pad" data-testid="track-record">
      <div class="calc">
        {shown.map((l) => (
          <p key={l.rung} class="calc-line" data-testid={`track-${l.rung}`}>
            {l.resolved > 0 ? fill((l.resolved === 1 ? c.heldOne : c.held)[l.rung], { n: String(l.resolved), m: String(l.held) }) : c.noneResolved[l.rung]}
            {l.open > 0 && ` ${fill(l.open === 1 ? c.openOne : c.open, { n: String(l.open) })}`}
          </p>
        ))}
        {lines.filter((l) => l.tightened).map((l) => (
          <p key={`tight-${l.rung}`} class="calc-line" data-testid={`track-tightened-${l.rung}`}>
            {c.tightened[l.rung]}
          </p>
        ))}
      </div>
      {lines.some((l) => !l.enough) && <p class="note faint no-gap">{c.tested}</p>}
    </div>
  )
}

/**
 * What helps you (stage R4, part 2): per reading, the moves the pooled belief says help, research's estimate beside each;
 * then the tests nearest finishing, each with the day it began, never a projected finish.
 */
function HelpsBlock({ ev }: { ev: RepairEvidence }) {
  const c = copy.repairEvidence
  return (
    <>
      <h2 class="section">{c.helpsTitle}</h2>
      <div class="card pad" data-testid="what-helps">
        {ev.helps.length === 0 ? (
          <p class="note no-gap">{c.helpsNone}</p>
        ) : (
          ev.helps.map((g) => (
            <div key={g.target} class="calc" data-testid="helps-reading">
              <p class="calc-line">
                <span class="calc-key">{readingById(g.target).name}</span>
              </p>
              {g.moves.map((m) => (
                <p key={m.key} class="calc-line" data-testid="helps-move">
                  {fill(c.helpsLine, { move: nameOf(m.moveId), belief: steps(m.belief), research: steps(m.research), rung: rungWords(m.level, m.direction) })}
                </p>
              ))}
            </div>
          ))
        )}
      </div>
      <h2 class="section">{c.nearestTitle}</h2>
      <div class="card pad" data-testid="nearest">
        {ev.nearest.length === 0 ? (
          <p class="note no-gap">{c.nearestNone}</p>
        ) : (
          <div class="calc">
            {ev.nearest.map((n) => (
              <p key={n.key} class="calc-line" data-testid="nearest-test">
                {fill(c.nearestLine, { move: nameOf(n.moveId), target: readingById(n.target).name, window: windowOf(n.window), date: formatDayShort(n.began), rung: rungWords(n.level, n.direction) })}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/** What helps you, the track record and the tests, in place of the cards. */
export function RepairTests({ today, onAsk }: { today: string; onAsk?: (about: AskAboutThis) => void }) {
  // A rebuild that throws trips the repair's breaker (R6): nothing here, and Evidence redraws as before the switch.
  const ev = useLive(() => guardRepair(today, () => repairEvidence(today), null), [today])
  if (!ev) return null
  const c = copy.repairEvidence
  return (
    <>
      <HelpsBlock ev={ev} />
      <h2 class="section">{c.trackTitle}</h2>
      <TrackBlock lines={ev.track} />
      <h2 class="section">{c.title}</h2>
      {ev.shown.length === 0 && ev.quiet.length === 0 ? (
        <p class="note" data-testid="repair-tests-none">
          {c.none}
        </p>
      ) : (
        <div class="card">
          {ev.shown.length > 0 && (
            <ul class="moves">
              {ev.shown.map((t) => (
                <TestBlock key={t.key} t={t} onAsk={onAsk} />
              ))}
            </ul>
          )}
          {ev.quiet.length > 0 && (
            <details class="calc quiet-tests" data-testid="repair-quiet">
              <summary class="calc-line">{fill(ev.quiet.length === 1 ? c.quietOne : c.quiet, { n: String(ev.quiet.length) })}</summary>
              {ev.quiet.map((t) => (
                <p key={t.key} class="calc-line">
                  {fill(c.quietItem, { move: nameOf(t.moveId), target: readingById(t.target).name, window: windowOf(t.window) })}
                </p>
              ))}
            </details>
          )}
        </div>
      )}
    </>
  )
}

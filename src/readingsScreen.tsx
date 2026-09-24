import { easeRetired } from './aims'
import { chipStates, readingProposals, type ChipId } from './audit'
import { blockAt } from './blocks'
import { copy } from './copy'
import { allCheckIns, db, getSettings, updateSettings } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { readingById } from './readings'

// Settings → Readings and chips: retirement proposals with both conditions and their numbers,
// decided by you and never automatic; the readings retired, each with one tap back; the chips
// that stopped appearing, each with one tap back; and the anchor swaps, logged and dated.

export function ReadingsScreen({ onClose }: { onClose: () => void }) {
  const today = blockAt(new Date()).day
  const settings = useLive(getSettings, [])
  const checkins = useLive(allCheckIns, [])
  const contexts = useLive(() => db.days.toArray(), [])
  const swaps = useLive(() => db.anchorSwaps.toArray(), [])
  // Workstream 6: the question on how a learning session went retires as a chip does, and comes back the same way.
  const easeOff = useLive(async () => easeRetired(await db.offers.toArray(), await db.outcomes.toArray(), (await getSettings()).easeBack), [])
  if (!settings || !checkins || !contexts || !swaps || easeOff === undefined) return <section class="screen" />
  const c = copy.readingsScreen
  const proposals = readingProposals(checkins, settings.retiredReadings, settings.readingDecisions, today)
  const chips = chipStates(checkins, contexts, settings.chipsBack, today)
  const retire = (id: string) => void updateSettings((s) => ({ ...s, retiredReadings: [...new Set([...s.retiredReadings, id])] }))
  const keep = (id: string) => void updateSettings((s) => ({ ...s, readingDecisions: { ...s.readingDecisions, [id]: today } }))
  const bringBackReading = (id: string) => void updateSettings((s) => ({ ...s, retiredReadings: s.retiredReadings.filter((r) => r !== id) }))
  const bringBackChip = (id: ChipId) => void updateSettings((s) => ({ ...s, chipsBack: { ...s.chipsBack, [id]: today } }))

  return (
    <section class="screen" data-testid="readings-screen">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>

      <h2 class="section">{c.proposals}</h2>
      <p class="note">{c.proposalsNote}</p>
      <div class="card pad">
        {proposals.length === 0 ? (
          <p class="note no-gap" data-testid="proposals-none">
            {c.none}
          </p>
        ) : (
          proposals.map((p) => {
            const name = readingById(p.reading).name
            return (
              <div key={p.reading} class="conclusion" data-testid="proposal">
                <p class="calc-line ink">{name}</p>
                <p class="calc-line">
                  {p.distinction.kind === 'twin'
                    ? fill(c.twin, { name, other: readingById(p.distinction.with as string).name, r: String(p.distinction.r), n: String(p.distinction.n) })
                    : fill(c.flat, { name, share: String(Math.round((p.distinction.sameShare ?? 0) * 100)), n: String(p.distinction.n) })}
                </p>
                <p class="calc-line">{fill(c.prediction, { r: String(p.prediction.r), n: String(p.prediction.n) })}</p>
                <div class="actions">
                  <button type="button" class="pill-quiet" onClick={() => retire(p.reading)}>
                    {c.retire}
                  </button>
                  <button type="button" class="textbtn" onClick={() => keep(p.reading)}>
                    {c.keep}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <h2 class="section">{c.retired}</h2>
      <div class="card">
        {settings.retiredReadings.length === 0 ? (
          <p class="note faint in-card">{c.retiredNone}</p>
        ) : (
          <ul class="rows">
            {settings.retiredReadings.map((id) => (
              <li key={id} class="row is-static">
                <span class="row-main">{readingById(id).name}</span>
                <button type="button" class="textbtn" onClick={() => bringBackReading(id)}>
                  {c.bringBack}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 class="section">{c.chips}</h2>
      <p class="note">{c.chipsNote}</p>
      <div class="card">
        <ul class="rows">
          {chips.map((s) => (
            <li key={s.id} class="row is-static" data-testid={`chip-state-${s.id}`}>
              <span class="row-main">
                {c.chipNames[s.id]}
                <span class="sub">{s.retired ? fill(c.chipRetired, { n: String(s.evenings) }) : s.lastTap ? fill(c.chipOn, { when: formatDayShort(s.lastTap) }) : fill(c.chipNever, { n: String(s.evenings) })}</span>
              </span>
              {s.retired && (
                <button type="button" class="textbtn" data-testid={`chip-back-${s.id}`} onClick={() => bringBackChip(s.id)}>
                  {c.bringBack}
                </button>
              )}
            </li>
          ))}
          <li class="row is-static" data-testid="chip-state-ease">
            <span class="row-main">
              {c.easeName}
              <span class="sub">{easeOff ? c.easeRetired : c.easeOn}</span>
            </span>
            {easeOff && (
              <button type="button" class="textbtn" data-testid="chip-back-ease" onClick={() => void updateSettings((st) => ({ ...st, easeBack: new Date().toISOString() }))}>
                {c.bringBack}
              </button>
            )}
          </li>
        </ul>
      </div>

      <h2 class="section">{c.swaps}</h2>
      <p class="note">{c.swapsNote}</p>
      <div class="card pad">
        {swaps.length === 0 ? (
          <p class="note no-gap" data-testid="swaps-none">
            {c.swapsNone}
          </p>
        ) : (
          <div class="calc">
            {swaps.map((s) => (
              <p key={s.id} class="calc-line" data-testid="swap">
                {fill(c.swapLine, { name: readingById(s.reading).name, position: String(s.position), from: s.from, to: s.to, date: formatDayShort(s.at), answers: String(s.answers) })}
              </p>
            ))}
          </div>
        )}
      </div>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

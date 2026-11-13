import { blockAt } from './blocks'
import { copy } from './copy'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { markWrong, noticedNow } from './noteEvents/flow'
import { refreshPatterns } from './patternsFlow'

/**
 * Settings → Brain → Noticed in your notes (2026-11-13): each thing Claude noticed in a note, with the owner's own
 * words, and one control: mark it wrong. A marked one counts nowhere and can be taken back. An event whose note is
 * gone, or no longer holds the quoted words, is not here at all.
 */
export function NoticedScreen({ onClose }: { onClose: () => void }) {
  const all = useLive(noticedNow, [])
  const c = copy.brainScreen.noticed
  if (!all) return <section class="screen" />
  // The counts follow the mark: the pattern table is built again, which no screen waits for.
  const mark = (eventId: string, wrong: boolean) => void markWrong(eventId, wrong).then(() => refreshPatterns(blockAt(new Date()).day))
  return (
    <section class="screen" data-testid="noticed-screen">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note">{c.intro}</p>
      {all.length === 0 && (
        <p class="note faint" data-testid="noticed-none">
          {c.none}
        </p>
      )}
      {all.map((n) => {
        const day = formatDayShort(n.event.note.day)
        const block = n.event.note.block
        return (
          <div class="card pad" key={n.event.id} data-testid="noticed-event">
            <p class="eyebrow small">{c.tag}</p>
            <p class="calc-line">
              <span class="calc-key">{n.type.label}</span>
            </p>
            <p class="note faint">{n.checkinId === null ? fill(c.kept, { day }) : block ? fill(c.at, { day, block: c.blocks[block as keyof typeof c.blocks] }) : day}</p>
            <p class="note" data-testid="noticed-quote">
              “{n.event.quote}”
            </p>
            {n.wrong ? (
              <p class="note faint no-gap" data-testid="noticed-marked">
                {c.marked}{' '}
                <button type="button" class="textbtn" data-testid="noticed-undo" onClick={() => mark(n.event.id, false)}>
                  {c.undo}
                </button>
              </p>
            ) : (
              <button type="button" class="textbtn" data-testid="noticed-wrong" onClick={() => mark(n.event.id, true)}>
                {c.wrong}
              </button>
            )}
          </div>
        )
      })}
      <div class="actions">
        <button type="button" class="textbtn" data-testid="noticed-done" onClick={onClose}>
          {c.done}
        </button>
      </div>
    </section>
  )
}

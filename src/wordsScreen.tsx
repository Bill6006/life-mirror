import { useState } from 'preact/hooks'
import { removeNote } from './ask/flow'
import type { Block } from './blocks'
import { copy } from './copy'
import { allCheckIns, db } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { SubHead } from './ui'
import { WORDS_SHOWN, yourWords } from './yourWords'

/**
 * Mirror → Your words (stage 3, group 4): every line typed at a check-in, newest first, each beside
 * that check-in's reading. A tap opens the check-in's summary, where every reading is listed. The
 * journal keeps its own screen. Notes kept from Ask (stage A3) follow, newest first, each removable at a second tap.
 */
export function WordsScreen({ onOpen, onClose }: { onOpen: (day: string, block: Block) => void; onClose: () => void }) {
  const read = useLive(async () => {
    const [all, notes] = await Promise.all([allCheckIns(), db.notes.toArray()])
    return { all, notes: notes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) }
  }, [])
  const [more, setMore] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const c = copy.words
  if (!read) return <section class="screen" />
  const rows = yourWords(read.all)
  const shown = more ? rows : rows.slice(0, WORDS_SHOWN)
  return (
    <section class="screen" data-testid="words">
      <SubHead title={c.title} back={copy.tabs.mirror} onBack={onClose} />
      <p class="note">{c.note}</p>
      {rows.length === 0 ? (
        <p class="note" data-testid="words-none">
          {c.none}
        </p>
      ) : (
        <div class="card">
          <ul class="rows">
            {shown.map((r) => (
              <li key={`${r.day}-${r.block}`}>
                <button type="button" class="row" data-testid="words-row" onClick={() => onOpen(r.day, r.block)}>
                  <span class="row-main">
                    <span class="sub" data-testid="words-when">
                      {fill(r.value === null ? c.whenOnly : c.when, { day: formatDayShort(r.day), block: copy.blocks[r.block], value: String(r.value), band: r.band ? (copy.bands as Record<string, string>)[r.band].toLowerCase() : '' })}
                    </span>
                    <span class="said" data-testid="words-note">
                      {fill(copy.summary.quoted, { note: r.note })}
                    </span>
                  </span>
                  <span class="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!more && rows.length > WORDS_SHOWN && (
        <div class="actions">
          <button type="button" class="textbtn" data-testid="words-more" onClick={() => setMore(true)}>
            {fill(c.more, { n: String(rows.length - WORDS_SHOWN) })}
          </button>
        </div>
      )}
      {read.notes.length > 0 && (
        <>
          <h2 class="section">{c.keptTitle}</h2>
          <div class="card">
            <ul class="rows">
              {read.notes.map((n) => (
                <li key={n.id} class="row is-static history-row" data-testid="words-kept">
                  <span class="sub">{formatDayShort(n.day)}</span>
                  <span class="said" data-testid="words-kept-note">
                    {fill(copy.summary.quoted, { note: n.text })}
                  </span>
                  <button type="button" class="textbtn faint" data-testid="words-kept-remove" onClick={() => (confirm === n.id ? void removeNote(n.id as number).then(() => setConfirm(null)) : setConfirm(n.id as number))}>
                    {confirm === n.id ? c.keptRemoveConfirm : c.keptRemove}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}

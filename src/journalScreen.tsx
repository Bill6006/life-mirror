import { useState } from 'preact/hooks'
import { copy } from './copy'
import { fill, formatDayLong, formatWhen } from './format'
import { allJournal, deleteJournal, searchJournal, updateJournal } from './journal'
import { JOURNAL_MAX } from './db'
import { useLive } from './live'
import { ClampText, SubHead } from './ui'

/**
 * Let it out, read back (agreed 2026-10-15): every night's entry, newest first, searched on this phone
 * alone. Each can be read whole, edited, or deleted after a second tap.
 */
export function JournalScreen({ onClose }: { onClose: () => void }) {
  const entries = useLive(allJournal, [])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [confirm, setConfirm] = useState<number | null>(null)
  const c = copy.journal
  if (!entries) return <section class="screen" />
  const shown = searchJournal(entries, query)

  return (
    <section class="screen" data-testid="journal">
      <SubHead title={c.title} back={copy.tabs.mirror} onBack={onClose} />
      <p class="note">{c.screenNote}</p>
      {entries.length > 0 && (
        <input class="input journal-search" type="search" placeholder={c.search} value={query} aria-label={c.search} data-testid="journal-search" onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
      )}
      {entries.length === 0 && <p class="note" data-testid="journal-none">{c.none}</p>}
      {entries.length > 0 && shown.length === 0 && <p class="note" data-testid="journal-no-match">{c.noMatch}</p>}
      {shown.map((e) => (
        <div key={e.id} class="card pad journal-entry" data-testid="journal-entry">
          <p class="eyebrow small">{formatDayLong(e.day)}</p>
          {editing === e.id ? (
            <>
              <textarea class="input journal-input" rows={10} maxLength={JOURNAL_MAX} value={draft} aria-label={c.edit} data-testid="journal-edit-input" onInput={(ev) => setDraft((ev.currentTarget as HTMLTextAreaElement).value)} />
              <div class="actions">
                <button
                  type="button"
                  class="pill-quiet"
                  data-testid="journal-save"
                  onClick={() =>
                    void updateJournal(e.id as number, draft).then(() => {
                      setEditing(null)
                    })
                  }
                >
                  {c.save}
                </button>
                <button type="button" class="textbtn" onClick={() => setEditing(null)}>
                  {c.cancel}
                </button>
              </div>
            </>
          ) : (
            <ClampText text={e.text} class="journal-text" testid="journal-text" />
          )}
          <p class="note faint no-gap" data-testid="journal-when">
            {fill(c.writtenAt, { when: formatWhen(e.writtenAt) })}
            {e.editedAt ? ` · ${fill(c.editedAt, { when: formatWhen(e.editedAt) })}` : ''}
          </p>
          {editing !== e.id && (
            <div class="actions">
              <button
                type="button"
                class="textbtn"
                data-testid="journal-edit"
                onClick={() => {
                  setDraft(e.text)
                  setEditing(e.id as number)
                  setConfirm(null)
                }}
              >
                {c.edit}
              </button>
              <button
                type="button"
                class="textbtn"
                data-testid="journal-delete"
                onClick={() => {
                  if (confirm === e.id) {
                    setConfirm(null)
                    void deleteJournal(e.id as number)
                  } else setConfirm(e.id as number)
                }}
              >
                {confirm === e.id ? c.deleteConfirm : c.delete}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

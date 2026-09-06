import { useState } from 'preact/hooks'
import { dayKey } from './blocks'
import { copy } from './copy'
import { allCheckIns, allWins, getSettings, privateItems, updateSettings, wipeEverything } from './db'
import { buildExport } from './export'
import { fill, formatWhen } from './format'
import { useLive } from './live'
import { unsubscribePush } from './push'
import { shareOrDownload } from './share'

/** Rule 13 of the plan: anything recorded can be exported or deleted. Rule 11: private items stay out unless ticked. */
export function DataScreen({ onClose }: { onClose: () => void }) {
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const wins = useLive(allWins, [])
  const items = useLive(privateItems, [])
  const [includePrivate, setIncludePrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [word, setWord] = useState('')
  if (!settings || !all || !wins || !items) return <section class="screen" />

  async function exportAll() {
    if (!settings || !all || !wins || !items) return
    setBusy(true)
    setFailed(false)
    try {
      const bundle = buildExport(all, wins, items, settings, { includePrivate })
      const stamp = dayKey(new Date())
      const files = [
        new File([bundle.json], `life-mirror-${stamp}.json`, { type: 'application/json' }),
        new File([bundle.csv], `life-mirror-${stamp}.csv`, { type: 'text/csv' }),
      ]
      await shareOrDownload(files, copy.appName)
      await updateSettings((s) => ({ ...s, lastExportAt: new Date().toISOString() }))
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function deleteAll() {
    try {
      await unsubscribePush()
    } catch {
      // The address may already be gone; the record goes regardless.
    }
    await wipeEverything()
    location.replace(import.meta.env.BASE_URL)
  }

  const typed = word.trim().toLowerCase() === copy.data.deleteWord

  return (
    <section class="screen">
      <header class="screen-head">
        <p class="eyebrow">{copy.data.title}</p>
      </header>

      <h2 class="section">{copy.data.export}</h2>
      <div class="card pad">
        <p class="note">{copy.data.exportNote}</p>
        <label class="check">
          <input type="checkbox" checked={includePrivate} data-testid="include-private" onChange={(e) => setIncludePrivate((e.currentTarget as HTMLInputElement).checked)} />
          <span>{copy.data.includePrivate}</span>
        </label>
        <div class="actions">
          <button type="button" class="pill-quiet" disabled={busy} onClick={() => void exportAll()}>
            {busy ? copy.data.exporting : copy.data.exportButton}
          </button>
        </div>
        <p class="note faint no-gap">{settings.lastExportAt ? fill(copy.data.lastExport, { when: formatWhen(settings.lastExportAt) }) : copy.data.neverExported}</p>
        {failed && <p class="note no-gap">{copy.data.exportFailed}</p>}
      </div>

      <h2 class="section">{copy.data.deleteTitle}</h2>
      <div class="card pad">
        <p class="note">{copy.data.deleteNote}</p>
        {!deleting ? (
          <div class="actions">
            <button type="button" class="pill-quiet" data-testid="delete-start" onClick={() => setDeleting(true)}>
              {copy.data.deleteStart}
            </button>
          </div>
        ) : (
          <>
            <p class="note">{fill(copy.data.deletePrompt, { word: copy.data.deleteWord })}</p>
            <input
              class="input"
              type="text"
              autocapitalize="none"
              autocomplete="off"
              data-testid="delete-word"
              placeholder={copy.data.deleteWord}
              value={word}
              onInput={(e) => setWord((e.currentTarget as HTMLInputElement).value)}
            />
            <div class="actions">
              <button type="button" class="pill-quiet" disabled={!typed} data-testid="delete-confirm" onClick={() => void deleteAll()}>
                {copy.data.deleteConfirm}
              </button>
              <button
                type="button"
                class="textbtn"
                onClick={() => {
                  setDeleting(false)
                  setWord('')
                }}
              >
                {copy.data.deleteCancel}
              </button>
            </div>
          </>
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

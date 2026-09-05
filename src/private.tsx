import { useState } from 'preact/hooks'
import { SwitchRow } from './controls'
import { copy } from './copy'
import { addPrivateItem, archivePrivateItem, getSettings, privateItems, updateSettings } from './db'
import { useLive } from './live'

/** Rule 11 of the plan: private things are named here, measured, and shown nowhere else unless chosen. */
export function PrivateScreen({ onClose }: { onClose: () => void }) {
  const items = useLive(privateItems, [])
  const settings = useLive(getSettings, [])
  const [name, setName] = useState('')
  if (!items || !settings) return <section class="screen" />

  function add() {
    const n = name.trim()
    if (!n) return
    void addPrivateItem(n)
    setName('')
  }

  return (
    <section class="screen">
      <header class="screen-head">
        <p class="eyebrow">{copy.private.title}</p>
      </header>
      <p class="note">{copy.private.note}</p>

      <div class="card">
        {items.length === 0 ? (
          <p class="note faint in-card">{copy.private.none}</p>
        ) : (
          <ul class="rows">
            {items.map((it) => (
              <li key={it.id} class="row is-static">
                <span class="row-main">{it.name}</span>
                <button type="button" class="textbtn" onClick={() => void archivePrivateItem(it.id as number)}>
                  {copy.private.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="add">
        <input
          class="input"
          type="text"
          maxLength={60}
          placeholder={copy.private.placeholder}
          value={name}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" class="pill-quiet" onClick={add} disabled={!name.trim()}>
          {copy.private.add}
        </button>
      </div>

      <div class="card">
        <SwitchRow label={copy.private.show} on={settings.showPrivate} onChange={(on) => void updateSettings((s) => ({ ...s, showPrivate: on }))} />
      </div>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

import { useState } from 'preact/hooks'
import { BLOCKS, type Block } from './blocks'
import { SwitchRow } from './controls'
import { copy } from './copy'
import { addPrivateItem, archivePrivateItem, blocksOf, getSettings, privateItems, setPrivateBlocks, updateSettings, type PrivateItem } from './db'
import { fill } from './format'
import { useLive } from './live'
import { activeBlocks } from './settings'

/**
 * Rule 11 of the plan: private things are named here, measured, and shown nowhere else unless
 * chosen. Each is asked at the check-ins you place it in, the evening until you choose (Pass 3).
 */
export function PrivateScreen({ onClose }: { onClose: () => void }) {
  const items = useLive(privateItems, [])
  const settings = useLive(getSettings, [])
  const [name, setName] = useState('')
  if (!items || !settings) return <section class="screen" />
  const asked = activeBlocks(settings.frequency)

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
              <PrivateRow key={it.id} item={it} asked={asked} />
            ))}
          </ul>
        )}
      </div>
      {items.length > 0 && <p class="note faint">{copy.private.placementNote}</p>}

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

/** One item: its name, where it is asked, and Remove. At least one check-in stays chosen. */
function PrivateRow({ item, asked }: { item: PrivateItem; asked: readonly Block[] }) {
  const placed = blocksOf(item)
  const toggle = (b: Block) => {
    const next = placed.includes(b) ? placed.filter((x) => x !== b) : [...placed, b]
    if (next.length) void setPrivateBlocks(item.id as number, next)
  }
  const unasked = placed.every((b) => !asked.includes(b))
  return (
    <li class="private-item" data-testid="private-item-row">
      <div class="row is-static">
        <span class="row-main">{item.name}</span>
        <button type="button" class="textbtn" onClick={() => void archivePrivateItem(item.id as number)}>
          {copy.private.remove}
        </button>
      </div>
      <div class="chips private-blocks" role="group" aria-label={fill(copy.private.placedAt, { name: item.name })}>
        {BLOCKS.map((b) => (
          <button key={b} type="button" class={placed.includes(b) ? 'when-chip is-on' : 'when-chip'} aria-pressed={placed.includes(b)} data-testid={`private-place-${b}`} onClick={() => toggle(b)}>
            {copy.blocks[b]}
          </button>
        ))}
      </div>
      {unasked && (
        <p class="note faint no-gap private-unasked" data-testid="private-unasked">
          {copy.private.unasked}
        </p>
      )}
    </li>
  )
}

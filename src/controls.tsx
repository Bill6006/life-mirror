// The few controls Settings needs: a segmented choice, a switch row, a time row, a link row.

export function Seg<T extends string>({
  label,
  note,
  value,
  options,
  onChange,
}: {
  label: string
  note?: string
  value: T
  options: readonly { v: T; l: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div class="setting">
      <p class="setting-label">{label}</p>
      <div class="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" class={o.v === value ? 'seg-opt is-on' : 'seg-opt'} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
            {o.l}
          </button>
        ))}
      </div>
      {note && <p class="note faint">{note}</p>}
    </div>
  )
}

export function SwitchRow({ label, note, on, onChange, testid }: { label: string; note?: string; on: boolean; onChange: (on: boolean) => void; testid?: string }) {
  return (
    <button type="button" class="switch-row" aria-pressed={on} data-testid={testid} onClick={() => onChange(!on)}>
      <span class="row-main">
        {label}
        {note && <span class="sub">{note}</span>}
      </span>
      <span class="switch" aria-hidden="true" />
    </button>
  )
}

export function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label class="time-row">
      <span>{label}</span>
      <input type="time" value={value} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).value || value)} />
    </label>
  )
}

export function NavRow({ label, note, onClick }: { label: string; note?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" class="row" onClick={onClick}>
        <span class="row-main">
          {label}
          {note && <span class="sub">{note}</span>}
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </button>
    </li>
  )
}

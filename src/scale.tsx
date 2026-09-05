import { copy } from './copy'
import { stanceOf, type Stance } from './score'

const BANDS: readonly { stance: Stance; from: number; to: number }[] = [
  { stance: 'Protect', from: 0, to: 25 },
  { stance: 'Recover', from: 25, to: 50 },
  { stance: 'Stabilize', from: 50, to: 75 },
  { stance: 'Build', from: 75, to: 100 },
]

/**
 * The 0 to 100 scale the reading sits on, drawn by hand: a hairline track, ticks at the band
 * edges, the four band names, and one warm mark where the reading is. Hollow when the mark
 * shows the last full reading rather than a current one.
 */
export function Scale({ value, hollow = false, compact = false }: { value: number | null; hollow?: boolean; compact?: boolean }) {
  const W = 320
  const H = compact ? 30 : 58
  const x0 = 8
  const x1 = W - 8
  const y = compact ? 12 : 26
  const x = (v: number) => x0 + (v / 100) * (x1 - x0)
  const active = value === null ? null : stanceOf(value)
  const label = value === null ? copy.reading.scaleEmpty : `${value} · ${copy.stances[active as Stance]}`

  return (
    <svg class="scale" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line class="scale-track" x1={x0} y1={y} x2={x1} y2={y} />
      {[25, 50, 75].map((v) => (
        <line key={v} class="scale-tick" x1={x(v)} y1={y - 5} x2={x(v)} y2={y + 5} />
      ))}
      {!compact &&
        [0, 25, 50, 75, 100].map((v) => (
          <text key={v} class="scale-num" x={x(v)} y={y - 11} text-anchor={v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}>
            {v}
          </text>
        ))}
      {!compact &&
        BANDS.map((b) => (
          <text key={b.stance} class={active === b.stance ? 'scale-band is-active' : 'scale-band'} x={(x(b.from) + x(b.to)) / 2} y={H - 8} text-anchor="middle">
            {copy.stances[b.stance].toUpperCase()}
          </text>
        ))}
      {value !== null && <circle class={hollow ? 'scale-mark is-hollow' : 'scale-mark'} cx={x(value)} cy={y} r={compact ? 5 : 7} />}
    </svg>
  )
}

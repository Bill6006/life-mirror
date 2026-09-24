import { useWidth } from './charts'
import { copy } from './copy'
import { bandOf, type Band } from './score'

/** The five bands of the scale, with their boundaries at 20, 40, 60 and 80. */
export const BANDS: readonly { band: Band; from: number; to: number }[] = [
  { band: 'empty', from: 0, to: 20 },
  { band: 'wornDown', from: 20, to: 40 },
  { band: 'gettingBy', from: 40, to: 60 },
  { band: 'solid', from: 60, to: 80 },
  { band: 'firing', from: 80, to: 100 },
]

export const BAND_EDGES: readonly number[] = [20, 40, 60, 80]

/**
 * The 0 to 100 scale the reading sits on, drawn by hand: a hairline track, ticks at the band
 * edges, both endpoints shown, and one warm mark where the reading is. Under it the five band
 * names, each over its own fifth, a two-word name on two lines so nothing runs together on a
 * narrow phone. From 80 the band's name turns the accent; the number beside it stays white.
 * Hollow when the mark shows the last full reading rather than a current one.
 */
export function Scale({ value, hollow = false, compact = false }: { value: number | null; hollow?: boolean; compact?: boolean }) {
  // Drawn at the width it is shown at, so its numbers are the size the stylesheet gives them on any phone.
  const [ref, W] = useWidth(320)
  const H = compact ? 30 : 40
  const x0 = 8
  const x1 = W - 8
  const y = compact ? 12 : 26
  const x = (v: number) => x0 + (v / 100) * (x1 - x0)
  const active = value === null ? null : bandOf(value)
  const label = value === null ? copy.reading.scaleEmpty : `${value} · ${copy.bands[active as Band]}`

  return (
    <div class="scale-wrap" ref={ref}>
      <svg class="scale" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
        <line class="scale-track" x1={x0} y1={y} x2={x1} y2={y} />
        {BAND_EDGES.map((v) => (
          <line key={v} class="scale-tick" x1={x(v)} y1={y - 5} x2={x(v)} y2={y + 5} />
        ))}
        {!compact &&
          [0, ...BAND_EDGES, 100].map((v) => (
            <text key={v} class="scale-num" data-testid="scale-num" x={x(v)} y={y - 11} text-anchor={v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}>
              {v}
            </text>
          ))}
        {value !== null && <circle class={hollow ? 'scale-mark is-hollow' : 'scale-mark'} cx={x(value)} cy={y} r={compact ? 5 : 7} />}
        {/* Signal draws the reading as a needle; the other themes hide it and draw the mark. */}
        {value !== null && <line class="scale-needle" x1={x(value)} x2={x(value)} y1={y - (compact ? 8 : 11)} y2={y + (compact ? 8 : 11)} />}
      </svg>
      {!compact && (
        <ol class="scale-bands" aria-hidden="true">
          {BANDS.map((b) => (
            <li
              key={b.band}
              class={active === b.band ? (b.band === 'firing' ? 'scale-band is-active is-firing' : 'scale-band is-active') : 'scale-band'}
              data-testid="scale-band"
            >
              {copy.bands[b.band]
                .toUpperCase()
                .split(' ')
                .map((word, i) => (
                  <span key={word} class="scale-word">
                    {i > 0 ? ' ' : ''}
                    {word}
                  </span>
                ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

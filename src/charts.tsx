import { BLOCKS, type Block } from './blocks'
import { copy } from './copy'
import { formatDayTiny, formatTime, weekdayShort } from './format'
import { lowestAhead } from './forecast'
import type { ContextPoint, DayValues } from './series'

// Hand-drawn SVG, hairlines throughout, the accent for now. Gaps stay gaps.

const BAND_LINES = [20, 40, 60, 80]

/** Today's trace: the reading by block on the 0 to 100 scale, one warm mark on the latest, an optional context overlay. */
export function Trace({ day, overlay, latest }: { day: DayValues; overlay: ContextPoint[] | null; latest: Block | null }) {
  const W = 320
  const H = 152
  const left = 30
  const right = 308
  const top = 16
  const bottom = 112
  const colW = (right - left) / 3
  const x = (i: number) => left + colW * (i + 0.5)
  const y = (v: number) => bottom - (v / 100) * (bottom - top)

  const pts = BLOCKS.map((b, i) => ({ block: b, i, v: day.values[b] }))
  const segs: string[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (a.v !== null && b.v !== null) segs.push(`M${x(a.i)} ${y(a.v)} L${x(b.i)} ${y(b.v)}`)
  }

  const ov = overlay
    ? BLOCKS.map((b, i) => {
        const p = overlay.find((o) => o.block === b)
        return p ? { i, v: (p.position - 1) * 25, label: p.label } : null
      })
    : []
  const ovSegs: string[] = []
  for (let i = 0; i < ov.length - 1; i++) {
    const a = ov[i]
    const b = ov[i + 1]
    if (a && b) ovSegs.push(`M${x(a.i)} ${y(a.v)} L${x(b.i)} ${y(b.v)}`)
  }

  return (
    <svg class="chart trace" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={copy.mirror.today} data-testid="trace">
      {BAND_LINES.map((v) => (
        <line key={v} class="ch-band" x1={left} x2={right} y1={y(v)} y2={y(v)} />
      ))}
      <line class="ch-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
      {[0, ...BAND_LINES, 100].map((v) => (
        <text key={v} class="ch-num" x={left - 6} y={y(v) + 3.5} text-anchor="end">
          {v}
        </text>
      ))}
      {segs.map((d) => (
        <path key={d} class="ch-line" d={d} />
      ))}
      {ovSegs.map((d) => (
        <path key={d} class="ch-line-ov" d={d} />
      ))}
      {pts.map((p) => p.v !== null && <circle key={p.block} class={p.block === latest ? 'ch-dot is-now' : 'ch-dot'} cx={x(p.i)} cy={y(p.v)} r={p.block === latest ? 5.5 : 4} />)}
      {ov.map(
        (o) =>
          o && (
            <g key={o.i}>
              <circle class="ch-dot-ov" cx={x(o.i)} cy={y(o.v)} r="3.5" />
              <text class="ch-label" x={x(o.i)} y={y(o.v) - 9} text-anchor="middle">
                {o.label}
              </text>
            </g>
          ),
      )}
      {BLOCKS.map((b, i) => (
        <g key={b}>
          <text class="ch-x" x={x(i)} y={bottom + 17} text-anchor="middle">
            {copy.blocks[b]}
          </text>
          <text class="ch-xs" x={x(i)} y={bottom + 31} text-anchor="middle">
            {day.times[b] ? formatTime(day.times[b] as string) : copy.now.notLogged}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** One day of the week, tiny: three possible dots on the scale, joined only where both neighbours exist. */
export function MiniTrace({ day }: { day: DayValues }) {
  const xs = [7, 20, 33]
  const y = (v: number) => 34 - (v / 100) * 28
  const pts = BLOCKS.map((b, i) => ({ i, v: day.values[b] }))
  const segs: string[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (a.v !== null && b.v !== null) segs.push(`M${xs[a.i]} ${y(a.v)} L${xs[b.i]} ${y(b.v)}`)
  }
  const any = pts.some((p) => p.v !== null)
  return (
    <svg class="chart mini" viewBox="0 0 40 40" role="img" aria-label={day.day} data-testid="mini">
      {BAND_LINES.map((v) => (
        <line key={v} class="ch-band" x1="2" x2="38" y1={y(v)} y2={y(v)} />
      ))}
      <line class="ch-axis" x1="2" x2="38" y1={y(0)} y2={y(0)} />
      {segs.map((d) => (
        <path key={d} class="ch-line thin" d={d} />
      ))}
      {pts.map((p) => p.v !== null && <circle key={p.i} class="ch-dot" cx={xs[p.i]} cy={y(p.v)} r="2.4" />)}
      {!any && <line class="ch-empty" x1="14" x2="26" y1="20" y2="20" />}
    </svg>
  )
}

/** Days by blocks: brighter is higher, an empty outline is Not logged yet, the current block outlined in ink. */
export function Heatmap({ rows, today, current }: { rows: DayValues[]; today: string; current: Block }) {
  const W = 320
  const labelW = 70
  const gap = 4
  const cellW = (W - labelW - 2 * gap - 2) / 3
  const cellH = 14
  const rowH = cellH + gap
  const headerH = 18
  const H = headerH + rows.length * rowH
  return (
    <svg class="chart heat" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={copy.mirror.heatmap} data-testid="heatmap">
      {BLOCKS.map((b, i) => (
        <text key={b} class="ch-x" x={labelW + i * (cellW + gap) + cellW / 2} y="11" text-anchor="middle">
          {copy.blocks[b]}
        </text>
      ))}
      {rows.map((r, ri) => (
        <g key={r.day}>
          <text class={r.day === today ? 'ch-y is-today' : 'ch-y'} x={labelW - 8} y={headerH + ri * rowH + cellH - 3} text-anchor="end">
            {formatDayTiny(r.day)}
          </text>
          {BLOCKS.map((b, i) => {
            const v = r.values[b]
            const cx = labelW + i * (cellW + gap)
            const cy = headerH + ri * rowH
            const now = r.day === today && b === current
            return v === null ? (
              <rect key={b} class={now ? 'ch-cell-empty is-now' : 'ch-cell-empty'} x={cx + 0.5} y={cy + 0.5} width={cellW - 1} height={cellH - 1} rx="3" />
            ) : (
              <rect key={b} class={now ? 'ch-cell is-now' : 'ch-cell'} x={cx + 0.5} y={cy + 0.5} width={cellW - 1} height={cellH - 1} rx="3" style={{ fillOpacity: 0.1 + 0.85 * (v / 100) }} />
            )
          })}
        </g>
      ))}
    </svg>
  )
}

/** A correlation as a bar from the middle: right for positive, left for negative. */
export function PairBar({ rho }: { rho: number }) {
  const w = Math.abs(rho) * 30
  return (
    <svg class="pair-bar" viewBox="0 0 64 8" aria-hidden="true">
      <line class="pb-axis" x1="32" x2="32" y1="0" y2="8" />
      <rect class={rho < 0 ? 'pb-bar is-neg' : 'pb-bar'} x={rho < 0 ? 32 - w : 32} y="1.5" width={w} height="5" rx="1" />
    </svg>
  )
}

export interface AheadDay {
  day: string
  expected: number | null
  lo: number | null
  hi: number | null
}

/** The five bands. The numbers mark the boundaries; the names sit at the middle of each band. */
const BAND_ROWS: readonly { band: 'empty' | 'wornDown' | 'gettingBy' | 'solid' | 'firing'; at: number }[] = [
  { band: 'empty', at: 10 },
  { band: 'wornDown', at: 30 },
  { band: 'gettingBy', at: 50 },
  { band: 'solid', at: 70 },
  { band: 'firing', at: 90 },
]

const AXIS_TICKS = [0, 20, 40, 60, 80, 100]

/** Half a band, in reading points: a name sits at its middle and its shading spans this either side. */
const BAND_HALF = 10

/** Half the width of a whisker's end cap. */
const CAP_HALF = 3.5

/** How far a day's edge notch drops below the axis. */
const NOTCH = 3.5

/** Half the break the whisker leaves where the step crosses it, so the two never touch. */
const WHISKER_GAP = 1.3
/** How far above its baseline a value's digits stand, with a hair of air: where the whisker stops. */
const VALUE_HEIGHT = 9

/**
 * The week ahead, as a compact strip: a narrow gutter for the numbers, a second for the band
 * names, and the seven days across the rest. One flat step per day at the expected reading with
 * a vertical connector between days, a thin whisker for the range, and the lowest day in the
 * accent. A day with no forecast is a gap, not a guess. The plot is a few translucent charcoal
 * panes laid over one another, so the cells read without ever looking striped.
 */
export function WeekAhead({ rows }: { rows: readonly AheadDay[] }) {
  const W = 340
  const H = 133
  const top = 10
  const bottom = 114
  const left = 20
  const right = 336
  // The band names have a gutter of their own.
  const x0 = left + 49
  const step = (right - x0) / rows.length
  const y = (v: number) => bottom - ((bottom - top) / 100) * Math.max(0, Math.min(100, v))
  const startOf = (i: number) => x0 + i * step
  const endOf = (i: number) => x0 + (i + 1) * step
  const centreOf = (i: number) => x0 + (i + 0.5) * step
  /** A value's baseline: just above its step, never above the plot. */
  const labelY = (v: number) => Math.max(top + 9, y(v) - 3.5)
  const low = lowestAhead(rows)
  const lowValue = low === -1 ? null : rows[low].expected
  // Every vertical the grid draws: the plot's own edges and each day's, plus a notch under each.
  const dayEdges = rows.map((_, i) => startOf(i))
  const verticals = [left, ...dayEdges, right]
  const notches = [...dayEdges, right]
  // One path for the whole step, so every corner is a join rather than two caps overlapping.
  let stepPath = ''
  let open = false
  rows.forEach((d, i) => {
    if (d.expected === null) {
      open = false
      return
    }
    if (!open) stepPath += `M${startOf(i)},${y(d.expected)}`
    else stepPath += `V${y(d.expected)}`
    stepPath += `H${endOf(i)}`
    open = true
  })

  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={copy.weekly.ahead}>
      <rect class="wa-pane" x={left} y={top} width={right - left} height={bottom - top} />
      {BAND_ROWS.map((b, i) => (
        <rect key={b.band} class={i % 2 === 0 ? 'wa-row' : 'wa-row is-dim'} x={x0} y={y(b.at + BAND_HALF)} width={right - x0} height={y(b.at - BAND_HALF) - y(b.at + BAND_HALF)} />
      ))}
      {rows.map((d, i) => i % 2 === 1 && <rect key={`p${d.day}`} class="wa-col" x={startOf(i)} y={top} width={step} height={bottom - top} />)}

      {AXIS_TICKS.map((v) => (
        <line key={`h${v}`} class="wa-grid" x1={left} x2={right} y1={y(v)} y2={y(v)} />
      ))}
      {verticals.map((x) => (
        <line key={`v${x}`} class="wa-grid" x1={x} x2={x} y1={top} y2={bottom} />
      ))}
      {notches.map((x) => (
        <line key={`n${x}`} class="wa-grid" x1={x} x2={x} y1={bottom} y2={bottom + NOTCH} />
      ))}

      {AXIS_TICKS.map((v) => (
        <text key={v} class="wa-tick" x={left - 4} y={y(v) + 3.2} text-anchor="end">
          {v}
        </text>
      ))}
      {BAND_ROWS.map((b) => (
        <text key={b.band} class="wa-band" x={(left + x0) / 2} y={y(b.at) + 2.8} text-anchor="middle">
          {copy.bands[b.band]}
        </text>
      ))}

      {rows.map((d, i) => {
        if (d.lo === null || d.hi === null) return null
        const cx = centreOf(i)
        const hi = y(d.hi)
        const lo = y(d.lo)
        const mid = d.expected === null ? null : y(d.expected)
        // The whisker stops at the top of its number and starts again under its step, so it runs through neither. With no step, it runs whole.
        const parts: readonly (readonly [number, number])[] = mid === null || d.expected === null ? [[hi, lo]] : [[hi, labelY(d.expected) - VALUE_HEIGHT], [mid + WHISKER_GAP, lo]]
        return (
          <g key={`w${d.day}`} class={i === low ? 'wa-whisker is-low' : 'wa-whisker'}>
            {parts.map(([from, to]) => to > from && <line key={from} x1={cx} x2={cx} y1={from} y2={to} />)}
            <line x1={cx - CAP_HALF} x2={cx + CAP_HALF} y1={hi} y2={hi} />
            <line x1={cx - CAP_HALF} x2={cx + CAP_HALF} y1={lo} y2={lo} />
          </g>
        )
      })}
      <path class="wa-step" d={stepPath} />
      {lowValue !== null && <line class="wa-step is-low" x1={startOf(low)} x2={endOf(low)} y1={y(lowValue)} y2={y(lowValue)} />}
      {rows.map((d, i) =>
        d.expected === null ? null : (
          <text key={`v${d.day}`} class={i === low ? 'wa-val is-low' : 'wa-val'} x={centreOf(i)} y={labelY(d.expected)} text-anchor="middle" data-testid="ahead-value">
            {Math.round(d.expected)}
          </text>
        ),
      )}
      {rows.map((d, i) => (
        <text key={`d${d.day}`} class={i === low ? 'wa-day is-low' : 'wa-day'} x={centreOf(i)} y={bottom + 14} text-anchor="middle">
          {weekdayShort(d.day)}
        </text>
      ))}
    </svg>
  )
}

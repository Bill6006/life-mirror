import { BLOCKS, type Block } from './blocks'
import { copy } from './copy'
import { formatDayTiny, formatTime } from './format'
import type { ContextPoint, DayValues } from './series'

// Hand-drawn SVG, hairlines throughout, the accent for now. Gaps stay gaps.

const BAND_LINES = [25, 50, 75]

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
      {[0, 50, 100].map((v) => (
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

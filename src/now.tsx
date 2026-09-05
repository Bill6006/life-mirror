import { useEffect, useState } from 'preact/hooks'
import { BLOCKS, blockAt, blockIndex, blockStart, type Block } from './blocks'
import { copy } from './copy'
import { allCheckIns, answeredCount, askedOf, getSettings, isComplete, winFor, type CheckIn } from './db'
import { fill, formatDayLong, formatDayShort, formatTime } from './format'
import { useLive } from './live'
import { ContextChips, ReadingHero } from './reading'
import { activeBlocks } from './settings'

type WindowState = 'logged' | 'partial' | 'now' | 'missed' | 'later'

interface TodayWindow {
  block: Block
  state: WindowState
  text: string
  time?: string
}

function statusOf(c: CheckIn): string {
  return isComplete(c)
    ? fill(copy.now.logged, { time: formatTime(c.completedAt ?? c.updatedAt) })
    : fill(copy.now.incomplete, { n: String(answeredCount(c)), total: String(askedOf(c).length) })
}

/** One small glyph per state: filled when logged, ringed when open now, faint when later or missed. */
function Glyph({ state }: { state: WindowState }) {
  return (
    <svg class={`glyph is-${state}`} viewBox="0 0 16 16" aria-hidden="true">
      <circle class="glyph-ring" cx="8" cy="8" r="6.5" />
      {(state === 'logged' || state === 'now' || state === 'partial') && <circle class="glyph-dot" cx="8" cy="8" r={state === 'logged' ? 6.5 : 2.5} />}
    </svg>
  )
}

export function NowScreen({ onCheckIn, onOpen }: { onCheckIn: (day: string, block: Block) => void; onOpen: (day: string, block: Block) => void }) {
  // Re-evaluate the current block once a minute so an open app crosses 12:00 and 17:00 correctly.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const today = blockAt(new Date())
  const all = useLive(allCheckIns, [])
  const settings = useLive(getSettings, [])
  const win = useLive(() => winFor(today.day), [today.day])
  if (!all || !settings || win === undefined) return <section class="screen" />

  const active = activeBlocks(settings.frequency)
  const todays = new Map<Block, CheckIn>()
  const earlier: CheckIn[] = []
  for (const c of all) {
    if (c.day === today.day) todays.set(c.block, c)
    else earlier.push(c)
  }
  const current = blockIndex(today.block)

  const windows = BLOCKS.flatMap((b, i): TodayWindow[] => {
    const c = todays.get(b)
    if (c && isComplete(c)) return [{ block: b, state: 'logged', text: copy.today.logged, time: formatTime(c.completedAt ?? c.updatedAt) }]
    if (c) return [{ block: b, state: 'partial', text: statusOf(c) }]
    if (!active.includes(b)) return []
    if (i === current) return [{ block: b, state: 'now', text: copy.today.now }]
    if (i < current) return [{ block: b, state: 'missed', text: copy.now.notLogged }]
    return [{ block: b, state: 'later', text: fill(copy.now.from, { time: blockStart[b] }) }]
  })

  const currentWindow = windows.find((w) => w.block === today.block)
  const action =
    currentWindow?.state === 'now'
      ? fill(copy.today.checkIn, { block: copy.blocks[today.block] })
      : currentWindow?.state === 'partial'
        ? fill(copy.today.continue, { block: copy.blocks[today.block] })
        : null

  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="eyebrow">{copy.tabs.now}</h1>
        <p class="date">{formatDayLong(today.day)}</p>
      </header>

      <ReadingHero all={all} today={today} />

      <div class="card today" style={{ '--n': String(windows.length) }}>
        <div class="windows">
          {windows.map((w) => {
            const tappable = w.state === 'logged' || w.state === 'partial' || w.state === 'now'
            const onTap = () => (w.state === 'logged' || (w.state === 'partial' && w.block !== today.block) ? onOpen(today.day, w.block) : onCheckIn(today.day, w.block))
            const inner = (
              <>
                <Glyph state={w.state} />
                <span class="w-name">{copy.blocks[w.block]}</span>
                <span class="w-state">
                  {w.text}
                  {w.time && <span class="w-time">{w.time}</span>}
                </span>
              </>
            )
            return tappable ? (
              <button key={w.block} type="button" class={`window is-${w.state}`} data-testid="block-row" onClick={onTap}>
                {inner}
              </button>
            ) : (
              <div key={w.block} class={`window is-${w.state}`} data-testid="block-row">
                {inner}
              </div>
            )
          })}
        </div>
      </div>
      {action && (
        <button type="button" class="pill-ink" onClick={() => onCheckIn(today.day, today.block)}>
          {action}
        </button>
      )}

      <ContextChips all={all} today={today.day} />

      {win && (
        <div class="card pad win-card">
          <p class="eyebrow small">{copy.win.today}</p>
          <p class="win-text">
            {win.text}
            {win.outcome && <span class="muted"> · {copy.extras.winOutcome[win.outcome]}</span>}
          </p>
        </div>
      )}

      {earlier.length > 0 && (
        <>
          <h2 class="section">{copy.now.earlier}</h2>
          <div class="card">
            <ul class="rows">
              {earlier.slice(0, 30).map((c) => (
                <li key={`${c.day}-${c.block}`}>
                  <button type="button" class="row" onClick={() => onOpen(c.day, c.block)}>
                    <span class="row-main">
                      {formatDayShort(c.day)} · {copy.blocks[c.block]}
                    </span>
                    <span class="row-side">{statusOf(c)}</span>
                    <span class="chev" aria-hidden="true">›</span>
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

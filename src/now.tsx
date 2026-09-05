import { useEffect, useState } from 'preact/hooks'
import { BLOCKS, blockAt, blockIndex, blockStart, type Block } from './blocks'
import { copy } from './copy'
import { allCheckIns, answeredCount, getSettings, isComplete, winFor, type CheckIn } from './db'
import { useLive } from './live'
import { fill, formatDayLong, formatDayShort, formatTime } from './format'
import { ContextStrip, ReadingNow } from './reading'
import { askedOf } from './db'
import { activeBlocks } from './settings'

function statusOf(c: CheckIn): string {
  return isComplete(c)
    ? fill(copy.now.logged, { time: formatTime(c.completedAt ?? c.updatedAt) })
    : fill(copy.now.incomplete, { n: String(answeredCount(c)), total: String(askedOf(c).length) })
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

  return (
    <section class="screen">
      <h1 class="eyebrow">{copy.tabs.now}</h1>
      <h2 class="title">{formatDayLong(today.day)}</h2>

      <ReadingNow all={all} today={today} />
      <ContextStrip all={all} today={today.day} />

      {win && (
        <p class="win-line">
          <span class="muted">{copy.win.today} — </span>
          {win.text}
          {win.outcome && <span class="muted"> · {copy.extras.winOutcome[win.outcome]}</span>}
        </p>
      )}

      <ul class="rows">
        {BLOCKS.map((b, i) => {
          const c = todays.get(b)
          const label = copy.blocks[b]
          if (c) {
            const resume = !isComplete(c) && i === current
            return (
              <li key={b} data-testid="block-row">
                <button type="button" class="row" onClick={() => (resume ? onCheckIn(today.day, b) : onOpen(today.day, b))}>
                  <span class="row-main">{label}</span>
                  <span class="row-side">{statusOf(c)}</span>
                  {resume ? <span class="pill">{copy.now.continue}</span> : <span class="chev" aria-hidden="true">›</span>}
                </button>
              </li>
            )
          }
          if (!active.includes(b)) return null
          if (i === current) {
            return (
              <li key={b} data-testid="block-row">
                <button type="button" class="row" onClick={() => onCheckIn(today.day, b)}>
                  <span class="row-main">{label}</span>
                  <span class="row-side">{copy.now.notLogged}</span>
                  <span class="pill">{copy.now.checkIn}</span>
                </button>
              </li>
            )
          }
          return (
            <li key={b} class="row is-static" data-testid="block-row">
              <span class="row-main">{label}</span>
              <span class="row-side">{i < current ? copy.now.notLogged : fill(copy.now.from, { time: blockStart[b] })}</span>
            </li>
          )
        })}
      </ul>

      {earlier.length > 0 && (
        <>
          <h2 class="section">{copy.now.earlier}</h2>
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
        </>
      )}
    </section>
  )
}

import { useEffect, useState } from 'preact/hooks'
import { AimsOnNow } from './aimsScreen'
import { BLOCKS, blockAt, blockIndex, blockStart, type Block } from './blocks'
import { Brief } from './brief'
import { copy } from './copy'
import { allCheckIns, answeredCount, askedOf, ensureDayContext, getDayContext, getSettings, isComplete, updateSettings, winFor, type CheckIn } from './db'
import { fill, formatDayLong, formatDayShort, formatTime } from './format'
import { useLive } from './live'
import { MoveCard } from './moveCard'
import { ensurePickupOffer, offerForSlot, pendingOffers, skipOffer, studyNightsAll, weeksOfRecord } from './offerFlow'
import { ContextChips, ReadingHero } from './reading'
import { activeBlocks } from './settings'
import { keptCount } from './studyNight'

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

/** Asked once, at first open after this build: one line, yours, kept on this phone. Never asked again. */
function DirectionAsk() {
  const [text, setText] = useState('')
  const c = copy.direction
  const answer = (line: string) => void updateSettings((s) => ({ ...s, direction: line.trim() || null, directionAskedAt: new Date().toISOString() }))
  return (
    <div class="card pad direction-ask" data-testid="direction-ask">
      <p class="eyebrow small">{c.title}</p>
      <p class="note">{c.ask}</p>
      <input class="input" type="text" maxLength={200} placeholder={c.placeholder} value={text} onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)} data-testid="direction-input" />
      <div class="actions">
        <button type="button" class="pill-quiet" disabled={!text.trim()} onClick={() => answer(text)}>
          {c.save}
        </button>
        <button type="button" class="textbtn" onClick={() => answer('')}>
          {c.notNow}
        </button>
      </div>
      <p class="note faint no-gap">{c.note}</p>
    </div>
  )
}

export function NowScreen({ onCheckIn, onOpen, onChangeRep }: { onCheckIn: (day: string, block: Block) => void; onOpen: (day: string, block: Block) => void; onChangeRep?: (aimId: number) => void }) {
  // Re-evaluate the current block once a minute so an open app crosses 12:00 and 17:00 correctly,
  // and open the slot before pickup when its window arrives.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    void ensurePickupOffer(new Date())
  }, [tick])

  const today = blockAt(new Date())
  const all = useLive(allCheckIns, [])
  const settings = useLive(getSettings, [])
  // Today's context record is written from the week's shape the first time the day is seen; Settings can change today alone.
  useEffect(() => {
    if (settings) void ensureDayContext(today.day, settings)
  }, [settings?.updatedAt, today.day])
  const ctx = useLive(() => getDayContext(today.day), [today.day])
  const studyNights = useLive(studyNightsAll, [])
  const win = useLive(() => winFor(today.day), [today.day])
  const here = useLive(() => offerForSlot(today.day, today.block), [today.day, today.block, tick])
  const pickup = useLive(() => offerForSlot(today.day, today.block, 'pickup'), [today.day, today.block, tick])
  const pending = useLive(pendingOffers, [])
  const weeks = useLive(() => weeksOfRecord(today.day), [today.day])
  if (!all || !settings || win === undefined || here === undefined || pickup === undefined || pending === undefined) return <section class="screen" />

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

  const offer = here ?? pending.find((o) => o.kind === 'block') ?? null

  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="eyebrow">{copy.tabs.now}</h1>
        <p class="date">{formatDayLong(today.day)}</p>
      </header>

      {settings.directionAskedAt === null && <DirectionAsk />}

      <ReadingHero all={all} today={today} />
      <Brief day={today.day} version={all.length} />

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
      {ctx?.studyNight && (
        <p class="note faint study-fact" data-testid="study-fact">
          {copy.study.fact}
          {studyNights && studyNights.length > 0 && ` · ${fill(copy.study.kept, { kept: String(keptCount(studyNights).kept), total: String(keptCount(studyNights).total) })}`}
        </p>
      )}

      <AimsOnNow onChangeRep={onChangeRep} />

      {!settings.hideMoves && pickup && <MoveCard offer={pickup} onSkip={() => void skipOffer(pickup)} />}
      {!settings.hideMoves && offer && <MoveCard offer={offer} onSkip={() => void skipOffer(offer)} />}
      {!settings.hideMoves && (
        <p class="note faint knows" data-testid="knows">
          {fill(copy.move.knows, { weeks: String(weeks ?? 0) })}
        </p>
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

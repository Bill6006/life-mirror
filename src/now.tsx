import { useEffect, useState } from 'preact/hooks'
import { AimsOnNow } from './aimsScreen'
import { BLOCKS, blockAt, blockIndex, blockStart, type Block } from './blocks'
import { Brief } from './brief'
import { PlaceQuestion } from './locationScreen'
import { lineActionState, todaysLine } from './brainFlow'
import { copy } from './copy'
import { allCheckIns, answeredCount, answerWin, askedOf, ensureDayContext, getSettings, isComplete, updateSettings, winFor, type CheckIn } from './db'
import { fill, formatDayShort, formatHHMM, formatTime } from './format'
import { Icon } from './icons'
import { useLive } from './live'
import { knowsCounts } from './learningFlow'
import { MoveCard } from './moveCard'
import { guardRepair } from './repair/breaker'
import { repairEvidence } from './repair/evidence'
import { useRepairOn } from './repair/gate'
import { WeekLine } from './repair/weekLine'
import { ensurePickupOffer, offerForSlot, pendingOffers, pickupOfferNow, skipOffer, weeksOfRecord } from './offerFlow'
import { ContextChips, ReadingHero } from './reading'
import { setUpPing } from './push'
import { activeBlocks, type PushState } from './settings'
import { Disclosure, Facts, LinkRow, ScreenHead, SectionLabel } from './ui'
import { awayStatus } from './awayFlow'
import { awayLine } from './awayScreen'
import type { AskAboutThis } from './ask/askScreen'

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

/** Today's blocks: one card, a block each, its state in words (never colour alone), a tap where there is something to open. */
function Status({ windows, today, onOpen, onCheckIn }: { windows: readonly TodayWindow[]; today: { day: string; block: Block }; onOpen: (day: string, block: Block) => void; onCheckIn: (day: string, block: Block) => void }) {
  return (
    <div class="card today" style={{ '--n': String(windows.length) }}>
      <div class="windows">
        {windows.map((w) => {
          const tappable = w.state === 'logged' || w.state === 'partial' || w.state === 'now'
          const onTap = () => (w.state === 'logged' || (w.state === 'partial' && w.block !== today.block) ? onOpen(today.day, w.block) : onCheckIn(today.day, w.block))
          const inner = (
            <>
              <span class="w-mark" aria-hidden="true" />
              <Icon name={w.block} class="w-ic" />
              <span class="w-name">{copy.blocks[w.block]}</span>
              <span class="w-state">
                {w.text}
                {/* The space before the time is outside it: the time stays whole, and may move to its own line. */}
                {w.time && <> <span class="w-time">{w.time}</span></>}
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
  )
}

/**
 * How much the moves know: one line, and how they pick one tap behind it. While the learning repair is on (R6), the words
 * behind the tap describe its draw, and its tests are those with fair draws on both sides; the line itself holds for both.
 */
function Knows({ weeks, counts, day }: { weeks: number; counts: { tried: number; tests: number } | undefined; day: string }) {
  const c = copy.move
  const repair = useRepairOn()
  const underWay = useLive(() => (repair ? guardRepair(day, () => repairEvidence(day).then((ev) => ev.shown.length + ev.quiet.length), null) : Promise.resolve(null)), [repair, day])
  const w = weeks === 1 ? c.weeksOne : fill(c.weeksMany, { n: String(weeks) })
  const tried = counts?.tried ?? 0
  const tests = repair ? (underWay ?? 0) : (counts?.tests ?? 0)
  const basis = tried === 0 ? c.knowsResearch : tried === 1 ? c.knowsCorrectedOne : fill(c.knowsCorrected, { n: String(tried) })
  const [lead, rest] = fill(c.knowsShort, { weeks: w, basis }).split(' · ')
  return (
    <div class="knows" data-testid="knows">
      <Facts items={[lead, rest]} />
      <Disclosure label={copy.disclose.knowsMore} testid="knows-more">
        <p class="note faint no-gap">
          {repair
            ? fill(c.knowsRepair, {
                weeks: w,
                tried: tried === 0 ? c.knowsTriedNone : tried === 1 ? c.knowsTriedOne : fill(c.knowsTriedN, { n: String(tried) }),
                tests: tests === 0 ? c.knowsUnderWayNone : tests === 1 ? c.knowsUnderWayOne : fill(c.knowsUnderWayN, { n: String(tests) }),
              })
            : fill(c.knows, {
                weeks: w,
                tried: tried === 0 ? c.knowsTriedNone : tried === 1 ? c.knowsTriedOne : fill(c.knowsTriedN, { n: String(tried) }),
                tests: tests === 0 ? c.knowsTestsNone : tests === 1 ? c.knowsTestsOne : fill(c.knowsTestsN, { n: String(tests) }),
              })}
        </p>
      </Disclosure>
    </div>
  )
}

/**
 * Earlier: one row a day, a column per block, each time a tap that opens that check-in. A block
 * not logged says so in words. Three days show; the rest sit behind one row, in the same grid.
 */
export function Earlier({ checkins, blocks, onOpen }: { checkins: readonly CheckIn[]; blocks: readonly Block[]; onOpen: (day: string, block: Block) => void }) {
  const byDay = new Map<string, Map<Block, CheckIn>>()
  for (const c of checkins) {
    if (!byDay.has(c.day)) byDay.set(c.day, new Map())
    ;(byDay.get(c.day) as Map<Block, CheckIn>).set(c.block, c)
  }
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1)).slice(0, 10)
  // The blocks you check in now, and any block the shown days hold.
  const cols = BLOCKS.filter((b) => blocks.includes(b) || days.some((d) => byDay.get(d)?.has(b)))
  const c = copy.earlier
  const rows = (list: readonly string[]) =>
    list.map((day) => (
      <div key={day} class="e-row" role="row" data-testid="earlier-day">
        <span class="e-day" role="rowheader">
          {formatDayShort(day)}
        </span>
        {cols.map((b) => {
          const ci = byDay.get(day)?.get(b)
          return (
            <span key={b} class="e-cell" role="cell">
              {ci ? (
                <button type="button" class="e-t" aria-label={`${fill(c.open, { block: copy.blocks[b], day: formatDayShort(day) })} · ${statusOf(ci)}`} data-testid="earlier-time" onClick={() => onOpen(day, b)}>
                  {isComplete(ci) ? formatTime(ci.completedAt ?? ci.updatedAt) : fill(copy.now.incomplete, { n: String(answeredCount(ci)), total: String(askedOf(ci).length) })}
                </button>
              ) : (
                <span class="e-miss">{c.notLogged}</span>
              )}
            </span>
          )
        })}
      </div>
    ))
  // One grid for the header, the days and the days behind the tap, so every column lines up; on a
  // narrow phone each day's name sits over its three times instead of beside them.
  return (
    <div class="card earlier" data-testid="earlier">
      <div class="e-grid" style={{ '--cols': String(cols.length) }} role="table" aria-label={c.title}>
        <div class="e-row e-heads" role="row">
          <span class="e-head e-head-day" role="columnheader">
            {c.day}
          </span>
          {cols.map((b) => (
            <span key={b} class="e-head" role="columnheader">
              {copy.blocks[b]}
            </span>
          ))}
        </div>
        {rows(days.slice(0, 3))}
        {days.length > 3 && (
          <Disclosure label={c.more} sub={fill(c.moreCount, { n: String(days.length - 3) })} testid="earlier-more" class="e-more">
            {rows(days.slice(3))}
          </Disclosure>
        )}
      </div>
    </div>
  )
}

/**
 * The ping lost its address and only a tap can make another (the owner's report of 2026-10-20: a browser that withdraws
 * its notification permission cancels the address): one line and one button, which asks for the permission and makes it.
 */
function PingLost({ push }: { push: PushState }) {
  const [busy, setBusy] = useState(false)
  const restore = () => {
    setBusy(true)
    void setUpPing(push)
      .then((next) => (next ? updateSettings((s) => ({ ...s, push: next })) : undefined))
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }
  return (
    <div class="card pad" data-testid="ping-lost">
      <p class="note">{copy.now.pingLost}</p>
      <div class="actions">
        <button type="button" class="pill-quiet" disabled={busy} data-testid="ping-restore" onClick={restore}>
          {copy.now.pingRestore}
        </button>
      </div>
    </div>
  )
}

export function NowScreen({ onCheckIn, onOpen, onChangeRep, onAway, onAsk }: { onCheckIn: (day: string, block: Block) => void; onOpen: (day: string, block: Block) => void; onChangeRep?: (aimId: number) => void; onAway?: () => void; onAsk?: (about: AskAboutThis) => void }) {
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
  const win = useLive(() => winFor(today.day), [today.day])
  const knows = useLive(knowsCounts, [])
  const here = useLive(() => offerForSlot(today.day, today.block), [today.day, today.block, tick])
  const pickup = useLive(() => pickupOfferNow(new Date()), [today.day, today.block, tick])
  const pending = useLive(pendingOffers, [])
  const weeks = useLive(() => weeksOfRecord(today.day), [today.day])
  // The Brain's line and its action, read here too, to decide which one thing carries the accent. Read again each minute: a line whose moment is gone leaves.
  const line = useLive(() => todaysLine(today.day), [today.day, tick])
  const act = useLive(() => (line ? lineActionState(today.day, line.action ?? null) : Promise.resolve(null)), [today.day, line?.key, JSON.stringify(line?.action ?? null), all?.length])
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
    return [{ block: b, state: 'later', text: fill(copy.now.from, { time: formatHHMM(blockStart[b]) }) }]
  })

  const currentWindow = windows.find((w) => w.block === today.block)
  const action =
    currentWindow?.state === 'now'
      ? fill(copy.today.checkIn, { block: copy.blocks[today.block] })
      : currentWindow?.state === 'partial'
        ? fill(copy.today.continue, { block: copy.blocks[today.block] })
        : null

  // One accent on Now, for the one thing to do: the check-in while its block is open; else the
  // Brain line's own action while it is open; else Resume on the commitment that action names.
  const briefPrimary = action === null && Boolean(line?.action) && act?.state === 'open'
  const dueAimId = action === null && !briefPrimary && line?.action?.kind === 'plan' ? line.action.aimId : null

  const offer = here ?? pending.find((o) => o.kind === 'block') ?? null
  // Away from home (post-window, gated): one line while a trip is set, to its screen; closed, Now is as it was.
  const trip = awayLine(awayStatus(settings.away, today.day))

  return (
    <section class="screen now">
      <ScreenHead title={copy.tabs.now} day={today.day} />
      {settings.reminders.enabled && settings.push.needsTap && <PingLost push={settings.push} />}
      {trip && onAway && (
        <div class="card" data-testid="away-line">
          <ul class="rows">
            <LinkRow label={copy.away.row} note={trip} icon="trip" onClick={onAway} testid="away-open" />
          </ul>
        </div>
      )}

      {settings.directionAskedAt === null && <DirectionAsk />}

      <ReadingHero all={all} today={today} />
      <Brief day={today.day} version={all.length} tick={tick} primary={briefPrimary} onAsk={onAsk} />
      <PlaceQuestion />

      <Status windows={windows} today={today} onOpen={onOpen} onCheckIn={onCheckIn} />
      {action && (
        <button type="button" class="pill-ink is-primary" onClick={() => onCheckIn(today.day, today.block)}>
          {action}
        </button>
      )}
      <AimsOnNow onChangeRep={onChangeRep} dueAimId={dueAimId} />

      {!settings.hideMoves && pickup && <MoveCard offer={pickup} onSkip={(reason) => void skipOffer(pickup, reason ?? null)} />}
      {/* A card left from an earlier check-in waits for the next check-in's question: no Skip promises what it cannot give (D6),
          and with nothing to tap it keeps to its name and when it was offered, the rest one tap away (final UI polish, 2026-09-26). */}
      {!settings.hideMoves && offer && <MoveCard offer={offer} onSkip={offer === here ? (reason) => void skipOffer(offer, reason ?? null) : undefined} waiting={offer !== here} />}
      {!settings.hideMoves && <WeekLine day={today.day} />}
      {!settings.hideMoves && <Knows weeks={weeks ?? 0} counts={knows} day={today.day} />}

      <ContextChips all={all} today={today.day} index={1} />

      {win && (
        <div class="card pad win-card">
          <p class="eyebrow small">{copy.win.today}</p>
          <p class="win-text">
            {win.text}
            {win.outcome && <span class="muted"> · {copy.extras.winOutcome[win.outcome]}</span>}
          </p>
          {win.outcome !== 'done' && (
            <button type="button" class="pill-quiet" data-testid="win-done" onClick={() => void answerWin(today.day, 'done')}>
              {copy.win.done}
            </button>
          )}
        </div>
      )}

      {earlier.length > 0 && (
        <>
          <SectionLabel index={2}>{copy.now.earlier}</SectionLabel>
          <Earlier checkins={earlier} blocks={active} onOpen={onOpen} />
        </>
      )}
    </section>
  )
}

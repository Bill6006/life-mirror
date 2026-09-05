import { useEffect, useRef, useState } from 'preact/hooks'
import { addDays, BLOCKS, type Block } from './blocks'
import { changesInWords } from './change'
import { copy } from './copy'
import {
  allCheckIns,
  askedOf,
  clearAnswer,
  deleteCheckIn,
  getCheckIn,
  getSettings,
  isComplete,
  previousCompleted,
  privateItems,
  saveAnswer,
  useLive,
  winFor,
} from './db'
import { fill, formatTime } from './format'
import { Glance, ReadingOfCheckIn } from './reading'
import { anchorFor, description, headword, POSITIONS, readingById, type Answers, type Position, type ReadingId } from './readings'
import { activeBlocks, askedReadings, type Depth } from './settings'

/** Pauses longer than this are not counted as answering time. */
const ACTIVE_GAP_MS = 60_000

function AnchorText({ anchor }: { anchor: string }) {
  const desc = description(anchor)
  return (
    <span class="row-main">
      <span class="head">{headword(anchor)}</span>
      {desc && <span class="desc"> — {desc}</span>}
    </span>
  )
}

/**
 * One reading at a time, five phrases, one tap each. Every tap is written to the phone at
 * once and the next reading appears. With `only`, a single reading is changed and control
 * returns to the summary. The set of readings is fixed when the check-in begins.
 */
export function CheckInScreen({
  day,
  block,
  depth,
  only,
  onDone,
  onClose,
}: {
  day: string
  block: Block
  depth: Depth
  only?: ReadingId
  onDone: () => void
  onClose: () => void
}) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const ids = record ? askedOf(record) : askedReadings(block, depth)
  const total = ids.length
  const [local, setLocal] = useState<Answers>({})
  const [index, setIndex] = useState(only ? Math.max(0, ids.indexOf(only)) : 0)
  const resumed = useRef(Boolean(only))
  const lastTap = useRef(performance.now())

  const answers: Answers = { ...(record?.answers ?? {}), ...local }

  // Resume at the first unanswered reading once the stored record is known.
  useEffect(() => {
    if (record === undefined || resumed.current) return
    resumed.current = true
    const first = ids.findIndex((id) => (record?.answers ?? {})[id] === undefined)
    if (first > 0) setIndex(first)
  }, [record])

  const safeIndex = Math.min(index, total - 1)
  const id = ids[safeIndex]
  const reading = readingById(id)
  const answered = ids.filter((r) => answers[r] !== undefined).length

  function pick(position: Position) {
    const now = performance.now()
    const gap = now - lastTap.current
    lastTap.current = now
    const next: Answers = { ...answers, [id]: position }
    setLocal((l) => ({ ...l, [id]: position }))
    void saveAnswer({ day, block }, ids, id, position, gap < ACTIVE_GAP_MS ? gap : 0)
    if (only) {
      onDone()
      return
    }
    const ahead = ids.findIndex((r, i) => i > safeIndex && next[r] === undefined)
    if (ahead !== -1) return setIndex(ahead)
    const anywhere = ids.findIndex((r) => next[r] === undefined)
    if (anywhere !== -1) return setIndex(anywhere)
    onDone()
  }

  function clear() {
    setLocal((l) => ({ ...l, [id]: undefined }))
    void clearAnswer({ day, block }, id)
    if (only) onDone()
  }

  return (
    <section class="screen checkin" aria-labelledby="ci-title">
      <p class="eyebrow">{fill(copy.checkin.progress, { block: copy.blocks[block], n: String(safeIndex + 1), total: String(total) })}</p>
      <div class="progress" aria-hidden="true">
        <span style={{ width: `${(answered / total) * 100}%` }} />
      </div>
      <h1 id="ci-title" class="title">
        {reading.name}
      </h1>
      <p class="note">{reading.prompt}</p>

      <ul class="rows anchors">
        {POSITIONS.map((p) => {
          const anchor = anchorFor(id, p)
          const picked = answers[id] === p
          return (
            <li key={p}>
              <button type="button" class={picked ? 'row anchor is-picked' : 'row anchor'} data-testid="anchor" aria-pressed={picked} onClick={() => pick(p)}>
                <span class="anchor-mark" aria-hidden="true" />
                <AnchorText anchor={anchor} />
              </button>
            </li>
          )
        })}
      </ul>

      <div class="actions">
        {!only && safeIndex > 0 && (
          <button type="button" class="textbtn" onClick={() => setIndex(safeIndex - 1)}>
            {copy.checkin.back}
          </button>
        )}
        {answers[id] !== undefined && (
          <button type="button" class="textbtn" onClick={clear}>
            {copy.checkin.clear}
          </button>
        )}
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}

/**
 * The give-back card after a check-in (fresh) and the review of any past one. Facts (what
 * was tapped) sit in the plain register; the reading, today's glance and the change since
 * last time sit in the calculation register. Any reading can be changed; the whole check-in
 * can be deleted in two taps.
 */
export function SummaryScreen({
  day,
  block,
  fresh,
  onChange,
  onExtras,
  onDone,
  onDeleted,
}: {
  day: string
  block: Block
  fresh: boolean
  onChange: (id: ReadingId) => void
  onExtras: () => void
  onDone: () => void
  onDeleted: () => void
}) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const previous = useLive(() => previousCompleted(day, block), [day, block])
  const all = useLive(allCheckIns, [])
  const settings = useLive(getSettings, [])
  const items = useLive(privateItems, [])
  const tomorrowWin = useLive(() => winFor(addDays(day, 1)), [day])
  const [confirm, setConfirm] = useState(false)

  if (record === undefined || previous === undefined || !all || !settings || !items || tomorrowWin === undefined) return <section class="screen" />

  if (record === null) {
    return (
      <section class="screen">
        <p class="eyebrow">{copy.blocks[block]}</p>
        <p class="note">{copy.summary.notLogged}</p>
        <div class="actions">
          <button type="button" class="textbtn" onClick={onDone}>
            {copy.summary.done}
          </button>
        </div>
      </section>
    )
  }

  const complete = isComplete(record)
  const change = complete ? changesInWords(record.answers, block, previous, { day, block }) : null
  const glanceBlocks = BLOCKS.filter((b) => activeBlocks(settings.frequency).includes(b) || all.some((c) => c.day === day && c.block === b))
  const ex = record.extras ?? {}
  const privateLogged = items.filter((it) => ex.private?.[String(it.id)])

  function remove() {
    if (!confirm) return setConfirm(true)
    if (record?.id !== undefined) void deleteCheckIn(record.id).then(onDeleted)
  }

  return (
    <section class="screen" data-testid={fresh ? 'give-back' : 'summary'}>
      <p class="eyebrow">
        {complete
          ? fill(copy.summary.logged, { block: copy.blocks[block], time: formatTime(record.completedAt ?? record.updatedAt) })
          : fill(copy.summary.incomplete, { block: copy.blocks[block] })}
      </p>

      <ReadingOfCheckIn checkin={record} />

      <div class="calc">
        <Glance all={all} day={day} blocks={glanceBlocks} />
        {change ? (
          <>
            {change.since && <h2 class="title-sm">{fill(copy.since.heading, { when: change.since })}</h2>}
            {change.lines.map((line) => (
              <p key={line} class="calc-line">
                {line}
              </p>
            ))}
          </>
        ) : (
          <p class="calc-line">{copy.summary.finishFirst}</p>
        )}
      </div>

      <h2 class="section">{copy.summary.readings}</h2>
      <ul class="rows">
        {askedOf(record).map((id) => {
          const p = record.answers[id]
          return (
            <li key={id}>
              <button type="button" class="row" onClick={() => onChange(id)}>
                <span class="row-main">{readingById(id).name}</span>
                <span class={p ? 'row-side ink' : 'row-side'}>{p ? headword(anchorFor(id, p)) : copy.summary.notLogged}</span>
                <span class="chev" aria-hidden="true">›</span>
              </button>
            </li>
          )
        })}
      </ul>

      {block === 'evening' && (
        <>
          <h2 class="section">{copy.summary.extras}</h2>
          <ul class="rows">
            {settings.extras.caffeine && <Fact label={copy.extras.caffeine} value={ex.caffeine ? copy.extras.yes : null} />}
            {settings.extras.dinner && <Fact label={copy.extras.dinner} value={ex.dinner ? copy.extras.yes : null} />}
            {(settings.extras.faith || ex.closeToGod) && <Fact label={copy.extras.faith} value={ex.closeToGod ? copy.extras.yes : null} />}
            {(settings.extras.privateLog || privateLogged.length > 0) && items.length > 0 && (
              <Fact
                label={copy.extras.private}
                value={
                  privateLogged.length === 0
                    ? null
                    : settings.showPrivate
                      ? privateLogged.map((it) => it.name).join(', ')
                      : fill(copy.extras.privateLogged, { n: String(privateLogged.length) })
                }
              />
            )}
            {(settings.extras.minimumWin || tomorrowWin) && <Fact label={copy.extras.tomorrowWin} value={tomorrowWin?.text ?? null} />}
            <li>
              <button type="button" class="row" onClick={onExtras}>
                <span class="row-main">{copy.summary.changeExtras}</span>
                <span class="chev" aria-hidden="true">›</span>
              </button>
            </li>
          </ul>
        </>
      )}

      <div class="actions">
        <button type="button" class="pill-btn" onClick={onDone}>
          {copy.summary.done}
        </button>
      </div>
      <div class="actions">
        <button type="button" class="textbtn faint" onClick={remove}>
          {confirm ? copy.summary.deleteConfirm : copy.summary.delete}
        </button>
      </div>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <li class="row is-static">
      <span class="row-main">{label}</span>
      <span class={value ? 'row-side ink wrap' : 'row-side'}>{value ?? copy.summary.notLogged}</span>
    </li>
  )
}

import { useEffect, useRef, useState } from 'preact/hooks'
import type { Block } from './blocks'
import { changesInWords } from './change'
import { copy } from './copy'
import { clearAnswer, deleteCheckIn, getCheckIn, isComplete, previousCompleted, saveAnswer, useLive } from './db'
import { fill, formatTime } from './format'
import { anchorFor, blockReadings, description, headword, POSITIONS, readingById, type Answers, type Position, type ReadingId } from './readings'

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
 * returns to the summary.
 */
export function CheckInScreen({
  day,
  block,
  only,
  onDone,
  onClose,
}: {
  day: string
  block: Block
  only?: ReadingId
  onDone: () => void
  onClose: () => void
}) {
  const ids = blockReadings(block)
  const total = ids.length
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const [local, setLocal] = useState<Answers>({})
  const [index, setIndex] = useState(only ? ids.indexOf(only) : 0)
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

  const id = ids[index]
  const reading = readingById(id)
  const answered = ids.filter((r) => answers[r] !== undefined).length

  function pick(position: Position) {
    const now = performance.now()
    const gap = now - lastTap.current
    lastTap.current = now
    const next: Answers = { ...answers, [id]: position }
    setLocal((l) => ({ ...l, [id]: position }))
    void saveAnswer(day, block, id, position, gap < ACTIVE_GAP_MS ? gap : 0)
    if (only) {
      onDone()
      return
    }
    const ahead = ids.findIndex((r, i) => i > index && next[r] === undefined)
    if (ahead !== -1) return setIndex(ahead)
    const anywhere = ids.findIndex((r) => next[r] === undefined)
    if (anywhere !== -1) return setIndex(anywhere)
    onDone()
  }

  function clear() {
    setLocal((l) => ({ ...l, [id]: undefined }))
    void clearAnswer(day, block, id)
    if (only) onDone()
  }

  return (
    <section class="screen checkin" aria-labelledby="ci-title">
      <p class="eyebrow">{fill(copy.checkin.progress, { block: copy.blocks[block], n: String(index + 1), total: String(total) })}</p>
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
        {!only && index > 0 && (
          <button type="button" class="textbtn" onClick={() => setIndex(index - 1)}>
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
 * was tapped) sit in the plain register; the change since last time sits in the calculation
 * register. Any reading can be changed; the whole check-in can be deleted in two taps.
 */
export function SummaryScreen({
  day,
  block,
  fresh,
  onChange,
  onDone,
  onDeleted,
}: {
  day: string
  block: Block
  fresh: boolean
  onChange: (id: ReadingId) => void
  onDone: () => void
  onDeleted: () => void
}) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const previous = useLive(() => previousCompleted(day, block), [day, block])
  const [confirm, setConfirm] = useState(false)

  if (record === undefined || previous === undefined) return <section class="screen" />

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

      <div class="calc">
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
        {blockReadings(block).map((id) => {
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

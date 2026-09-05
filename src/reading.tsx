import type { Block, Slot } from './blocks'
import { copy } from './copy'
import type { CheckIn } from './db'
import { fill, formatDayShort, formatTime } from './format'
import { anchorFor, headword, readingById } from './readings'
import { latestContext, latestFullReading, readingOf, todayGlance, TOTAL_INGREDIENTS, type Reading100 } from './score'

// The reading out of 100 and what sits beside it. Everything derived is in the calculation
// register (.calc); the context values are facts.

function whenOf(c: CheckIn, today: string): string {
  const time = formatTime(c.completedAt ?? c.updatedAt)
  const block = copy.blocks[c.block].toLowerCase()
  return c.day === today ? fill(copy.reading.at, { block, time }) : fill(copy.reading.atDay, { day: formatDayShort(c.day), block, time })
}

function recipe(r: Reading100): string {
  return fill(copy.reading.recipe, { used: String(r.used), total: String(TOTAL_INGREDIENTS) })
}

function Big({ reading }: { reading: Reading100 }) {
  return (
    <p class="reading-big">
      <span class="num">{reading.value}</span>
      <span class="stance">{copy.stances[reading.stance]}</span>
    </p>
  )
}

/** The headline on Now: this block's reading, or Incomplete with the last full one, or Not logged yet. */
export function ReadingNow({ all, today }: { all: CheckIn[]; today: Slot }) {
  const current = all.find((c) => c.day === today.day && c.block === today.block)
  const full = latestFullReading(all)

  if (current && !readingOf(current)) {
    return (
      <div class="calc reading" data-testid="reading-incomplete">
        <p class="reading-big">{copy.reading.incomplete}</p>
        {full && (
          <p class="calc-line">
            {fill(copy.reading.lastFull, { value: String(full.reading.value), stance: copy.stances[full.reading.stance], when: whenOf(full.checkin, today.day) })}
          </p>
        )}
      </div>
    )
  }

  if (!full) {
    return (
      <div class="reading">
        <p class="reading-big">{copy.reading.none}</p>
        <p class="note">{copy.reading.noneNote}</p>
      </div>
    )
  }

  return (
    <div class="calc reading" data-testid="reading-100">
      <Big reading={full.reading} />
      <p class="calc-line">
        {recipe(full.reading)} · {whenOf(full.checkin, today.day)}
      </p>
    </div>
  )
}

/** The reading of one check-in, for its card. */
export function ReadingOfCheckIn({ checkin }: { checkin: CheckIn }) {
  const r = readingOf(checkin)
  if (!r) {
    return (
      <div class="calc reading">
        <p class="reading-big">{copy.reading.incomplete}</p>
      </div>
    )
  }
  return (
    <div class="calc reading" data-testid="reading-100">
      <Big reading={r} />
      <p class="calc-line">{recipe(r)}</p>
    </div>
  )
}

/** Today's blocks and their readings, one line. */
export function Glance({ all, day, blocks }: { all: CheckIn[]; day: string; blocks: readonly Block[] }) {
  const items = todayGlance(all, day, blocks)
  return (
    <p class="calc-line">
      {copy.reading.today}:{' '}
      {items.map((g, i) => (
        <span key={g.block}>
          {i > 0 && ' · '}
          {copy.blocks[g.block]} {g.reading ? g.reading.value : '—'}
        </span>
      ))}
    </p>
  )
}

/** Hunger, sleep, confidence, loneliness, social energy: latest values with their time. Facts. */
export function ContextStrip({ all, today }: { all: CheckIn[]; today: string }) {
  const values = latestContext(all)
  if (!values.length) return null
  return (
    <div class="context">
      <p class="eyebrow small">{copy.reading.context}</p>
      <ul class="context-list">
        {values.map((v) => (
          <li key={v.id}>
            <span class="ctx-name">{readingById(v.id).name}</span>
            <span class="ctx-value">{headword(anchorFor(v.id, v.position))}</span>
            <span class="ctx-when">{whenOf(v.checkin, today)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

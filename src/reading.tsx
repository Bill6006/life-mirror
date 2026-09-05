import type { Block, Slot } from './blocks'
import { copy } from './copy'
import type { CheckIn } from './db'
import { fill, formatDayShort, formatTime } from './format'
import { anchorFor, headword, readingById } from './readings'
import { Scale } from './scale'
import { latestContext, latestFullReading, readingOf, todayGlance, TOTAL_INGREDIENTS, type Reading100 } from './score'

// The reading out of 100 and what sits beside it. Everything derived is in the calculation
// register (the thin rule on the left); the context values are facts.

function whenOf(c: CheckIn, today: string): string {
  const time = formatTime(c.completedAt ?? c.updatedAt)
  const block = copy.blocks[c.block].toLowerCase()
  return c.day === today ? fill(copy.reading.at, { block, time }) : fill(copy.reading.atDay, { day: formatDayShort(c.day), block, time })
}

function recipe(r: Reading100): string {
  return fill(copy.reading.recipe, { used: String(r.used), total: String(TOTAL_INGREDIENTS) })
}

function Value({ reading, dim = false }: { reading: Reading100; dim?: boolean }) {
  return (
    <p class={dim ? 'hero-value is-dim' : 'hero-value'}>
      <span class="hero-num">{reading.value}</span>
      <span class="hero-stance" data-testid="stance">
        {copy.stances[reading.stance]}
      </span>
    </p>
  )
}

/** The centrepiece of Now: this block's reading on its scale, or Incomplete with the last full one, or Not logged yet. */
export function ReadingHero({ all, today }: { all: CheckIn[]; today: Slot }) {
  const current = all.find((c) => c.day === today.day && c.block === today.block)
  const full = latestFullReading(all)

  if (current && !readingOf(current)) {
    return (
      <div class="hero" data-testid="reading-incomplete">
        <p class="hero-word">{copy.reading.incomplete}</p>
        <Scale value={full ? full.reading.value : null} hollow />
        <p class="hero-recipe">
          {full ? fill(copy.reading.lastFull, { value: String(full.reading.value), stance: copy.stances[full.reading.stance], when: whenOf(full.checkin, today.day) }) : copy.reading.noneNote}
        </p>
      </div>
    )
  }

  if (!full) {
    return (
      <div class="hero">
        <p class="hero-word">{copy.reading.none}</p>
        <Scale value={null} />
        <p class="hero-recipe">{copy.reading.noneNote}</p>
      </div>
    )
  }

  return (
    <div class="hero" data-testid="reading-100">
      <Value reading={full.reading} />
      <Scale value={full.reading.value} />
      <p class="hero-recipe">
        {recipe(full.reading)} · {whenOf(full.checkin, today.day)}
      </p>
    </div>
  )
}

/** The reading of one check-in, for its card: the same shape, smaller. */
export function ReadingOfCheckIn({ checkin }: { checkin: CheckIn }) {
  const r = readingOf(checkin)
  if (!r) {
    return (
      <div class="hero compact">
        <p class="hero-word">{copy.reading.incomplete}</p>
        <Scale value={null} compact />
      </div>
    )
  }
  return (
    <div class="hero compact" data-testid="reading-100">
      <Value reading={r} />
      <Scale value={r.value} compact />
      <p class="hero-recipe">{recipe(r)}</p>
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

/** Hunger, sleep, confidence, loneliness, social energy as small chips: latest value, and the day when it is not today. Facts. */
export function ContextChips({ all, today }: { all: CheckIn[]; today: string }) {
  const values = latestContext(all)
  if (!values.length) return null
  return (
    <div class="context">
      <p class="eyebrow small">{copy.reading.context}</p>
      <ul class="chips">
        {values.map((v) => (
          <li key={v.id} class="chip">
            <span class="chip-name">{readingById(v.id).name}</span>
            <span class="chip-value">{headword(anchorFor(v.id, v.position))}</span>
            {v.checkin.day !== today && <span class="chip-when">{formatDayShort(v.checkin.day)}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

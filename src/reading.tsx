import { useState } from 'preact/hooks'
import type { Block, Slot } from './blocks'
import { onBoard } from './caffeineRecord'
import { copy } from './copy'
import { askedOf, type CheckIn } from './db'
import { fill, formatDayShort, formatTime } from './format'
import { anchorFor, headword, readingById } from './readings'
import { Scale } from './scale'
import { Facts, SectionLabel } from './ui'
import { bandOf, INGREDIENTS, latestContext, latestFullReading, readingOf, todayGlance, TOTAL_INGREDIENTS, type Reading100 } from './score'

// The reading out of 100 and what sits beside it. Everything derived is in the calculation
// register (the thin rule on the left); the context values are facts.

function whenOf(c: CheckIn, today: string): string {
  const time = formatTime(c.completedAt ?? c.updatedAt)
  const block = copy.blocks[c.block].toLowerCase()
  return c.day === today ? fill(copy.reading.at, { block, time }) : fill(copy.reading.atDay, { day: formatDayShort(c.day), block, time })
}

function recipe(r: Reading100): string {
  return fill(copy.reading.recipe, { used: String(r.used), total: String(TOTAL_INGREDIENTS), weights: r.weighted ? copy.reading.learnedWeights : copy.reading.equalWeights })
}

function answeredIngredients(c: CheckIn): number {
  return askedOf(c).filter((id) => id in INGREDIENTS && c.answers[id] !== undefined).length
}

function Value({ reading }: { reading: Reading100 }) {
  const band = bandOf(reading.value)
  return (
    <p class="hero-value">
      <span class="hero-num">{reading.value}</span>
      <span class={band === 'firing' ? 'hero-stance is-firing' : 'hero-stance'} data-testid="stance" data-band={band}>
        {copy.bands[band]}
      </span>
    </p>
  )
}

/** The centrepiece of Now: this block's reading on its scale, Incomplete with no number, or Not logged yet. */
export function ReadingHero({ all, today }: { all: CheckIn[]; today: Slot }) {
  const current = all.find((c) => c.day === today.day && c.block === today.block)
  const full = latestFullReading(all)

  if (current && !readingOf(current)) {
    return (
      <div class="hero" data-testid="reading-incomplete">
        <p class="hero-word">{copy.reading.incomplete}</p>
        <Scale value={null} />
        <p class="hero-recipe">{fill(copy.reading.soFar, { n: String(answeredIngredients(current)), total: String(TOTAL_INGREDIENTS) })}</p>
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
        <Facts items={[...recipe(full.reading).split(' · '), whenOf(full.checkin, today.day), onBoard(all, full.checkin) && <span data-testid="caffeine-on-board">{copy.caffeine.onBoard}</span>]} />
      </p>
    </div>
  )
}

/** Caffeine on board at the check-in the reading came from (Part 22a): a marker only. */
function OnBoard() {
  return <span data-testid="caffeine-on-board"> · {copy.caffeine.onBoard}</span>
}

/** The reading of one check-in, for its card: the same shape, smaller. */
export function ReadingOfCheckIn({ checkin, all = [] }: { checkin: CheckIn; all?: readonly CheckIn[] }) {
  const r = readingOf(checkin)
  if (!r) {
    return (
      <div class="hero compact">
        <p class="hero-word">{copy.reading.incomplete}</p>
        <Scale value={null} compact />
        <p class="hero-recipe">{fill(copy.reading.soFar, { n: String(answeredIngredients(checkin)), total: String(TOTAL_INGREDIENTS) })}</p>
      </div>
    )
  }
  return (
    <div class="hero compact" data-testid="reading-100">
      <Value reading={r} />
      <Scale value={r.value} compact />
      <p class="hero-recipe">
        {recipe(r)}
        {onBoard(all, checkin) && <OnBoard />}
      </p>
    </div>
  )
}

/** Today's blocks and their readings, one line. */
export function Glance({ all, day, blocks, today }: { all: CheckIn[]; day: string; blocks: readonly Block[]; today: string }) {
  const items = todayGlance(all, day, blocks)
  return (
    <p class="calc-line" data-testid="day-glance">
      {day === today ? copy.reading.today : fill(copy.reading.pastDay, { day: formatDayShort(day) })}:{' '}
      {items.map((g, i) => (
        <span key={g.block}>
          {i > 0 && ' · '}
          {copy.blocks[g.block]} {g.reading ? g.reading.value : '—'}
        </span>
      ))}
    </p>
  )
}

/**
 * Hunger, sleep, confidence, loneliness, social energy: the latest value of each, as facts in a small
 * grid. One from an earlier day says so, and its day and time are one tap behind it (the approved
 * structure moved the dates behind the value; none is lost).
 */
export function ContextChips({ all, today, index }: { all: CheckIn[]; today: string; index?: number }) {
  const values = latestContext(all)
  const [shown, setShown] = useState<string | null>(null)
  if (!values.length) return null
  return (
    <div class="context" data-testid="context">
      <SectionLabel index={index}>{copy.reading.context}</SectionLabel>
      <ul class="context-grid">
        {values.map((v) => {
          const old = v.checkin.day !== today
          const open = shown === v.id
          const body = (
            <>
              <span class="ctx-k">
                <Facts items={[readingById(v.id).name, old && copy.disclose.contextEarlier]} />
              </span>
              <span class="ctx-v">{headword(anchorFor(v.id, v.position))}</span>
              {old && open && <span class="ctx-when">{fill(copy.disclose.context, { when: whenOf(v.checkin, today) })}</span>}
            </>
          )
          return (
            <li key={v.id}>
              {old ? (
                <button type="button" class="ctx" aria-expanded={open} data-testid="context-cell" onClick={() => setShown(open ? null : v.id)}>
                  {body}
                </button>
              ) : (
                <div class="ctx" data-testid="context-cell">
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

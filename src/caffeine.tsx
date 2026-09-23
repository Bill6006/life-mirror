import { useEffect, useRef } from 'preact/hooks'
import { blockAt, type Block } from './blocks'
import { chipRetired, chipStates } from './audit'
import { copy } from './copy'
import { allCheckIns, askedOf, CAFFEINE_BANDS, db, getCheckIn, getSettings, markCaffeineShown, setCaffeine, type CaffeineBand, type CheckIn } from './db'
import { fill } from './format'
import { useLive } from './live'
import { askedReadings } from './settings'

// Caffeine (Part 21, the owner's settled design). One optional item on the three surfaces that
// already hold optional extras: the morning summary, the afternoon summary and the evening
// extras. With caffeine in the window, tap its band; with none, do nothing. There is no "None"
// to tap, and nothing is ever stored as zero. Energy stays exactly what was reported: caffeine
// is context, never an adjustment.
//
// Three honest states per window: a band reported; the item shown and left untapped (none
// reported, which is never a confirmed zero); not shown (unknown). "Shown" is written only when
// the item was actually on screen, on the check-in's own day.

/** How a check-in's caffeine reads in words, for a summary's facts: a band, an older yes, or nothing. */
export function caffeineWords(c: Pick<CheckIn, 'extras'> | null | undefined): string | null {
  const ex = c?.extras
  if (ex?.caffeineIntake) return copy.caffeine.bands[ex.caffeineIntake.band]
  if (ex?.caffeine || ex?.heavyCaffeine) return copy.caffeine.legacy
  return null
}

export function CaffeineCard({ day, block }: { day: string; block: Block }) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const contexts = useLive(() => db.days.toArray(), [])
  const ref = useRef<HTMLDivElement>(null)
  const today = blockAt(new Date()).day
  const shownAlready = Boolean(record?.extras?.caffeineShown)
  // Whether the card renders at all. The four reads resolve in any order, so the observer below
  // keys on this, not on the record alone, or it would never attach when the record came first.
  const showing =
    record !== undefined && settings !== undefined && all !== undefined && contexts !== undefined && settings.extras.caffeine && !chipRetired('caffeine', chipStates(all, contexts, settings.chipsBack, day))

  // Shown means seen: written once the item is actually on screen, and only on the check-in's own day.
  useEffect(() => {
    if (!showing || !record || shownAlready || day !== today || !ref.current || typeof IntersectionObserver === 'undefined') return
    const el = ref.current
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          void markCaffeineShown({ day, block })
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [showing, record?.id, shownAlready, day, block, today])

  if (!showing || !settings) return null
  const asked = record ? askedOf(record) : askedReadings(block, settings.depth, settings.retiredReadings)
  const current = record?.extras?.caffeineIntake?.band ?? null
  const legacy = !current && (record?.extras?.caffeine || record?.extras?.heavyCaffeine)
  const c = copy.caffeine
  return (
    <>
      <h2 class="section">{block === 'morning' ? c.titleMorning : c.title}</h2>
      <div class="card pad" ref={ref} data-testid="caffeine">
        <div class="chips caffeine-bands" role="group" aria-label={c.title}>
          {CAFFEINE_BANDS.map((band: CaffeineBand) => (
            <button
              key={band}
              type="button"
              class={current === band ? 'when-chip is-on' : 'when-chip'}
              aria-pressed={current === band}
              data-testid={`caffeine-${band}`}
              onClick={() => void setCaffeine({ day, block }, asked, current === band ? null : band)}
            >
              {c.bands[band]}
            </button>
          ))}
        </div>
        {legacy && (
          <p class="note faint no-gap" data-testid="caffeine-legacy">
            {c.legacy}
          </p>
        )}
        <p class="note faint no-gap" data-testid="caffeine-help">
          {fill(c.help, {})}
        </p>
      </div>
    </>
  )
}

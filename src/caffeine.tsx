import { useEffect, useRef } from 'preact/hooks'
import { blockAt, type Block } from './blocks'
import { chipRetired, chipStates } from './audit'
import { copy } from './copy'
import { allCheckIns, askedOf, CAFFEINE_BANDS, CAFFEINE_LAST, db, getCheckIn, getSettings, markCaffeineShown, setCaffeine, setCaffeineLast, type CaffeineBand, type CheckIn } from './db'
import { Disclosure } from './ui'
import { useChipsSeen } from './chipsSeen'
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

  // Stage 3, item 5: When was the last? once some is reported, marked once seen; it stops appearing after going unused.
  const lastShowing = showing && Boolean(record?.extras?.caffeineIntake) && all !== undefined && contexts !== undefined && settings !== undefined && !chipRetired('caffeineLast', chipStates(all, contexts, settings.chipsBack, day))
  useChipsSeen(ref, { day, block }, lastShowing && !record?.extras?.chipsShown?.caffeineLast ? ['caffeineLast'] : [])

  if (!showing || !settings) return null
  const asked = record ? askedOf(record) : askedReadings(block, settings.depth, settings.retiredReadings, { day, morning: (all ?? []).find((c) => c.day === day && c.block === 'morning') ?? null })
  const current = record?.extras?.caffeineIntake?.band ?? null
  const lastNow = record?.extras?.caffeineIntake?.last ?? null
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
          {block === 'morning' ? c.helpMorning : c.help}
        </p>
        {/* Stage 3, item 5: once some is reported, when the last was; it follows the bands' help, before their examples. */}
        {lastShowing && (
          <div class="caffeine-last" data-testid="caffeine-last" data-chip="caffeineLast">
            <p class="note faint no-gap">{c.last}</p>
            <div class="chips" role="group" aria-label={c.last}>
              {CAFFEINE_LAST.map((l) => (
                <button key={l} type="button" class={lastNow === l ? 'when-chip is-on' : 'when-chip'} aria-pressed={lastNow === l} data-testid={`caffeine-last-${l}`} onClick={() => void setCaffeineLast({ day, block }, lastNow === l ? null : l)}>
                  {c.lastOptions[l]}
                </button>
              ))}
            </div>
          </div>
        )}
        <Disclosure label={c.examples} testid="caffeine-examples" class="caffeine-examples">
          <ul class="caffeine-example-list">
            {CAFFEINE_BANDS.map((band) => (
              <li key={band} class="note faint no-gap">
                {c.bands[band]}: {c.exampleLines[band]}
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </>
  )
}
